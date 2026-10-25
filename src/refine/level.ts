/* Level-up refine reveal (SPEC §5 "level" column): refines the OLD level's blocks into the NEW level's blocks over
   1.2 s, in place on the photo the person is already looking at.

   PRIVACY (hard rule): the only inputs are the two frames the partner already sent for these two levels (`a` = the
   level we were at, `b` = the level we both just agreed to). Pixelation happens on the sender, so `b` is the most
   detail this device has; the tree is built from exactly these two grids (maxD = lo + 1: it can never go finer than
   `b`), nothing is fetched, and no other image is read. The only "sharp" crossfade is to `b` itself when `b` is the
   full photo (level 5), which was also received. Every run is logged to window.__pdRevealLog for test/e2e.mjs. */
import { Refiner, clamp01, easeInOut, type Renderer } from './engine'
import { LV, type Tree } from './prep'
import { R2D } from './r2d'
import { RGL, glOK } from './gl'
import { prep, prepWhere } from './client'

export interface LvOpts {
  canvas: HTMLCanvasElement; a: HTMLImageElement; b: HTMLImageElement; fromLv: number; toLv: number
  /** performance.now() at which the refine starts (the level-up moment + 400 ms) */
  start: number; reduced: boolean; css?: number
  /** first frame (== level `a`) is on screen: the caller may now swap what's underneath */
  onShown?(): void; onDone?(): void
}
const rends = new WeakMap<HTMLCanvasElement, Renderer>()
const want2d = () => !!(window as any).__pdNoGL || new URLSearchParams(location.search).get('rr') === '2d'
/** tests opt in by defining window.__pdRevealLog before load; production keeps nothing */
const lvLog = (): any[] | undefined => (window as any).__pdRevealLog

export async function playLevel(o: LvOpts): Promise<{ stop(): void; mode: string } | null> {
  const { a, b } = o, lo = Math.log2(a.naturalWidth), full = o.toLv === 5
  // a must be a square ladder level; b must be the next level (2x) or the received full photo
  if (!Number.isInteger(lo) || a.naturalWidth !== a.naturalHeight || b.naturalWidth !== b.naturalHeight) return null
  if (!full && b.naturalWidth !== a.naturalWidth * 2) return null
  const t0 = performance.now()
  // bitmaps of the two received <img>s (already decoded, no network): the Worker reads their pixels
  const [ba, bb] = await Promise.all([createImageBitmap(a), createImageBitmap(b)])
  const t1 = performance.now()
  const out = await prep({ k: 'lv', a: ba, b: bb, lo, seed: (Math.random() * 1e9) | 0, fineAvg: full })
  const t2 = performance.now()
  const tree: Tree = out.tree, fine = out.fine!
  let r = rends.get(o.canvas)
  if (!r) { r = !want2d() && glOK() ? new RGL(o.canvas) : new R2D(o.canvas); rends.set(o.canvas, r) }
  const R = new Refiner({ sparkBase: 4.2, fxSeed: ((Math.random() * 1e9) | 0) || 7 }); R.attach(r)
  const dpr = Math.min(2, devicePixelRatio || 1), cs = o.canvas.getBoundingClientRect()
  R.resize(o.css ?? Math.max(cs.width, cs.height, 128), dpr)
  R.setTree(tree, out.sch, full ? b : null) // the only sharp source ever passed is the received level-5 photo
  R.showDepth(lo)
  const log = { from: o.fromLv, to: o.toLv, srcA: a.src, srcB: b.src, lo, maxD: tree.maxD, mode: r.kind, prep: prepWhere, n: out.sch.n,
    fine: lvLog() ? Array.from(fine) : [], coarse: lvLog() ? Array.from(out.coarse!) : [], ms: { bitmaps: +(t1 - t0).toFixed(2), worker: +(out.ms).toFixed(2), roundTrip: +(t2 - t1).toFixed(2), apply: 0 }, frames: [] as number[] }
  lvLog()?.push(log)
  const t3 = performance.now(); R.draw(t3, 0, 0); log.ms.apply = +(performance.now() - t3).toFixed(2)
  o.onShown?.()
  let raf = 0, dead = false, phase: 'wait' | 'run' | 'xfade' | 'rm' | 'done' = 'wait', tp = 0
  const frame = (now: number) => {
    if (dead) return
    const c0 = performance.now(); let sharpA = 0, snapA = 0
    if (phase === 'wait' && now >= o.start) {
      if (o.reduced) { R.takeSnap(); R.showDepth(lo + 1); phase = 'rm' } else phase = 'run'
      tp = now
    }
    const t = now - tp
    if (phase === 'run') { if (R.revealTo(Math.max(0, now - o.start), now, true) && !R.sparksAlive(now)) { phase = full ? 'xfade' : 'done'; tp = now } }
    else if (phase === 'rm') { snapA = 1 - clamp01(t / LV.rmFade); if (snapA <= 0) { phase = full ? 'xfade' : 'done'; tp = now } }
    if (phase === 'xfade') { sharpA = easeInOut(clamp01((now - tp) / (o.reduced ? LV.rmFade : LV.xfade))); if (sharpA >= 1) phase = 'done' }
    if (phase === 'done' && full) sharpA = 1
    R.draw(now, sharpA, snapA)
    log.frames.push(+(performance.now() - c0).toFixed(3))
    if (phase === 'done') { o.onDone?.(); return }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return { mode: r.kind, stop() { dead = true; cancelAnimationFrame(raf) } }
}
