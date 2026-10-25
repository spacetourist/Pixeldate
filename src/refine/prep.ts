/* Refine reveal · image prep (SPEC §2–§4). Pure functions on typed arrays: no DOM, so the same code runs in the
   Worker (normal path) and on the main thread (fallback when Workers / OffscreenCanvas are missing).
   Flat quadtree over every node, depth 0..maxD: id = off[d] + y·2^d + x. */
export interface Tree { maxD: number; off: Int32Array; count: number; col32: Uint32Array; sd: Float32Array }
export interface Schedule { n: number; ids: Int32Array; depth: Uint8Array; t: Float32Array; mt: Float32Array; dur: number; mergeDur: number }
export interface SchedOpts { seed: number; startDepth: number; minDepth: number; sdStop: number; bias: number; sdRef: number; intro: number; dur: number; gamma: number; power: number; mergeDur?: number }

export function mulberry32(a: number) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
/** ImageData Uint32 view (little-endian ABGR) */
export const pack = (r: number, g: number, b: number) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
export function offsets(maxD: number) { const off = new Int32Array(maxD + 2); let n = 0; for (let d = 0; d <= maxD; d++) { off[d] = n; n += 1 << (2 * d) } off[maxD + 1] = n; return off }
export const treeOf = (maxD: number, col32: Uint32Array, sd: Float32Array): Tree => { const off = offsets(maxD); return { maxD, off, count: off[maxD + 1], col32, sd } }

/** Finding images: the build-time file from tools/refine-data.py (finest RGB means + sd per node); parents are the
    mean of their 4 children, the same pyramid treeFromImage builds. */
export function treeFromRR(buf: ArrayBuffer): Tree {
  const u = new Uint8Array(buf); if (u[0] !== 82 || u[1] !== 82 || u[2] !== 1) throw new Error('bad .rr')
  const maxD = u[3], T = 1 << maxD, off = offsets(maxD), count = off[maxD + 1]
  const r = new Float32Array(count), g = new Float32Array(count), b = new Float32Array(count), o = off[maxD], L = 4, S = L + T * T * 3
  for (let i = 0; i < T * T; i++) { r[o + i] = u[L + i * 3]; g[o + i] = u[L + i * 3 + 1]; b[o + i] = u[L + i * 3 + 2] }
  pyramid(maxD, off, r, g, b)
  const sd = new Float32Array(count); for (let i = 0; i < count; i++) sd[i] = u[S + i] / 2
  return { maxD, off, count, col32: colours(count, r, g, b), sd }
}
function pyramid(maxD: number, off: Int32Array, r: Float32Array, g: Float32Array, b: Float32Array, sq?: Float32Array) {
  for (let d = maxD - 1; d >= 0; d--) {
    const n = 1 << d, cn = n * 2, od = off[d], oc = off[d + 1]
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const id = od + y * n + x, c0 = oc + 2 * y * cn + 2 * x, c1 = c0 + 1, c2 = c0 + cn, c3 = c2 + 1
      r[id] = (r[c0] + r[c1] + r[c2] + r[c3]) / 4; g[id] = (g[c0] + g[c1] + g[c2] + g[c3]) / 4; b[id] = (b[c0] + b[c1] + b[c2] + b[c3]) / 4
      if (sq) sq[id] = (sq[c0] + sq[c1] + sq[c2] + sq[c3]) / 4
    }
  }
}
const colours = (n: number, r: Float32Array, g: Float32Array, b: Float32Array) => { const c = new Uint32Array(n); for (let i = 0; i < n; i++) c[i] = pack(Math.round(r[i]), Math.round(g[i]), Math.round(b[i])); return c }

/** Runtime box-average pyramid from RGBA pixels of a (4·2^maxD)² readback (SPEC treeFromImage). Kept for tools and
    tests; the app never calls it on the main thread (finding images are prebuilt). */
export function treeFromPixels(px: Uint8ClampedArray, maxD: number): Tree {
  const T = 1 << maxD, W = T * 4, off = offsets(maxD), count = off[maxD + 1], o = off[maxD]
  const r = new Float32Array(count), g = new Float32Array(count), b = new Float32Array(count), sq = new Float32Array(count)
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    let R = 0, G = 0, B = 0, s2 = 0
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const p = ((y * 4 + j) * W + x * 4 + i) * 4, a = px[p], c = px[p + 1], e = px[p + 2]; R += a; G += c; B += e; s2 += a * a + c * c + e * e }
    const id = o + y * T + x; r[id] = R / 16; g[id] = G / 16; b[id] = B / 16; sq[id] = s2 / 16
  }
  pyramid(maxD, off, r, g, b, sq)
  const sd = new Float32Array(count); for (let i = 0; i < count; i++) sd[i] = Math.sqrt(Math.max(0, sq[i] - (r[i] * r[i] + g[i] * g[i] + b[i] * b[i])) / 3)
  return { maxD, off, count, col32: colours(count, r, g, b), sd }
}

/** Sample an n×n grid from RGBA pixels (w×h) at cell centres: no averaging, so a received pixelated level gives back
    exactly the colours the peer sent. `avg` box-averages instead (only for the full photo -> its own 128 grid). */
