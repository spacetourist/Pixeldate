/* Finding screen loop (SPEC §5, port of finding.js): reveal -> crossfade to sharp -> caption payoff -> hold ->
   reverse merge -> root-colour tween -> next image from a shuffle bag (never the same image twice in a row).
   Trees + schedules are prebuilt at build time (tools/refine-data.py) and finished in the Worker together with the
   sharp image's decode + resize, so the main thread only swaps typed arrays in. React stays out of the frame path. */
import { Refiner, clamp01, easeInOut, lerpPacked } from './engine'
import { FIND as P, FIND_RM as RM, mulberry32, type Tree, type Schedule } from './prep'
import { R2D } from './r2d'
import { RGL, glOK } from './gl'
import { prep, prepWhere } from './client'

export const POOL = [
  { id: 'disco-frog', cap: 'a disco frog' },
  { id: 'corgi-sunglasses', cap: 'a corgi in shades' },
  { id: 'cat-astronaut', cap: 'a cat astronaut' },
  { id: 'pizza-surfing', cap: 'a pizza slice, surfing' },
  { id: 'balloon-neon-city', cap: 'a balloon over Neon City' },
  { id: 'arcade-cabinet', cap: 'a retro arcade cabinet' },
  { id: 'strawberry-umbrella', cap: 'a strawberry with a brolly' },
]
type Entry = typeof POOL[number]
interface Item { e: Entry; tree: Tree; sch: Schedule; bmp: ImageBitmap | null }
export interface FindOpts { canvas: HTMLCanvasElement; cap: HTMLElement; capT: HTMLElement; root: HTMLElement; reduced: boolean; base: string; seed?: number; seq?: string[]; capture?: boolean; mode?: 'webgl2' | '2d' }

