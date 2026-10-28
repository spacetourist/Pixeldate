/* Pure descriptor maths: landmarks + category masks + pixels -> avatar descriptor. No MediaPipe, no DOM. */
export type Lm = { x: number; y: number; z: number; visibility?: number }
export type Mask = { name: string; x0: number; y0: number; w: number; h: number; data: Uint8Array }
import { snap, type PaletteName } from './palette'
export type Img = { w: number; h: number; data: Uint8ClampedArray }
// selfie_multiclass_256x256 categories
export const CLS = { bg: 0, hair: 1, bodySkin: 2, faceSkin: 3, clothes: 4, others: 5 } as const
export type Field<T> = { value: T; confidence: number }
/** raw = the region's colour before v0.1 handling (median of the unbalanced dominant cluster); measured = after white
 *  balance + 70th-percentile lightness (what gets snapped); chroma = CIELab C* of measured (black/charcoal gate). */
export type Colour = { raw: string; measured: string; palette: PaletteName; name: string; hex: string; dE: number; chroma: number } | null
/** Exactly the fields in design/pixeldate/pixel-avatar/SPEC.md ("What detection needs to hand the kit"), each with a confidence. */
export type Descriptor = {
  v: 1
  build: Field<'slim' | 'regular' | 'broad' | null>
  hairLength: Field<'none' | 'short' | 'chin' | 'shoulder' | 'long' | null>
  hairVolume: Field<number | null>
  colours: { skin: Field<Colour>; hair: Field<Colour>; top: Field<Colour>; bottom: Field<Colour>; legs: Field<Colour>; shoes: Field<Colour>; hat: Field<Colour> }
  lowerBody: Field<'trousers' | 'shorts' | 'skirt' | 'dress' | null>
  sleeve: Field<'none' | 'short' | 'long' | null>
  glasses: Field<boolean | null>
  notes: string[]
  metrics: Record<string, number>
}
export type AvatarError = { code: 'no_person' | 'not_full_body' | 'multiple_people'; message: string; detail?: string; missing?: string[] }

const NAMES: Record<number, string> = { 0: 'head', 2: 'left eye', 5: 'right eye', 11: 'left shoulder', 12: 'right shoulder', 23: 'left hip', 24: 'right hip', 27: 'left ankle', 28: 'right ankle' }
const NEED = [0, 2, 5, 11, 12, 23, 24, 27, 28]
const inFrame = (p: Lm) => (p.visibility ?? 1) >= 0.5 && p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02
/** Photo gate (SPEC): "Need head to toe" if head or ankles (or hips/shoulders) are missing, "Just you, please" for 2+ people. */
export function gate(poses: Lm[][]): AvatarError | null {
  const lm = poses[0]
  if (!lm || lm.length < 33) return { code: 'no_person', message: 'Need head to toe', detail: 'No person found in the photo.' }
  if (poses.length > 1) {
    const ht = (q: Lm[]) => Math.max(...q.map(p => p.y)) - Math.min(...q.map(p => p.y))
    // a second pose at least 40% the main one's height and mostly in frame counts as another person (not a far passer-by)
    if (poses.slice(1).some(q => ht(q) > 0.4 * ht(lm) && q.filter(inFrame).length > 16)) return { code: 'multiple_people', message: 'Just you, please', detail: 'More than one person in the photo.' }
  }
  const missing = NEED.filter(i => !inFrame(lm[i])).map(i => NAMES[i])
  if (missing.length) return { code: 'not_full_body', message: 'Need head to toe', detail: `Can't see: ${missing.join(', ')}.`, missing }
  return null
}

// ---- OKLab ----
const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const unlin = (c: number) => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))) }
const LIN = new Float32Array(256).map((_, i) => lin(i))
export function toLab(r: number, g: number, b: number): [number, number, number] { return linLab(LIN[r], LIN[g], LIN[b]) }
/** OKLab from linear-light RGB (0..1). */
export function linLab(R: number, G: number, B: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
export function labHex(L: number, a: number, b: number) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  return '#' + rgb.map(c => unlin(c).toString(16).padStart(2, '0')).join('')
}

