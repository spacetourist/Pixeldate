/* Signup 2b "This is how they'll meet you": the photo ladder, a looping canvas reveal.
   render(t) is a pure function of time. Every frame is drawn from pixel.ts pixelateCanvas() output, so the preview
   is exactly what a match receives. Nothing here leaves the device. Reduced motion = static level + 300 ms crossfade. */
import { LEVELS } from '../config'
import { pixelateCanvas } from '../pixel'

// one loop: crunch full→8 (900) · then each level lands every 1400 (900 hold + 500 wipe) · gold burst at clear · rest
const T = { sharp: 700, crunch: 900, hold: 900, wipe: 500, burst: 900, rest: 1600, ctas: 600 }
const land = (i: number) => T.crunch + i * (T.hold + T.wipe) // 900 2300 3700 5100 6500
const wipeAt = (i: number) => land(i) - T.wipe
export const PERIOD = land(4) + T.rest
/** First pass: a sharp hold of your own photo, then the loop. CTAs appear shortly after it clears. */
export const SKIP_TO = T.sharp + land(4), INTRO_END = SKIP_TO + T.ctas
export type LadderState = { cur: number; landed: number; ctas: boolean }

type Cv = HTMLCanvasElement; type Ctx = CanvasRenderingContext2D
const S = 512
const clamp = (v: number) => Math.max(0, Math.min(1, v))
const easeInOut = (p: number) => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)
const rng = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647
const GOLD = ['#FFE38C', '#F4F3EA', '#FFD2B0', '#FFD84D']

