/* "Lite" segmentation (v0.1 download budget): instead of the 16 MB multiclass selfie model, build the same 6-class mask
   from two small MediaPipe models plus colour: selfie_segmenter (person vs background, 0.25 MB) + hair_segmenter
   (0.78 MB), then person pixels that aren't hair are split into skin vs clothes by distance to the face's own skin
   colour (sampled under the eyes from the pose), and skin into face vs body by the shoulder line. Pure maths, no DOM. */
import { CLS, toLab, type Lm, type Mask } from './descriptor'

export type SkinModel = { L: number; a: number; b: number; tL0: number; tL1: number; tAB: number; n: number }
const med = (a: number[]) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1] }

/** Skin colour from the cheeks/nose: inner-eye to inner-eye, just below the eyes down to the mouth. */
export function skinModel(px: Uint8ClampedArray, w: number, h: number, lm: Lm[]): SkinModel | null {
  const P = (i: number) => ({ x: lm[i].x * w, y: lm[i].y * h })
  const e1 = P(2), e2 = P(5), m1 = P(9), m2 = P(10), eyeY = (e1.y + e2.y) / 2, mY = (m1.y + m2.y) / 2
  const x0 = Math.floor(Math.min(e1.x, e2.x)), x1 = Math.ceil(Math.max(e1.x, e2.x)), y0 = Math.floor(eyeY + (mY - eyeY) * 0.3), y1 = Math.ceil(mY)
  const L: number[] = [], A: number[] = [], B: number[] = []
  for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
    const i = (y * w + x) * 4, c = toLab(px[i], px[i + 1], px[i + 2]); L.push(c[0]); A.push(c[1]); B.push(c[2])
  }
  if (L.length < 6) return null
  const l0 = med(L), a0 = med(A), b0 = med(B)
  const madL = med(L.map(v => Math.abs(v - l0))), madAB = med(A.map((v, i) => Math.hypot(v - a0, B[i] - b0)))
  // lit and shadowed skin differ mostly in lightness: wide L window, tighter hue/chroma window
  return { L: l0, a: a0, b: b0, tL0: Math.max(0.22, 4 * madL), tL1: Math.max(0.12, 3 * madL), tAB: Math.max(0.03, 3 * madAB), n: L.length }
}

/** Combine person + hair confidences (crop px) and the skin model into a 6-class mask like selfie_multiclass's. */
export function liteMask(name: string, box: { x0: number; y0: number; w: number; h: number }, person: Float32Array, hair: Float32Array,
  px: Uint8ClampedArray, w: number, lm: Lm[], ih: number, sk: SkinModel | null): Mask {
  const data = new Uint8Array(box.w * box.h)
  const shoulderY = (lm[11].y + lm[12].y) / 2 * ih, eyeY = (lm[2].y + lm[5].y) / 2 * ih, neckY = shoulderY - (shoulderY - eyeY) * 0.25
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
    const k = y * box.w + x
    if (person[k] < 0.5 && hair[k] < 0.5) continue
    if (hair[k] >= 0.5) { data[k] = CLS.hair; continue }
    const X = box.x0 + x, Y = box.y0 + y, i = (Y * w + X) * 4
    let skin = false
    if (sk) {
      const c = toLab(px[i], px[i + 1], px[i + 2]), dL = c[0] - sk.L
      skin = dL > -sk.tL0 && dL < sk.tL1 && Math.hypot(c[1] - sk.a, c[2] - sk.b) < sk.tAB
    }
    data[k] = skin ? (Y < neckY ? CLS.faceSkin : CLS.bodySkin) : CLS.clothes
  }
  return { name, x0: box.x0, y0: box.y0, w: box.w, h: box.h, data }
}
