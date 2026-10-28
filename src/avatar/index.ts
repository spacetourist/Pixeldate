/* Pixel-avatar detection client. Import this module dynamically only: it pulls in nothing heavy itself, but the Worker
   it starts fetches ~21 MB (lite) or ~37 MB (full fallback) of self-hosted WASM + models from /avatar/, and only when
   the user picks the photo route. The photo stays on the device: it is posted to our own Worker and decoded there;
   no network request ever carries image data. */
import type { LoadInfo, Mode, Progress, Result } from './types'
export type { Result, LoadInfo, Mode, Progress } from './types'
export type { Descriptor, AvatarError } from './descriptor'
export const base = import.meta.env.BASE_URL + 'avatar/'
let w: Worker | null | undefined, seq = 0
export let where: 'worker' | 'main' = 'worker'
const wait = new Map<number, [(o: any) => void, (e: any) => void, ((p: Progress) => void) | undefined]>()
function worker() {
  if (w !== undefined) return w
  try {
    if ((window as any).__pdNoWorker || typeof OffscreenCanvas === 'undefined') throw 0
    w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = e => {
      const p = wait.get(e.data.id); if (!p) return
      if (e.data.progress) { p[2]?.(e.data.progress); return }
      wait.delete(e.data.id); e.data.err ? p[1](new Error(e.data.err)) : p[0](e.data.o)
    }
    w.onerror = () => { w = null; where = 'main'; for (const [, p] of wait) p[1](new Error('avatar worker failed')); wait.clear() }
  } catch { w = null; where = 'main' }
  return w
}
function call<T>(k: 'load' | 'analyse', mode: Mode, photo?: Blob, onProgress?: (p: Progress) => void): Promise<T> {
  const W = worker()
  if (!W) return import('./engine').then(m => (k === 'load' ? m.load(base, mode, onProgress) : m.analyse(base, photo!, mode)) as Promise<T>)
  return new Promise((ok, bad) => { const id = ++seq; wait.set(id, [ok, bad, onProgress]); W.postMessage({ id, k, base, photo, mode }) })
}
/** Fetch + compile WASM and the route's models, reporting bytes for the progress meter. */
export const preload = (mode: Mode = 'lite', onProgress?: (p: Progress) => void) => call<LoadInfo>('load', mode, undefined, onProgress)
/** Analyse a full-body photo into an avatar descriptor (or a clear error). */
export const analysePhoto = async (photo: Blob, mode: Mode = 'lite'): Promise<Result> => ({ ...(await call<Result>('analyse', mode, photo)), where })