function drawLevel(ctx: Ctx, lv: Cv) { ctx.imageSmoothingEnabled = lv.width >= S; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(lv, 0, 0, S, S) }
/** Diagonal block-resolve wipe (same front as animateReveal). Returns the front cells for dust. */
function wipe(ctx: Ctx, from: Cv, to: Cv, grid: number, t: number) {
  drawLevel(ctx, from)
  const slant = .35, sweep = .3, cell = S / grid, front: [number, number, number][] = []
  ctx.save(); ctx.beginPath()
  for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
    const d = ((x + y * slant) / grid) / (1 + slant), p = (t * (1 + sweep) - d) / sweep
    if (p <= 0) continue
    ctx.rect(Math.round(x * cell), Math.round(y * cell), Math.ceil(cell), Math.ceil(cell))
    if (p < 1) front.push([x, y, p])
  }
  ctx.clip(); drawLevel(ctx, to); ctx.restore()
  for (const [x, y, p] of front) { ctx.fillStyle = `rgba(255,240,236,${.4 * Math.sin(Math.PI * p)})`; ctx.fillRect(Math.round(x * cell), Math.round(y * cell), Math.ceil(cell), Math.ceil(cell)) }
  return front.map(([x, y, p]) => [(x + .5) * cell, (y + .5) * cell, p] as const)
}
/** Pixel star: a plus of art pixels (u px each) with a dark outline. */
function star(ctx: Ctx, x: number, y: number, size: 1 | 2, col: string, u = 8) {
  const cx = Math.round(x / u) * u, cy = Math.round(y / u) * u, pts = size === 1 ? [[0, 0]] : [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
  ctx.fillStyle = '#05020F'; for (const [dx, dy] of pts) ctx.fillRect(cx + dx * u - u / 2, cy + dy * u - u / 2, u * 2, u * 2)
  ctx.fillStyle = col; for (const [dx, dy] of pts) ctx.fillRect(cx + dx * u, cy + dy * u, u, u)
}

export function mountLadder(cv: Cv, img: HTMLImageElement, o: { intro: boolean; reduce: boolean; frozen?: number | null; onState: (s: LadderState) => void }) {
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')!, lv = LEVELS.map((_, i) => pixelateCanvas(img, i + 1)), raw = lv[4]
  const mid = document.createElement('canvas'), mctx = mid.getContext('2d')!
  let t = o.frozen ?? (o.intro ? 0 : SKIP_TO), raf = 0, last = 0, playing = !o.reduce && o.frozen == null, ctas = !o.intro, key = '', sel = 0

  const stateAt = (t: number): LadderState => {
    if (t < T.sharp) return { cur: -1, landed: 0, ctas: ctas || t >= INTRO_END }
    const first = t - T.sharp < PERIOD, u = (t - T.sharp) % PERIOD
    let n = 0; for (let i = 0; i < 5; i++) if (u >= land(i)) n = i + 1
    return { cur: n === 0 ? (first ? -1 : 4) : n - 1, landed: first ? n : 5, ctas: ctas || t >= INTRO_END }
  }
  const render = (t: number) => {
    ctx.globalAlpha = 1
    if (t < T.sharp) return drawLevel(ctx, raw)
    const u = (t - T.sharp) % PERIOD
    if (u < land(0)) { // crunch: block size grows geometrically 1 → 64 px, in hard steps
      const p = Math.floor(easeInOut(u / T.crunch) * 10) / 10, n = Math.max(8, Math.round(S * Math.pow(8 / S, p)))
      if (n >= S) return drawLevel(ctx, raw)
      mid.width = mid.height = n; mctx.imageSmoothingQuality = 'high'; mctx.drawImage(raw, 0, 0, n, n)
      return drawLevel(ctx, mid)
    }
    let i = 0; for (let k = 1; k < 5; k++) if (u >= land(k)) i = k
    if (i < 4 && u >= wipeAt(i + 1)) {
      const front = wipe(ctx, lv[i], lv[i + 1], lv[i + 1].width >= S ? 64 : lv[i + 1].width, clamp((u - wipeAt(i + 1)) / T.wipe))
      const r = rng(97 + i * 13 + Math.floor((u - wipeAt(i + 1)) / 90))
      for (const [x, y] of front) if (r() < .05) star(ctx, x, y, r() < .3 ? 2 : 1, '#F4F3EA')
      return
    }
    drawLevel(ctx, lv[i])
    const b = u - land(4)
    if (b >= 0 && b < T.burst) { // gold burst at Crystal clear
      const p = easeOut(b / T.burst), r = rng(4242)
      for (let k = 0; k < 28; k++) {
        const a = r() * Math.PI * 2, sp = .25 + r() * .3, d = p * S * sp
        if (r() > 1 - p * .9) continue // particles wink out as the burst ends
        star(ctx, S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, p < .5 && k % 3 === 0 ? 2 : 1, GOLD[k % 4])
      }
    }
  }
  const emit = (s: LadderState) => { const k = s.cur + ':' + s.landed + ':' + s.ctas; if (k !== key) { key = k; if (s.ctas) ctas = true; o.onState(s) } }
  const frame = (now: number) => {
    t += Math.min(100, now - (last || now)); last = now
    render(t); emit(stateAt(t)); raf = playing ? requestAnimationFrame(frame) : 0
  }
  const still = (i: number) => { // reduced motion: a static level, 300 ms crossfade on change
    const from = document.createElement('canvas'); from.width = from.height = S; from.getContext('2d')!.drawImage(cv, 0, 0)
    const t0 = performance.now(); cancelAnimationFrame(raf)
    const step = (now: number) => { const p = clamp((now - t0) / 300); ctx.globalAlpha = 1; ctx.drawImage(from, 0, 0); ctx.globalAlpha = p; drawLevel(ctx, lv[i]); ctx.globalAlpha = 1; if (p < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
  }
  if (o.reduce && o.frozen == null) { drawLevel(ctx, lv[0]); emit({ cur: 0, landed: 5, ctas: true }) }
  else { render(t); emit(stateAt(t)); if (playing) raf = requestAnimationFrame(frame) }
  return {
    play() { if (o.reduce || playing) return; playing = true; last = 0; raf = requestAnimationFrame(frame) },
    pause() { playing = false; cancelAnimationFrame(raf); raf = 0 },
    skip() { ctas = true; t = SKIP_TO; if (!playing) { render(t) } emit(stateAt(t)) },
    show(i: number) { if (!o.reduce || i === sel) return; sel = i; still(i); emit({ cur: i, landed: 5, ctas: true }) },
    destroy() { playing = false; cancelAnimationFrame(raf) },
  }
}
