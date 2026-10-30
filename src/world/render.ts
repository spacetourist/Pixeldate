/* Pixeldate World renderer: PixiJS v8 (WebGL first; WebGPU / Canvas only if WebGL is missing), sprites only.
   GD's café art is the background; the hand-written grid in world/shared/map.ts says what is blocked. Everything is in
   the café's native 16 px grid, scaled by an INTEGER factor k in device pixels with nearest sampling, so every art pixel
   is exactly k×k screen pixels. */
import { MAP, W, H, TILE, at, TABLES } from '../../world/shared/map.ts'
import { F_HEART, F_BROKEN, F_MOVING, F_SIT, F_ME } from '../../world/shared/proto.ts'
import { composeDir, footX, WALK_FRAME_MS, WALK_W, WALK_H, SIT_D, SIT_CHAIR, type Dir, type Frame } from './walk.ts'
import { parseOptions } from '../avatar/kit/map.ts'
import { SAMPLES } from '../avatar/kit/kit.gen.ts'
import type { WorldNet, Seen } from './net.ts'
import { autoDetectRenderer, Container, Sprite, Texture, CanvasSource, Rectangle, type PixiRenderer } from './pixi.ts'

export const MW = W * TILE, MH = H * TILE
/* GD's final world markers (world/markers/README.md), copied into ./art/markers/ by  node tools/import-world-art.mjs
   (sizes checked there). Anchors are in art px from the person's 24x32 sprite cell top-left (sx, sy); seated: y + SIT_D.
     heart-bob.png        18x9, two 9x9 frames (0 = lower), ~400 ms each, at (sx+7, sy-10); heart.png 9x8 at (sx+7, sy-9)
                          is the still heart for reduced motion
     broken-heart.png     9x7 at (sx+7, sy-8)
     edge-arrow.png       24x24 pointing right; -left / -up / -down are drawn upright (heart stays upright), used as is.
                          Outline tip 2 px inside the screen edge; the other axis follows the target, clamped to the view
     count-badges.png     strip: x2..x9 11 px wide at 0, 11 .. 77; x9+ 15 px at 88. On the arrow at right/down (0,0),
                          left (13,0), up (0,15)
     speech-bubble-*.png  the chat bubble (DOM, world.css): 12x12 9-slice (4 px) + 9x6 tail, tip 2 px over the head */
const ART = import.meta.glob<string>('./art/**/*.png', { eager: true, query: '?url', import: 'default' })
const ARROWS = { right: 'edge-arrow', left: 'edge-arrow-left', up: 'edge-arrow-up', down: 'edge-arrow-down' } as const
type Edge = keyof typeof ARROWS
/** Arrow cell (art px); the arrow art fills 1..22 of it, so the tip is 22 (right/down) or 1 (left/up). */
const ARROW = 24, TIP_IN = 2
const BADGE_AT: Record<Edge, [number, number]> = { right: [0, 0], left: [13, 0], down: [0, 0], up: [0, 15] }
const HEART_BOB_MS = 400
const GLOW: Record<string, string> = { table: 'glow-table-lamp.png', pendant: 'glow-pendant.png', floor: 'glow-floor-lamp.png' }
/** GD's glows are 150/255 at the centre and the map already has its light baked in, so they go on at about half strength:
    enough to warm the people standing in a pool of light without washing out the art. */
const GLOW_ALPHA = 0.55
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
const load = (f: string) => new Promise<HTMLCanvasElement>((ok, no) => { const i = new Image(); i.decoding = 'async'
  i.onload = () => { const c = cnv(i.naturalWidth, i.naturalHeight); c.getContext('2d')!.drawImage(i, 0, 0); ok(c) }
  i.onerror = () => no(new Error('art ' + f)); i.src = ART['./art/' + f] })
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches

const dirOf = (e: Seen): Dir => {
  if (e.f & F_SIT) { const tx = Math.floor(e.x), ty = Math.floor(e.y)  // face the table
    return at(tx + 1, ty) === 'T' ? 'right' : at(tx - 1, ty) === 'T' ? 'left' : at(tx, ty - 1) === 'T' ? 'up' : 'down' }
  return Math.abs(e.dx) > Math.abs(e.dy) ? (e.dx < 0 ? 'left' : 'right') : (e.dy < 0 ? 'up' : 'down')
}
export type Layout = 'phone' | 'desk'
/** One arrow per screen edge and stretch of it: off-screen hearts whose arrows would overlap on the same edge share one,
    with a count badge. x, y: arrow centre in CSS px. */