// ---- k-means in OKLab, largest cluster ----
// v0.1 (SPEC "Dark and dim clothes"): lightness is down-weighted in the clustering so the lit and shadowed folds of one
// garment stay one cluster (only hue/chroma splits it), and the cluster's lightness is read at the 70th percentile
// instead of the median so shadow doesn't win. a/b stay the cluster median.
type Dom = { hex: string; lab: [number, number, number]; n: number; share: number; spread: number; medL: number }
const LW = 0.4   // lightness weight in the clustering distance
export function dominant(pts: Float32Array, k = 3, lp = 0.7): Dom | null {
  const n = pts.length / 3
  if (n < 12) return null
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const c = new Float32Array(k * 3), asg = new Uint8Array(n)
  const dist = (i: number, q: number) => { const dl = (pts[i * 3] - c[q * 3]) * LW, da = pts[i * 3 + 1] - c[q * 3 + 1], db = pts[i * 3 + 2] - c[q * 3 + 2]; return dl * dl + da * da + db * db }
  // k-means++ init
  const first = Math.floor(rnd() * n); c.set(pts.subarray(first * 3, first * 3 + 3), 0)
  const d2 = new Float32Array(n)
  for (let j = 1; j < k; j++) {
    let sum = 0
    for (let i = 0; i < n; i++) { let best = Infinity; for (let q = 0; q < j; q++) best = Math.min(best, dist(i, q)); d2[i] = best; sum += best }
    let t = rnd() * sum, pick = n - 1; for (let i = 0; i < n; i++) { t -= d2[i]; if (t <= 0) { pick = i; break } }
    c.set(pts.subarray(pick * 3, pick * 3 + 3), j * 3)
  }
  for (let it = 0; it < 12; it++) {
    const acc = new Float64Array(k * 4)
    for (let i = 0; i < n; i++) {
      let best = Infinity, bq = 0
      for (let q = 0; q < k; q++) { const d = dist(i, q); if (d < best) { best = d; bq = q } }
      asg[i] = bq; acc[bq * 4] += pts[i * 3]; acc[bq * 4 + 1] += pts[i * 3 + 1]; acc[bq * 4 + 2] += pts[i * 3 + 2]; acc[bq * 4 + 3]++
    }
    for (let q = 0; q < k; q++) if (acc[q * 4 + 3]) for (let e = 0; e < 3; e++) c[q * 3 + e] = acc[q * 4 + e] / acc[q * 4 + 3]
  }
  const cnt = new Array(k).fill(0); for (let i = 0; i < n; i++) cnt[asg[i]]++
  const big = cnt.indexOf(Math.max(...cnt))
  const ch: number[][] = [[], [], []]
  for (let i = 0; i < n; i++) if (asg[i] === big) for (let e = 0; e < 3; e++) ch[e].push(pts[i * 3 + e])
  for (const a of ch) a.sort((x, y) => x - y)
  const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.floor(a.length * f))]
  const lab: [number, number, number] = [q(ch[0], lp), q(ch[1], 0.5), q(ch[2], 0.5)]
  let sp = 0; for (let i = 0; i < n; i++) if (asg[i] === big) { const dl = pts[i * 3] - lab[0], da = pts[i * 3 + 1] - lab[1], db = pts[i * 3 + 2] - lab[2]; sp += Math.sqrt(dl * dl + da * da + db * db) }
  return { hex: labHex(...lab), lab, n, share: cnt[big] / n, spread: sp / cnt[big], medL: q(ch[0], 0.5) }
}

/* Grey-world white balance (SPEC v0.1). Gains are estimated over the whole person crop (person + surroundings) and
   then applied to every region's pixels before clustering. Estimating them inside a single garment region would push
   that garment itself to grey (a red hoodie's mean is red, not a cast), so the scene around it is used instead.
   Gains are clamped to 0.8..1.25 per channel so a strongly coloured backdrop can't repaint the outfit. */
export type Gains = [number, number, number]
export function greyWorld(img: Img, box: Box): Gains {
  let r = 0, g = 0, b = 0, n = 0
  const x0 = Math.max(0, Math.floor(box[0])), x1 = Math.min(img.w, Math.ceil(box[2])), y0 = Math.max(0, Math.floor(box[1])), y1 = Math.min(img.h, Math.ceil(box[3]))
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
    const i = (y * img.w + x) * 4, R = LIN[img.data[i]], G = LIN[img.data[i + 1]], B = LIN[img.data[i + 2]]
    if (Math.max(R, G, B) > 0.95 || R + G + B < 0.01) continue   // clipped highlights / black don't carry the cast
    r += R; g += G; b += B; n++
  }
  if (!n) return [1, 1, 1]
  const m = (r + g + b) / 3, cl = (v: number) => Math.max(0.8, Math.min(1.25, v))
  return [cl(m / Math.max(1e-6, r)), cl(m / Math.max(1e-6, g)), cl(m / Math.max(1e-6, b))]
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const r2 = (v: number) => Math.round(v * 100) / 100
const r3 = (v: number) => Math.round(v * 1000) / 1000
type Box = [number, number, number, number]

