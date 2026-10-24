/* Signup 2b "This is how they'll meet you": the photo ladder, a one-shot canvas reveal that then holds on full.
   render(t) is a pure function of time. Every frame is drawn from pixel.ts pixelateCanvas() output, so the preview
   is exactly what a match receives. Nothing here leaves the device. Reduced motion = static level + 300 ms crossfade. */
import { LEVELS } from '../config'
import { pixelateCanvas } from '../pixel'

/** First-pass timing (GD "snappy" brief). Sharp flash, then each level pops in (ease-out-back, 1.04 bump) and holds.
    No loop: after the pass the hero holds on full and Replay re-runs it (WCAG 2.2.2). */
export const LADDER = {
  SHARP_MS: 250,       // your own sharp photo, flashed
  POP_MS: 120,         // ease-out-back pop between levels
  HOLD_MS: 380,        // each level holds after its pop
  SETTLE_MS: 180,      // the 1.04 bump eases back to 1 at the start of the hold
  POP_SCALE: 1.04,     // scale bump on each step
  CTAS_AFTER_FULL_MS: 250, // Change photo / Looks good appear this long after full lands
  BURST_MS: 700,       // gold burst at Crystal clear
} as const
const STEP = LADDER.POP_MS + LADDER.HOLD_MS
/** When level i (0..4) starts popping in: 250 750 1250 1750 2250 */
export const landAt = (i: number) => LADDER.SHARP_MS + i * STEP
/** End of the first pass: CTAs appear (≈2.5 s). Motion (the burst tail) stops at MOTION_END (≈2.95 s). */
export const PASS_END = landAt(4) + LADDER.CTAS_AFTER_FULL_MS
export const MOTION_END = Math.max(PASS_END, landAt(4) + LADDER.BURST_MS, landAt(4) + LADDER.POP_MS + LADDER.SETTLE_MS)
export type LadderState = { cur: number; landed: number; ctas: boolean; done: boolean }

type Cv = HTMLCanvasElement; type Ctx = CanvasRenderingContext2D
const S = 512
const clamp = (v: number) => Math.max(0, Math.min(1, v))
const easeOutBack = (p: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2) }
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)
const rng = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647
const GOLD = ['#FFE38C', '#F4F3EA', '#FFD2B0', '#FFD84D']

