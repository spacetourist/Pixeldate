/* Refine reveal · image prep jobs. Run inside the Worker (worker.ts) or, when Workers / OffscreenCanvas are
   unavailable, on the main thread through the same function (prep() below picks). */
import { treeFromRR, treeFromLevels, grid, findSched, lvSched, type Tree, type Schedule } from './prep'

export type Job =
  | { k: 'find'; rr: string; img: string; S: number; seed: number }
  /** level-up: ONLY the two frames the partner sent (as bitmaps of the received images), nothing else */
  | { k: 'lv'; a: ImageBitmap; b: ImageBitmap; lo: number; seed: number; fineAvg: boolean }
export interface Out { tree: Tree; sch: Schedule; bmp?: ImageBitmap | null; fine?: Uint8ClampedArray; coarse?: Uint8ClampedArray; ms: number }

const now = () => performance.now()
function pixels(b: ImageBitmap) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(b.width, b.height) : Object.assign(document.createElement('canvas'), { width: b.width, height: b.height })
  const x = (c as any).getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D; x.drawImage(b, 0, 0); return x.getImageData(0, 0, b.width, b.height).data
}
export async function run(j: Job): Promise<Out> {
  if (j.k === 'find') {
    const [buf, blob] = await Promise.all([fetch(j.rr).then(r => { if (!r.ok) throw new Error(r.status + ''); return r.arrayBuffer() }), fetch(j.img).then(r => { if (!r.ok) throw new Error(r.status + ''); return r.blob() })])
    const t0 = now(), tree = treeFromRR(buf), sch = findSched(tree, j.seed), ms = now() - t0
    // decode + high-quality resize to the canvas backing size, off the main thread
    const bmp = await createImageBitmap(blob, { resizeWidth: j.S, resizeHeight: j.S, resizeQuality: 'high' })
    return { tree, sch, bmp, ms }
  }
  const t0 = now(), n = 1 << j.lo
  const coarse = grid(pixels(j.a), j.a.width, j.a.height, n), fine = grid(pixels(j.b), j.b.width, j.b.height, n * 2, j.fineAvg)
  j.a.close(); j.b.close()
  const tree = treeFromLevels(coarse, fine, j.lo), sch = lvSched(tree, j.lo, j.seed)
  return { tree, sch, fine, coarse, ms: now() - t0 }
}
export const transfers = (o: Out): Transferable[] => {
  const t: Transferable[] = [o.tree.col32.buffer, o.tree.sd.buffer, o.tree.off.buffer, o.sch.ids.buffer, o.sch.depth.buffer, o.sch.t.buffer, o.sch.mt.buffer]
  if (o.bmp) t.push(o.bmp); if (o.fine) t.push(o.fine.buffer); if (o.coarse) t.push(o.coarse.buffer); return t as Transferable[]
}