/** OKLab samples from mask pixels of the given classes inside an image-px box, eroded by `er` mask px. */
function sample(img: Img, m: Mask, cls: number[], box: Box, er = 1, cap = 5000, wb: Gains = [1, 1, 1]) {
  const [bx0, by0, bx1, by1] = box, want = new Uint8Array(8); for (const c of cls) want[c] = 1
  const idx: number[] = []
  const i0 = Math.max(er, Math.floor(bx0 - m.x0)), i1 = Math.min(m.w - 1 - er, Math.ceil(bx1 - m.x0))
  const j0 = Math.max(er, Math.floor(by0 - m.y0)), j1 = Math.min(m.h - 1 - er, Math.ceil(by1 - m.y0))
  const D = m.data, W = m.w
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const p = j * W + i, v = D[p]; if (!want[v]) continue
    if (er && (D[p - er] !== v || D[p + er] !== v || D[p - er * W] !== v || D[p + er * W] !== v)) continue
    idx.push(p)
  }
  const step = Math.max(1, idx.length / cap), out = new Float32Array(Math.floor(idx.length / step) * 3)
  for (let q = 0, o = 0; o < out.length; q += step, o += 3) {
    const p = idx[Math.floor(q)], x = m.x0 + (p % W), y = m.y0 + ((p / W) | 0)
    const ip = (Math.min(img.h - 1, y) * img.w + Math.min(img.w - 1, x)) * 4
    const L = linLab(Math.min(1, LIN[img.data[ip]] * wb[0]), Math.min(1, LIN[img.data[ip + 1]] * wb[1]), Math.min(1, LIN[img.data[ip + 2]] * wb[2])); out[o] = L[0]; out[o + 1] = L[1]; out[o + 2] = L[2]
  }
  return { pts: out, count: idx.length }
}
type CF = Field<Colour> & { lab?: [number, number, number]; medL?: number }
/** One region's colour. `lp` = lightness percentile (0.7 for clothes per SPEC v0.1, median for skin/hair). */
function colour(img: Img, m: Mask, cls: number[], box: Box, ref: number, vis: number, pal: PaletteName, er = 1, wb: Gains = [1, 1, 1], lp = 0.5): CF {
  const s = sample(img, m, cls, box, er, 5000, wb), d = dominant(s.pts, 3, lp)
  if (!d) return { value: null, confidence: 0 }
  const raw = sample(img, m, cls, box, er, 5000), dr = dominant(raw.pts, 3, 0.5)   // unbalanced median, kept for reference
  const sn = snap(d.hex, pal)
  // more pixels, one clear dominant colour, tight cluster, visible landmarks, and a snap that isn't a coin-toss -> higher
  const conf = clamp(s.count / ref) * clamp(0.4 + d.share) * clamp(1.2 - d.spread * 4) * clamp(vis) * clamp(0.6 + sn.gap / 10)
  return { value: { raw: dr ? dr.hex : d.hex, measured: d.hex, palette: pal, name: sn.name, hex: sn.hex, dE: sn.dE, chroma: sn.chroma }, confidence: r2(conf), lab: d.lab }
}
/* Skin (v0.2). The v0.1 estimate (median of all face+body skin, full grey-world gains) ran dark and grey on faces in
   shade or under stubble (3535084: fair face -> 'brown'), because shadowed jaw, stubble and neck pixels pulled the
   median down and a warm scene's gains (brick, sunset) cooled the skin itself. Now:
   - sample the lit face area only: face-skin pixels in a box from above the eyes to just below the mouth (forehead +
     cheeks), falling back to all skin in the head crop when that's too small;
   - soften white balance for skin (sqrt of the scene gains): skin is the thing we least want grey-world to neutralise;
   - hue/chroma = median after dropping the darkest 35% (shadow, stubble, beard, hair edges) and brightest 3% (specular);
   - lightness = 66th percentile (upper, lit side) with a mild scene-exposure correction (see below). */
function skinColour(img: Img, m: Mask, E: { x: number; y: number }, Mo: { x: number; y: number }, hd: number, wide: Box, refN: number, vis: number, wb: Gains, M: Record<string, number>): CF {
  const g: Gains = [Math.sqrt(wb[0]), Math.sqrt(wb[1]), Math.sqrt(wb[2])]
  const faceBox: Box = [E.x - hd * 0.5, E.y - hd * 0.55, E.x + hd * 0.5, Mo.y + hd * 0.08]
  let s = sample(img, m, [CLS.faceSkin], faceBox, 1, 4000, g), src = 1
  if (s.pts.length / 3 < 30) { s = sample(img, m, [CLS.faceSkin, CLS.bodySkin], wide, 1, 4000, g); src = 2 }
  const n = s.pts.length / 3
  if (n < 8) return { value: null, confidence: 0 }
  const ord = Array.from({ length: n }, (_, i) => i).sort((a, b) => s.pts[a * 3] - s.pts[b * 3])
  const keep = ord.slice(Math.floor(n * 0.35), Math.max(Math.floor(n * 0.35) + 1, Math.ceil(n * 0.97)))
  const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.floor(a.length * f))]
  const As = keep.map(i => s.pts[i * 3 + 1]).sort((a, b) => a - b), Bs = keep.map(i => s.pts[i * 3 + 2]).sort((a, b) => a - b)
  // lightness: 66th percentile of all face-skin samples (the lit cheek/forehead), with a gentle exposure correction
  // against the scene's 90th-percentile lightness (a dim scene lifts a shaded face, a bright studio pulls it back);
  // factor (0.7 / sceneP90)^0.25 clamped to 0.9..1.1
  const all = ord.map(i => s.pts[i * 3]), sc = sceneP90(img), ex = Math.min(1.1, Math.max(0.9, (0.7 / sc) ** 0.25))
  // then a contrast stretch about OKLab L 0.57 (x1.4): photographed skin spans a much narrower lightness range than the
  // kit ramp (porcelain..ebony), so fair faces read too dark and deep ones too light without it (tuned on the 6 photos)
  const lab: [number, number, number] = [Math.min(0.98, Math.max(0.1, 0.57 + (q(all, 0.66) * ex - 0.57) * 1.4)), q(As, 0.5), q(Bs, 0.5)]
  M.sceneP90 = r2(sc); M.skinEx = r2(ex)
  let sp = 0; for (const i of keep) sp += Math.hypot(s.pts[i * 3 + 1] - lab[1], s.pts[i * 3 + 2] - lab[2])
  const hex = labHex(...lab), sn = snap(hex, 'skin')
  const raw = dominant(sample(img, m, [CLS.faceSkin, CLS.bodySkin], wide, 1, 5000).pts, 3, 0.5)
  M.skinSrc = src; M.skinN = n
  const conf = clamp(s.count / (src === 1 ? refN * 0.3 : refN)) * clamp(1.2 - (sp / keep.length) * 12) * clamp(vis) * clamp(0.6 + sn.gap / 10)
  return { value: { raw: raw ? raw.hex : hex, measured: hex, palette: 'skin', name: sn.name, hex: sn.hex, dE: sn.dE, chroma: sn.chroma }, confidence: r2(conf), lab, medL: s.pts[ord[Math.floor(n / 2)] * 3] }
}
/** 90th-percentile OKLab lightness of the whole frame (subsampled ~4k px), an exposure reference. */
function sceneP90(img: Img) {
  const step = Math.max(1, Math.floor(Math.sqrt(img.w * img.h / 4000))), L: number[] = []
  for (let y = 0; y < img.h; y += step) for (let x = 0; x < img.w; x += step) { const i = (y * img.w + x) * 4; L.push(toLab(img.data[i], img.data[i + 1], img.data[i + 2])[0]) }
  L.sort((a, b) => a - b); return L[Math.floor(L.length * 0.9)] ?? 0.7
}
/** Class histogram inside an image-px box of a mask. */
function hist(m: Mask, box: Box) {
  const h = new Array(6).fill(0); let all = 0
  for (let y = Math.max(0, Math.floor(box[1] - m.y0)); y < Math.min(m.h, Math.ceil(box[3] - m.y0)); y++)
    for (let x = Math.max(0, Math.floor(box[0] - m.x0)); x < Math.min(m.w, Math.ceil(box[2] - m.x0)); x++) { all++; h[m.data[y * m.w + x]]++ }
  return { h, all }
}

