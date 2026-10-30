/* Pixeldate World renderer (Canvas2D; PixiJS could not be installed on the build box, so the renderer is isolated here
   behind a small interface and can be swapped for a Pixi stage later). Everything is drawn at the café's native 16 px
   grid and blown up by an INTEGER factor k in device pixels, with smoothing off, so every art pixel is k×k screen pixels. */
import { ROWS, W, H, TILE, at, TABLES } from '../../world/shared/map.ts'
import { F_HEART, F_BROKEN, F_MOVING, F_SIT, F_ME } from '../../world/shared/proto.ts'
import { composeDir, footX, WALK_FRAME_MS, WALK_W, WALK_H, type Dir, type Frame } from './walk.ts'
import { parseOptions } from '../avatar/kit/map.ts'
import { SAMPLES } from '../avatar/kit/kit.gen.ts'
import type { WorldNet, Seen } from './net.ts'
export const MW = W * TILE, MH = H * TILE
type Spr = { c: HTMLCanvasElement; ax: number; fy: number }
const cnv = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const rect = (g: CanvasRenderingContext2D, col: string, x: number, y: number, w: number, h: number) => { g.fillStyle = col; g.fillRect(x, y, w, h) }
const pat = (g: CanvasRenderingContext2D, rows: string[], cols: Record<string, string>, x: number, y: number) => {
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = cols[r[i]]; if (c) rect(g, c, x + i, y + j, 1, 1) } }) }
const HEART = ['.cc.cc.', 'chcccc' + 'c', 'ccccccc', '.ccccc.', '..ccc..', '...c...']
const BROKEN = ['gg.gg', 'ggg.g', '.g.g.', '..g..']
const HC = { c: '#FF6F59', h: '#FFC2B3' }, BC = { g: '#8A84A3' }

