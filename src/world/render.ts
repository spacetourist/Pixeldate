/* Pixeldate World renderer: PixiJS v8 (WebGL first; WebGPU / Canvas only if WebGL is missing), sprites only.
   GD's café art is the background; the hand-written grid in world/shared/map.ts says what is blocked. Everything is in
   the café's native 16 px grid, scaled by an INTEGER factor k in device pixels with nearest sampling, so every art pixel
   is exactly k×k screen pixels. */
import { MAP, W, H, TILE, at, TABLES, isPianoSeat } from '../../world/shared/map.ts'
import { PIANO_PX, PIECE, NOTE, noteEveryMs } from '../../world/shared/piano.ts'
import { SOFAS, seatOf, seatPx } from '../../world/shared/sofa.ts'
import { DUET, DUET_PX, partAt, type Part } from '../../world/shared/duet.ts'
import { F_HEART, F_BROKEN, F_MOVING, F_SIT, F_ME } from '../../world/shared/proto.ts'
import { composeDir, footX, WALK_FRAME_MS, WALK_W, WALK_H, SIT_D, SIT_CHAIR, PIANO_FRAME_MS, type Dir, type Frame } from './walk.ts'
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
/* GD's couple heart (world/couple/README.md), copied into ./art/couple/: couple-heart.png 90x13 (six 15x13 frames),
   couple-steam.png 28x32 (7x16 wisps, row 0 left, row 16 right; 4 x 180 ms), couple-drift.png 19x6 (coral, butter, cream) */
const COUPLE_MS = [300, 140, 140, 240, 200, 180], COUPLE_LOOP = 1200, STEAM_MS = 180
/** the drifting hearts alive at time t (README): one per 600 ms, alternating L (8,-3) / R (23,-3), coral/butter/cream,
    1600 ms life, 14 px rise with ease-out, +-1 px sine sway (800 ms), 3 px outward drift, fade in 10% / out after 50%,
    at most 4 (oldest dropped), whole px. x, y: particle bottom-centre, table-local. */
function drift(t: number) {
  const SPAWN = 600, LIFE = 1600, out: { age: number; v: number; x: number; y: number; a: number }[] = []
  for (let k = Math.floor((t - LIFE) / SPAWN) + 1; k <= Math.floor(t / SPAWN); k++) {
    const age = t - k * SPAWN; if (age < 0 || age >= LIFE) continue
    const u = age / LIFE, L = ((k % 2) + 2) % 2 === 0, [tx, ty] = L ? [8, -3] : [23, -3]
    const rise = 14 * (1 - (1 - u) ** 2), dx = (L ? -1 : 1) * 3 * u + Math.sin(2 * Math.PI * age / 800)
    out.push({ age, v: ((k % 3) + 3) % 3, x: Math.round(tx + dx), y: Math.round(ty - rise), a: Math.max(0, Math.min(1, u < 0.1 ? u / 0.1 : u > 0.5 ? (1 - u) / 0.5 : 1)) })
  }
  out.sort((a, b) => b.age - a.age); return out.slice(-4)
}
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
/** one sort key for a sofa's layers: its bottom row (y + 32), then the layer (GD sofa README: 0 back, 1..3 sitter bodies L/M/R,
    4 front, 5..7 sitter legs L/M/R) */
export const sofaZ = (ty: number, layer: number) => ((ty + 2) * TILE) * 1024 - 8 + layer
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches

const dirOf = (e: Seen): Dir => {
  if (e.f & F_SIT) { const tx = Math.floor(e.x), ty = Math.floor(e.y)  // face the table
    if (isPianoSeat(tx, ty)) return 'up'
    return at(tx + 1, ty) === 'T' ? 'right' : at(tx - 1, ty) === 'T' ? 'left' : at(tx, ty - 1) === 'T' ? 'up' : 'down' }
  return Math.abs(e.dx) > Math.abs(e.dy) ? (e.dx < 0 ? 'left' : 'right') : (e.dy < 0 ? 'up' : 'down')
}
export type Layout = 'phone' | 'desk'
/** One arrow per screen edge and stretch of it: off-screen hearts whose arrows would overlap on the same edge share one,
    with a count badge. x, y: arrow centre in CSS px. */
