/* Pixeldate World renderer: PixiJS v8 (WebGL first; WebGPU / Canvas only if WebGL is missing), sprites only.
   GD's café art is the background; the hand-written grid in world/shared/map.ts says what is blocked. Everything is in
   the café's native 16 px grid, scaled by an INTEGER factor k in device pixels with nearest sampling, so every art pixel
   is exactly k×k screen pixels. */
import { MAP, W, H, TILE, at, TABLES } from '../../world/shared/map.ts'
import { F_HEART, F_BROKEN, F_MOVING, F_SIT, F_ME } from '../../world/shared/proto.ts'
import { composeDir, footX, WALK_FRAME_MS, WALK_W, WALK_H, type Dir, type Frame } from './walk.ts'
import { parseOptions } from '../avatar/kit/map.ts'
import { SAMPLES } from '../avatar/kit/kit.gen.ts'
import type { WorldNet, Seen } from './net.ts'
import { autoDetectRenderer, Container, Sprite, Texture, CanvasSource, Rectangle, type PixiRenderer } from './pixi.ts'

export const MW = W * TILE, MH = H * TILE
const ART = import.meta.glob<string>('./art/*.png', { eager: true, query: '?url', import: 'default' })
const GLOW: Record<string, string> = { table: 'glow-table-lamp.png', pendant: 'glow-pendant.png', floor: 'glow-floor-lamp.png' }
/** GD's glows are 150/255 at the centre and the map already has its light baked in, so they go on at about half strength:
    enough to warm the people standing in a pool of light without washing out the art. */
const GLOW_ALPHA = 0.55
/** Seated: GD's seated sprite sits 4 px above the chair tile, 3 px into it; with no sitting pose yet we draw the stand pose
    there and cut it at the hips, so the chair seat and the table edge (both in the map art) frame the body. */
const SIT_TOP = -20, SIT_CROP = 22
const PHONE_CSS_SCALE = 2
/** Renderer choice; ?gl=canvas / ?gl=webgpu forces a fallback for testing. */
const PREF = (['webgl', 'webgpu', 'canvas'] as const).find(x => x === new URLSearchParams(location.search).get('gl')) ?? 'webgl'
/** Camera ease time constant (ms): the view glides after you rather than locking to every step. */
const EASE_MS = 140

type Px = Record<string, string>
const cnv = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const paint = (rows: string[], cols: Px) => { const c = cnv(rows[0].length, rows.length), g = c.getContext('2d')!
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const col = cols[r[i]]; if (col) { g.fillStyle = col; g.fillRect(i, j, 1, 1) } } }); return c }
const source = (c: HTMLCanvasElement) => new CanvasSource({ resource: c, scaleMode: 'nearest' })
const tex = (c: HTMLCanvasElement) => new Texture({ source: source(c) })
const load = (f: string) => new Promise<HTMLCanvasElement>((ok, no) => { const i = new Image()
  i.onload = () => { const c = cnv(i.naturalWidth, i.naturalHeight); c.getContext('2d')!.drawImage(i, 0, 0); ok(c) }
  i.onerror = () => no(new Error('art ' + f)); i.src = ART['./art/' + f] })

const HEART = ['.cc.cc.', 'chccccc', 'ccccccc', '.ccccc.', '..ccc..', '...c...']
/** Broken heart: still small, grey and still, but a lighter grey with a 1 px night-ink outline and a crack that reads as
    a gap, so it holds up against the dark plum floor. (v01's flat #8A84A3 5x4 sat almost on the floor's value.) */
const BROKEN = ['.oo.oo.', 'oggogg' + 'o', 'oggo.go', '.og.go.', '..ogo..', '...o...']
const HC: Px = { c: '#FF6F59', h: '#FFC2B3' }, BC: Px = { g: '#B8B2CF', o: '#0B0620' }
/** Off-screen heart arrow, 9x9 with the pivot pixel at (4,4) so 90° turns stay on the pixel grid. */
const arrowArt = (inside: (x: number, y: number) => boolean) => {
  const rows: string[] = []
  for (let y = 0; y < 9; y++) { let r = ''; for (let x = 0; x < 9; x++) r += !inside(x, y) ? '.' : [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !inside(x + a, y + b)) ? 'o' : 'c'; rows.push(r) }
  return paint(rows, { c: '#FF6F59', o: '#0B0620' }) }
const ARROW_E = () => arrowArt((x, y) => x >= 3 && x <= 7 && Math.abs(y - 4) <= 7 - x)  // ▶ tip at (7,4)
const ARROW_SE = () => arrowArt((x, y) => x <= 7 && y <= 7 && x + y >= 8)                   // ◢ corner at (7,7)