/**
 * img: analysis pixels. lm: 33 normalised pose landmarks; world: 33 metric landmarks.
 * body/head: category masks (image px) from a whole-body crop and a head-and-shoulders crop.
 */
export function describe(img: Img, lm: Lm[], world: Lm[] | undefined, body: Mask, head: Mask): Descriptor {
  const P = lm.map(p => ({ x: p.x * img.w, y: p.y * img.h, v: p.visibility ?? 1 }))
  const avg = (...i: number[]) => ({ x: i.reduce((s, k) => s + P[k].x, 0) / i.length, y: i.reduce((s, k) => s + P[k].y, 0) / i.length })
  const vis = (...i: number[]) => Math.min(...i.map(k => P[k].v))
  const lerp = (a: number, b: number, t: number) => ({ x: P[a].x + (P[b].x - P[a].x) * t, y: P[a].y + (P[b].y - P[a].y) * t })
  const notes: string[] = [], M: Record<string, number> = {}
  const S = avg(11, 12), H = avg(23, 24), A = avg(27, 28), E = avg(2, 5)
  const T = Math.max(1, H.y - S.y)                         // torso height px
  const sW = Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y)
  const xL = Math.min(P[11].x, P[12].x, P[23].x, P[24].x), xR = Math.max(P[11].x, P[12].x, P[23].x, P[24].x)
  const wide = Math.max(sW, T * 0.6), headD = Math.max(4, S.y - E.y)
  const ref = (k: number) => Math.max(40, k * T * T)       // pixel-count reference scales with body size
  const kneeY = (P[25].y + P[26].y) / 2
  // class at a point of the body mask, voted over a small window (r image px)
  const at = (x: number, y: number, r: number) => {
    const h = hist(body, [x - r, y - r, x + r + 1, y + r + 1]).h; return h.indexOf(Math.max(...h))
  }
  const lr = Math.max(1, T * 0.04)

  // ---- lower body: walk each leg hip -> knee -> ankle (t 0..2) and find where cloth stops and skin starts ----
  const legT = (h: number, k: number, a: number) => {
    let hem = 2, seen = 0
    for (let t = 0.1; t <= 1.95; t += 0.05) {
      const p = t <= 1 ? lerp(h, k, t) : lerp(k, a, t - 1), c = at(p.x, p.y, lr)
      if (c === CLS.bodySkin) { if (++seen >= 2) { hem = t - 0.05; break } } else seen = 0
    }
    return hem
  }
  const hemL = legT(23, 25, 27), hemR = legT(24, 26, 28), hem = Math.min(hemL, hemR)
  // fabric bridging the gap between the legs (skirt/dress) vs background there (trousers/shorts)
  const gapAt = (t: number): number => {
    const a = t <= 1 ? lerp(23, 25, t) : lerp(25, 27, t - 1), b = t <= 1 ? lerp(24, 26, t) : lerp(26, 28, t - 1)
    const legGap = Math.abs(a.x - b.x); if (legGap < T * 0.12) return -1   // legs together: can't tell
    const c = at((a.x + b.x) / 2, (a.y + b.y) / 2, lr); return c === CLS.clothes || c === CLS.others ? 1 : 0
  }
  const gapTs = [0.45, 0.6, 0.75, 0.9, 1.05, 1.2].filter(t => t < hem - 0.05).map(gapAt).filter(v => v >= 0)
  const bridged = gapTs.length ? gapTs.reduce((s, v) => s + v, 0) / gapTs.length : NaN
  // low bridge (between the shins, t 1.5..1.85): a maxi skirt/dress fills it; leggings/trousers with touching thighs don't
  const lowTs = [1.5, 1.65, 1.8].filter(t => t < hem - 0.05).map(gapAt).filter(v => v >= 0)
  const bridgedLow = lowTs.length ? lowTs.reduce((s, v) => s + v, 0) / lowTs.length : NaN
  // skirt flare: clothes run width on the row just above the hem vs at the upper thigh (only meaningful for short hems)
  const runW = (y: number, x0: number) => {
    let a = x0, b = x0; const step = Math.max(1, lr / 2)
    if (at(x0, y, 1) !== CLS.clothes) return 0
    while (a > body.x0 && at(a - step, y, 1) === CLS.clothes) a -= step
    while (b < body.x0 + body.w && at(b + step, y, 1) === CLS.clothes) b += step
    return b - a
  }
  const legMid = (t: number) => { const a = lerp(23, 25, Math.min(1, t)), b = lerp(24, 26, Math.min(1, t)); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  const fh0 = legMid(0.25), fh1 = legMid(Math.max(0.3, hem - 0.12))
  const flare = hem < 1 ? runW(fh1.y, fh1.x) / Math.max(1, runW(fh0.y, fh0.x)) : NaN
  // knee width for long hems: a maxi stays about hip-wide at the knee; leggings/trousers narrow to the legs
  const fk = legMid(0.95), kneeFlare = hem >= 1.9 ? runW(fk.y, fk.x) / Math.max(1, runW(fh0.y, fh0.x)) : NaN
  // bare midriff (crop top / separate top + bottom): skin on the torso centre line between chest and hips
  let midSkin = 0, mn = 0; for (let f = 0.55; f <= 0.96; f += 0.04) { mn++; if (at(S.x + (H.x - S.x) * f, S.y + T * f, lr) === CLS.bodySkin) midSkin++ }
  M.hemL = r2(hemL); M.hemR = r2(hemR); M.bridged = r2(bridged); M.bridgedLow = r2(bridgedLow); M.flare = r2(flare); M.kneeFlare = r2(kneeFlare); M.midSkin = r2(midSkin / mn)

  // ---- colours (v0.1: grey-world balanced, clothes lightness at p70, chroma-gated black) ----
  const wb = greyWorld(img, [body.x0, body.y0, body.x0 + body.w, body.y0 + body.h])
  M.wbR = r3(wb[0]); M.wbG = r3(wb[1]); M.wbB = r3(wb[2])
  const skin = skinColour(img, head, E, avg(9, 10), headD, [S.x - wide * 1.5, 0, S.x + wide * 1.5, S.y + T * 0.6], ref(0.03), vis(0), wb, M)
  const hair = colour(img, head, [CLS.hair], [S.x - wide * 1.5, 0, S.x + wide * 1.5, H.y], ref(0.03), vis(0), 'hair', 1, wb)
  const top = colour(img, body, [CLS.clothes], [xL - wide * 0.6, S.y - T * 0.12, xR + wide * 0.6, H.y - T * 0.05], ref(0.25), vis(11, 12, 23, 24), 'cloth', 2, wb, 0.7)
  // v0.3 open front: share of much-lighter person pixels in a narrow centre strip of the lower torso (chest..belt).
  // An open jacket over a tee shows the tee all the way down; a buttoned suit only shows the shirt in the upper V.
  if (top.lab) {
    const cx = (S.x + H.x) / 2, hw = Math.max(2, sW * 0.1)
    const st = sample(img, body, [CLS.clothes], [cx - hw, S.y + T * 0.45, cx + hw, H.y - T * 0.08], 1, 3000, wb)
    let lit = 0; const n = st.pts.length / 3
    for (let i = 0; i < n; i++) if (st.pts[i * 3] > top.lab[0] + 0.25) lit++
    M.openFront = n >= 12 ? r2(lit / n) : -1
  }
  const botEnd = hem >= 1.9 ? A.y - T * 0.08 : Math.max(H.y + T * 0.2, (hem <= 1 ? H.y + (kneeY - H.y) * hem : kneeY + (A.y - kneeY) * (hem - 1)) - T * 0.04)
  const bottom = colour(img, body, [CLS.clothes], [xL - wide * 0.4, H.y + T * 0.08, xR + wide * 0.4, botEnd], ref(0.2), vis(23, 24, 25, 26), 'cloth', 2, wb, 0.7)
  // legs (SPEC: bare = skin colour, or tights in a cloth colour): lower legs below the hem, above the ankles
  const shin: Box = [Math.min(P[25].x, P[26].x, P[27].x, P[28].x) - T * 0.12, Math.max(botEnd, kneeY), Math.max(P[25].x, P[26].x, P[27].x, P[28].x) + T * 0.12, A.y - T * 0.04]
  const sh = hist(body, shin), legSkin = sh.h[CLS.bodySkin], legCloth = sh.h[CLS.clothes]
  const legs: CF = hem >= 1.9 && legCloth >= legSkin
    // v0.2: covered to the ankle means the shin IS the bottom garment, so reuse its colour; sampling the shin alone
    // read shiny black leggings as burgundy (26263222: skin-warm sheen on dark fabric)
    ? (() => { notes.push('legs covered to the ankle: legs colour = trousers/leggings fabric (bottom colour)'); return bottom })()
    : colour(img, body, [CLS.bodySkin], shin, ref(0.03), vis(25, 26, 27, 28), 'skin', 1, wb)
  const feet = [[27, 29, 31], [28, 30, 32]].map(f => {
    const xs = f.map(k => P[k].x), ys = f.map(k => P[k].y)
    return [Math.min(...xs) - T * 0.1, P[f[0]].y + T * 0.02, Math.max(...xs) + T * 0.1, Math.max(...ys) + T * 0.12] as Box
  })
  const shoeBox: Box = [Math.min(feet[0][0], feet[1][0]), Math.min(feet[0][1], feet[1][1]), Math.max(feet[0][2], feet[1][2]), Math.max(feet[0][3], feet[1][3])]
  const shoes = colour(img, body, [CLS.clothes, CLS.others], shoeBox, ref(0.03), vis(27, 28, 29, 30, 31, 32), 'cloth', 1, wb, 0.7)
  const fh = hist(body, shoeBox).h
  if (fh[CLS.bodySkin] > fh[CLS.clothes] + fh[CLS.others]) { shoes.confidence = r2(shoes.confidence * 0.5); notes.push('feet mostly skin (sandals/heels/bare feet?)') }

  // ---- lowerBody (SPEC: where the top's colour ends relative to the hips and knees) ----
  let lowerBody: Descriptor['lowerBody'] = { value: null, confidence: 0 }
  {
    const dE = top.lab && bottom.lab ? Math.hypot(top.lab[0] - bottom.lab[0], top.lab[1] - bottom.lab[1], top.lab[2] - bottom.lab[2]) : NaN
    // cloth continuous through the waist at the centre line
    let cont = 0, n = 0; for (let f = 0.8; f <= 1.25; f += 0.05) { const c = at(S.x + (H.x - S.x) * f, S.y + T * f, lr); n++; if (c === CLS.clothes) cont++ }
    M.topBottomDE = r3(dE); M.waistCloth = r2(cont / n)
    const bareMid = midSkin >= 1   // any skin hit between the lower chest and the hips
    const sameColour = dE < 0.05 && cont / n > 0.85 && !bareMid   // one garment: same colour, no skin at the waist
    if (bareMid) notes.push('bare midriff: separate top and bottom (not a dress)')
    const v = vis(23, 24, 25, 26, 27, 28)
    let value: 'trousers' | 'shorts' | 'skirt' | 'dress', c: number
    const skirtish = () => (sameColour ? 'dress' : 'skirt') as 'dress' | 'skirt'
    if (hem >= 1.9) {
      // fabric between the thighs alone is not enough (leggings / touching legs); a maxi also fills the gap between the shins
      const maxi = bridged > 0.6 && (!isFinite(bridgedLow) || bridgedLow > 0.5) && !(kneeFlare < 0.85)
      value = maxi ? skirtish() : 'trousers'; c = isFinite(bridged) ? 0.4 + Math.abs(bridged - 0.5) * 0.8 : 0.35
      if (bridged > 0.6 && !maxi) { notes.push('fabric between the legs but no flare at the knee: read as trousers/leggings'); c = 0.45 }
    } else if (hem < 0.8) {
      if (isFinite(bridged)) { value = bridged > 0.5 ? skirtish() : 'shorts'; c = 0.35 + Math.abs(bridged - 0.5) * 0.7 }
      // legs together: can't see between them. One colour top-to-hem with no bare waist = dress; else flare decides
      else if (sameColour) { value = 'dress'; c = 0.4 }
      else { value = flare >= 0.9 ? 'skirt' : 'shorts'; c = 0.25; notes.push('legs together: skirt vs shorts guessed from hem flare') }
    }
    else { value = bridged < 0.35 && isFinite(bridged) ? (hem < 1.2 ? 'shorts' : 'trousers') : skirtish(); c = 0.45 }
    if (value === 'skirt' && sameColour) value = 'dress'
    lowerBody = { value, confidence: r2(clamp(c) * v) }
  }

  // ---- sleeve: walk each arm shoulder -> elbow -> wrist (t 0..2), first skin ----
  let sleeve: Descriptor['sleeve'] = { value: null, confidence: 0 }
  {
    const arm = (s: number, e: number, w: number) => {
      let first = 2.1, seen = 0, cover = 0, n = 0
      for (let t = 0.1; t <= 1.9; t += 0.05) {
        const p = t <= 1 ? lerp(s, e, t) : lerp(e, w, t - 1), c = at(p.x, p.y, Math.max(1, lr * 0.6)); n++
        if (c === CLS.bodySkin) { if (++seen >= 2 && first > 2) first = t - 0.05 } else { seen = 0; if (c === CLS.clothes) cover++ }
      }
      return { first, v: vis(s, e, w), cover: cover / n }
    }
    const arms = [arm(11, 13, 15), arm(12, 14, 16)].filter(a => a.v > 0.5)
    if (arms.length) {
      const a = arms.reduce((m, x) => (x.v > m.v ? x : m)), first = arms.length > 1 ? (arms[0].first + arms[1].first) / 2 : a.first
      M.sleeveSkinAt = r2(first)
      const value = first < 0.3 ? 'none' : first < 1.2 ? 'short' : 'long'
      const agree = arms.length > 1 ? clamp(1 - Math.abs(arms[0].first - arms[1].first) / 1.2) : 0.6
      sleeve = { value, confidence: r2(clamp(0.35 + 0.5 * agree) * a.v * (value === 'long' && a.cover < 0.4 ? 0.5 : 1)) }
    } else notes.push('arms not visible: sleeve unknown')
  }

  // ---- build (SPEC: shoulder width ÷ hip width from pose landmarks); 3D world landmarks so a turned body still measures ----
  let build: Descriptor['build'] = { value: null, confidence: 0 }
  {
    let ratio = NaN, src = 0
    if (world && world.length >= 33) { const d = (a: Lm, b: Lm) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); ratio = d(world[11], world[12]) / Math.max(1e-3, d(world[23], world[24])); src = 3 }
    if (!isFinite(ratio)) { ratio = sW / Math.max(1, Math.hypot(P[23].x - P[24].x, P[23].y - P[24].y)); src = 2 }
    const turned = clamp(1 - sW / (T * 0.75))
    M.shoulderHip = r3(ratio); M.turned = r2(turned); M.buildSrc = src
    // thresholds tuned on the spike set (n=6, see report): pose hip landmarks are hip joints, so ratios run ~1.3-1.9
    const lo = 1.45, hi = 1.75
    const value = ratio < lo ? 'slim' : ratio < hi ? 'regular' : 'broad'
    const edge = Math.min(Math.abs(ratio - lo), Math.abs(ratio - hi))
    build = { value, confidence: r2(clamp(0.25 + edge * 2, 0, 0.6) * (1 - turned * 0.6) * vis(11, 12, 23, 24)) }
    if (turned > 0.4) notes.push('body turned: build less reliable')
  }

  let hat: CF = { value: null, confidence: 0 }
  // ---- hair length + volume (SPEC: from the hair mask below the ears and its width) ----
  let hairLength: Descriptor['hairLength'] = { value: null, confidence: 0 }, hairVolume: Descriptor['hairVolume'] = { value: null, confidence: 0 }
  {
    const box: Box = [S.x - wide * 1.5, 0, S.x + wide * 1.5, H.y]
    const ys: number[] = [], rowsW = new Map<number, [number, number]>()
    for (let y = Math.max(0, Math.floor(box[1] - head.y0)); y < Math.min(head.h, Math.ceil(box[3] - head.y0)); y++)
      for (let x = Math.max(0, Math.floor(box[0] - head.x0)); x < Math.min(head.w, Math.ceil(box[2] - head.x0)); x++) if (head.data[y * head.w + x] === CLS.hair) {
        ys.push(y + head.y0); const r = rowsW.get(y); if (!r) rowsW.set(y, [x, x]); else { r[0] = Math.min(r[0], x); r[1] = Math.max(r[1], x) }
      }
    const area = ys.length / (headD * headD)
    // covered = hat/beanie/hood pixels ('others' or cloth) above the eyes
    const above = hist(head, [E.x - headD * 0.6, E.y - headD * 1.0, E.x + headD * 0.6, E.y - headD * 0.15]).h
    const covered = (above[CLS.others] + above[CLS.clothes]) > above[CLS.hair]
    const earW = Math.max(Math.abs(P[7].x - P[8].x), sW * 0.45)
    M.hairArea = r2(area); M.hatAbove = covered ? 1 : 0
    // v0.2 hat colour: person pixels in the band just above the head (the hair mask often swallows the hat, so hair,
    // cloth and 'others' all count), snapped to cloth. No butter default: low confidence falls back to the hair colour.
    if (covered) {
      const hb: Box = [E.x - headD * 0.6, E.y - headD * 1.3, E.x + headD * 0.6, E.y - headD * 0.35]
      const hc = colour(img, head, [CLS.hair, CLS.clothes, CLS.others], hb, ref(0.006), vis(0), 'cloth', 1, wb, 0.5)
      if (hc.value && hc.confidence >= 0.35) { hat = hc; M.hatSrc = 1 }
      else if (hair.value) {
        const sn = snap(hair.value.measured, 'cloth')
        hat = { value: { ...hair.value, palette: 'cloth', name: sn.name, hex: sn.hex, dE: sn.dE, chroma: sn.chroma }, confidence: r2(Math.min(hair.confidence, 0.45)) }
        M.hatSrc = 2; notes.push('hat colour: low confidence above the head, using the hair colour')
      }
    }
    if (area < 0.06 && !covered) { hairLength = { value: 'none', confidence: r2(0.5 * vis(0)) }; hairVolume = { value: 0, confidence: r2(0.5 * vis(0)) } }
    else if (area < 0.06) notes.push('hair hidden under a hat/hood: length + volume unknown')
    else {
      ys.sort((a, b) => a - b)
      const t = (ys[Math.floor(ys.length * 0.97)] - E.y) / headD   // 0 = eye line, 1 = shoulder line
      const cuts = [0.38, 0.72, 1.15, 1.6]
      // short < ear lobe/jaw; chin; shoulder; long = clearly past the shoulders
      const value = t < cuts[0] ? 'short' : t < cuts[1] ? 'chin' : t < cuts[2] ? 'shoulder' : 'long'
      const edge = Math.min(...cuts.map(c => Math.abs(t - c)))
      hairLength = { value, confidence: r2(clamp(0.3 + edge * 1.2, 0, 0.85) * clamp(area / 0.3) * vis(0, 11, 12) * (covered ? 0.6 : 1)) }
      let maxW = 0; for (const [, [a, b]] of rowsW) maxW = Math.max(maxW, b - a + 1)
      const wr = maxW / earW            // widest hair row vs ear-to-ear width
      const vol = clamp((wr - 1.05) / 1.1)
      hairVolume = { value: r2(vol), confidence: r2(clamp(0.6 * vis(7, 8, 0)) * (covered ? 0.5 : 1)) }
      M.hairReach = r2(t); M.hairWidth = r2(wr)
      if (covered) notes.push('hat/beanie on: hair partly hidden')
    }
  }

  // ---- glasses: 'others' (accessory) class or very dark pixels across the eye band of the head mask ----
  let glasses: Descriptor['glasses'] = { value: null, confidence: 0 }
  {
    const eyeW = Math.max(3, Math.abs(P[3].x - P[6].x))
    const box: Box = [Math.min(P[3].x, P[6].x) - eyeW * 0.1, E.y - eyeW * 0.25, Math.max(P[3].x, P[6].x) + eyeW * 0.1, E.y + eyeW * 0.25]
    const hh = hist(head, box)
    let dark = 0, tot = 0
    if (skin.lab) for (let y = Math.max(0, Math.floor(box[1])); y < Math.min(img.h, Math.ceil(box[3])); y++) for (let x = Math.max(0, Math.floor(box[0])); x < Math.min(img.w, Math.ceil(box[2])); x++) {
      const i = (y * img.w + x) * 4; tot++; if (toLab(img.data[i], img.data[i + 1], img.data[i + 2])[0] < (skin.medL ?? skin.lab[0]) * 0.55) dark++   // v0.1 reference (median), so the glasses test is unchanged
    }
    const of = hh.all ? hh.h[CLS.others] / hh.all : 0, df = tot ? dark / tot : 0, ff = hh.all ? hh.h[CLS.faceSkin] / hh.all : 0
    const facing = vis(2, 5) * clamp(eyeW / (headD * 0.35))
    M.eyeW = Math.round(eyeW); M.eyeOthers = r2(of); M.eyeDark = r2(df); M.eyeFace = r2(ff)
    // eye band under ~6 px wide or face turned: can't tell
    if (eyeW < 6 || facing < 0.4) notes.push('face too small or turned to judge glasses')
    // a cap/beanie brim puts 'others' pixels and shadow into the eye band, so with a hat require both signals
    else if (M.hatAbove ? of > 0.18 && df > 0.4 : of > 0.18 || df > 0.45) glasses = { value: true, confidence: r2(clamp(0.3 + Math.max(of, df - 0.3)) * 0.8 * facing) }
    else if (ff > 0.7 && of < 0.04 && df < 0.25) glasses = { value: false, confidence: r2(0.45 * facing) }
  }
  M.torsoPx = Math.round(T)

  const out = (f: CF): Field<Colour> => ({ value: f.value, confidence: f.confidence })
  return {
    v: 1, build, hairLength, hairVolume,
    colours: { skin: out(skin), hair: out(hair), top: out(top), bottom: out(lowerBody.value === 'dress' ? top : bottom), legs: out(legs), shoes: out(shoes), hat: out(hat) },
    lowerBody, sleeve, glasses, notes, metrics: M,
  }
}

