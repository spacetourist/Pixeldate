/* One café instance, as a pure class: no Cloudflare APIs, so it runs (and is benchmarked) in plain Node too.
   The Durable Object in worker.ts owns one Room, feeds it sockets and messages, and calls tick() every 100 ms. */
import { TABLES, SPAWNS, walkable, isSeat, type Table } from '../shared/map.ts'
import { findPath, nearestWalkable, type P } from '../shared/path.ts'
import { CAP, ENT_BYTES, FIX, F_BROKEN, F_HEART, F_ME, F_MOVING, F_SIT, HEAD_BYTES, SAY_MAX, SAY_WINDOW_MS, SNAP, SPEED, type Pub } from '../shared/proto.ts'
import { compatible, okBracket, type Prefs } from '../shared/compat.ts'
import { check, cleanName } from './filter.ts'
import { localDeck, type Question } from '../../src/deck.ts'

export interface Sock { send(d: string | ArrayBuffer): void; close(code?: number, reason?: string): void }
export type Field = 'met' | 'hearted' | 'passed' | 'refusedBy' | 'blocked' | 'blockedBy'
export type Rec = Record<Field, string[]>
export const emptyRec = (): Rec => ({ met: [], hearted: [], passed: [], refusedBy: [], blocked: [], blockedBy: [] })
/** Per-user memory (UserDO in production, a Map in tests). add() is fire-and-forget from the Room's point of view. */
export interface Store { load(uid: string): Promise<Rec>; add(uid: string, f: Field, other: string): void; report(r: Report): void }
export interface Report { at: number; inst: string; by: string; who: string; why: string; ctx: { said: { at: number; text: string }[]; heard: { at: number; text: string }[]; where: [number, number][]; tick: number } }
export interface RoomOpts { cap?: number; invites: Set<string>; now?: () => number; next?: string }
const REASONS = new Set(['rude', 'sexual', 'spam', 'underage', 'fake', 'other'])
const R_SPACE = 0.75, BOX = 0.28, INPUT_PER_S = 20

class Player {
  id: number; uid: string; name: string; br: [number, number]; min: number; max: number; iam: Prefs['iam']; seek: Prefs['seek']; pav: string | undefined; sock: Sock
  x: number; y: number; path: P[] = []; dir: [number, number] | null = null; moving = false; sitting = false; stuck = 0
  says: number[] = []; recent: { at: number; text: string }[] = []; heard: { at: number; text: string }[] = []
  bucket = INPUT_PER_S; table: Table | null = null
  sets: Record<Field, Set<string>>
  constructor(id: number, uid: string, name: string, p: Prefs & { pav?: string }, sock: Sock, rec: Rec, spawn: P) {
    this.id = id; this.uid = uid; this.name = name; this.br = p.br; this.min = p.min; this.max = p.max; this.iam = p.iam; this.seek = p.seek; this.pav = p.pav; this.sock = sock
    this.x = spawn[0] + .5; this.y = spawn[1] + .5
    this.sets = Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, new Set(v)])) as Record<Field, Set<string>>
  }
  pub(): Pub { return { id: this.id, name: this.name, br: this.br, pav: this.pav } }
}
interface Pair { a: Player; b: Player; level: number; used: Set<string>; q: Question | null }

export class Room {
  players = new Map<Sock, Player>(); byId = new Map<number, Player>(); pending = new Set<Sock>()
  joining = 0; tickN = 0; nextId = 1; pairs = new Map<number, Pair>()
  name: string; store: Store; opts: RoomOpts; cap: number; now: () => number
  constructor(name: string, store: Store, opts: RoomOpts) { this.name = name; this.store = store; this.opts = opts; this.cap = opts.cap ?? CAP; this.now = opts.now ?? Date.now }
  get size() { return this.players.size }
  nextName() { const m = /^(.*?)-?(\d+)$/.exec(this.name); return this.opts.next ?? (m ? `${m[1]}-${+m[2] + 1}` : `${this.name}-2`) }

