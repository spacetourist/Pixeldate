import { FULL_PHOTO_PX, LEVELS, REVEAL_MS } from './config'
/** Square-crop and block-average the photo ON THE SENDER. Output is exactly `blocks` px wide,
 *  so the receiver physically cannot get more detail. Level 5 sends FULL_PHOTO_PX. */
/** Square-crop and block-average ON THE SENDER: a canvas exactly `blocks` px wide (FULL_PHOTO_PX at level 5),
 *  so the receiver physically cannot get more detail. Also used by the onboarding preview, so it is identical. */
export function pixelateCanvas(img: HTMLImageElement | HTMLCanvasElement, level: number): HTMLCanvasElement {
  const blocks = LEVELS[level - 1].blocks || FULL_PHOTO_PX
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width, h = 'naturalHeight' in img ? img.naturalHeight : img.height
  const s = Math.min(w, h)
  // two-step box filter: draw to 8x then let the browser average down
  const mid = document.createElement('canvas'); mid.width = mid.height = Math.min(s, blocks * 8)
  mid.getContext('2d')!.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, mid.width, mid.width)
  const out = document.createElement('canvas'); out.width = out.height = blocks
  const c = out.getContext('2d')!; c.imageSmoothingQuality = 'high'; c.drawImage(mid, 0, 0, blocks, blocks)
  return out
}
export const pixelatePhoto = (img: HTMLImageElement | HTMLCanvasElement, level: number) => pixelateCanvas(img, level).toDataURL(level === 5 ? 'image/jpeg' : 'image/png', 0.9)
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src })
}
/** Reveal: blocks split along a diagonal front with a shimmer over REVEAL_MS, drawn nearest-neighbour. */
export function animateReveal(canvas: HTMLCanvasElement, from: HTMLImageElement | null, to: HTMLImageElement, onDone?: () => void) {
  const S = canvas.width, c = canvas.getContext('2d')!; c.imageSmoothingEnabled = false
  const n = to.naturalWidth, t0 = performance.now()
  const step = () => {
    const r = Math.min(1, (performance.now() - t0) / REVEAL_MS), t = r < .5 ? 4 * r * r * r : 1 - Math.pow(-2 * r + 2, 3) / 2 // ease-in-out
    if (!from || t >= 1) { c.drawImage(to, 0, 0, S, S); if (t >= 1 || !from) { onDone?.(); return } }
    c.drawImage(from!, 0, 0, S, S)
    const g = Math.min(n, 128), cell = S / g, slant = 0.35, sweep = 0.3
    for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) {
      const d = ((x + y * slant) / g) / (1 + slant) // 0..1 along the front
      const p = (t * (1 + sweep) - d) / sweep
      if (p <= 0) continue
      const sx = (x / g) * n, sw = n / g
      c.drawImage(to, sx, (y / g) * n, sw, sw, x * cell, y * cell, Math.ceil(cell), Math.ceil(cell))
      if (p < 1) { c.fillStyle = `rgba(255,240,236,${0.4 * Math.sin(Math.PI * p)})`; c.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell)) }
    }
    requestAnimationFrame(step)
  }
  step()
}