/** Crop boxes (image px) for the two segmentation passes, from the pose. */
export function crops(lm: Lm[], w: number, h: number) {
  const P = lm.map(p => ({ x: p.x * w, y: p.y * h }))
  const xs = P.map(p => p.x), ys = P.map(p => p.y)
  const S = { x: (P[11].x + P[12].x) / 2, y: (P[11].y + P[12].y) / 2 }, H = { y: (P[23].y + P[24].y) / 2 }
  const T = Math.max(8, H.y - S.y), E = (P[2].y + P[5].y) / 2, d = Math.max(4, S.y - E)
  const cl = (b: number[]) => { const x0 = Math.max(0, Math.floor(b[0])), y0 = Math.max(0, Math.floor(b[1])); return { x0, y0, w: Math.min(w, Math.ceil(b[2])) - x0, h: Math.min(h, Math.ceil(b[3])) - y0 } }
  const padX = T * 0.7, top = Math.min(...ys) - d * 1.6
  const body = cl([Math.min(...xs) - padX, top, Math.max(...xs) + padX, Math.max(...ys) + T * 0.25])
  const sW = Math.abs(P[11].x - P[12].x), hw = Math.max(sW * 1.1, d * 1.8, T * 0.75)
  const head = cl([S.x - hw, E - d * 1.6, S.x + hw, H.y])
  return { body, head }
}
