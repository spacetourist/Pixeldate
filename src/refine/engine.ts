/* Refine reveal · renderer-agnostic engine (SPEC §6): block buffer, split / merge cursors, pop ring and sparkle pool.
   Only draw() differs between WebGL2 (./gl) and Canvas 2D (./r2d). Nothing allocates per frame. */
import { mulberry32, type Tree, type Schedule } from './prep'

export const BUTTER = '#FFD84D', BUTTER_HI = '#FFF4BF', EDGE = '#05020F', SNAP_BG = '#1E1640'
export const SPARK_COLS = ['#FF6F59', '#FFD84D', '#48E5C2'] // coral, butter, mint
export interface Opts {
  popMs: number; popScale: number; edgeMs: number; popMinCss: number; sparkBase: number; sparkFalloff: number; sparkMax: number; fxSeed: number
  /** brief: the first `strongN` splits pop harder (bigger overshoot, brighter + thicker butter edge, longer) */
  strongN: number; strongScale: number; strongMs: number; strongEdgeMs: number
}
export const DEFAULTS: Opts = { popMs: 120, popScale: 1.08, edgeMs: 170, popMinCss: 8, sparkBase: 3.2, sparkFalloff: .52, sparkMax: 72, fxSeed: 7, strongN: 2, strongScale: 1.24, strongMs: 200, strongEdgeMs: 300 }

export const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v
export const easeOutBack = (k: number) => { const c1 = 1.70158, c3 = c1 + 1, m = k - 1; return 1 + c3 * m * m * m + c1 * m * m }
export const easeInOut = (k: number) => k < .5 ? 2 * k * k : 1 - (-2 * k + 2) * (-2 * k + 2) / 2
export const pack = (r: number, g: number, b: number) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
export function lerpPacked(a: number, b: number, k: number) {
  const r = (a & 255) + ((b & 255) - (a & 255)) * k, g = (a >>> 8 & 255) + ((b >>> 8 & 255) - (a >>> 8 & 255)) * k, bl = (a >>> 16 & 255) + ((b >>> 16 & 255) - (a >>> 16 & 255)) * k
  return pack(r | 0, g | 0, bl | 0)
}
export const depthOf = (off: Int32Array, id: number) => { let d = 0; while (id >= off[d + 1]) d++; return d }

/** One drawable pop rect / edge, resolved by the engine so both renderers draw exactly the same thing */
export interface Renderer {
  readonly kind: 'webgl2' | '2d'
  resize(S: number): void
  /** sharp image already at (or near) S×S: an ImageBitmap from the worker, or null */
  setSharp(img: CanvasImageSource | null): void
  takeSnap(): void
  draw(R: Refiner, now: number, sharpA: number, snapA: number): void
  dispose(): void
}