export type Arrow = { id: number; ids: number[]; n: number; x: number; y: number; dir: Edge; cover: boolean; badge: string }
type Spr = { t: Texture; ax: number; fy: number }
/** sx, sy: sprite cell top-left this frame (art px, map space), for the markers and the bubble tail */
type Ent = { root: Container; shadow: Sprite; me: Sprite; sel: Sprite; body: Sprite; mark: Sprite; sx: number; sy: number; sit: boolean }
type Box = [number, number, number, number]
const hit = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]

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
  private T: Record<string, Texture> = {}; private badges: Texture[] = []
  private arrowPool: Sprite[] = []; private countPool: Sprite[] = []
  /** GD's marker files in use, with their sizes in art px (tests check them against world/markers/README.md). */
  art: Record<string, [number, number]> = {}
  constructor(c: HTMLCanvasElement) {
    this.c = c
    this.ready = this.init().catch(err => { console.error('[world] renderer', err); throw err })
  }
  private async init() {
    const MK = ['heart', 'heart-bob', 'broken-heart', ...Object.values(ARROWS), 'count-badges']
    const [map, ...rest] = await Promise.all([load(MAP.art), ...Object.values(GLOW).map(load), ...MK.map(f => load(`markers/${f}.png`))])
    const glows = rest.slice(0, 3), mk = Object.fromEntries(MK.map((f, i) => [f, rest[3 + i]]))
    const px = await autoDetectRenderer({ canvas: this.c, width: this.dw, height: this.dh, resolution: 1, autoDensity: false, antialias: false,
      preference: PREF, skipExtensionImports: true, hello: false, background: '#08041A', roundPixels: true })
    if (this.dead) { px.destroy(); return }
    this.kind = px.name
    const T = this.T
    T.map = tex(map); Object.keys(GLOW).forEach((k, i) => { T['glow-' + k] = tex(glows[i]) })
    T.shadow = tex(paint(['..xxxxxxxx..', 'xxXXXXXXXXxx', 'xxXXXXXXXXxx', 'xxXXXXXXXXxx', '..xxxxxxxx..'], { x: '#00000066', X: '#000000A8' }))
    T.me = tex(paint(['m............m', '.mmmmmmmmmmmm.'], { m: '#48E5C2' }))
    T.sel = tex(paint(['y..............y', '.yyyyyyyyyyyyyy.'], { y: '#FFD84D' }))
    for (const f of MK) { T[f] = tex(mk[f]); this.art[f] = [mk[f].width, mk[f].height] }
    const bob = T['heart-bob'].source; T.bob0 = new Texture({ source: bob, frame: new Rectangle(0, 0, 9, 9) }); T.bob1 = new Texture({ source: bob, frame: new Rectangle(9, 0, 9, 9) })
    const strip = T['count-badges'].source
    this.badges = [...Array.from({ length: 8 }, (_, i) => new Texture({ source: strip, frame: new Rectangle(i * 11, 0, 11, 9) })), new Texture({ source: strip, frame: new Rectangle(88, 0, 15, 9) })]
    T.dot = tex(paint(['mm', 'mm'], { m: '#48E5C2' }))
    T.goal = tex(paint(['mmmmmmmmmm', 'm........m', 'm........m', 'm........m', 'm........m', 'mmmmmmmmmm'], { m: '#48E5C2' }))

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
      a = { t: Texture.EMPTY, ax: Math.floor(footX(st)), fy }; this.sprites.set(ak, a) }
    s = { t: new Texture({ source: source(c) }), ax: a.ax, fy: a.fy }
    this.sprites.set(key, s); return s
  }
  private feet(net: WorldNet, e: Seen, now: number) { return [Math.round(net.lerpX(e, now) * TILE), Math.round(net.lerpY(e, now) * TILE)] }
  private ent(id: number): Ent {
    let x = this.ents.get(id); if (x) return x
    const T = this.T, root = new Container(), shadow = new Sprite(T.shadow), me = new Sprite(T.me), sel = new Sprite(T.sel), body = new Sprite(), mark = new Sprite()
    root.addChild(shadow, me, sel, body); this.people.addChild(root); this.marks.addChild(mark)
    x = { root, shadow, me, sel, body, mark, sx: 0, sy: 0, sit: false }; this.ents.set(id, x); return x
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
    const seen = new Set<number>()
    const bodies: Box[] = [], far: { id: number; x: number; y: number }[] = [], calm = still()
    for (const e of net.ents.values()) {
      seen.add(e.id); const x = this.ent(e.id), d = dirOf(e), sit = !!(e.f & F_SIT)
      let [fx, fy] = this.feet(net, e, now)
      const fr: Frame = sit ? 'sit' : (e.f & F_MOVING) ? (Math.floor((now + e.id * 53) / WALK_FRAME_MS) % 4) as Frame : 'stand'
      const s = this.sprite(e.id, net.pubs.get(e.id)?.pav ?? (e.id === net.me ? net.p.pav : undefined), d, fr)
      let sx: number, sy: number
      if (sit && (d === 'right' || d === 'left')) {
        // GD's chair tile is 16x32 with its top on the back-rest row (the seat tile's row - 1); the map art already has the
        // chair and the table, so drawing the sitter over it gives chair, table, sitter (feet tuck under the table)
        const tx = Math.floor(e.x), ty = Math.floor(e.y), [dx, dy] = d === 'right' ? SIT_CHAIR.leftSeat : SIT_CHAIR.rightSeat
        sx = tx * TILE + dx; sy = (ty - 1) * TILE + dy; fx = sx + 12; fy = sy + 32
      } else { if (sit) { fx = Math.floor(e.x) * TILE + 8; fy = Math.floor(e.y) * TILE + 8 } sx = fx - s.ax; sy = fy - s.fy }
      x.body.texture = s.t; x.body.position.set(sx, sy); x.sx = sx; x.sy = sy; x.sit = sit
      x.root.zIndex = fy * 1024 + (e.id & 1023)
      x.shadow.visible = !sit; x.shadow.position.set(fx - 6, fy - 2)
      x.me.visible = !!(e.f & F_ME); x.me.position.set(fx - 7, fy + 1)
      x.sel.visible = e.id === this.sel; x.sel.position.set(fx - 8, fy + 1)
      const heart = !!(e.f & F_HEART), broken = !heart && !!(e.f & F_BROKEN), sd = sit ? SIT_D : 0
      x.mark.visible = heart || broken
      if (heart && calm) { x.mark.texture = this.T.heart; x.mark.position.set(sx + 7, sy - 9 + sd) }
      else if (heart) { x.mark.texture = Math.floor((now + e.id * 137) / HEART_BOB_MS) % 2 ? this.T.bob1 : this.T.bob0; x.mark.position.set(sx + 7, sy - 10 + sd) }
      else if (broken) { x.mark.texture = this.T['broken-heart']; x.mark.position.set(sx + 7, sy - 8 + sd) }
      // on screen (even partly): arrows keep off them; off screen with a heart: they get an arrow
      const box: Box = [fx - 9 - this.camX, sy - this.camY, fx + 9 - this.camX, fy + 3 - this.camY]
      const off = box[2] < 0 || box[0] > vw || box[3] < 0 || box[1] - 9 > vh
      if (!off) bodies.push(box)
      else if (heart && e.id !== net.me) far.push({ id: e.id, x: fx - this.camX, y: fy - 14 - this.camY })
    }
    for (const [id, x] of this.ents) if (!seen.has(id)) { x.root.destroy(); x.mark.destroy(); this.ents.delete(id) }
    this.arrows = this.placeArrows(far, bodies)
    this.px.render(this.stage)
  }
  /** Off-screen hearts → edge arrows (GD's README): each goes on the edge its direction from the view centre crosses,
      drawn with that edge's upright art, tip TIP_IN px inside the edge, the other axis at the target's position clamped to
      the view. Arrows that would overlap on the same edge merge into one with a count badge; an arrow then slides along
      the edge (up to 3 steps either way) to keep off anyone standing there and off other arrows. */
  private placeArrows(far: { id: number; x: number; y: number }[], bodies: Box[]): Arrow[] {
    const vw = this.vw, vh = this.vh, k = this.k, W0 = Math.floor(vw), H0 = Math.floor(vh)
    const lo = 1, hiX = W0 - ARROW - 1, hiY = H0 - ARROW - 1, cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
    const edges: Record<Edge, { id: number; c: number }[]> = { right: [], left: [], up: [], down: [] }
    for (const f of far) { const dx = f.x - vw / 2, dy = f.y - vh / 2
      const e: Edge = Math.abs(dx) / (vw / 2) >= Math.abs(dy) / (vh / 2) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
      const side = e === 'right' || e === 'left'
      edges[e].push({ id: f.id, c: side ? cl(Math.round(f.y - ARROW / 2), lo, hiY) : cl(Math.round(f.x - ARROW / 2), lo, hiX) }) }
    const groups: { e: Edge; m: { id: number; c: number }[] }[] = []
    for (const e of Object.keys(edges) as Edge[]) { const l = edges[e].sort((a, b) => a.c - b.c); let g: { id: number; c: number }[] | null = null
      for (const f of l) { if (g && f.c < g[g.length - 1].c + ARROW) g.push(f); else { g = [f]; groups.push({ e, m: g }) } } }
    const out: Arrow[] = [], taken: Box[] = []
    groups.forEach(({ e, m }, i) => {
      const side = e === 'right' || e === 'left', c0 = Math.round(m.reduce((s, f) => s + f.c, 0) / m.length)
      const fixed = e === 'right' ? W0 - 1 - TIP_IN - 22 : e === 'down' ? H0 - 1 - TIP_IN - 22 : TIP_IN - 1
      let px = 0, py = 0, cover = true
      for (const step of [0, 1, -1, 2, -2, 3, -3]) {
        const c = side ? cl(c0 + step * (ARROW + 2), lo, hiY) : cl(c0 + step * (ARROW + 2), lo, hiX)
        const qx = side ? fixed : c, qy = side ? c : fixed, b: Box = [qx + 1, qy + 1, qx + ARROW - 1, qy + ARROW - 1]
        if (step === 0) { px = qx; py = qy }
        if (!bodies.some(o => hit(o, b)) && !taken.some(o => hit(o, b))) { px = qx; py = qy; cover = false; break }
      }
      taken.push([px, py, px + ARROW, py + ARROW])
      const a = this.arrowPool[i] ?? this.ui.addChild(new Sprite()); this.arrowPool[i] = a
      a.texture = this.T[ARROWS[e]]; a.position.set(px, py); a.visible = true
      const n = m.length, c = this.countPool[i] ?? this.ui.addChild(new Sprite()); this.countPool[i] = c; c.visible = n > 1
      if (n > 1) { c.texture = this.badges[Math.min(n, 10) - 2]; c.position.set(px + BADGE_AT[e][0], py + BADGE_AT[e][1]) }
      out.push({ id: m[0].id, ids: m.map(f => f.id), n, x: (px + ARROW / 2) * k / this.dpr, y: (py + ARROW / 2) * k / this.dpr, dir: e, cover, badge: n > 1 ? (n > 9 ? 'x9+' : 'x' + n) : '' })
    })
    for (let i = groups.length; i < this.arrowPool.length; i++) { this.arrowPool[i].visible = false; this.countPool[i].visible = false }
    return out
  }
  /** Where a speech bubble's tail tip goes for this person, in CSS px on the canvas: [left edge of the tip's pixel column
      (sx+11), bottom of the tip pixel (2 px above the head: sy-2, or sy+1 seated)], or null if they aren't drawn yet. */
  tip(id: number): [number, number] | null { const x = this.ents.get(id); if (!x) return null
    return [((x.sx + 11) * this.k - this.ox) / this.dpr, ((x.sy + (x.sit ? 1 : -2) + 1) * this.k - this.oy) / this.dpr] }
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