export function startFinding(o: FindOpts) {
  const q = new URLSearchParams(location.search)
  let seed = o.seed ?? (+(q.get('seed') || 0) || ((Math.random() * 1e9) | 0))
  const seq = o.seq ?? (q.get('seq') || '').split(',').filter(Boolean)
  const want = o.mode ?? (q.get('rr') as any) ?? ((window as any).__pdNoGL ? '2d' : undefined)
  const R = new Refiner({ fxSeed: seed ^ 0x5bd1 })
  const r = want !== '2d' && glOK() ? new RGL(o.canvas) : new R2D(o.canvas)
  const dpr = Math.min(3, devicePixelRatio || 1)
  const fit = () => { const css = parseFloat(getComputedStyle(o.root).getPropertyValue('--rr-css')) || 256; const c = R.resize(css, dpr); o.canvas.style.width = o.canvas.style.height = c + 'px'; return c }
  R.attach(r); fit()
  const reduced = q.get('motion') === 'reduce' || (q.get('motion') !== 'full' && o.reduced)

  const rnd = mulberry32(seed); let bag: Entry[] = [], last: Entry | null = null
  const nextEntry = (): Entry => {
    if (seq.length) { const id = seq.shift(); return (last = POOL.find(p => p.id === id) || POOL[0]) }
    if (!bag.length) { bag = POOL.slice(); for (let i = bag.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [bag[i], bag[j]] = [bag[j], bag[i]] } if (bag[bag.length - 1] === last) bag.unshift(bag.pop()!) }
    return (last = bag.pop()!)
  }
  const stats = { prepMs: [] as number[], applyMs: [] as number[], shown: [] as string[] }
  const load = (e: Entry): Promise<Item> => { seed = (seed * 1664525 + 1013904223) >>> 0
    return prep({ k: 'find', rr: o.base + e.id + '.rr', img: o.base + e.id + '.webp', S: R.S, seed }).then(x => { stats.prepMs.push(+x.ms.toFixed(2)); return { e, tree: x.tree, sch: x.sch, bmp: x.bmp || null } }) }

  let capState = -1
  const setCap = (on: number, k: number, text: string) => {
    if (on !== capState) { capState = on; o.cap.classList.toggle('is-on', !!on); o.capT.textContent = on ? 'Warming up: ' + text : 'Warming up…' }
    const s = on ? (k < .34 ? .82 : k < .67 ? 1.1 : 1) : 1; o.cap.style.transform = s === 1 ? '' : `scale(${s})`
  }

  let cur: Item | null = null, nxt: Item | null = null, nxtP: Promise<Item> | null = null, phase = 'boot', t0 = 0, prevRoot = 0, rmStep = 0, dead = false
  const queue = () => { const e = nextEntry(); nxt = null; nxtP = load(e); nxtP.then(i => { if (!dead) nxt = i }, () => {}) }
  const apply = (item: Item) => { const a = performance.now(); cur?.bmp?.close(); cur = item; R.setTree(item.tree, item.sch, item.bmp); stats.applyMs.push(+(performance.now() - a).toFixed(2)); stats.shown.push(item.e.id); o.root.dataset.img = item.e.id }
  function startImage(item: Item, now: number, fromCol: number | null) {
    apply(item)
    if (fromCol != null) { phase = 'tween'; prevRoot = fromCol } else { phase = reduced ? 'rm' : 'reveal'; R.showDepth(reduced ? RM.steps[0] : 0) }
    t0 = now; setCap(0, 0, ''); rmStep = 0; queue()
  }
  function frame(now: number) {
    const t = now - t0; let sharpA = 0, snapA = 0
    if (phase === 'tween') {
      const k = clamp01(t / P.tween); R.fillAll(lerpPacked(prevRoot, cur!.tree.col32[0], easeInOut(k)))
      if (k >= 1) { phase = 'reveal'; t0 = now; R.showDepth(0) }
    } else if (phase === 'reveal') {
      if (R.revealTo(t, now, true) && t >= P.dur) { phase = 'xfade'; t0 = now }
    } else if (phase === 'xfade') {
      sharpA = easeInOut(clamp01(t / P.xfade)); if (t >= P.xfade) { phase = 'hold'; t0 = now; sharpA = 1 }
    } else if (phase === 'hold') {
      sharpA = 1; setCap(1, clamp01(t / P.capPopMs), cur!.e.cap)
      if (t >= P.hold && nxt) { phase = 'merge'; t0 = now; setCap(0, 0, '') }
    } else if (phase === 'merge') {
      sharpA = 1 - easeInOut(clamp01(t / P.unfade))
      if (R.mergeTo(t) && t >= P.mergeDur) startImage(nxt!, now, cur!.tree.col32[0])
    } else if (phase === 'rm') { // 8 -> 16 -> 32 -> sharp, 300 ms snapshot crossfades, no pops or sparkles
      snapA = 1 - clamp01(t / RM.stepFade); sharpA = rmStep === 3 ? 1 : 0
      if (rmStep === 3) setCap(1, 1, cur!.e.cap)
      if (t >= (rmStep === 3 ? RM.hold : RM.stepHold)) {
        if (rmStep === 3) { if (nxt) { R.takeSnap(); startImage(nxt, now, null); t0 = now } }
        else { R.takeSnap(); rmStep++; t0 = now; if (rmStep < 3) R.showDepth(RM.steps[rmStep]) }
      }
    }
    R.draw(now, sharpA, snapA)
  }
  const perf = { n: 0, buf: new Float32Array(8192) }
  let raf = 0
  const loop = (now: number) => { if (dead) return; const a = performance.now(); frame(now); const d = performance.now() - a; if (perf.n < perf.buf.length) perf.buf[perf.n++] = d; raf = requestAnimationFrame(loop) }
  const ro = new ResizeObserver(() => { const s = R.S; fit(); if (R.S !== s && cur) R.draw(performance.now(), phase === 'hold' ? 1 : 0, 0) }); ro.observe(o.root)
  const capture = o.capture ?? q.has('capture')
  const first = load(nextEntry())
  const api: any = {
    mode: r.kind, prep: () => prepWhere, reduced, stats, phase: () => phase,
    perf: () => { const a = Array.from(perf.buf.slice(0, perf.n)).sort((x, y) => x - y); const p = (f: number) => a[Math.min(a.length - 1, (a.length * f) | 0)]; return { frames: a.length, p50: p(.5), p95: p(.95), p99: p(.99), max: a[a.length - 1] } },
  }
  api.ready = first.then(item => { if (dead) return false; startImage(item, capture ? 0 : performance.now(), null); o.root.dataset.rr = r.kind; if (!capture) raf = requestAnimationFrame(loop); return true })
  // deterministic capture: a recorder drives a virtual clock (waits for the next image instead of skipping frames)
  api.frame = async (ms: number) => { while (((phase === 'hold') || (phase === 'rm' && rmStep === 3)) && !nxt && nxtP) await nxtP.catch(() => {}); frame(ms) }
  ;(window as any).__rr = api
  first.catch(() => { if (!dead) o.root.dataset.rr = 'static' })
  return { api, stop() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); r.dispose?.(); cur?.bmp?.close() }, failed: first.then(() => false, () => true) }
}