  connect(s: Sock) { this.pending.add(s) }
  async message(s: Sock, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 1200) return
    let m: any; try { m = JSON.parse(raw) } catch { return }
    if (!m || typeof m !== 'object') return
    if (this.pending.has(s)) { if (m.t === 'join') await this.join(s, m); return }
    const p = this.players.get(s); if (!p) return
    if (p.bucket < 1) return; p.bucket--
    switch (m.t) {
      case 'go': return this.go(p, m.x, m.y)
      case 'dir': return this.steer(p, m.dx, m.dy)
      case 'say': return this.say(p, m.text)
      case 'heart': case 'pass': case 'block': case 'report': return this.act(p, m.t, m.id, m.why)
      case 'next': return this.nextCard(p)
    }
  }
  close(s: Sock) {
    this.pending.delete(s); const p = this.players.get(s); if (!p) return
    this.players.delete(s); this.byId.delete(p.id)
    for (const o of this.players.values()) if (!this.hidden(o, p)) o.sock.send(JSON.stringify({ t: 'del', id: p.id }))
    this.unpair(p)
  }

  private async join(s: Sock, m: any) {
    const p = m.p || {}, refuse = (why: string) => { s.send(JSON.stringify({ t: 'no', why })); this.pending.delete(s); s.close(4001, why) }
    if (typeof m.invite !== 'string' || !this.opts.invites.has(m.invite)) return refuse('invite')
    if (p.adult !== true) return refuse('adult')
    const okUid = typeof p.uid === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(p.uid)
    const okPrefs = okBracket(p.br) && Number.isFinite(p.min) && Number.isFinite(p.max) && p.min >= 18 && p.max >= p.min && p.max <= 999
      && (p.iam === 'man' || p.iam === 'woman') && ['men', 'women', 'everyone'].includes(p.seek)
    const okPav = p.pav === undefined || (typeof p.pav === 'string' && p.pav.length <= 512 && p.pav[0] === '{' && !/data:|base64|blob:/i.test(p.pav))
    if (!okUid || !okPrefs || !okPav || typeof p.name !== 'string' || !p.name.trim()) return refuse('profile')
    // a reconnect with the same uid replaces the old socket rather than counting twice
    for (const [os, op] of this.players) if (op.uid === p.uid) { os.close(4002, 'replaced'); this.close(os) }
    if (this.players.size + this.joining >= this.cap) { s.send(JSON.stringify({ t: 'full', next: this.nextName() })); this.pending.delete(s); s.close(4003, 'full'); return }
    this.joining++
    let rec: Rec; try { rec = await this.store.load(p.uid) } catch { rec = emptyRec() } finally { this.joining-- }
    if (!this.pending.has(s)) return // went away while loading
    this.pending.delete(s)
    const me = new Player(this.nextId++, p.uid, cleanName(p.name), p, s, rec, this.spawn())
    if (this.nextId > 65000) this.nextId = 1
    this.players.set(s, me); this.byId.set(me.id, me)
    s.send(JSON.stringify({ t: 'hi', me: me.id, inst: this.name, n: this.players.size }))
    for (const o of this.players.values()) {
      if (this.hidden(me, o)) continue
      s.send(JSON.stringify({ t: 'add', p: o.pub() }))
      if (o !== me) o.sock.send(JSON.stringify({ t: 'add', p: me.pub() }))
    }
  }
  private spawn(): P {
    for (const sp of SPAWNS) if (![...this.players.values()].some(o => Math.hypot(o.x - sp[0] - .5, o.y - sp[1] - .5) < 1)) return sp
    return SPAWNS[this.tickN % SPAWNS.length]
  }

  /** Either of the two has blocked the other: they no longer exist for each other, in every instance. */
  hidden(a: Player, b: Player) { return a !== b && (a.sets.blocked.has(b.uid) || a.sets.blockedBy.has(b.uid) || b.sets.blocked.has(a.uid) || b.sets.blockedBy.has(a.uid)) }
  /** What viewer v sees above o. Computed here, only ever sent to v, as two bits. */
  marker(v: Player, o: Player) {
    if (v === o) return 0
    if (o.sets.passed.has(v.uid) || v.sets.refusedBy.has(o.uid)) return F_BROKEN
    if (!v.sets.met.has(o.uid) && !v.sets.passed.has(o.uid) && compatible(v, o)) return F_HEART
    return 0
  }

  private go(p: Player, x: unknown, y: unknown) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return
    const t = walkable(x as number, y as number) ? [x, y] as P : nearestWalkable(x as number, y as number); if (!t) return
    const path = findPath([Math.floor(p.x), Math.floor(p.y)], t); if (!path) return
    p.path = path; p.dir = null; p.stuck = 0
  }
  private steer(p: Player, dx: unknown, dy: unknown) {
    if (typeof dx !== 'number' || typeof dy !== 'number') return
    const sx = Math.sign(dx), sy = Math.sign(dy); p.dir = sx || sy ? [sx, sy] : null; if (p.dir) p.path = []
  }
  private boxFree(x: number, y: number) {
    return walkable(Math.floor(x - BOX), Math.floor(y - BOX)) && walkable(Math.floor(x + BOX), Math.floor(y - BOX))
      && walkable(Math.floor(x - BOX), Math.floor(y + BOX)) && walkable(Math.floor(x + BOX), Math.floor(y + BOX))
  }
  /** Personal space: a step may not bring you closer than R_SPACE to anyone (stepping away is always allowed). */
  private spaceFree(p: Player, x: number, y: number) {
    for (const o of this.players.values()) {
      if (o === p || this.hidden(p, o)) continue
      const d = (x - o.x) ** 2 + (y - o.y) ** 2
      if (d < R_SPACE * R_SPACE && d < (p.x - o.x) ** 2 + (p.y - o.y) ** 2) return false
    }
    return true
  }
  private move(p: Player) {
    let nx = p.x, ny = p.y
    if (p.dir) {
      const [dx, dy] = p.dir, k = SPEED / Math.hypot(dx, dy)
      nx = p.x + dx * k; ny = p.y + dy * k
      if (!this.boxFree(nx, ny)) { if (this.boxFree(nx, p.y)) ny = p.y; else if (this.boxFree(p.x, ny)) nx = p.x; else return false }
    } else if (p.path.length) {
      const [tx, ty] = p.path[0], cx = tx + .5, cy = ty + .5, d = Math.hypot(cx - p.x, cy - p.y)
      if (d <= SPEED) { nx = cx; ny = cy } else { nx = p.x + (cx - p.x) / d * SPEED; ny = p.y + (cy - p.y) / d * SPEED }
    } else return false
    if (!this.spaceFree(p, nx, ny)) {
      // someone is in the way: wait a moment, then try to route around them
      if (p.path.length && ++p.stuck > 5) {
        const goal = p.path[p.path.length - 1], occ = new Set([...this.players.values()].filter(o => o !== p).map(o => Math.floor(o.x) + ',' + Math.floor(o.y)))
        const alt = findPath([Math.floor(p.x), Math.floor(p.y)], goal, (x, y) => occ.has(x + ',' + y))
        p.path = alt && p.stuck < 40 ? alt : []; if (!p.path.length) p.stuck = 0
      }
      return false
    }
    p.stuck = 0; p.x = nx; p.y = ny
    if (!p.dir && p.path.length && nx === p.path[0][0] + .5 && ny === p.path[0][1] + .5) p.path.shift()
    return true
  }

  tick() {
    this.tickN = (this.tickN + 1) & 0xffff
    for (const p of this.players.values()) {
      p.bucket = Math.min(INPUT_PER_S, p.bucket + INPUT_PER_S / 10)
      p.moving = this.move(p)
      const tx = Math.floor(p.x), ty = Math.floor(p.y)
      p.sitting = !p.moving && !p.dir && isSeat(tx, ty) && Math.abs(p.x - tx - .5) < .05 && Math.abs(p.y - ty - .5) < .05
    }
    this.tables()
    this.snapshots()
  }
  private tables() {
    const seated = new Map<string, Player>()
    for (const p of this.players.values()) if (p.sitting) seated.set(Math.floor(p.x) + ',' + Math.floor(p.y), p)
    for (const t of TABLES) {
      const a = seated.get(t.seats[0].join(',')), b = seated.get(t.seats[1].join(',')), cur = this.pairs.get(t.id)
      const ok = !!(a && b && !this.hidden(a, b))
      if (cur && (!ok || cur.a !== a || cur.b !== b)) this.endPair(t.id)
      if (ok && a && b && !this.pairs.has(t.id)) {
        const pr: Pair = { a, b, level: 1, used: new Set(), q: null }; this.pairs.set(t.id, pr); a.table = b.table = t
        for (const [x, y] of [[a, b], [b, a]]) if (!x.sets.met.has(y.uid)) { x.sets.met.add(y.uid); this.store.add(x.uid, 'met', y.uid) }
        this.deal(pr)
      }
    }
  }
  private deal(pr: Pair) {
    let q: Question | null = null
    for (let i = 0; i < 4 && !q; i++) { q = localDeck.next(pr.level, pr.used); if (!q) { pr.level = pr.level % 3 + 1; if (pr.level === 1) pr.used.clear() } }
    pr.q = q; if (q) pr.used.add(q.id)
    const card = q && { id: q.id, text: q.text }
    pr.a.sock.send(JSON.stringify({ t: 'card', q: card, with: pr.b.id })); pr.b.sock.send(JSON.stringify({ t: 'card', q: card, with: pr.a.id }))
  }
  private endPair(id: number) {
    const pr = this.pairs.get(id); if (!pr) return; this.pairs.delete(id)
    for (const p of [pr.a, pr.b]) { p.table = null; if (this.players.get(p.sock) === p) p.sock.send(JSON.stringify({ t: 'card', q: null })) }
  }
  private unpair(p: Player) { for (const [id, pr] of this.pairs) if (pr.a === p || pr.b === p) this.endPair(id) }
  private nextCard(p: Player) { for (const pr of this.pairs.values()) if (pr.a === p || pr.b === p) return this.deal(pr) }

  private snapshots() {
    const all = [...this.players.values()], max = HEAD_BYTES + all.length * ENT_BYTES
    for (const v of all) {
      const buf = new ArrayBuffer(max), d = new DataView(buf); let n = 0, o = HEAD_BYTES
      d.setUint8(0, SNAP); d.setUint16(2, this.tickN, true)
      for (const e of all) {
        if (this.hidden(v, e)) continue
        d.setUint16(o, e.id, true); d.setUint16(o + 2, Math.round(e.x * FIX), true); d.setUint16(o + 4, Math.round(e.y * FIX), true)
        d.setUint8(o + 6, this.marker(v, e) | (e.moving ? F_MOVING : 0) | (e.sitting ? F_SIT : 0) | (e === v ? F_ME : 0))
        o += ENT_BYTES; n++
      }
      d.setUint16(4, n, true)
      v.sock.send(o === max ? buf : buf.slice(0, o))
    }
  }

  private say(p: Player, text: unknown) {
    const t = this.now(); p.says = p.says.filter(s => s > t - SAY_WINDOW_MS)
    const raw = typeof text === 'string' ? text.slice(0, 200) : ''
    if (p.says.length >= SAY_MAX) return p.sock.send(JSON.stringify({ t: 'said', ok: false, why: 'slow', text: raw, wait: p.says[0] + SAY_WINDOW_MS - t }))
    const v = check(text)
    if (!v.ok) { if (v.why !== 'empty') p.says.push(t); return p.sock.send(JSON.stringify({ t: 'said', ok: false, why: v.why, text: raw })) }
    p.says.push(t); p.recent.push({ at: t, text: v.text }); if (p.recent.length > 8) p.recent.shift()
    p.sock.send(JSON.stringify({ t: 'said', ok: true, text: v.text }))
    const msg = JSON.stringify({ t: 'say', id: p.id, text: v.text })
    for (const o of this.players.values()) if (o !== p && !this.hidden(p, o)) { // the sender already has 'said'
      o.sock.send(msg)
      if (o !== p) { o.heard.push({ at: t, text: v.text }); if (o.heard.length > 8) o.heard.shift() }
    }
  }
  private act(p: Player, what: 'heart' | 'pass' | 'block' | 'report', id: unknown, why: unknown) {
    const o = typeof id === 'number' ? this.byId.get(id) : undefined
    if (!o || o === p || this.hidden(p, o)) return
    const add = (x: Player, f: Field, y: Player) => { if (!x.sets[f].has(y.uid)) { x.sets[f].add(y.uid); this.store.add(x.uid, f, y.uid) } }
    if (what === 'heart') {
      add(p, 'hearted', o)
      if (o.sets.hearted.has(p.uid)) for (const [x, y] of [[p, o], [o, p]]) x.sock.send(JSON.stringify({ t: 'mutual', id: y.id }))
    } else if (what === 'pass') { add(p, 'passed', o); add(o, 'refusedBy', p) }
    else if (what === 'block') {
      add(p, 'blocked', o); add(o, 'blockedBy', p)
      p.sock.send(JSON.stringify({ t: 'del', id: o.id })); o.sock.send(JSON.stringify({ t: 'del', id: p.id }))
      if (p.table && p.table === o.table) this.unpair(p)
    } else {
      this.store.report({
        at: this.now(), inst: this.name, by: p.uid, who: o.uid, why: typeof why === 'string' && REASONS.has(why) ? why : 'other',
        ctx: { said: o.recent.slice(-5), heard: p.heard.slice(-5), where: [[+p.x.toFixed(2), +p.y.toFixed(2)], [+o.x.toFixed(2), +o.y.toFixed(2)]], tick: this.tickN },
      })
    }
    p.sock.send(JSON.stringify({ t: 'ack', what, id: o.id }))
  }
}
