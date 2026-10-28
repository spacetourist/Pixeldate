/* TS port of GD's kit.py compose(): same layer order, dress-skips-bottom, hat-hides-hair and outline pass.
   Part shapes come from the generated indexed atlas (tools/avatar-kit.py), so kit.py stays the source of truth. */
import atlasUrl from './atlas.png'
import { ATLAS_COLS, CELLS, CLOTH, FIXED, GRID, HAIRC, HAT_SHOWS, SKIN, SLOTS } from './kit.gen'

export type KitOptions = {
  v?: 1; build: string; hair: string; top: string; bottom: string; shoes: string; beard?: string; acc?: string; face?: string
  skin: string; hairc: string; topc: string; bottomc: string; shoec: string; accc?: string; tights?: string | null
}
const [W, H] = GRID
export type Atlas = (name: string) => Uint8Array | undefined   // cell → W*H slot indices (0 empty, i+1 = SLOTS[i])

let atlasP: Promise<Atlas> | null = null
/** Decode the lazy atlas once. Palette index is recovered from the red channel (index*8, see tools/avatar-kit.py). */
export function loadAtlas(): Promise<Atlas> {
  return atlasP ??= (async () => {
    const img = new Image(); img.src = atlasUrl; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height).data, cache = new Map<string, Uint8Array>()
    return (name: string) => {
      const n = CELLS[name]; if (n === undefined) return undefined
      let g = cache.get(name); if (g) return g
      g = new Uint8Array(W * H); const ox = (n % ATLAS_COLS) * W, oy = Math.floor(n / ATLAS_COLS) * H
      for (let y = 0; y < H; y++) for (let x2 = 0; x2 < W; x2++) {
        const i = ((oy + y) * c.width + ox + x2) * 4; if (d[i + 3] > 127) g[y * W + x2] = Math.round(d[i] / 8)
      }
      cache.set(name, g); return g
    }
  })()
}

const K = SLOTS.indexOf('K') + 1
/** Slot grid (W*H, 0 = empty) for an options set: kit.py compose() minus the colouring. */
export function composeSlots(atlas: Atlas, o: KitOptions): Uint8Array {
  const hide = (o.acc === 'beanie' || o.acc === 'cap') && !HAT_SHOWS.includes(o.hair)
  const layers = [atlas('hairB.' + o.hair), atlas('body.' + o.build)]
  if (o.top !== 'dress') layers.push(atlas('bottom.' + o.bottom))
  layers.push(atlas(`top.${o.top}.${o.build}`), atlas('shoes.' + o.shoes), atlas('face.' + (o.face || 'a')), atlas('beard.' + (o.beard || 'none')))
  if (!hide) layers.push(atlas('hairF.' + o.hair)); else if (o.hair !== 'bald') layers.push(atlas('hatHair'))
  layers.push(atlas('acc.' + (o.acc || 'none')))
  const g = new Uint8Array(W * H)
  for (const L of layers) if (L) for (let i = 0; i < L.length; i++) if (L[i]) g[i] = L[i]
  // outline: an empty pixel 4-adjacent to a filled, non-K pixel becomes K
  const out = g.slice(), filled = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H && g[y * W + x] !== 0 && g[y * W + x] !== K
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (!g[y * W + x] && (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1))) out[y * W + x] = K
  return out
}

/** Slot → hex for an options set (kit.py's `pal` dict). Unknown names fall back to the first palette entry. */
export function slotColours(o: KitOptions): Record<string, string> {
  const pick = <T,>(p: Record<string, T>, k: string | undefined | null) => (k && p[k]) || Object.values(p)[0]
  const sk = pick(SKIN, o.skin), hc = pick(HAIRC, o.hairc), tc = pick(CLOTH, o.topc), bc = pick(CLOTH, o.bottomc), fc = pick(CLOTH, o.shoec)
  const ac = pick(CLOTH, o.accc || (o.acc === 'glasses' ? 'black' : 'butter')), tg = o.tights ? CLOTH[o.tights] : null
  return { ...FIXED, S: sk[0], s: sk[1], r: sk[2], L: sk[3], q: sk[3], H: hc[0], h: hc[1], g: hc[2], T: tc[0], t: tc[1], n: tc[2],
    B: bc[0], b: bc[1], J: tg ? tg[0] : sk[0], j: tg ? tg[1] : sk[1], F: fc[0], f: fc[1], A: ac[0], a: ac[1], O: ac[2] }
}

/** RGBA pixels (W*H*4) of the composed character. */
export function composeRGBA(atlas: Atlas, o: KitOptions): Uint8ClampedArray<ArrayBuffer> {
  const g = composeSlots(atlas, o), pal = slotColours(o), rgb = SLOTS.split('').map(s => { const h = pal[s] || '#ff00ff'; return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) })
  const px = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < g.length; i++) if (g[i]) { const c = rgb[g[i] - 1]; px.set([c[0], c[1], c[2], 255], i * 4) }
  return px
}

/** Draw at an integer scale onto a canvas (sized W*scale x H*scale, CSS `image-rendering: pixelated`). */
export function drawAvatar(canvas: HTMLCanvasElement, atlas: Atlas, o: KitOptions, scale: number) {
  const s = Math.max(1, Math.floor(scale)); canvas.width = W * s; canvas.height = H * s
  const x = canvas.getContext('2d')!, src = new ImageData(composeRGBA(atlas, o), W, H)
  const t = document.createElement('canvas'); t.width = W; t.height = H; t.getContext('2d')!.putImageData(src, 0, 0)
  x.imageSmoothingEnabled = false; x.clearRect(0, 0, canvas.width, canvas.height); x.drawImage(t, 0, 0, W * s, H * s)
}
export const KIT_W = W, KIT_H = H
