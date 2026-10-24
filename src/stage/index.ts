/* Stage photo controller (main bundle, tiny). Picks a renderer:
   - 'gl'     WebGL2 de-pixelation shader, lazy-loaded (./gl is its own chunk, never in the initial JS)
   - '2d'     Canvas 2D fallback (no WebGL2, shader failed, or the context was lost): the diagonal-front reveal
   - 'static' reduced motion: no blocks tween, a 300 ms opacity crossfade between the two allowed images
   One rAF loop drives the uniforms while a tween runs; nothing goes through React state. */
import { animateReveal } from '../pixel'
import type { R } from './gl'

export type Anim = 'cut' | 'up' | 'full'
export type Mode = 'gl' | '2d' | 'static'
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const ease = (r: number) => r < .5 ? 4 * r * r * r : 1 - Math.pow(-2 * r + 2, 3) / 2
let glMod: Promise<typeof import('./gl')> | null = null
export const loadGL = () => (glMod ??= import('./gl'))
export const canGL = () => typeof WebGL2RenderingContext !== 'undefined' && !(window as any).__pdNoGL

/** timings from motion/levelup.png and motion/reveal.png */
export const T = { up: { delay: 400, dur: 1000, front: true }, full: { delay: 400, dur: 2000, front: false }, rm: 300 }

export class Stage {
  c: HTMLCanvasElement | null = null; r: R | null = null; mode: Mode = 'static'
  cur: HTMLImageElement | null = null; prev: HTMLImageElement | null = null
  clar = 0; private raf = 0; private ro?: ResizeObserver; private tw: null | { t0: number; delay: number; dur: number; b0: number; b1: number; front: boolean } = null
  private gen = 0; onMode?: (m: Mode) => void; onBroken?: () => void; broken = false
  constructor() { (window as any).__pdStage = this }
  /** canvas mounted (or remounted when the photo moves between the stage and the compact plate) */
  attach(c: HTMLCanvasElement | null, wantGL: boolean) {
    if (c === this.c) return
    this.detach(); this.c = c; if (!c) return
    const g = ++this.gen
    const use2d = () => { this.mode = RM() ? 'static' : '2d'; this.onMode?.(this.mode); if (this.cur) this.paint2d('cut') }
    if (!wantGL || this.broken || !canGL() || RM()) { use2d(); return }
    loadGL().then(m => {
      if (g !== this.gen || !this.c) return
      const r = m.createGL(c, () => { this.broken = true; this.r = null; this.mode = '2d'; this.onBroken?.() })
      if (!r) { this.broken = true; this.onBroken?.(); return }
      this.r = r; this.mode = 'gl'; this.onMode?.('gl')
      this.ro = new ResizeObserver(() => this.fit()); this.ro.observe(c); this.fit()
      if (this.cur) { r.setTex(this.cur, false); this.frame() }
    }, () => { this.broken = true; use2d() })
  }
  detach() { cancelAnimationFrame(this.raf); this.ro?.disconnect(); this.r?.destroy(); this.r = null; this.c = null; this.tw = null }
  private fit() { const c = this.c, r = this.r; if (!c || !r) return; const d = Math.min(2, devicePixelRatio || 1); const px = Math.min(2048, Math.ceil(Math.max(c.clientWidth, c.clientHeight) * d)) || 512; r.size(px, d); this.frame() }
  /** show the photo for the (new) current level. `anim` only ever moves towards this image; the image itself is
      what the peer sent for the level we are both at, so the reveal never shows more than allowed. */
  show(img: HTMLImageElement, anim: Anim = 'cut') {
    const prev = this.cur; this.prev = prev; this.cur = img
    if (!prev || img.naturalWidth <= prev.naturalWidth) anim = 'cut'
    if (!this.c) return
    if (!this.r) { this.paint2d(anim); return }
    this.r.setTex(img, anim !== 'cut')
    if (anim === 'cut' || RM()) { this.tw = null; this.frame(); return }
    const t = T[anim], n = img.naturalWidth
    this.tw = { t0: performance.now(), delay: t.delay, dur: t.dur, b0: prev!.naturalWidth, b1: n, front: t.front }
    this.loop()
  }
  setClarity(v: number) { this.clar = v; if (!this.tw) this.frame() }
  /** progress for tests: blocks currently drawn */
  blocks = 0
  private frame(now = performance.now()) {
    const r = this.r; if (!r || !this.cur) return
    const n = this.cur.naturalWidth; let blocks = n, front = -2, prevMix = 0
    const tw = this.tw
    if (tw) {
      const raw = Math.max(0, Math.min(1, (now - tw.t0 - tw.delay) / tw.dur)), k = ease(raw)
      blocks = tw.b0 + (tw.b1 - tw.b0) * k
      prevMix = 1 - Math.min(1, raw / .2) // the first 20%: blend from the old (already shown) image into the new one
      if (tw.front && raw > 0 && raw < 1) front = -.15 + 1.3 * k
      if (raw >= 1) this.tw = null
    }
    this.blocks = blocks
    r.draw({ blocks, front, clar: this.clar, prevMix })
  }
  private loop() {
    cancelAnimationFrame(this.raf)
    const step = (t: number) => { if (document.hidden) { this.raf = requestAnimationFrame(step); return } this.frame(t); if (this.tw) this.raf = requestAnimationFrame(step) }
    this.raf = requestAnimationFrame(step)
  }
  private paint2d(anim: Anim) {
    const c = this.c, img = this.cur; if (!c || !img) return
    if (anim === 'cut' || !this.prev) { animateReveal(c, null, img); return }
    if (RM()) { crossfade(c, this.prev, img, T.rm); return }
    const t = T[anim]; animateReveal(c, this.prev, img, undefined, t)
  }
}
/** reduced motion: draw the old image, then the new one at rising opacity over `ms` (no blocks tween, no front) */
function crossfade(c: HTMLCanvasElement, a: HTMLImageElement, b: HTMLImageElement, ms: number) {
  const x = c.getContext('2d')!, S = c.width, t0 = performance.now(); x.imageSmoothingEnabled = false
  const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); x.globalAlpha = 1; x.drawImage(a, 0, 0, S, S); x.globalAlpha = k; x.drawImage(b, 0, 0, S, S); x.globalAlpha = 1; if (k < 1) requestAnimationFrame(step) }
  step()
}
