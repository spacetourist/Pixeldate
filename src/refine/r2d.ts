/* Canvas 2D renderer (the prototype path, SPEC §6): one 128² ImageData blit, batched pop fills then butter strokes,
   sharp at globalAlpha, snapshot on top, 4 batched sparkle passes. Used when WebGL2 is missing or fails its probe. */
import { BUTTER, BUTTER_HI, EDGE, SNAP_BG, SPARK_COLS, type Refiner, type Renderer } from './engine'

export class R2D implements Renderer {
  readonly kind = '2d' as const
  ctx: CanvasRenderingContext2D; tex = document.createElement('canvas'); tctx = this.tex.getContext('2d')!
  snap = document.createElement('canvas'); sctx = this.snap.getContext('2d', { alpha: false })!
  img: ImageData | null = null; sharp: CanvasImageSource | null = null; S = 0; colStr: (string | undefined)[] = []; colTree: unknown = null
  constructor(public cv: HTMLCanvasElement) { const c = cv.getContext('2d', { alpha: false }); if (!c) throw new Error('no 2d'); this.ctx = c }
  resize(S: number) { this.S = S; this.cv.width = this.cv.height = S; this.snap.width = this.snap.height = S; this.sctx.fillStyle = SNAP_BG; this.sctx.fillRect(0, 0, S, S) }
  setSharp(img: CanvasImageSource | null) { this.sharp = img }
  takeSnap() { this.sctx.drawImage(this.cv, 0, 0) }
  private col(R: Refiner, id: number) {
    if (this.colTree !== R.tree) { this.colTree = R.tree; this.colStr = [] }
    let s = this.colStr[id]; if (!s) { const c = R.tree!.col32[id]; s = this.colStr[id] = `rgb(${c & 255},${c >>> 8 & 255},${c >>> 16 & 255})` } return s
  }
  draw(R: Refiner, now: number, sharpA: number, snapA: number) {
    const ctx = this.ctx, S = this.S, T = R.T
    if (!this.img || this.img.width !== T) { this.tex.width = this.tex.height = T; this.img = this.tctx.createImageData(T, T); R.dirty = true; R.dy0 = 0; R.dy1 = T }
    if (R.dirty) { new Uint32Array(this.img.data.buffer).set(R.buf); this.tctx.putImageData(this.img, 0, 0, 0, R.dy0, T, R.dy1 - R.dy0); R.dirty = false }
    ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false; ctx.drawImage(this.tex, 0, 0, S, S)
    if (R.popLen) {
      R.prunePops(now)
      for (let q = 0; q < R.popLen; q++) R.pop(q, now, (cid, x, y, s) => { if (R.popK < 1) { ctx.fillStyle = this.col(R, cid); ctx.fillRect(x, y, s, s) } })
      for (let q = 0; q < R.popLen; q++) R.pop(q, now, (_c, x, y, s) => { if (R.popE <= 0) return; const w = R.popStrong ? R.lw * 2 : R.lw
        ctx.globalAlpha = R.popE; ctx.strokeStyle = R.popStrong ? BUTTER_HI : BUTTER; ctx.lineWidth = w; ctx.strokeRect(x + w / 2, y + w / 2, s - w, s - w) })
      ctx.globalAlpha = 1
    }
    if (sharpA > 0 && this.sharp) { ctx.globalAlpha = sharpA; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(this.sharp, 0, 0, S, S); ctx.globalAlpha = 1 }
    if (snapA > 0) { ctx.globalAlpha = snapA; ctx.drawImage(this.snap, 0, 0); ctx.globalAlpha = 1 }
    let pass = -1
    const flush = () => { if (pass >= 0) { ctx.fillStyle = pass === 0 ? EDGE : SPARK_COLS[pass - 1]; ctx.fill() } }
    R.sparks(now, (p, x, y, w, h) => { if (p !== pass) { flush(); pass = p; ctx.beginPath() } ctx.rect(x, y, w, h) }); flush()
  }
  dispose() {}
}