/** Café art, baked once at native resolution: night palette, warm lamps, bright tables. */
function bakeMap() {
  const c = cnv(MW, MH), g = c.getContext('2d')!
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = x * TILE, Y = y * TILE, ch = ROWS[y][x]
    // floor everywhere first: plum planks, seams every 4 px, staggered joints
    rect(g, (y & 1) ? '#2A1F47' : '#261C41', X, Y, TILE, TILE)
    for (let j = 0; j < 4; j++) { rect(g, '#1B1332', X, Y + j * 4 + 3, TILE, 1); rect(g, '#1B1332', X + ((x * 5 + j * 7 + y * 3) % 16), Y + j * 4, 1, 3) }
    if (ch === 'r') { rect(g, '#4A1F45', X, Y, TILE, TILE); for (let i = 0; i < 16; i += 4) rect(g, '#5E2852', X + i + (y & 1) * 2, Y + 7, 2, 2)
      if (at(x, y - 1) !== 'r') rect(g, '#FF6F59', X, Y + 1, TILE, 1); if (at(x, y + 1) !== 'r') rect(g, '#FF6F59', X, Y + 14, TILE, 1)
      if (at(x - 1, y) !== 'r') rect(g, '#FF6F59', X + 1, Y, 1, TILE); if (at(x + 1, y) !== 'r') rect(g, '#FF6F59', X + 14, Y, 1, TILE) }
    if (ch === '#') { rect(g, '#0B0620', X, Y, TILE, TILE); rect(g, '#1A1236', X, Y + (y === 0 ? 13 : 0), TILE, 3) }
    if (ch === 'D') { rect(g, '#6E3F35', X + 1, Y + 3, 14, 10); rect(g, '#8A5446', X + 2, Y + 4, 12, 1) }
    if (ch === 'W') {
      rect(g, '#33285E', X, Y, TILE, TILE); rect(g, '#463477', X, Y + 11, TILE, 5); rect(g, '#5A4590', X, Y + 11, TILE, 1); rect(g, '#1B1332', X, Y + 15, TILE, 1)
      if (x % 4 === 2) { rect(g, '#5A4A8A', X + 1, Y + 1, 14, 9); rect(g, '#14204E', X + 2, Y + 2, 12, 7); rect(g, '#5A4A8A', X + 7, Y + 2, 1, 7)
        rect(g, '#FFF6EC', X + 3 + (x * 3) % 4, Y + 3, 1, 1); rect(g, '#A49CC2', X + 10, Y + 6, 1, 1); if (x === 10) { rect(g, '#FFE68A', X + 11, Y + 3, 2, 2) } }
      else if (x % 4 === 0) { rect(g, '#FFD84D', X + 7, Y + 4, 2, 3); rect(g, '#FFE68A', X + 7, Y + 4, 2, 1); rect(g, '#2A1F47', X + 6, Y + 7, 4, 1) }  // wall sconce
    }
    if (ch === 'C') { rect(g, '#3E2228', X, Y + 2, TILE, 14); rect(g, '#C98B5E', X, Y + 2, TILE, 6); rect(g, '#E3A877', X, Y + 2, TILE, 1); rect(g, '#6E3F35', X, Y + 8, TILE, 7)
      for (let i = 2; i < 16; i += 5) rect(g, '#55302B', X + i, Y + 9, 1, 6)
      if (x % 3 === 1) { rect(g, '#FFF6EC', X + 5, Y + 3, 4, 4); rect(g, '#FF6F59', X + 5, Y + 4, 4, 1); rect(g, '#FFF6EC', X + 9, Y + 4, 1, 2) }
      if (x % 3 === 2) { rect(g, '#48E5C2', X + 4, Y, 3, 6); rect(g, '#8DF2DA', X + 4, Y, 1, 6) } }
    if (ch === 'b') { rect(g, '#00000055', X + 4, Y + 10, 8, 3); rect(g, '#3E2228', X + 7, Y + 6, 2, 6); rect(g, '#FF6F59', X + 4, Y + 3, 8, 4); rect(g, '#FF9A7F', X + 4, Y + 3, 8, 1) }
    if (ch === 's') { const right = at(x - 1, y) === 'T'; rect(g, '#00000055', X + 2, Y + 11, 12, 3)
      rect(g, '#5B3E7A', X + 3, Y + 5, 10, 8); rect(g, '#FFB48A', X + 3, Y + 5, 10, 4); rect(g, '#FFD4B8', X + 3, Y + 5, 10, 1)
      rect(g, '#43305E', right ? X + 12 : X + 2, Y, 2, 13) }
    if (ch === 'T') { rect(g, '#00000066', X - 1, Y + 11, 18, 4); rect(g, '#B9875A', X + 1, Y + 8, 14, 5); rect(g, '#8A5E3E', X + 7, Y + 12, 2, 3)
      rect(g, '#FFE3B3', X - 1, Y + 1, 18, 8); rect(g, '#FFF3DA', X - 1, Y + 1, 18, 1); rect(g, '#F2C784', X - 1, Y + 8, 18, 1)
      rect(g, '#FFD84D', X + 7, Y + 2, 2, 3); rect(g, '#FFFFFF', X + 7, Y + 2, 1, 1); rect(g, '#FF6F59', X + 3, Y + 4, 3, 2) }
    if (ch === 'P') { rect(g, '#00000055', X + 3, Y + 13, 10, 2); rect(g, '#B9573E', X + 4, Y + 9, 8, 5); rect(g, '#D9775A', X + 4, Y + 9, 8, 1)
      pat(g, ['...ll.l..', '.llLlll.l', 'lLlllLll.', '.lllLlll.', 'llLlllLl.', '.lllll...'], { l: '#2FAF8A', L: '#48E5C2' }, X + 3, Y + 2) }
    if (ch === 'L') { rect(g, '#00000055', X + 4, Y + 13, 8, 2); rect(g, '#3E2228', X + 7, Y + 4, 2, 10); rect(g, '#3E2228', X + 5, Y + 13, 6, 1)
      rect(g, '#FFD84D', X + 3, Y - 4, 10, 6); rect(g, '#FFE68A', X + 3, Y - 4, 10, 1); rect(g, '#C99A2E', X + 3, Y + 1, 10, 1) }
  }
  return c
}
/** Light, baked once: darkness away from lights, warm additive glow near them, quantised into bands like pixel art. */
function bakeLight() {
  const lights: [number, number, number, number][] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = ROWS[y][x], cx = x * TILE + 8, cy = y * TILE + 8
    if (ch === 'L') lights.push([cx, cy - 10, 70, 1]); if (ch === 'T') lights.push([cx, cy, 34, 0.9])
    if (ch === 'C' && x % 3 === 0) lights.push([cx, cy, 30, 0.55]); if (ch === 'W' && x % 4 === 0) lights.push([cx, cy, 30, 0.6])
  }
  const shade = cnv(MW, MH), glow = cnv(MW, MH), sd = new ImageData(MW, MH), gd = new ImageData(MW, MH)
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    let I = 0; for (const [lx, ly, r, s] of lights) { const d = Math.hypot(x - lx, (y - ly) * 1.25); if (d < r) I += (1 - d / r) ** 2 * s }
    I = Math.min(1, Math.floor(Math.min(1, I) * 5) / 5); const o = (y * MW + x) * 4
    sd.data[o] = 8; sd.data[o + 1] = 4; sd.data[o + 2] = 26; sd.data[o + 3] = Math.round(120 * (1 - I))
    gd.data[o] = 255; gd.data[o + 1] = 176; gd.data[o + 2] = 96; gd.data[o + 3] = Math.round(70 * I)
  }
  shade.getContext('2d')!.putImageData(sd, 0, 0); glow.getContext('2d')!.putImageData(gd, 0, 0)
  return { shade, glow }
}
const dirOf = (e: Seen): Dir => {
  if (e.f & F_SIT) { const tx = Math.floor(e.x), ty = Math.floor(e.y); return at(tx + 1, ty) === 'T' ? 'right' : at(tx - 1, ty) === 'T' ? 'left' : 'down' }
  return Math.abs(e.dx) > Math.abs(e.dy) ? (e.dx < 0 ? 'left' : 'right') : (e.dy < 0 ? 'up' : 'down')
}
export type Layout = 'phone' | 'desk'
export class Renderer {
  c: HTMLCanvasElement; g: CanvasRenderingContext2D
  map = bakeMap(); light = bakeLight()
  k = 1; dpr = 1; vw = MW; vh = MH; camX = 0; camY = 0; cssW = 0; cssH = 0
  sel = 0; path: [number, number][] = []; fps = 0; private frames: number[] = []
  private sprites = new Map<string, Spr>()
  constructor(c: HTMLCanvasElement) { this.c = c; this.g = c.getContext('2d')! }
  /** Integer factor only. Phone: the café's full width fits the screen width. Desktop: a closer view that follows you. */
  resize(cssW: number, cssH: number, dpr: number, layout: Layout) {
    const dw = Math.floor(cssW * dpr), dh = Math.floor(cssH * dpr)
    this.k = layout === 'phone' ? Math.max(1, Math.floor(dw / MW)) : Math.max(2, Math.floor(Math.min(dw / 240, dh / 200)))
    this.vw = Math.ceil(dw / this.k); this.vh = Math.ceil(dh / this.k)
    this.c.width = dw; this.c.height = dh; this.c.style.width = dw / dpr + 'px'; this.c.style.height = dh / dpr + 'px'
    this.dpr = dpr; this.cssW = dw / dpr; this.cssH = dh / dpr
  }
  sprite(id: number, pav: string | undefined, d: Dir, f: Frame): Spr {
    const key = (pav ?? '#' + id) + '|' + d + '|' + f; let s = this.sprites.get(key); if (s) return s
    const o = (pav && parseOptions(pav)) || SAMPLES[id % SAMPLES.length]
    const px = composeDir(o as any, d, f), c = cnv(WALK_W, WALK_H); c.getContext('2d')!.putImageData(new ImageData(px, WALK_W, WALK_H), 0, 0)
    // feet anchor per direction, from its standing pose (GD: the mirrored right view sits 1 px off; per-frame anchoring
    // would cancel the stride and make walkers slide)
    const ak = (pav ?? '#' + id) + '|' + d + '|anchor'; let a = this.sprites.get(ak)
    if (!a) { const st = f === 'stand' ? px : composeDir(o as any, d, 'stand'); let fy = WALK_H - 1
      while (fy > 0) { let any = false; for (let x = 0; x < WALK_W; x++) if (st[(fy * WALK_W + x) * 4 + 3]) any = true; if (any) break; fy-- }
      a = { c, ax: Math.floor(footX(st)), fy }; this.sprites.set(ak, a) }
    s = { c, ax: a.ax, fy: a.fy }; this.sprites.set(key, s); return s
  }
  private feet(net: WorldNet, e: Seen, now: number) { return [Math.round(net.lerpX(e, now) * TILE), Math.round(net.lerpY(e, now) * TILE) - ((e.f & F_SIT) ? 3 : 0)] }
  frame(net: WorldNet, now: number) {
    const g = this.g, k = this.k; this.frames.push(now); while (this.frames.length && now - this.frames[0] > 1000) this.frames.shift(); this.fps = this.frames.length
    const me = net.ents.get(net.me)
    if (me) { const [fx, fy] = this.feet(net, me, now)
      this.camX = this.vw >= MW ? -Math.floor((this.vw - MW) / 2) : Math.max(0, Math.min(MW - this.vw, fx - (this.vw >> 1)))
      this.camY = this.vh >= MH ? -Math.floor((this.vh - MH) / 2) : Math.max(0, Math.min(MH - this.vh, fy - 12 - (this.vh >> 1))) }
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; g.fillStyle = '#08041A'; g.fillRect(0, 0, this.c.width, this.c.height)
    g.setTransform(k, 0, 0, k, -this.camX * k, -this.camY * k); g.imageSmoothingEnabled = false
    g.drawImage(this.map, 0, 0)
    if (me && this.path.length) { for (const [x, y] of this.path) rect(g, '#48E5C2', x * TILE + 7, y * TILE + 7, 2, 2)
      const t = this.path.at(-1)!; g.strokeStyle = '#48E5C2'; g.lineWidth = 1; g.strokeRect(t[0] * TILE + 3.5, t[1] * TILE + 5.5, 9, 5) }
    const list = [...net.ents.values()].sort((a, b) => a.y - b.y || a.id - b.id)
    for (const e of list) {
      const [fx, fy] = this.feet(net, e, now), d = dirOf(e)
      const fr: Frame = (e.f & F_MOVING) ? (Math.floor((now + e.id * 53) / WALK_FRAME_MS) % 4) as Frame : 'stand'
      const s = this.sprite(e.id, net.pubs.get(e.id)?.pav ?? (e.id === net.me ? net.p.pav : undefined), d, fr)
      rect(g, '#00000066', fx - 6, fy - 1, 12, 3); rect(g, '#00000066', fx - 4, fy - 2, 8, 5)
      if (e.f & F_ME) { rect(g, '#48E5C2', fx - 6, fy + 2, 12, 1); rect(g, '#48E5C2', fx - 7, fy + 1, 1, 1); rect(g, '#48E5C2', fx + 6, fy + 1, 1, 1) }
      if (e.id === this.sel) { rect(g, '#FFD84D', fx - 7, fy + 2, 14, 1); rect(g, '#FFD84D', fx - 8, fy + 1, 1, 1); rect(g, '#FFD84D', fx + 7, fy + 1, 1, 1) }
      g.drawImage(s.c, fx - s.ax, fy - s.fy)
      const top = fy - s.fy - 1
      if (e.f & F_HEART) pat(g, HEART, HC, fx - 3, top - 7 - (Math.floor(now / 300 + e.id) % 2))
      else if (e.f & F_BROKEN) pat(g, BROKEN, BC, fx - 2, top - 5)
    }
    g.globalCompositeOperation = 'source-over'; g.drawImage(this.light.shade, 0, 0)
    g.globalCompositeOperation = 'lighter'; g.drawImage(this.light.glow, 0, 0); g.globalCompositeOperation = 'source-over'
  }
  /** CSS-pixel point on the canvas → map position in tiles. */
  toTile(cx: number, cy: number) { const d = this.dpr; return [(cx * d / this.k + this.camX) / TILE, (cy * d / this.k + this.camY) / TILE] }
  /** Map position in tiles → CSS pixels on the canvas. */
  toCss(tx: number, ty: number) { return [((tx * TILE - this.camX) * this.k) / this.dpr, ((ty * TILE - this.camY) * this.k) / this.dpr] }
  /** The person under a tap, if any (their sprite box, topmost first; never yourself). */
  pick(net: WorldNet, cx: number, cy: number, now: number) {
    const [tx, ty] = this.toTile(cx, cy), gx = tx * TILE, gy = ty * TILE
    const list = [...net.ents.values()].filter(e => e.id !== net.me).sort((a, b) => b.y - a.y)
    for (const e of list) { const [fx, fy] = this.feet(net, e, now); if (gx >= fx - 9 && gx <= fx + 9 && gy >= fy - 30 && gy <= fy + 3) return e.id }
    return 0
  }
}
export { TABLES }
