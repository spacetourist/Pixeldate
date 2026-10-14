/* Onboarding photo reveal, "See how they'll see you" (port of design/v3/photo-reveal/reveal.js).
   render(t) is a pure function of time; reduced motion = the settled state. Every level canvas comes from
   pixel.ts pixelateCanvas(), so the preview is identical to what a match receives. Nothing here is sent. */
import { LEVELS } from './config'
import { pixelateCanvas } from './pixel'

// ~10.6 s: sharp 800 · crunch 900 · Stranger hold 1400 · 4 × (600 wipe + 1400 hold) · sparkle 900; CTAs from sparkle + 600
const T = { hold: 800, crunch: 900, rest: 1400, step: 2000, wipe: 600, pop: 280, burst: 900, ctas: 600 }
const crunchEnd = T.hold + T.crunch, climb0 = crunchEnd + T.rest
const lvStart = (i: number) => climb0 + (i - 1) * T.step
const lvLand = (i: number) => i === 0 ? crunchEnd : lvStart(i) + T.wipe
const CLEAR = lvLand(4), SETTLE = CLEAR + T.ctas
export const END = CLEAR + T.burst
const PV = 320

const clamp = (v: number) => Math.max(0, Math.min(1, v))
const easeInOut = (p: number) => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)
// springy landing: hard frames 1.3 → 0.92 → 1.06 → 1 (overshoot, no smooth scaling of pixel type)
const popScale = (p: number | null) => p == null || p < 0 || p >= 1 ? 1 : p < .25 ? 1.3 : p < .5 ? .92 : p < .75 ? 1.06 : 1
const stepped = (p: number, n: number) => Math.floor(p * n) / n
type Cv = HTMLCanvasElement; type Ctx = CanvasRenderingContext2D

function drawLevel(ctx: Ctx, lv: Cv, S: number) { ctx.imageSmoothingEnabled = lv.width >= S; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(lv, 0, 0, S, S) }
/** Block-resolve wipe (animateReveal's diagonal front as a clip). Returns the front cells for dust. */
function wipe(ctx: Ctx, from: Cv, to: Cv, grid: number, t: number, S: number, shimmer = 'rgba(255,240,236,') {
  drawLevel(ctx, from, S)
  const slant = .35, sweep = .3, cell = S / grid, front: [number, number, number][] = []
  ctx.save(); ctx.beginPath()
  for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
    const d = ((x + y * slant) / grid) / (1 + slant), p = (t * (1 + sweep) - d) / sweep
    if (p <= 0) continue
    ctx.rect(Math.round(x * cell), Math.round(y * cell), Math.ceil(cell), Math.ceil(cell))
    if (p < 1) front.push([x, y, p])
  }
  ctx.clip(); drawLevel(ctx, to, S); ctx.restore()
  for (const [x, y, p] of front) { ctx.fillStyle = shimmer + (.45 * Math.sin(Math.PI * p)) + ')'; ctx.fillRect(Math.round(x * cell), Math.round(y * cell), Math.ceil(cell), Math.ceil(cell)) }
  return front.map(([x, y, p]) => [(x + .5) * cell, (y + .5) * cell, p] as const)
}
const rng = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647
const STAR: Record<number, number[][]> = { 1: [[0, 0]], 2: [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]], 3: [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]] }
const GOLD = ['#ffe38c', '#f4f3ea', '#ffd2b0', '#ffe38c']
function star(ctx: Ctx, x: number, y: number, size: number, col: string, u: number) {
  ctx.fillStyle = '#031113'
  for (const [dx, dy] of STAR[size]) ctx.fillRect(Math.round(x / 2) * u + dx * u - u, Math.round(y / 2) * u + dy * u - u, u * 3, u * 3)
  ctx.fillStyle = col
  for (const [dx, dy] of STAR[size]) ctx.fillRect(Math.round(x / 2) * u + dx * u, Math.round(y / 2) * u + dy * u, u, u)
}

const HTML = `<div class="rv-stage"><div class="px-frame px-card"></div><canvas class="pv" aria-label="Your photo as your match will see it"></canvas>
<span class="px-frame px-tag badge hid">LV 1 · STRANGER</span><span class="blk hid">8 BLOCKS</span><canvas class="fx"></canvas></div>
<div class="rv-ladder hid"><span class="nm">STRANGER</span><div class="px-meter"><i></i><i></i><i></i><i></i><i></i></div></div>
<div class="rv-strip hid"></div>
<button class="rv-skip hid" type="button" data-t="reveal-skip">SKIP</button>
<p class="rv-sr" aria-live="polite"></p>`