export function grid(px: Uint8ClampedArray, w: number, h: number, n: number, avg = false): Uint8ClampedArray {
  const out = new Uint8ClampedArray(n * n * 4)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const o = (y * n + x) * 4
    if (!avg) { const sx = Math.min(w - 1, Math.floor((x + .5) * w / n)), sy = Math.min(h - 1, Math.floor((y + .5) * h / n)), p = (sy * w + sx) * 4; out[o] = px[p]; out[o + 1] = px[p + 1]; out[o + 2] = px[p + 2]; out[o + 3] = 255; continue }
    const x0 = Math.floor(x * w / n), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / n)), y0 = Math.floor(y * h / n), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / n))
    let R = 0, G = 0, B = 0, k = 0
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const p = (yy * w + xx) * 4; R += px[p]; G += px[p + 1]; B += px[p + 2]; k++ }
    out[o] = R / k; out[o + 1] = G / k; out[o + 2] = B / k; out[o + 3] = 255
  }
  return out
}

/** Level-up: only the two RECEIVED levels exist. Depth lo = coarse grid, depth lo+1 = fine grid; nothing deeper is
    ever built. Bias = how much the 4 fine cells differ from their coarse parent (no detail is invented). Depths
    above lo stay black: the schedule starts at lo and never reads them. */
export function treeFromLevels(coarse: Uint8ClampedArray, fine: Uint8ClampedArray, lo: number): Tree {
  const maxD = lo + 1, off = offsets(maxD), count = off[maxD + 1], n = 1 << lo, fn = n * 2
  const col32 = new Uint32Array(count), sd = new Float32Array(count)
  for (let i = 0; i < n * n; i++) col32[off[lo] + i] = pack(coarse[i * 4], coarse[i * 4 + 1], coarse[i * 4 + 2])
  for (let i = 0; i < fn * fn; i++) col32[off[maxD] + i] = pack(fine[i * 4], fine[i * 4 + 1], fine[i * 4 + 2])
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const ci = (y * n + x) * 4; let s = 0
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const f = ((2 * y + j) * fn + 2 * x + i) * 4; s += Math.abs(fine[f] - coarse[ci]) + Math.abs(fine[f + 1] - coarse[ci + 1]) + Math.abs(fine[f + 2] - coarse[ci + 2]) }
    sd[off[lo] + y * n + x] = s / 12
  }
  return { maxD, off, count, col32, sd }
}

/** Split schedule (SPEC §3–§4): key = parentKey + Exp(1)/w, w = 1 + bias·min(1, sd/sdRef); sorted by key; real time
    t = intro + (dur − intro)·x^(1/power) on cumulative cost x, c = 2^(−γ·depth); reverse merge mt. */
export function buildSchedule(t: Tree, o: SchedOpts): Schedule {
  const rnd = mulberry32(o.seed >>> 0 || 1), maxD = t.maxD, off = t.off
  const key = new Float64Array(t.count), ids: number[] = []
  let active: number[] = []; for (let i = off[o.startDepth]; i < off[o.startDepth + 1]; i++) active.push(i)
  for (let d = o.startDepth; d < maxD && active.length; d++) {
    const n = 1 << d, next: number[] = []
    for (const id of active) {
      const sd = t.sd[id]
      if (d >= o.minDepth && sd < o.sdStop) continue
      const w = 1 + o.bias * Math.min(1, sd / o.sdRef), li = id - off[d], x = li % n, y = (li / n) | 0
      const pk = d > o.startDepth ? key[off[d - 1] + (y >> 1) * (n >> 1) + (x >> 1)] : 0
      key[id] = pk + (-Math.log(1 - rnd())) / w; ids.push(id)
      const cn = n * 2, c0 = off[d + 1] + 2 * y * cn + 2 * x
      next.push(c0, c0 + 1, c0 + cn, c0 + cn + 1)
    }
    active = next
  }
  const order = ids.sort((a, b) => key[a] - key[b])
  const N = order.length, mergeDur = o.mergeDur || 0
  const out: Schedule = { n: N, ids: Int32Array.from(order), depth: new Uint8Array(N), t: new Float32Array(N), mt: new Float32Array(N), dur: o.dur, mergeDur }
  let total = 0
  for (let i = 0; i < N; i++) { const id = out.ids[i]; let d = 0; while (id >= off[d + 1]) d++; out.depth[i] = d; total += Math.pow(2, -o.gamma * d) }
  let cum = 0; const span = o.dur - o.intro
  for (let i = 0; i < N; i++) {
    out.t[i] = o.intro + span * Math.pow(cum / total, 1 / o.power)
    out.mt[i] = mergeDur * (1 - (out.t[i] - o.intro) / span)
    cum += Math.pow(2, -o.gamma * out.depth[i])
  }
  return out
}

/** SPEC §5 parameter sets */
export const FIND = { maxD: 7, intro: 380, dur: 4600, xfade: 360, hold: 1200, unfade: 220, mergeDur: 700, tween: 240, gamma: .62, power: 2.4, bias: 2.2, sdRef: 46, sdStop: 4.5, minDepth: 3, capPopMs: 260, nextAt: 520 }
export const FIND_RM = { steps: [3, 4, 5], stepHold: 950, stepFade: 300, hold: 1700 }
export const LV = { dur: 1200, power: 1.7, bias: 2.0, sdRef: 28, xfade: 360, rmFade: 300 }
export const findSched = (t: Tree, seed: number) => buildSchedule(t, { seed, startDepth: 0, minDepth: FIND.minDepth, sdStop: FIND.sdStop, bias: FIND.bias, sdRef: FIND.sdRef, intro: FIND.intro, dur: FIND.dur, gamma: FIND.gamma, power: FIND.power, mergeDur: FIND.mergeDur })
export const lvSched = (t: Tree, lo: number, seed: number) => buildSchedule(t, { seed, startDepth: lo, minDepth: 0, sdStop: -1, bias: LV.bias, sdRef: LV.sdRef, intro: 0, dur: LV.dur, gamma: 0, power: LV.power, mergeDur: 0 })