function drawLevel(ctx: Ctx, lv: Cv) { ctx.imageSmoothingEnabled = lv.width >= S; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(lv, 0, 0, S, S) }
/** Pixel star: a plus of art pixels (u px each) with a dark outline. */
function star(ctx: Ctx, x: number, y: number, size: 1 | 2, col: string, u = 8) {
  const cx = Math.round(x / u) * u, cy = Math.round(y / u) * u, pts = size === 1 ? [[0, 0]] : [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
  ctx.fillStyle = '#05020F'; for (const [dx, dy] of pts) ctx.fillRect(cx + dx * u - u / 2, cy + dy * u - u / 2, u * 2, u * 2)
  ctx.fillStyle = col; for (const [dx, dy] of pts) ctx.fillRect(cx + dx * u, cy + dy * u, u, u)
}

export function mountLadder(cv: Cv, img: HTMLImageElement, o: { intro: boolean; reduce: boolean; frozen?: number | null; onState: (s: LadderState) => void }) {
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')!, lv = LEVELS.map((_, i) => pixelateCanvas(img, i + 1)), raw = lv[4]
  let t = o.frozen ?? (o.intro ? 0 : MOTION_END), raf = 0, last = 0, playing = !o.reduce && o.frozen == null && t < MOTION_END
  let ctas = !o.intro, key = '', sel = 0
  const level = (t: number) => { let n = -1; for (let i = 0; i < 5; i++) if (t >= landAt(i)) n = i; return n }
  const stateAt = (t: number): LadderState => { const n = level(t); return { cur: n, landed: n + 1, ctas: ctas || t >= PASS_END, done: t >= MOTION_END } }
  const render = (t: number) => {
    ctx.globalAlpha = 1
    const i = level(t)
    if (i < 0) return drawLevel(ctx, raw)
    // the pop: scale rises 1 → 1.04 on ease-out-back over POP_MS, then settles back to 1 early in the hold
    const u = t - landAt(i), up = u < LADDER.POP_MS
    const k = up ? easeOutBack(u / LADDER.POP_MS) : 1 - easeOut(clamp((u - LADDER.POP_MS) / LADDER.SETTLE_MS))
    const sc = Math.max(1, 1 + (LADDER.POP_SCALE - 1) * k)
    ctx.save(); ctx.translate(S / 2, S / 2); ctx.scale(sc, sc); ctx.translate(-S / 2, -S / 2); drawLevel(ctx, lv[i]); ctx.restore()
    if (up) { ctx.fillStyle = `rgba(255,240,236,${.22 * (1 - u / LADDER.POP_MS)})`; ctx.fillRect(0, 0, S, S) } // a quick flash on the step
    const b = t - landAt(4)
    if (b >= 0 && b < LADDER.BURST_MS) { // gold burst at Crystal clear
      const p = easeOut(b / LADDER.BURST_MS), r = rng(4242)
      for (let n = 0; n < 28; n++) {
        const a = r() * Math.PI * 2, sp = .25 + r() * .3, d = p * S * sp
        if (r() > 1 - p * .9) continue // particles wink out as the burst ends
        star(ctx, S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, p < .5 && n % 3 === 0 ? 2 : 1, GOLD[n % 4])
      }
    }
  }
  const emit = (s: LadderState) => {
    const k = s.cur + ':' + s.landed + ':' + s.ctas + ':' + s.done
    if (k === key) return
    key = k; if (s.ctas && !ctas) { ctas = true; performance.mark('ladder:ctas') }
    if (s.done) performance.mark('ladder:still')
    o.onState(s)
  }
  const frame = (now: number) => {
    t = Math.min(MOTION_END, t + Math.min(100, now - (last || now))); last = now
    if (t >= MOTION_END) playing = false
    render(t); emit(stateAt(t)); raf = playing ? requestAnimationFrame(frame) : 0
  }
  const still = (i: number) => { // reduced motion: a static level, 300 ms crossfade on change
    const from = document.createElement('canvas'); from.width = from.height = S; from.getContext('2d')!.drawImage(cv, 0, 0)
    const t0 = performance.now(); cancelAnimationFrame(raf)
    const step = (now: number) => { const p = clamp((now - t0) / 300); ctx.globalAlpha = 1; ctx.drawImage(from, 0, 0); ctx.globalAlpha = p; drawLevel(ctx, lv[i]); ctx.globalAlpha = 1; if (p < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
  }
  const start = () => { performance.mark('ladder:start'); last = 0; raf = requestAnimationFrame(frame) }
  if (o.reduce && o.frozen == null) { drawLevel(ctx, lv[0]); emit({ cur: 0, landed: 5, ctas: true, done: true }) }
  else { render(t); emit(stateAt(t)); if (playing) start() }
  return {
    /** resume after the viewer closes (no-op once the pass has finished) */
    play() { if (o.reduce || playing || o.frozen != null || t >= MOTION_END) return; playing = true; last = 0; raf = requestAnimationFrame(frame) },
    pause() { playing = false; cancelAnimationFrame(raf); raf = 0 },
    /** re-run the first pass from the sharp flash */
    replay() { if (o.reduce) return; cancelAnimationFrame(raf); t = 0; playing = true; render(t); emit(stateAt(t)); start() },
    show(i: number) { if (!o.reduce || i === sel) return; sel = i; still(i); emit({ cur: i, landed: 5, ctas: true, done: true }) },
    destroy() { playing = false; cancelAnimationFrame(raf) },
  }
}