export type Arrow = { id: number; ids: number[]; n: number; x: number; y: number; dir: Edge; cover: boolean; badge: string }
type Spr = { t: Texture; ax: number; fy: number }
/** sx, sy: sprite cell top-left this frame (art px, map space), for the markers and the bubble tail */
type Ent = { root: Container; shadow: Sprite; me: Sprite; sel: Sprite; body: Sprite; legs: Sprite; mark: Sprite; sx: number; sy: number; sit: boolean }
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
  /** the café piano as the server last said (index.tsx sets it): the song and its start, in this client's clock (ms,
      performance.now() time base), for the pianist's hands and the notes over the lid */
  piano: { by: number; song: string | null; at: number } = { by: 0, song: null, at: 0 }
  /** the duet as the server last said (index.tsx): who's on Bass / Melody, the phase, the song and its downbeat (this
      client's clock, ms), the parts whose player stood up mid-song */
  duet: { on: boolean; bass: number; melody: number; ph: string; song: string | null; at: number; gone: Part[] } = { on: false, bass: 0, melody: 0, ph: '', song: null, at: 0, gone: [] }
  /** what the duet layer drew last frame (tests): the duet bench, the seat-open frame, the count-in numeral + frame */
  duetOn = { bench: false, seatOpen: -1, count: '' }
  private bench = new Sprite(); private seatOpen = new Sprite(); private countIn = new Sprite(); private SO: Texture[] = []; private CI: Texture[][] = []
  /** notes drawn last frame (tests) */
  notesOn = 0
  private notes = new Container(); private G: Texture[] = []
  /** GD's couple heart (world/couple/README.md): tables whose pair is on a café call with "Show our heart" on (the server
      says only on/off per table; the animation is all local). Room layer, above everything in the room, unlit. */
  hearts = new Set<number>()
  private couple = new Container(); private CH: Texture[] = []; private CS: Texture[][] = []; private CD: Texture[] = []
  /** couple-heart sprites drawn last frame per table, for tests: tb -> [heart frame, drift particles alive] */
  coupleOn: Record<number, [number, number]> = {}
  /** the viewer's private markers last frame, for tests: id -> [has a heart/broken flag, drawn]. A marker over someone
      seated at a table showing its couple heart is hidden (GD: it read as a pile of hearts) and comes back when it stops. */
  markOn: Record<number, [boolean, boolean]> = {}
  /** GD's marker files in use, with their sizes in art px (tests check them against world/markers/README.md). */
  art: Record<string, [number, number]> = {}
  constructor(c: HTMLCanvasElement) {
    this.c = c
    this.ready = this.init().catch(err => { console.error('[world] renderer', err); throw err })
  }
  private async init() {
    const MK = ['heart', 'heart-bob', 'broken-heart', ...Object.values(ARROWS), 'count-badges', 'notes-glyphs']
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
    // GD's three note glyphs (notes-glyphs.png 28x9: quaver 1-6, quaver 9-14, beamed pair 17-26)
    const ng = T['notes-glyphs'].source; this.G = [[0, 8], [8, 8], [16, 12]].map(([x, w]) => new Texture({ source: ng, frame: new Rectangle(x, 0, w, 9) }))
    for (let i = 0; i < 3; i++) this.notes.addChild(new Sprite(this.G[0]))
    // GD's sofa3: the back is in the map art; over it the sitters' bodies (L, M, R), the front layer (cushions, arms,
    // feet), then the sitters' legs (L, M, R), all sorted as one object at the sofa's bottom (y + 32)
    const [ch, cs, cd] = await Promise.all(['couple-heart', 'couple-steam', 'couple-drift'].map(f => load(`couple/${f}.png`)))
    for (const [f, im] of [['couple-heart', ch], ['couple-steam', cs], ['couple-drift', cd]] as const) this.art[f] = [im.width, im.height]
    const chS = tex(ch).source, csS = tex(cs).source, cdS = tex(cd).source
    this.CH = COUPLE_MS.map((_, i) => new Texture({ source: chS, frame: new Rectangle(i * 15, 0, 15, 13) }))
    this.CS = [0, 16].map(y => [0, 1, 2, 3].map(i => new Texture({ source: csS, frame: new Rectangle(i * 7, y, 7, 16) })))
    this.CD = [[0, 5, 5], [6, 5, 5], [12, 7, 6]].map(([x, w, h]) => new Texture({ source: cdS, frame: new Rectangle(x, 6 - h, w, h) }))
    // GD's duet bench (world/duet/README.md): over the solo bench while a duet (or a duet's mix) is on, sorted with the two
    // players at the bench's bottom row; the seat-open marker (2 frames, 500 ms) while Melody is empty; the count-in numerals
    const CIN = [1, 2, 3].flatMap(n => [0, 1, 2, 3, 4, 5].map(f => `duet/countin-${n}-f${f}.png`))
    const [bp, so, ...ci] = await Promise.all(['duet/bench-patch.png', 'duet/duet-seat-open.png', ...CIN].map(load))
    this.art['bench-patch'] = [bp.width, bp.height]; this.art['duet-seat-open'] = [so.width, so.height]; this.art['countin'] = [ci[0].width, ci[0].height]
    this.bench.texture = tex(bp); this.bench.position.set(DUET_PX.bench[0], DUET_PX.bench[1]); this.bench.zIndex = (DUET_PX.bench[1] + 16) * 1024; this.bench.visible = false
    const soS = tex(so).source; this.SO = [0, 24].map(x => new Texture({ source: soS, frame: new Rectangle(x, 0, 24, 32) }))
    this.seatOpen.position.set(DUET_PX.seatOpen[0], DUET_PX.seatOpen[1]); this.seatOpen.zIndex = (DUET_PX.bench[1] + 16) * 1024 + 3; this.seatOpen.visible = false
    this.CI = [0, 1, 2].map(n => ci.slice(n * 6, n * 6 + 6).map(tex))
    this.countIn.position.set(DUET_PX.countIn[0] - 20, DUET_PX.countIn[1] - 20); this.countIn.visible = false
    this.bench.label = 'duet-bench'; this.seatOpen.label = 'duet-seat-open'
    this.people.addChild(this.bench, this.seatOpen); this.notes.addChild(this.countIn)
    const front = await load('tiles/sofa3-front.png'); T.sofaFront = tex(front); this.art['sofa3-front'] = [front.width, front.height]
    for (const sf of SOFAS) { const sp = new Sprite(T.sofaFront); sp.position.set(sf.x * TILE, sf.y * TILE); sp.zIndex = sofaZ(sf.y, 4); sp.label = 'sofa-front-' + sf.id; this.people.addChild(sp) }
    T.dot = tex(paint(['mm', 'mm'], { m: '#48E5C2' }))
    T.goal = tex(paint(['mmmmmmmmmm', 'm........m', 'm........m', 'm........m', 'm........m', 'mmmmmmmmmm'], { m: '#48E5C2' }))

    const bg = new Sprite(T.map), glow = new Container()
    for (const l of MAP.lights) { const t = T['glow-' + l.kind], s = new Sprite(t)
      s.position.set(Math.round(l.x - t.width / 2), Math.round(l.y - t.height / 2)); s.blendMode = 'add'; s.alpha = GLOW_ALPHA; glow.addChild(s) }
    this.goal.texture = T.goal; this.goal.visible = false
    this.people.sortableChildren = true
    this.world.addChild(bg, this.dots, this.goal, this.people, glow, this.notes, this.marks, this.couple)
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
    const legs = new Sprite(); legs.visible = false; legs.label = 'legs-' + id
    root.addChild(shadow, me, sel, body); this.people.addChild(root, legs); this.marks.addChild(mark)
    x = { root, shadow, me, sel, body, legs, mark, sx: 0, sy: 0, sit: false }; this.ents.set(id, x); return x
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
    const under = new Set<string>(); for (const tb of this.hearts) for (const [cx, cy] of TABLES[tb]?.seats ?? []) under.add(cx + ',' + cy)
    this.markOn = {}
    for (const e of net.ents.values()) {
      seen.add(e.id); const x = this.ent(e.id), d = dirOf(e), sit = !!(e.f & F_SIT)
      let [fx, fy] = this.feet(net, e, now)
      const atPiano = sit && isPianoSeat(Math.floor(e.x), Math.floor(e.y)), playing = atPiano && e.id === this.piano.by && !!this.piano.song && now >= this.piano.at
      const part = atPiano ? partAt(Math.floor(e.x)) : null
      const onSofa = sit && at(Math.floor(e.x), Math.floor(e.y)) === 'S'
      const fr: Frame = onSofa ? 'sofaBody' : part ? this.duetFrame(part, now, calm) : atPiano ? (playing && !calm && Math.floor((now - this.piano.at) / PIANO_FRAME_MS) % 2 ? 'piano1' : 'piano0') : sit ? 'sit' : (e.f & F_MOVING) ? (Math.floor((now + e.id * 53) / WALK_FRAME_MS) % 4) as Frame : 'stand'
      const pav = net.pubs.get(e.id)?.pav ?? (e.id === net.me ? net.p.pav : undefined), s = this.sprite(e.id, pav, onSofa ? 'down' : d, fr)
      let sx: number, sy: number, seatZ = 0
      if (part) { [sx, sy] = DUET_PX[part] as unknown as [number, number]; fx = sx + 12; fy = sy + 32; seatZ = (DUET_PX.bench[1] + 16) * 1024 + (part === 'bass' ? 1 : 2) }
      else if (atPiano) { [sx, sy] = PIANO_PX.sprite as unknown as [number, number]; fx = sx + 12; fy = sy + 32; if (this.duetBench()) seatZ = (DUET_PX.bench[1] + 16) * 1024 + 1 }
      else if (onSofa) { const st = seatOf(e.x, e.y)!; [sx, sy] = seatPx(st[0], st[1]); fx = sx + 12; fy = sy + 32; seatZ = sofaZ(SOFAS[st[0]].y, 1 + st[1])
        // the legs layer, same offset as the body, over the sofa front
        x.legs.texture = this.sprite(e.id, pav, 'down', 'sofaLegs').t; x.legs.position.set(sx, sy); x.legs.zIndex = sofaZ(SOFAS[st[0]].y, 5 + st[1]) }
      else if (sit && (d === 'right' || d === 'left')) {
        // GD's chair tile is 16x32 with its top on the back-rest row (the seat tile's row - 1); the map art already has the
        // chair and the table, so drawing the sitter over it gives chair, table, sitter (feet tuck under the table)
        const tx = Math.floor(e.x), ty = Math.floor(e.y), [dx, dy] = d === 'right' ? SIT_CHAIR.leftSeat : SIT_CHAIR.rightSeat
        sx = tx * TILE + dx; sy = (ty - 1) * TILE + dy; fx = sx + 12; fy = sy + 32
      } else { if (sit) { fx = Math.floor(e.x) * TILE + 8; fy = Math.floor(e.y) * TILE + 8 } sx = fx - s.ax; sy = fy - s.fy }
      x.legs.visible = onSofa
      x.body.texture = s.t; x.body.position.set(sx, sy); x.sx = sx; x.sy = sy; x.sit = sit
      x.root.zIndex = seatZ || fy * 1024 + (e.id & 1023)
      x.shadow.visible = !sit; x.shadow.position.set(fx - 6, fy - 2)
      x.me.visible = !!(e.f & F_ME); x.me.position.set(fx - 7, fy + 1)
      x.sel.visible = e.id === this.sel; x.sel.position.set(fx - 8, fy + 1)
      const heart = !!(e.f & F_HEART), broken = !heart && !!(e.f & F_BROKEN), sd = sit ? SIT_D : 0
      const hush = sit && under.has(Math.floor(e.x) + ',' + Math.floor(e.y))
      x.mark.visible = (heart || broken) && !hush; this.markOn[e.id] = [heart || broken, x.mark.visible]
      if (heart && calm) { x.mark.texture = this.T.heart; x.mark.position.set(sx + 7, sy - 9 + sd) }
      else if (heart) { x.mark.texture = Math.floor((now + e.id * 137) / HEART_BOB_MS) % 2 ? this.T.bob1 : this.T.bob0; x.mark.position.set(sx + 7, sy - 10 + sd) }
      else if (broken) { x.mark.texture = this.T['broken-heart']; x.mark.position.set(sx + 7, sy - 8 + sd) }
      // on screen (even partly): arrows keep off them; off screen with a heart: they get an arrow
      const box: Box = [fx - 9 - this.camX, sy - this.camY, fx + 9 - this.camX, fy + 3 - this.camY]
      const off = box[2] < 0 || box[0] > vw || box[3] < 0 || box[1] - 9 > vh
      if (!off) bodies.push(box)
      else if (heart && e.id !== net.me) far.push({ id: e.id, x: fx - this.camX, y: fy - 14 - this.camY })
    }
    for (const [id, x] of this.ents) if (!seen.has(id)) { x.root.destroy(); x.legs.destroy(); x.mark.destroy(); this.ents.delete(id) }
    this.drawDuet(now, calm)
    this.drawNotes(now, calm)
    this.drawCouple(now, calm)
    this.arrows = this.placeArrows(far, bodies)
    this.px.render(this.stage)
  }
  /** GD's couple heart over a table (README): steam L then R, the drifting hearts oldest first, then the heart, from the
      table sprite's top-left (tile x*16, (seat row - 1)*16). Every screen runs the same clock (performance.now()), so the
      loop is local; reduced motion: the still first heart frame and steam, no drift. */
  private drawCouple(now: number, calm: boolean) {
    const c = this.couple; this.coupleOn = {}; let i = 0
    const put = (t: Texture, x: number, y: number, a = 1) => { let s = c.children[i] as Sprite | undefined
      if (!s) { s = new Sprite(t); c.addChild(s) } s.texture = t; s.position.set(x, y); s.alpha = a; s.visible = true; i++ }
    for (const tb of this.hearts) {
      const t = TABLES[tb]; if (!t || !this.CH.length) continue
      const X = t.x * TILE, Y = (t.y - 1) * TILE, sf = calm ? 0 : Math.floor(now / STEAM_MS) % 4
      put(this.CS[0][sf], X + 3, Y - 4); put(this.CS[1][sf], X + 22, Y - 4)
      const ps = calm ? [] : drift(now)
      for (const p of ps) { const d = this.CD[p.v]; put(d, X + p.x - Math.floor(d.width / 2), Y + p.y - d.height + 1, p.a) }
      let hf = 0; if (!calm) { let m = now % COUPLE_LOOP; while (m >= COUPLE_MS[hf]) m -= COUPLE_MS[hf++] }
      put(this.CH[hf], X + 8, Y - 21); this.coupleOn[tb] = [hf, ps.length]
    }
    for (; i < c.children.length; i++) c.children[i].visible = false
  }
  /** GD's floating notes over the lid while a song plays: one note per noteEveryMs() (2 beats; a bar in slow 3/4; the
      Audio Engineer's Clair de lune / Nocturne overrides), counted from the song's start so every screen agrees; each
      lives 6 frames of 120 ms, rising 4 px a frame with GD's sway and fade. Reduced motion: one still note. */
  /** the duet's notes play from the downbeat (none during the count-in); a duet's mix (Play solo instead) from its start */
  private noteSrc(): { at: number; dur: number; every: number } | null {
    const d = this.duet, du = d.on && d.ph === 'play' && d.song ? DUET.get(d.song) : undefined
    if (du) return { at: d.at, dur: du.durationSec * 1000, every: du.beatSec * 2000 }
    const p = this.piano, pc = p.song ? PIECE.get(p.song) : undefined, pd = p.song ? DUET.get(p.song) : undefined
    if (pc) return { at: p.at, dur: pc.durationSec * 1000, every: noteEveryMs(pc) }
    if (pd) return { at: p.at, dur: pd.durationSec * 1000, every: pd.beatSec * 2000 }
    return null
  }
  private duetBench() { const d = this.duet; return (d.on && !!(d.bass || d.melody)) || (!!this.piano.song && DUET.has(this.piano.song)) }
  /** GD's duet pose: FRAME_MS 220 from the downbeat, Bass on t % 2 and Melody on (t + 1) % 2 (counterpoint); frame 0 held
      with no notes (waiting, the pick, the count-in, after the end; reduced motion) */
  private duetFrame(part: Part, now: number, calm: boolean): Frame {
    const d = this.duet, du = d.on && d.ph === 'play' && d.song ? DUET.get(d.song) : undefined
    if (!du || calm || now < d.at || now > d.at + du.durationSec * 1000 || d.gone.includes(part)) return part === 'bass' ? 'bass0' : 'melody0'
    const t = Math.floor((now - d.at) / PIANO_FRAME_MS)
    return part === 'bass' ? (t % 2 ? 'bass1' : 'bass0') : ((t + 1) % 2 ? 'melody1' : 'melody0')
  }
  private drawDuet(now: number, calm: boolean) {
    const d = this.duet, on = this.duetBench(); this.bench.visible = on
    const open = d.on && d.ph === 'wait' && !!d.bass && !d.melody
    this.seatOpen.visible = open; const sf = calm ? 0 : Math.floor(now / 500) % 2; if (open) this.seatOpen.texture = this.SO[sf]
    // count-in: from downbeat − countInSec, one numeral a beat (3, 2, 1), 6 frames a beat, no "Go"
    const du = d.on && (d.ph === 'count' || d.ph === 'play') && d.song ? DUET.get(d.song) : undefined
    let cnt = ''
    if (du && this.CI.length) { const t = now - (d.at - du.countInSec * 1000), beat = du.beatSec * 1000, k = Math.floor(t / beat)
      if (t >= 0 && k < du.countInBeats && k < 3) { const n = 3 - k, f = calm ? 0 : Math.min(5, Math.floor((t - k * beat) / (beat / 6))); this.countIn.texture = this.CI[n - 1][f]; cnt = n + ':' + f } }
    this.countIn.visible = !!cnt
    this.duetOn = { bench: on, seatOpen: open ? sf : -1, count: cnt }
  }
  private drawNotes(now: number, calm: boolean) {
    const ns = this.noteSrc(), spr = (this.notes.children as Sprite[]).filter(c => c !== this.countIn)
    for (const s of spr) s.visible = false; this.notesOn = 0
    if (!ns || now < ns.at || now > ns.at + ns.dur) return
    const p = ns
    const [bx, by] = PIANO_PX.notes, life = NOTE.frameMs * NOTE.life
    if (calm) { const s = spr[0]; s.texture = this.G[0]; s.alpha = 1; s.position.set(bx - 4, by - 9 - 8); s.visible = true; this.notesOn = 1; return }
    const every = ns.every, t = now - p.at, i0 = Math.max(0, Math.floor((t - life) / every) + 1), i1 = Math.floor(t / every)
    for (let i = i0, k = 0; i <= i1 && k < spr.length; i++, k++) {
      const age = t - i * every, f = Math.floor(age / NOTE.frameMs); if (f < 0 || f >= NOTE.life) continue
      const s = spr[k], g = i % 3; s.texture = this.G[g]; s.alpha = NOTE.alpha[f] / 255
      s.position.set(bx - 12 + NOTE.x[g] + NOTE.sway[f], by - 9 - NOTE.rise * f); s.visible = true; this.notesOn++
    }
  }
  /** test hook: the drawn sprite of a person / a sofa front (art px, map space) and its place in the draw order */
  drawn(id: number) { const x = this.ents.get(id); if (!x) return null
    const list = [...this.people.children].sort((a, b) => a.zIndex - b.zIndex)
    return { sx: x.body.x, sy: x.body.y, z: x.root.zIndex, order: list.indexOf(x.root), legs: x.legs.visible ? { x: x.legs.x, y: x.legs.y, z: x.legs.zIndex, order: list.indexOf(x.legs) } : null, fronts: SOFAS.map(f => { const c = this.people.children.find(o => o.label === 'sofa-front-' + f.id)!; return { x: c.x, y: c.y, z: c.zIndex, order: list.indexOf(c) } }) } }
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