const dirOf = (e: Seen): Dir => {
  if (e.f & F_SIT) { const tx = Math.floor(e.x), ty = Math.floor(e.y); return at(tx + 1, ty) === 'T' ? 'right' : at(tx - 1, ty) === 'T' ? 'left' : 'down' }
  return Math.abs(e.dx) > Math.abs(e.dy) ? (e.dx < 0 ? 'left' : 'right') : (e.dy < 0 ? 'up' : 'down')
}
export type Layout = 'phone' | 'desk'
export type Arrow = { id: number; x: number; y: number; oct: number }
type Spr = { t: Texture; sit: Texture; ax: number; fy: number }
type Ent = { root: Container; shadow: Sprite; me: Sprite; sel: Sprite; body: Sprite; mark: Sprite; arrow: Sprite }

export class Renderer {
  c: HTMLCanvasElement
  k = 1; dpr = 1; vw = MW; vh = MH; camX = 0; camY = 0; cssW = 0; cssH = 0; layout: Layout = 'phone'
  sel = 0; path: [number, number][] = []; fps = 0; arrows: Arrow[] = []; kind = ''; camT: [number, number] = [0, 0]
  ready: Promise<void>
  private ox = 0; private oy = 0; private dw = 1; private dh = 1; private snap = true; private last = 0
  private frames: number[] = []; private sprites = new Map<string, Spr>(); private ents = new Map<number, Ent>()
  private px: PixiRenderer | null = null; private dead = false
  private stage = new Container(); private world = new Container(); private people = new Container(); private marks = new Container()
  private ui = new Container(); private dots = new Container(); private goal = new Sprite()
  private T: Record<string, Texture> = {}
  constructor(c: HTMLCanvasElement) {
    this.c = c
    this.ready = this.init().catch(err => { console.error('[world] renderer', err); throw err })
  }
  private async init() {
    const [map, ...glows] = await Promise.all([load(MAP.art), ...Object.values(GLOW).map(load)])
    const px = await autoDetectRenderer({ canvas: this.c, width: this.dw, height: this.dh, resolution: 1, autoDensity: false, antialias: false,
      preference: PREF, skipExtensionImports: true, hello: false, background: '#08041A', roundPixels: true })
    if (this.dead) { px.destroy(); return }
    this.kind = px.name
    const T = this.T
    T.map = tex(map); Object.keys(GLOW).forEach((k, i) => { T['glow-' + k] = tex(glows[i]) })
    T.shadow = tex(paint(['..xxxxxxxx..', 'xxXXXXXXXXxx', 'xxXXXXXXXXxx', 'xxXXXXXXXXxx', '..xxxxxxxx..'], { x: '#00000066', X: '#000000A8' }))
    T.me = tex(paint(['m............m', '.mmmmmmmmmmmm.'], { m: '#48E5C2' }))
    T.sel = tex(paint(['y..............y', '.yyyyyyyyyyyyyy.'], { y: '#FFD84D' }))
    T.heart = tex(paint(HEART, HC)); T.broken = tex(paint(BROKEN, BC))
    T.dot = tex(paint(['mm', 'mm'], { m: '#48E5C2' }))
    T.goal = tex(paint(['mmmmmmmmmm', 'm........m', 'm........m', 'm........m', 'm........m', 'mmmmmmmmmm'], { m: '#48E5C2' }))
    T.arrowE = tex(ARROW_E()); T.arrowSE = tex(ARROW_SE())

    const bg = new Sprite(T.map), glow = new Container()
    for (const l of MAP.lights) { const t = T['glow-' + l.kind], s = new Sprite(t)
      s.position.set(Math.round(l.x - t.width / 2), Math.round(l.y - t.height / 2)); s.blendMode = 'add'; s.alpha = GLOW_ALPHA; glow.addChild(s) }
    this.goal.texture = T.goal; this.goal.visible = false
    this.people.sortableChildren = true
    this.world.addChild(bg, this.dots, this.goal, this.people, glow, this.marks)
    this.stage.addChild(this.world, this.ui)
    this.px = px; this.apply()
  }
  destroy() { this.dead = true; if (this.px) { this.px.destroy(); this.px = null } }
  /** Integer factor k (device px per art px), and never so small that the view is wider or taller than the room, so there
      are no empty bands. Phone: 2 CSS px per art px (about 12 tiles across at 390). Desktop: a closer view that follows you. */
  resize(cssW: number, cssH: number, dpr: number, layout: Layout) {
    const dw = Math.max(1, Math.floor(cssW * dpr)), dh = Math.max(1, Math.floor(cssH * dpr))
    const base = layout === 'phone' ? Math.max(1, Math.round(PHONE_CSS_SCALE * dpr)) : Math.max(2, Math.floor(Math.min(dw / 320, dh / 240)))
    this.k = Math.max(base, Math.ceil(dw / MW), Math.ceil(dh / MH))
    this.vw = dw / this.k; this.vh = dh / this.k; this.dw = dw; this.dh = dh; this.layout = layout
    this.dpr = dpr; this.cssW = dw / dpr; this.cssH = dh / dpr; this.snap = true
    this.c.style.width = this.cssW + 'px'; this.c.style.height = this.cssH + 'px'
    this.apply()
  }
  private apply() { if (!this.px) { this.c.width = this.dw; this.c.height = this.dh; return }
    this.px.resize(this.dw, this.dh, 1); this.world.scale.set(this.k); this.ui.scale.set(this.k) }
  sprite(id: number, pav: string | undefined, d: Dir, f: Frame): Spr {
    const key = (pav ?? '#' + id) + '|' + d + '|' + f; let s = this.sprites.get(key); if (s) return s
    const o = (pav && parseOptions(pav)) || SAMPLES[id % SAMPLES.length]
    const px = composeDir(o as any, d, f), c = cnv(WALK_W, WALK_H); c.getContext('2d')!.putImageData(new ImageData(px, WALK_W, WALK_H), 0, 0)
    // feet anchor per direction, from its standing pose (GD: the mirrored right view sits 1 px off; per-frame anchoring
    // would cancel the stride and make walkers slide)
    const ak = (pav ?? '#' + id) + '|' + d + '|anchor'; let a = this.sprites.get(ak)
    if (!a) { const st = f === 'stand' ? px : composeDir(o as any, d, 'stand'); let fy = WALK_H - 1
      while (fy > 0) { let any = false; for (let x = 0; x < WALK_W; x++) if (st[(fy * WALK_W + x) * 4 + 3]) any = true; if (any) break; fy-- }
      a = { t: Texture.EMPTY, sit: Texture.EMPTY, ax: Math.floor(footX(st)), fy }; this.sprites.set(ak, a) }
    const src = source(c)
    s = { t: new Texture({ source: src }), sit: new Texture({ source: src, frame: new Rectangle(0, 0, WALK_W, SIT_CROP) }), ax: a.ax, fy: a.fy }
    this.sprites.set(key, s); return s
  }
  private feet(net: WorldNet, e: Seen, now: number) { return [Math.round(net.lerpX(e, now) * TILE), Math.round(net.lerpY(e, now) * TILE)] }
  private ent(id: number): Ent {
    let x = this.ents.get(id); if (x) return x
    const T = this.T, root = new Container(), shadow = new Sprite(T.shadow), me = new Sprite(T.me), sel = new Sprite(T.sel), body = new Sprite(), mark = new Sprite(), arrow = new Sprite()
    root.addChild(shadow, me, sel, body); this.people.addChild(root); this.marks.addChild(mark); this.ui.addChild(arrow); arrow.pivot.set(4, 4)
    x = { root, shadow, me, sel, body, mark, arrow }; this.ents.set(id, x); return x
  }
  frame(net: WorldNet, now: number) {
    this.frames.push(now); while (this.frames.length && now - this.frames[0] > 1000) this.frames.shift(); this.fps = this.frames.length
    const dt = Math.min(100, Math.max(0, now - (this.last || now))); this.last = now
    if (!this.px) return
    const k = this.k, vw = this.vw, vh = this.vh
    // camera: ease toward the player, clamped to the room (k guarantees the view is never bigger than the room)
    const me = net.ents.get(net.me)
    if (me) { const [fx, fy] = this.feet(net, me, now)
      const tx = Math.max(0, Math.min(MW - vw, fx - vw / 2)), ty = Math.max(0, Math.min(MH - vh, fy - 12 - vh / 2))
      this.camT = [tx, ty]
      if (this.snap) { this.camX = tx; this.camY = ty; this.snap = false }
      else { const a = 1 - Math.exp(-dt / EASE_MS); this.camX += (tx - this.camX) * a; this.camY += (ty - this.camY) * a
        if (Math.abs(tx - this.camX) < 0.05) this.camX = tx; if (Math.abs(ty - this.camY) < 0.05) this.camY = ty } }
    this.camX = Math.max(0, Math.min(MW - vw, this.camX)); this.camY = Math.max(0, Math.min(MH - vh, this.camY))
    this.ox = Math.round(this.camX * k); this.oy = Math.round(this.camY * k)
    this.world.position.set(-this.ox, -this.oy)

    // walk preview
    const dots = this.dots.children as Sprite[], n = me ? this.path.length : 0
    while (dots.length < n) this.dots.addChild(new Sprite(this.T.dot))
    dots.forEach((d, i) => { d.visible = i < n; if (i < n) d.position.set(this.path[i][0] * TILE + 7, this.path[i][1] * TILE + 7) })
    this.goal.visible = n > 0; if (n) { const t = this.path[n - 1]; this.goal.position.set(t[0] * TILE + 3, t[1] * TILE + 5) }

    // people
    const seen = new Set<number>(), arrows: Arrow[] = [], cx = this.camX + vw / 2, cy = this.camY + vh / 2
    for (const e of net.ents.values()) {
      seen.add(e.id); const x = this.ent(e.id), d = dirOf(e), sit = !!(e.f & F_SIT)
      let [fx, fy] = this.feet(net, e, now)
      const fr: Frame = (e.f & F_MOVING) ? (Math.floor((now + e.id * 53) / WALK_FRAME_MS) % 4) as Frame : 'stand'
      const s = this.sprite(e.id, net.pubs.get(e.id)?.pav ?? (e.id === net.me ? net.p.pav : undefined), d, sit ? 'stand' : fr)
      let top: number
      if (sit) { const tx = Math.floor(e.x), ty = Math.floor(e.y); fx = tx * TILE + 8 + (d === 'right' ? 1 : d === 'left' ? -1 : 0); fy = ty * TILE + 8
        top = ty * TILE + SIT_TOP; x.body.texture = s.sit; x.body.position.set(fx - s.ax, top) }
      else { top = fy - s.fy; x.body.texture = s.t; x.body.position.set(fx - s.ax, top) }
      x.root.zIndex = fy * 1024 + (e.id & 1023)
      x.shadow.visible = !sit; x.shadow.position.set(fx - 6, fy - 2)
      x.me.visible = !!(e.f & F_ME); x.me.position.set(fx - 7, fy + 1)
      x.sel.visible = e.id === this.sel; x.sel.position.set(fx - 8, fy + 1)
      const heart = !!(e.f & F_HEART), broken = !heart && !!(e.f & F_BROKEN)
      x.mark.visible = heart || broken
      if (heart) { x.mark.texture = this.T.heart; x.mark.position.set(fx - 3, top - 8 - (Math.floor(now / 300 + e.id) % 2)) }
      else if (broken) { x.mark.texture = this.T.broken; x.mark.position.set(fx - 3, top - 7) }
      // off-screen heart → coral arrow on the screen edge, pointing at them
      const off = fx + 9 < this.camX || fx - 9 > this.camX + vw || fy < this.camY || top - 9 > this.camY + vh
      x.arrow.visible = heart && off && e.id !== net.me
      if (x.arrow.visible) {
        const dx = fx - cx, dy = fy - 14 - cy, m = 6, hx = vw / 2 - m, hy = vh / 2 - m
        const t = Math.min(dx ? hx / Math.abs(dx) : Infinity, dy ? hy / Math.abs(dy) : Infinity)
        const ax = Math.round(vw / 2 + dx * t), ay = Math.round(vh / 2 + dy * t)
        const oct = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8
        x.arrow.texture = oct & 1 ? this.T.arrowSE : this.T.arrowE; x.arrow.rotation = (oct >> 1) * Math.PI / 2
        x.arrow.position.set(ax, ay); arrows.push({ id: e.id, x: ax * k / this.dpr, y: ay * k / this.dpr, oct })
      }
    }
    for (const [id, x] of this.ents) if (!seen.has(id)) { x.root.destroy(); x.mark.destroy(); x.arrow.destroy(); this.ents.delete(id) }
    this.arrows = arrows
    this.px.render(this.stage)
  }
  /** CSS-pixel point on the canvas → map position in tiles. */
  toTile(cx: number, cy: number) { const d = this.dpr; return [(cx * d + this.ox) / this.k / TILE, (cy * d + this.oy) / this.k / TILE] }
  /** Map position in tiles → CSS pixels on the canvas. */
  toCss(tx: number, ty: number) { return [(tx * TILE * this.k - this.ox) / this.dpr, (ty * TILE * this.k - this.oy) / this.dpr] }
  /** The person under a tap, if any (their sprite box, topmost first; never yourself). */
  pick(net: WorldNet, cx: number, cy: number, now: number) {
    const [tx, ty] = this.toTile(cx, cy), gx = tx * TILE, gy = ty * TILE
    const list = [...net.ents.values()].filter(e => e.id !== net.me).sort((a, b) => b.y - a.y)
    for (const e of list) { const [fx, fy] = this.feet(net, e, now); if (gx >= fx - 9 && gx <= fx + 9 && gy >= fy - 30 && gy <= fy + 3) return e.id }
    return 0
  }
}
export { TABLES }
