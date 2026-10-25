/* One shared prep Worker for the finding loop and level-ups; main-thread fallback when it can't start. */
import type { Job, Out } from './work'
let w: Worker | null | undefined, seq = 0
const wait = new Map<number, [(o: Out) => void, (e: any) => void]>()
export let prepWhere: 'worker' | 'main' = 'worker'
function worker() {
  if (w !== undefined) return w
  try {
    if ((window as any).__pdNoWorker || typeof OffscreenCanvas === 'undefined') throw 0
    w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = e => { const p = wait.get(e.data.id); if (!p) return; wait.delete(e.data.id); e.data.err ? p[1](new Error(e.data.err)) : p[0](e.data.o) }
    w.onerror = () => { w = null; prepWhere = 'main'; for (const [, p] of wait) p[1](new Error('worker failed')); wait.clear() }
  } catch { w = null; prepWhere = 'main' }
  return w
}
export function prep(job: Job): Promise<Out> {
  const W = worker()
  if (!W) return import('./work').then(m => m.run(job))
  return new Promise((ok, bad) => { const id = ++seq; wait.set(id, [ok, bad]); W.postMessage({ id, job }, job.k === 'lv' ? [job.a, job.b] : []) })
}
