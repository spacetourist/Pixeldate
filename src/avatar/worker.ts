/* Avatar Worker: MediaPipe pose + segmentation off the main thread. */
import { analyse, load } from './engine'
addEventListener('message', async (e: MessageEvent) => {
  const { id, k, base, photo, mode } = e.data
  try {
    const o = k === 'load' ? await load(base, mode, p => (self as any).postMessage({ id, progress: p })) : await analyse(base, photo, mode)
    const tr = (o as any).masks ? (o as any).masks.map((m: any) => m.data.buffer) : []
    ;(self as any).postMessage({ id, o }, tr)
  } catch (err: any) { (self as any).postMessage({ id, err: String(err?.message ?? err) }) }
})