export class Refiner {
  o: Opts; r!: Renderer
  tree: Tree | null = null; sch: Schedule | null = null
  T = 0; buf = new Uint32Array(0); dirty = true; dy0 = 0; dy1 = 0
  S = 0; dpr = 1; lw = 1; spU = 2; popDepth = 0
  cursor = 0; mcursor = 0
  popCap = 256; popId = new Int32Array(256); popT = new Float64Array(256); popS = new Uint8Array(256); popHead = 0; popLen = 0
  sp: { x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array; t0: Float64Array; life: Float32Array; col: Uint8Array; big: Uint8Array; live: Uint8Array; next: number }
  fxRnd: () => number
  constructor(o: Partial<Opts> = {}) {
    this.o = { ...DEFAULTS, ...o }; const M = this.o.sparkMax
    this.sp = { x: new Float32Array(M), y: new Float32Array(M), vx: new Float32Array(M), vy: new Float32Array(M), t0: new Float64Array(M), life: new Float32Array(M), col: new Uint8Array(M), big: new Uint8Array(M), live: new Uint8Array(M), next: 0 }
    this.fxRnd = mulberry32(this.o.fxSeed || 7)
  }
  attach(r: Renderer) { this.r = r; if (this.S) r.resize(this.S) }
  /** backing S = unit·round(css·dpr/unit). unit 64 (SPEC uses 128) so the 1440 stage can be 576 css at dpr 1: every
      block down to 64 across still lands on whole device pixels; the 128 level is a nearest-neighbour blit. */
  resize(css: number, dpr: number, unit = 64, cap = 2048) {
    const S = Math.min(cap, unit * Math.max(1, Math.round(css * dpr / unit)))
    this.dpr = dpr; this.lw = Math.max(1, Math.round(dpr)); this.spU = Math.max(2, Math.round(S / 128 * 2))
    if (S !== this.S) { this.S = S; this.r?.resize(S) }
    this.dirty = true; this.dy0 = 0; this.dy1 = this.T; this.popDepthFor()
    return S / dpr
  }
  private popDepthFor() { if (!this.tree) return; const css = this.S / this.dpr; this.popDepth = 0; while (css / (1 << (this.popDepth + 1)) >= this.o.popMinCss && this.popDepth < this.tree.maxD) this.popDepth++ }
  setTree(tree: Tree, sch: Schedule | null, sharp: CanvasImageSource | null) {
    this.tree = tree; this.sch = sch; const T = 1 << tree.maxD
    if (T !== this.T) { this.T = T; this.buf = new Uint32Array(T * T) }
    this.popDepthFor(); this.r.setSharp(sharp)
    this.cursor = 0; this.mcursor = sch ? sch.n - 1 : 0; this.popLen = 0; this.sp.live.fill(0)
  }
  private mark(y0: number, y1: number) { if (!this.dirty) { this.dirty = true; this.dy0 = y0; this.dy1 = y1 } else { if (y0 < this.dy0) this.dy0 = y0; if (y1 > this.dy1) this.dy1 = y1 } }
  writeNode(id: number, d: number) {
    const t = this.tree!, n = 1 << d, li = id - t.off[d], x = li % n, y = (li / n) | 0, s = this.T >> d, col = t.col32[id], T = this.T
    for (let r = y * s, re = r + s, c0 = x * s; r < re; r++) this.buf.fill(col, r * T + c0, r * T + c0 + s)
    this.mark(y * s, y * s + s)
  }
  fillAll(col: number) { this.buf.fill(col); this.mark(0, this.T) }
  showDepth(d: number) { const off = this.tree!.off; for (let i = off[d]; i < off[d + 1]; i++) this.writeNode(i, d) }
  split(id: number, d: number, now: number, fx: boolean, strong: boolean) {
    const t = this.tree!, n = 1 << d, li = id - t.off[d], x = li % n, y = (li / n) | 0, cn = n * 2, c0 = t.off[d + 1] + 2 * y * cn + 2 * x
    this.writeNode(c0, d + 1); this.writeNode(c0 + 1, d + 1); this.writeNode(c0 + cn, d + 1); this.writeNode(c0 + cn + 1, d + 1)
    if (!fx) return
    if (d + 1 <= this.popDepth) { const i = (this.popHead + this.popLen) % this.popCap; this.popId[i] = id; this.popT[i] = now; this.popS[i] = strong ? 1 : 0; if (this.popLen < this.popCap) this.popLen++; else this.popHead = (this.popHead + 1) % this.popCap }
    const b = this.S / (1 << d), cx = (x + .5) * b, cy = (y + .5) * b; let e = this.o.sparkBase * Math.pow(this.o.sparkFalloff, d) * (strong ? 1.5 : 1)
    while (e > 0) { if (e >= 1 || this.fxRnd() < e) this.spawn(cx, cy, d, now); e -= 1 }
  }
  spawn(x: number, y: number, d: number, now: number) {
    const s = this.sp, i = s.next; s.next = (i + 1) % this.o.sparkMax; const r = this.fxRnd, a = r() * Math.PI * 2, v = (0.03 + r() * 0.05) * this.S / 256 * (d < 2 ? 1.6 : 1)
    s.x[i] = x; s.y[i] = y; s.vx[i] = Math.cos(a) * v; s.vy[i] = Math.sin(a) * v - 0.01 * this.S / 256; s.t0[i] = now; s.life[i] = 420 + r() * 320
    s.col[i] = (r() * 3) | 0; s.big[i] = d < 3 || r() < .25 ? 1 : 0; s.live[i] = 1
  }
  /** advance the split cursor to tr ms since the reveal started; true when done */
  revealTo(tr: number, now: number, fx: boolean) {
    const s = this.sch!; while (this.cursor < s.n && s.t[this.cursor] <= tr) { this.split(s.ids[this.cursor], s.depth[this.cursor], now - (tr - s.t[this.cursor]), fx, this.cursor < this.o.strongN); this.cursor++ }
    return this.cursor >= s.n
  }
  mergeTo(tm: number) { const s = this.sch!; while (this.mcursor >= 0 && s.mt[this.mcursor] <= tm) { this.writeNode(s.ids[this.mcursor], s.depth[this.mcursor]); this.mcursor-- } return this.mcursor < 0 }
  takeSnap() { this.r.takeSnap() }
  draw(now: number, sharpA: number, snapA: number) { this.r.draw(this, now, sharpA, snapA) }
  /** drop expired pops (head first; strong ones live longest and are always first) */
  prunePops(now: number) {
    const o = this.o
    while (this.popLen) { const h = this.popHead, life = this.popS[h] ? Math.max(o.strongMs, o.strongEdgeMs) : Math.max(o.popMs, o.edgeMs); if (now - this.popT[h] <= life) break; this.popHead = (h + 1) % this.popCap; this.popLen-- }
  }
  /** pop geometry for ring slot q: calls f(cid, x, y, size) for its 4 children; returns {kp, edgeA, strong} via fields */
  popK = 0; popE = 0; popStrong = false
  pop(q: number, now: number, f: (cid: number, px: number, py: number, bs: number) => void) {
    const i = (this.popHead + q) % this.popCap, id = this.popId[i], age = now - this.popT[i], t = this.tree!, o = this.o, st = this.popS[i] === 1
    if (age < 0) return false
    const ms = st ? o.strongMs : o.popMs, ems = st ? o.strongEdgeMs : o.edgeMs, scale = st ? o.strongScale : o.popScale
    const d = depthOf(t.off, id), n = 1 << d, li = id - t.off[d], x = li % n, y = (li / n) | 0, cn = n * 2, c0 = t.off[d + 1] + 2 * y * cn + 2 * x, b = this.S / (1 << (d + 1))
    const kp = clamp01(age / ms), sc = 1 + (scale - 1) * (1 - easeOutBack(kp)), bs = b * sc, ke = clamp01(age / ems)
    this.popK = kp; this.popE = ke < .4 ? 1 : 1 - (ke - .4) / .6; this.popStrong = st
    for (let j = 0; j < 4; j++) { const cid = j < 2 ? c0 + j : c0 + cn + (j - 2); f(cid, (2 * x + (j & 1)) * b + b / 2 - bs / 2, (2 * y + (j >> 1)) * b + b / 2 - bs / 2, bs) }
    return true
  }
  /** visible sparkle shapes for this frame (SPEC §5 look), each as up to 2 rects; f(pass 0 = shadow | 1..3 colour, x, y, w, h) */
  sparks(now: number, f: (pass: number, x: number, y: number, w: number, h: number) => void) {
    const s = this.sp, M = this.o.sparkMax, u = this.spU
    for (let pass = 0; pass < 4; pass++) for (let i = 0; i < M; i++) {
      if (!s.live[i]) continue; const age = now - s.t0[i]
      if (age > s.life[i]) { s.live[i] = 0; continue }
      if (age < 0 || (pass > 0 && s.col[i] !== pass - 1)) continue
      const k = age / s.life[i]; if (k > .55 && ((age / 70) | 0) % 3 === 2) continue
      const x = Math.round((s.x[i] + s.vx[i] * age) / u) * u, y = Math.round((s.y[i] + s.vy[i] * age) / u) * u, o = pass === 0 ? this.lw : 0
      if (s.big[i] && k < .45) { f(pass, x - u + o, y - u * 2 + o, u, u * 3); f(pass, x - u * 2 + o, y - u + o, u * 3, u) }
      else f(pass, x - u / 2 + o, y - u / 2 + o, u, u)
    }
  }
  sparksAlive(now: number) { const s = this.sp; for (let i = 0; i < this.o.sparkMax; i++) if (s.live[i] && now - s.t0[i] <= s.life[i]) return true; return false }
}