/** Builds the reveal inside `root` and plays it for `img`. Returns a cleanup function. */
export function mountReveal(root: HTMLElement, img: HTMLImageElement, onSettled: (on: boolean) => void) {
  root.innerHTML = HTML
  const q = <E extends Element>(s: string) => root.querySelector(s) as E
  const pv = q<Cv>('.pv'), fx = q<Cv>('.fx'), badge = q<HTMLElement>('.badge'), blk = q<HTMLElement>('.blk'), nm = q<HTMLElement>('.nm')
  const meter = q<HTMLElement>('.px-meter'), strip = q<HTMLElement>('.rv-strip'), ladder = q<HTMLElement>('.rv-ladder'), skip = q<HTMLElement>('.rv-skip'), live = q<HTMLElement>('.rv-sr')
  const DPR = Math.max(1, Math.round(devicePixelRatio || 1)), u = 2 * DPR, S = PV * DPR
  pv.width = pv.height = S; fx.width = 384 * DPR; fx.height = 388 * DPR
  const pctx = pv.getContext('2d')!, fctx = fx.getContext('2d')!
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const src = pixelateCanvas(img, 5), lv = LEVELS.map((_, i) => pixelateCanvas(img, i + 1))
  let raf = 0, sel = 4, playing: number | null = null
  const show = (el: Element, on: boolean) => el.classList.toggle('hid', !on)
  const thumbs = LEVELS.map((L, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'th empty'; b.dataset.t = 'reveal-thumb-' + (i + 1); b.setAttribute('aria-label', `Level ${i + 1}: ${L.name}`)
    const c = document.createElement('canvas'); const n = document.createElement('span'); n.className = 'n'; n.textContent = String(i + 1)
    b.append(c, n); b.onclick = () => select(i); strip.append(b); return { b, c }
  })
  const range = Object.assign(document.createElement('input'), { type: 'range', min: '0', max: '4', step: '1', value: '4' })
  range.setAttribute('aria-label', 'Preview level'); range.oninput = () => select(+range.value); strip.append(range)
  const glints = () => { star(fctx, 352, 34, 3, '#ffe38c', u); star(fctx, 334, 22, 1, '#f4f3ea', u); star(fctx, 30, 340, 2, '#ffe38c', u) }
  function setHUD(i: number, popP: number | null) {
    const L = LEVELS[i]; badge.textContent = `LV ${i + 1} · ${L.name.toUpperCase()}`; badge.classList.toggle('gold', i === 4)
    const s = popScale(popP)
    badge.style.transform = `scale(${s})`; blk.textContent = L.blocks ? `${L.blocks} BLOCKS` : 'FULL PHOTO'; nm.textContent = L.name.toUpperCase()
  }
  function setMeter(filled: number, partial: number, popP: number | null = null) {
    ;[...meter.children].forEach((m, k) => { const e = m as HTMLElement; e.className = k < filled ? 'is-full' : ''; e.removeAttribute('style'); if (k === filled && partial > 0) e.style.setProperty('--f', String(Math.min(10, partial)))
      if (k === filled - 1 && popP != null) e.style.transform = `scale(${popScale(popP)})` })
  }
  const markSel = (i: number) => { thumbs.forEach((t, k) => { t.b.classList.toggle('sel', k === i); t.b.setAttribute('aria-pressed', String(k === i)) }); range.value = String(i) }
  let settledShown = false
  const settled = (on: boolean) => { if (on !== settledShown) { settledShown = on; onSettled(on) } }

  function render(t: number) {
    fctx.clearRect(0, 0, fx.width, fx.height)
    let cur = 0, pop: number | null = null, dust: readonly (readonly [number, number, number])[] = [], dustCol = GOLD
    if (t < T.hold) { drawLevel(pctx, src, S); cur = -1 }
    else if (t < crunchEnd) { dust = wipe(pctx, src, lv[0], 8, easeInOut((t - T.hold) / T.crunch), S, 'rgba(255,227,140,'); cur = -1 }
    else {
      pop = (t - crunchEnd) / T.pop
      for (let i = 1; i <= 4; i++) if (t >= lvStart(i)) { cur = i; pop = (t - lvLand(i)) / T.pop }
      if (cur > 0 && t < lvLand(cur)) { dust = wipe(pctx, lv[cur - 1], lv[cur], Math.min(64, LEVELS[cur].blocks || 64), easeInOut((t - lvStart(cur)) / T.wipe), S); dustCol = ['#f4f3ea', '#ffd2b0']; pop = null }
      else drawLevel(pctx, lv[cur], S)
    }
    const shown = cur < 0 ? -1 : (pop == null ? cur - 1 : cur); playing = Math.max(0, shown)
    show(badge, shown >= 0); show(blk, shown >= 0); show(ladder, t >= T.hold)
    if (shown >= 0) setHUD(shown, pop); else nm.textContent = 'THEIR VIEW…'
    let full = 0, part = 0
    if (cur < 0) part = t > T.hold ? Math.floor(clamp((t - T.hold) / T.crunch) * 10) : 0
    else if (pop == null) { full = cur; part = Math.floor(clamp((t - lvStart(cur)) / T.wipe) * 10) }
    else full = cur + 1
    setMeter(full, part, pop)
    show(strip, t >= crunchEnd)
    thumbs.forEach((th, i) => { const landed = t >= lvLand(i); if (landed && th.b.classList.contains('empty')) { th.c.width = th.c.height = lv[i].width; th.c.getContext('2d')!.drawImage(lv[i], 0, 0) /* real block count; CSS scales it pixelated */; th.b.classList.remove('empty') } if (!landed) th.b.classList.add('empty') })
    markSel(t >= SETTLE ? sel : Math.max(0, shown))
    settled(t >= SETTLE); (root.parentElement ?? root).style.setProperty('--acts', t >= END ? '1' : t >= SETTLE ? String(stepped(clamp((t - SETTLE) / (END - SETTLE)), 3) || .34) : '0')
    const off = 32 * DPR, stride = Math.max(1, Math.ceil(dust.length / 18))
    dust.forEach(([x, y, p], k) => { if (k % stride) return; const r = rng(k + 1 + Math.floor(t / 80))
      star(fctx, (off + x + (r() - .5) * 40 * DPR) / DPR, (off + y + (r() - .5) * 40 * DPR - p * 30 * DPR) / DPR, p < .5 ? 2 : 1, dustCol[k % dustCol.length], u) })
    if (t >= CLEAR && t < CLEAR + T.burst) {
      const qq = (t - CLEAR) / T.burst, r = rng(42)
      for (let k = 0; k < 26; k++) { const a = r() * 6.283, d = 60 + r() * 120, delay = r() * .35, life = clamp((qq - delay) / .65)
        if (life <= 0 || life >= 1) continue; const e = easeOut(life)
        star(fctx, 192 + Math.cos(a) * d * (.4 + .6 * e), 192 + Math.sin(a) * d * (.4 + .6 * e), life < .3 ? 3 : life < .7 ? 2 : 1, GOLD[k % 4], u) }
    }
    show(skip, t < END)
  }
  function renderSettled() { render(END); playing = null; drawLevel(pctx, lv[sel], S); setHUD(sel, null); setMeter(sel + 1, 0); fctx.clearRect(0, 0, fx.width, fx.height); if (sel === 4) glints() }
  function select(i: number) {
    const prev = playing ?? sel; playing = null; sel = i; markSel(i); live.textContent = `${LEVELS[i].name}: ${LEVELS[i].blocks ? LEVELS[i].blocks + ' blocks' : 'full photo'}`
    cancelAnimationFrame(raf)
    if (reduce || prev === i) return renderSettled()
    const ts = performance.now(), from = lv[prev], to = lv[i], g = Math.min(64, Math.max(LEVELS[i].blocks, LEVELS[prev].blocks) || 64)
    const tick = () => { const p = clamp((performance.now() - ts) / 200); fctx.clearRect(0, 0, fx.width, fx.height)
      wipe(pctx, from, to, g, easeOut(p), S); setHUD(i, null); setMeter(i + 1, 0)
      if (p < 1) raf = requestAnimationFrame(tick); else renderSettled() }
    tick()
  }
  skip.onclick = () => { cancelAnimationFrame(raf); renderSettled() }
  strip.addEventListener('pointermove', e => { if (!e.buttons) return; const r = strip.getBoundingClientRect(); const i = Math.max(0, Math.min(4, Math.floor((e.clientX - r.left) / r.width * 5))); if (i !== sel) select(i) })
  const t = +(new URLSearchParams(location.search).get('revealt') ?? NaN) // freeze a frame for screenshots
  if (!isNaN(t)) t >= END ? renderSettled() : render(t)
  else if (reduce) { renderSettled(); live.textContent = 'Your photo at all 5 levels. Crystal clear selected.' }
  else { const t0 = performance.now(); const tick = (now: number) => { const t = now - t0; if (t >= END) return renderSettled(); render(t); raf = requestAnimationFrame(tick) }; raf = requestAnimationFrame(tick) }
  return () => { cancelAnimationFrame(raf); root.innerHTML = '' }
}
