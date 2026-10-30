/* One café instance, as a pure class: no Cloudflare APIs, so it runs (and is benchmarked) in plain Node too.
   The Durable Object in worker.ts owns one Room, feeds it sockets and messages, and calls tick() every 100 ms. */
import { TABLES, SPAWNS, walkable, isSeat, isPianoSeat, type Table } from '../shared/map.ts'
import { PIECE, PIANO_SEAT, LEAD_MS, type Role } from '../shared/piano.ts'
import { DUET, DUETS, PICK_MS, OFFER_MS, INVITE_MS, FLIP_MS, DUET_LEAD_MS, BASS_SEAT, MELODY_SEAT, MATCH_HOLD_MS, MAYBE_MS, LEVELUP_MS, MISS_HOLD_MS, type Part, type DuetPhase } from '../shared/duet.ts'
import { EMOTE_COOLDOWN_MS, isEmote, nextTake, setOf } from '../shared/emote.ts'
import { SOFAS, SEAT_ORDER, SOFA_FRONT_Y } from '../shared/sofa.ts'
import { findPath, nearestWalkable, type P } from '../shared/path.ts'
import { CAP, ENT_BYTES, FIX, F_BROKEN, F_HEART, F_ME, F_MOVING, F_SIT, HEAD_BYTES, LV_MAX, LV_SEG, MAX_ANS, PHOTO_MAX, SAY_MAX, SAY_WINDOW_MS, SNAP, SPEED, STALE_MS, VIDEO_LEVEL, type Pub, type Table as TableView } from '../shared/proto.ts'
import { compatible, okBracket, type Prefs } from '../shared/compat.ts'
import { check, cleanName } from './filter.ts'
import { localDeck, type Question } from '../../src/deck.ts'
import { LEVELS, FULL_PHOTO_PX } from '../../src/config.ts'

export interface Sock { send(d: string | ArrayBuffer): void; close(code?: number, reason?: string): void }
export type Field = 'met' | 'hearted' | 'passed' | 'refusedBy' | 'blocked' | 'blockedBy'
export type Rec = Record<Field, string[]>
export const emptyRec = (): Rec => ({ met: [], hearted: [], passed: [], refusedBy: [], blocked: [], blockedBy: [] })
/** Per-user memory (UserDO in production, a Map in tests). add() is fire-and-forget from the Room's point of view. */
export interface Store { load(uid: string): Promise<Rec>; add(uid: string, f: Field, other: string): void; report(r: Report): void
  /** take one record out again (Not for me clears the hearts between the two) */ del?(uid: string, f: Field, other: string): void }
export interface Report { at: number; inst: string; by: string; who: string; why: string; ctx: { said: { at: number; text: string }[]; heard: { at: number; text: string }[]; where: [number, number][]; tick: number } }
/** v05: what a pair keeps across the whole app (one Pair Durable Object per pair in production, shared by every room
    and instance): their level, how many cards into it they are (the meter, 0..LV_SEG) and who said yes to a date. */
export interface PairRec { lv: number; seg?: number; date: string[]; duetUp?: string }
/** Where pair records live. load() is async (a Durable Object call); save() is fire-and-forget. */
export interface PairStore { load(key: string): Promise<PairRec | undefined>; save(key: string, r: PairRec): void }
/** In-memory pair store: one per process is shared by every room (tests, the Node dev server). */
export const memPairs = (m = new Map<string, PairRec>()): PairStore & { m: Map<string, PairRec> } => ({ m,
  load: async k => { const r = m.get(k); return r && structuredClone(r) },
  save: (k, r) => { m.set(k, structuredClone(r)); if (m.size > 50000) m.delete(m.keys().next().value!) } })
/** The tag a client keys its local pair level by: sha256('pd-pair:' + their uid), 32 hex chars. The same function runs
    in the app (src/pairlv.ts), so the café never has to send anyone a raw uid. */
export async function peerTag(uid: string) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pd-pair:' + uid)))
  return [...h.slice(0, 16)].map(x => x.toString(16).padStart(2, '0')).join('')
}
/** How long a pair waits for both clients' local levels before it stops listening for them. */
export const CLAIM_MS = 4000
export interface RoomOpts { cap?: number; invites: Set<string>; now?: () => number; next?: string
  /** a socket that sends nothing (not even the keepalive) for this long is dropped (default STALE_MS) */ staleMs?: number
  /** the app-wide pair store (default: an in-memory one for this room only) */
  pairs?: PairStore }
const REASONS = new Set(['rude', 'sexual', 'spam', 'underage', 'fake', 'other'])
const R_SPACE = 0.75, BOX = 0.28, INPUT_PER_S = 20

class Player {
  id: number; uid: string; name: string; br: [number, number]; min: number; max: number; iam: Prefs['iam']; seek: Prefs['seek']; pav: string | undefined; sock: Sock
  x: number; y: number; path: P[] = []; dir: [number, number] | null = null; moving = false; sitting = false; stuck = 0
  says: number[] = []; recent: { at: number; text: string; to?: string }[] = []; heard: { at: number; text: string }[] = []
  bucket = INPUT_PER_S; table: Table | null = null; seen = 0
  /** on a sofa: [sofa index, slot]; sitAt = the tick the player last sat down (who sat second at a table) */
  sofa: [number, number] | null = null; sofaWant: [number, number] | null = null; sitAt = 0
  /** the duet picked in the piano picker (Start duet) */
  duetWant: string | null = null
  sets: Record<Field, Set<string>>
  /** voice emotes: when the last one went out, and the last take per emote (never the same take twice in a row) */
  emoteAt = -Infinity; takes: Record<string, string> = {}
  constructor(id: number, uid: string, name: string, p: Prefs & { pav?: string }, sock: Sock, rec: Rec, spawn: P) {
    this.id = id; this.uid = uid; this.name = name; this.br = p.br; this.min = p.min; this.max = p.max; this.iam = p.iam; this.seek = p.seek; this.pav = p.pav; this.sock = sock
    this.x = spawn[0] + .5; this.y = spawn[1] + .5
    this.sets = Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, new Set(v)])) as Record<Field, Set<string>>
  }
  pub(): Pub { return { id: this.id, name: this.name, br: this.br, pav: this.pav } }
}
interface Pair { tb: number; key: string; a: Player; b: Player; level: number; seg: number; up: boolean; used: Set<string>; q: Question | null
  ans: Map<Player, string>; rev: boolean; n: number; date: Set<Player>; call: Player | null; duetUp?: string
  /** a call the two started in the café (after both tapped): who reports it connected, and each one's
      "Show our heart in the café" switch (on at the start of every call) */
  live: { up: Set<Player>; sw: Map<Player, boolean> } | null
  /** pair store read done; each side's local level claim; reconciled (both claims in, or CLAIM_MS passed); tag of the other per side */
  loaded: boolean; claims: Map<Player, { lv: number; drop: boolean }>; rc: boolean; peer: Map<Player, string> }
/** The café piano: who is on the bench, and the song (server time of its first sample, so every client schedules its audio
    against the same clock and a late joiner seeks to now − at). Duets later: seats.bass / seats.melody + a count-in. */
interface Piano { by: Player | null; song: string | null; at: number; role: Role; seats: { bass: Player | null; melody: Player | null } | null }
interface DuetS {
  bass: Player | null; melody: Player | null; ph: DuetPhase; song: string; at: number
  picks: Map<Player, string>; rnd: Set<Player>; end: number; gone: Part[]
  res: { match: boolean; coin: string; offer: boolean; yes: Set<Player>; no: boolean; done: boolean; up: number; t0: number; end: number } | null
  inv: { from: Player; to: Player; exp: number; yes: boolean } | null
  rec: PairRec | null; key: string
}
const pairKey = (a: Player, b: Player) => [a.uid, b.uid].sort().join('|')
/** Only the two people at a table ever receive anything from these maps. */
const other = (pr: Pair, p: Player) => pr.a === p ? pr.b : pr.a
const b64 = (s: string) => { try { return Uint8Array.from(atob(s), c => c.charCodeAt(0)) } catch { return null } }
/** Width x height of a PNG (IHDR) or a baseline/progressive JPEG (first SOF marker); null if it's neither. */
export function imageDims(u8: Uint8Array): { kind: 'png' | 'jpeg'; w: number; h: number } | null {
  if (u8.length > 24 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) {
    const d = new DataView(u8.buffer, u8.byteOffset); return { kind: 'png', w: d.getUint32(16), h: d.getUint32(20) } }
  if (u8[0] !== 0xff || u8[1] !== 0xd8) return null
  for (let i = 2; i + 9 < u8.length;) {
    if (u8[i] !== 0xff) return null
    const mk = u8[i + 1], len = (u8[i + 2] << 8) | u8[i + 3]
    if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return { kind: 'jpeg', h: (u8[i + 5] << 8) | u8[i + 6], w: (u8[i + 7] << 8) | u8[i + 8] }
    i += 2 + len
  }
  return null
}

export class Room {
  players = new Map<Sock, Player>(); byId = new Map<number, Player>(); pending = new Set<Sock>()
  joining = 0; tickN = 0; nextId = 1; pairs = new Map<number, Pair>(); ps: PairStore
  piano: Piano = { by: null, song: null, at: 0, role: 'solo', seats: null }
  /** tables showing the couple heart right now (GD couple/README: only on/off per table is ever broadcast) */
  hearts = new Set<number>()
  name: string; store: Store; opts: RoomOpts; cap: number; now: () => number; stale: number
  constructor(name: string, store: Store, opts: RoomOpts) { this.name = name; this.store = store; this.opts = opts; this.cap = opts.cap ?? CAP; this.now = opts.now ?? Date.now; this.stale = opts.staleMs ?? STALE_MS; this.ps = opts.pairs ?? memPairs() }
  get size() { return this.players.size }
  nextName() { const m = /^(.*?)-?(\d+)$/.exec(this.name); return this.opts.next ?? (m ? `${m[1]}-${+m[2] + 1}` : `${this.name}-2`) }

  connect(s: Sock) { this.pending.add(s) }
  async message(s: Sock, raw: string | ArrayBuffer) {
    // a photo for the table partner is the one message allowed to be big (a pixelated PNG, or the level-5 512 px JPEG)
    if (typeof raw !== 'string' || raw.length > (raw.startsWith('{"t":"photo"') ? PHOTO_MAX + 64 : 1200)) return
    let m: any; try { m = JSON.parse(raw) } catch { return }
    if (!m || typeof m !== 'object') return
    if (this.pending.has(s)) { if (m.t === 'join') await this.join(s, m); return }
    const p = this.players.get(s); if (!p) return
    p.seen = this.now()
    if (m.t === 'ka') return
    if (m.t === 'tm') { if (typeof m.c === 'number') s.send(JSON.stringify({ t: 'tm', c: m.c, s: this.now() })); return }   // clock sync, unmetered (tiny, 5 a join)
    if (p.bucket < 1) return; p.bucket--
    switch (m.t) {
      case 'go': return this.go(p, m.x, m.y)
      case 'dir': return this.steer(p, m.dx, m.dy)
      case 'say': return this.say(p, m.text)
      case 'heart': case 'pass': case 'block': case 'report': return this.act(p, m.t, m.id, m.why)
      case 'next': return this.nextCard(p)
      case 'ans': return this.answer(p, m.text)
      case 'date': return this.dateAsk(p, m.yes !== false)
      case 'call': case 'callyes': case 'callno': return this.callMsg(p, m.t)
      case 'photo': return this.photo(p, m.lv, m.data)
      case 'pairlv': return this.claim(p, m.lv, m.drop)
      case 'piano': return this.pianoPlay(p, m.id)
      case 'pstop': return this.pianoStop(p)
      case 'nfm': return this.notForMe(p)
      case 'sofa': return this.sofaGo(p, m.i)
      case 'emote': return this.emote(p, m.e)
      case 'callup': case 'calldown': return this.callLive(p, m.t)
      case 'cheart': return this.coupleSwitch(p, m.on)
      case 'dstart': return this.duetStart(p, m.id)
      case 'dsolo': return this.duetSolo(p)
      case 'dpick': return this.duetPick(p, m.id)
      case 'doffer': return this.duetOffer(p, m.yes === true)
      case 'dcancel': return this.duetCancel(p)
      case 'dagain': return this.duetAgain(p)
      case 'dlist': return this.duetList(p)
      case 'dinv': return this.duetInvite(p, m.id)
      case 'dinvx': { const d = this.duet; if (d?.inv?.from === p) this.duetInviteEnd('cancel'); return }
      case 'dinvans': return this.duetInviteAns(p, m.yes === true)
    }
  }
  /** the duet bench (null: nobody on a duet seat) */
  duet: DuetS | null = null
  close(s: Sock) {
    this.pending.delete(s); const p = this.players.get(s); if (!p) return
    this.players.delete(s); this.byId.delete(p.id)
    for (const o of this.players.values()) if (!this.hidden(o, p)) o.sock.send(JSON.stringify({ t: 'del', id: p.id }))
    this.unpair(p)
    if (this.piano.by === p) { this.piano = { by: null, song: null, at: 0, role: 'solo', seats: null }; this.pianoSend() }
    if (this.duet) this.duetTick()
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
    me.seen = this.now(); this.players.set(s, me); this.byId.set(me.id, me)
    // 'add' below goes to you for EVERYONE in the room, yourself included: the client's count is its list's size
    s.send(JSON.stringify({ t: 'hi', me: me.id, inst: this.name, n: this.players.size, ka: Math.max(250, Math.floor(this.stale / 3)), now: this.now(), sofas: true }))
    for (const o of this.players.values()) {
      if (this.hidden(me, o)) continue
      s.send(JSON.stringify({ t: 'add', p: o.pub() }))
      if (o !== me) o.sock.send(JSON.stringify({ t: 'add', p: me.pub() }))
    }
    s.send(JSON.stringify(this.pianoView(me)))   // a late joiner hears the song from where it is now
    if (this.duet) s.send(JSON.stringify(this.duetView(me)))
    for (const tb of this.hearts) { const pr = this.pairs.get(tb); if (pr && !this.hidden(me, pr.a) && !this.hidden(me, pr.b)) s.send(JSON.stringify({ t: 'couple', tb, on: true })) }
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
    this.sofaLeave(p); p.sofaWant = null
    if (isPianoSeat(x as number, y as number) && this.pianoBusy(p, x as number)) { p.sock.send(JSON.stringify({ t: 'note', k: 'piano-busy' })); return }   // one pianist (or one duet) at a time
    const t = walkable(x as number, y as number) ? [x, y] as P : nearestWalkable(x as number, y as number); if (!t) return
    const path = findPath([Math.floor(p.x), Math.floor(p.y)], t); if (!path) return
    p.path = path; p.dir = null; p.stuck = 0
  }
  private steer(p: Player, dx: unknown, dy: unknown) {
    if (typeof dx !== 'number' || typeof dy !== 'number') return
    const sx = Math.sign(dx), sy = Math.sign(dy); p.dir = sx || sy ? [sx, sy] : null; if (p.dir) { p.path = []; this.sofaLeave(p); p.sofaWant = null }
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

  /** Sockets that went silent (a phone that lost signal, a tab killed without a close frame) stop counting quickly. */
  prune() {
    const t = this.now()
    for (const [s, p] of [...this.players]) if (t - p.seen > this.stale) { try { s.close(4004, 'stale') } catch {} this.close(s) }
  }
  tick() {
    this.tickN = (this.tickN + 1) & 0xffff
    if (this.tickN % 5 === 0) this.prune()
    for (const p of this.players.values()) {
      p.bucket = Math.min(INPUT_PER_S, p.bucket + INPUT_PER_S / 10)
      if (p.sofa) { p.moving = false; p.sitting = true; continue }
      p.moving = this.move(p)
      const tx = Math.floor(p.x), ty = Math.floor(p.y), was = p.sitting
      p.sitting = !p.moving && !p.dir && (isSeat(tx, ty) || isPianoSeat(tx, ty)) && Math.abs(p.x - tx - .5) < .05 && Math.abs(p.y - ty - .5) < .05
      if (p.sitting && !was) p.sitAt = this.tickN
      if (p.sofaWant && !p.moving && !p.path.length) this.sofaSit(p)
    }
    this.tables()
    this.pianoTick()
    this.duetTick()
    this.snapshots()
  }
  private tables() {
    const seated = new Map<string, Player>()
    for (const p of this.players.values()) if (p.sitting) seated.set(Math.floor(p.x) + ',' + Math.floor(p.y), p)
    for (const t of TABLES) {
      const a = seated.get(t.seats[0].join(',')), b = seated.get(t.seats[1].join(',')), cur = this.pairs.get(t.id)
      // Not for me is for good: those two never get a table together again (the one who sat down second is stood up)
      if (a && b && this.refused(a, b)) { const late = a.sitAt >= b.sitAt ? a : b; this.standUp(late, t.seats[late === a ? 0 : 1]); late.sock.send(JSON.stringify({ t: 'note', k: 'table-no' })); continue }
      const ok = !!(a && b && !this.hidden(a, b))
      if (cur && (!ok || cur.a !== a || cur.b !== b)) this.endPair(t.id)
      if (ok && a && b && !this.pairs.has(t.id)) {
        const key = pairKey(a, b)
        const pr: Pair = { tb: t.id, key, a, b, level: 1, seg: 0, up: false, used: new Set(), q: null, ans: new Map(), rev: false, n: 0,
          date: new Set(), call: null, live: null, loaded: false, claims: new Map(), rc: false, peer: new Map() }
        this.pairs.set(t.id, pr); a.table = b.table = t
        for (const [x, y] of [[a, b], [b, a]]) if (!x.sets.met.has(y.uid)) { x.sets.met.add(y.uid); this.store.add(x.uid, 'met', y.uid) }
        this.deal(pr); void this.sync(pr)
      }
    }
  }
  /** The next card comes from the pair's level pool; when that's used up, the levels below it, then the level again. */
  private deal(pr: Pair) {
    let q: Question | null = null
    for (let l = pr.level; l >= 1 && !q; l--) q = localDeck.next(l, pr.used)
    if (!q) { pr.used.clear(); q = localDeck.next(pr.level, pr.used) }
    pr.q = q; if (q) pr.used.add(q.id)
    pr.ans.clear(); pr.rev = false; pr.up = false
    this.sendCard(pr)
  }
  /** Each of the two gets their own view: their answer, whether the other has answered, and the other's answer only
      after both are in. Nobody else is ever sent any of it. */
  view(pr: Pair, v: Player): TableView & { t: 'card'; q: { id: string; text: string; lv: number; i: number } | null; with: number } {
    const o = other(pr, v), mine = pr.ans.get(v) ?? null
    return { t: 'card', q: pr.q && { id: pr.q.id, text: pr.q.text, lv: pr.q.level, i: pr.q.index }, with: o.id, tb: pr.tb, lv: pr.level, seg: pr.seg, up: pr.up, n: pr.n, mine, them: pr.ans.has(o),
      rev: pr.rev ? { mine: mine ?? '', theirs: pr.ans.get(o) ?? '' } : null, date: { me: pr.date.has(v), them: pr.date.has(o) },
      call: pr.call ? (pr.call === v ? 'out' : 'in') : null, video: VIDEO_LEVEL, ...(pr.peer.has(v) ? { peer: pr.peer.get(v) } : {}), rc: pr.rc }
  }
  /** Pick up where the pair left off anywhere in the app: the pair's record (any room, any instance), then each side's
      local level from the app (reconcile()). */
  private async sync(pr: Pair) {
    const [rec, ta, tb] = await Promise.all([this.ps.load(pr.key).catch(() => undefined), peerTag(pr.b.uid), peerTag(pr.a.uid)])
    if (this.pairs.get(pr.tb) !== pr) return
    pr.peer.set(pr.a, ta); pr.peer.set(pr.b, tb)
    const lv0 = pr.level
    if (rec) {
      const lv = Math.min(LV_MAX, Math.max(1, Math.floor(rec.lv) || 1)), seg = Math.min(LV_SEG, Math.max(0, Math.floor(rec.seg ?? 0)))
      if (lv > pr.level || (lv === pr.level && seg > pr.seg)) { pr.level = lv; pr.seg = seg }
      for (const x of [pr.a, pr.b]) if (rec.date?.includes(x.uid)) pr.date.add(x)
      pr.duetUp = rec.duetUp
    }
    pr.loaded = true
    if (!this.reconcile(pr) && pr.level !== lv0) this.redeal(pr)
    this.sendCard(pr)
    setTimeout(() => { if (this.pairs.get(pr.tb) === pr && !pr.rc) { pr.rc = true; this.sendCard(pr) } }, CLAIM_MS)
  }
  /** A client's local pair level from the app (src/pairlv.ts), sent once per sitting. Raising needs BOTH sides to
      remember at least that level (min of the two claims), so editing one device's storage can't unlock a sharper
      photo; a level set in the app chat (drop: lowered there, or changed there since the café last saw the pair) from either
      side is honoured when it is lower, since lowering is always safe. */
  private claim(p: Player, lv: unknown, drop: unknown) {
    const pr = this.pairOf(p); if (!pr || pr.claims.has(p) || typeof lv !== 'number' || !Number.isInteger(lv) || lv < 1 || lv > LV_MAX) return
    pr.claims.set(p, { lv, drop: drop === true || drop === 1 })
    this.reconcile(pr); this.sendCard(pr)
  }
  /** The level is max(pair record, the level both clients' app stores agree on); a drop from either side lowers it. */
  private reconcile(pr: Pair) {
    if (!pr.loaded) return false
    const cs = [...pr.claims.values()], drops = cs.filter(c => c.drop && c.lv < pr.level)
    let to = pr.level
    if (drops.length) to = Math.min(...drops.map(c => c.lv))
    else if (cs.length === 2) to = Math.max(pr.level, Math.min(cs[0].lv, cs[1].lv))
    if (cs.length === 2) pr.rc = true
    if (to === pr.level) return false
    pr.level = to; pr.seg = 0; pr.up = false; if (to < VIDEO_LEVEL) pr.call = null
    this.persist(pr); this.redeal(pr); return true
  }
  /** a level change before anyone answered: the card comes from the new level's pool (sent by the caller) */
  private redeal(pr: Pair) {
    if (pr.rev || pr.ans.size) return
    if (pr.q) pr.used.delete(pr.q.id)
    let q: Question | null = null
    for (let l = pr.level; l >= 1 && !q; l--) q = localDeck.next(l, pr.used)
    pr.q = q; if (q) pr.used.add(q.id)
  }
  private sendCard(pr: Pair) { for (const v of [pr.a, pr.b]) v.sock.send(JSON.stringify(this.view(pr, v))) }
  private persist(pr: Pair) {
    this.ps.save(pr.key, { lv: pr.level, seg: pr.seg, date: [...pr.date].map(x => x.uid), ...(pr.duetUp ? { duetUp: pr.duetUp } : {}) })
  }
  pairOf(p: Player) { for (const pr of this.pairs.values()) if (pr.a === p || pr.b === p) return pr; return null }
  private answer(p: Player, text: unknown) {
    const pr = this.pairOf(p); if (!pr || !pr.q || pr.rev || pr.ans.has(p)) return
    const v = check(text, MAX_ANS), raw = typeof text === 'string' ? text.slice(0, 200) : ''
    if (!v.ok) return p.sock.send(JSON.stringify({ t: 'ansno', why: v.why, text: raw }))
    pr.ans.set(p, v.text); p.recent.push({ at: this.now(), text: v.text, to: other(pr, p).uid }); if (p.recent.length > 8) p.recent.shift()
    if (pr.ans.size === 2) {
      pr.rev = true; pr.n++
      // one meter segment per card you both answered; a full meter is the next level (the last level just stays full)
      if (pr.level >= LV_MAX) pr.seg = Math.min(LV_SEG, pr.seg + 1)
      else if (++pr.seg >= LV_SEG) { pr.level++; pr.seg = 0; pr.up = true }
      this.persist(pr)
      for (const x of [pr.a, pr.b]) { const o = other(pr, x); x.heard.push({ at: this.now(), text: pr.ans.get(o)! }); if (x.heard.length > 8) x.heard.shift() }
    }
    this.sendCard(pr)
  }
  private dateAsk(p: Player, yes: boolean) {
    const pr = this.pairOf(p); if (!pr) return
    const o = other(pr, p)
    if (yes) pr.date.add(p)
    else { const asked = pr.date.has(o) && !pr.date.has(p); pr.date.clear(); pr.call = null; if (asked) o.sock.send(JSON.stringify({ t: 'note', k: 'date-no' })) }
    this.persist(pr); this.sendCard(pr)
  }
  /** Start call: only at the video level (GD: Level 3 · Crush). Nobody goes on camera until BOTH tapped Start call (the
      second tap is 'callyes', or a 'call' while the other's is waiting); either can cancel or decline. Only then are the two sent the one-time code their app's PeerJS video date uses. */
  private callMsg(p: Player, what: 'call' | 'callyes' | 'callno') {
    const pr = this.pairOf(p); if (!pr) return
    const o = other(pr, p)
    if (what === 'call' && pr.call && pr.call !== p) what = 'callyes'
    if (what === 'call') { if (pr.call || pr.level < VIDEO_LEVEL) return; pr.call = p }
    else if (what === 'callno') { if (!pr.call) return; o.sock.send(JSON.stringify({ t: 'note', k: pr.call === p ? 'call-cancelled' : 'call-declined' })); pr.call = null }
    else {
      if (!pr.call || pr.call === p || pr.level < VIDEO_LEVEL) return
      const host = pr.call, r = crypto.getRandomValues(new Uint8Array(12)), code = [...r].map(x => (x % 36).toString(36)).join('')
      pr.call = null; pr.live = { up: new Set(), sw: new Map([[pr.a, true], [pr.b, true]]) }
      for (const x of [pr.a, pr.b]) x.sock.send(JSON.stringify({ t: 'call', code, host: x === host, lv: pr.level }))
    }
    this.sendCard(pr)
  }
  /** The table photo strip: each side sends its OWN photo, already pixelated on the phone to the pair's current level
      (exactly what the main app sends at that level). Checked (pair, level, image kind and size), relayed to the partner
      only, never stored or logged. */
  private photo(p: Player, lv: unknown, data: unknown) {
    const pr = this.pairOf(p); if (!pr || lv !== pr.level || typeof data !== 'string' || data.length > PHOTO_MAX) return
    const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(data); if (!m) return
    const u8 = b64(m[2].slice(0, 4096)), d = u8 && imageDims(lv === LV_MAX ? b64(m[2]) ?? u8 : u8)
    const want = LEVELS[pr.level - 1].blocks || FULL_PHOTO_PX
    if (!d || d.w !== want || d.h !== want || (lv === LV_MAX ? d.kind !== 'jpeg' : d.kind !== 'png') || m[1] !== d.kind) return
    other(pr, p).sock.send(JSON.stringify({ t: 'photo', id: p.id, lv, data }))
  }
  private endPair(id: number) {
    const pr = this.pairs.get(id); if (!pr) return; this.pairs.delete(id); pr.call = null
    if (pr.live) { pr.live = null; for (const p of [pr.a, pr.b]) if (this.players.get(p.sock) === p) p.sock.send(JSON.stringify({ t: 'callend' })) }
    this.coupleSync()
    for (const p of [pr.a, pr.b]) { p.table = null; if (this.players.get(p.sock) === p) p.sock.send(JSON.stringify({ t: 'card', q: null })) }
  }
  private unpair(p: Player) { for (const [id, pr] of this.pairs) if (pr.a === p || pr.b === p) this.endPair(id) }
  /** Next card: once this one is revealed (both answered). */
  private nextCard(p: Player) { const pr = this.pairOf(p); if (pr && pr.rev) this.deal(pr) }

  /** One pianist at a time: whoever is sitting on the bench. Standing up (or leaving) stops their song; a song that has
      played to its end clears itself. */
  private pianoTick() {
    const pn = this.piano
    const atBench = (p: Player) => p.sitting && Math.floor(p.x) === PIANO_SEAT[0] && Math.floor(p.y) === PIANO_SEAT[1]
    let on: Player | null = pn.by && this.byId.get(pn.by.id) === pn.by && atBench(pn.by) ? pn.by : null   // the pianist keeps the bench
    if (!on) for (const p of this.players.values()) if (p.sitting && Math.floor(p.x) === PIANO_SEAT[0] && Math.floor(p.y) === PIANO_SEAT[1]) { on = p; break }
    if (on !== pn.by) { pn.by = on; pn.song = null; pn.at = 0; this.pianoSend() }
    else if (pn.song && this.now() >= pn.at + (PIECE.get(pn.song)?.durationSec ?? DUET.get(pn.song)?.durationSec ?? 0) * 1000) { pn.song = null; pn.at = 0; this.pianoSend('end') }
  }
  /** What viewer v knows about the piano; someone who blocked the pianist (or was blocked) hears nothing from them. */
  pianoView(v: Player, why?: string) {
    const pn = this.piano, by = pn.by && !this.hidden(v, pn.by) ? pn.by : null
    return { t: 'piano', by: by?.id ?? 0, song: by ? pn.song : null, at: by && pn.song ? pn.at : 0, now: this.now(), ...(why ? { why } : {}) }
  }
  private pianoSend(why?: string) { for (const v of this.players.values()) v.sock.send(JSON.stringify(this.pianoView(v, why))) }
  private pianoPlay(p: Player, id: unknown) {
    if (p !== this.piano.by || typeof id !== 'string' || !PIECE.has(id)) return
    this.piano.song = id; this.piano.at = this.now() + LEAD_MS; this.pianoSend()
  }
  private pianoStop(p: Player) { if (p === this.piano.by && this.piano.song) { this.piano.song = null; this.piano.at = 0; this.pianoSend('stop') } }

  // ── duets (GD world/duet/README) ────────────────────────────────────────────────────────────────────────────────
  /** A piano seat is busy: the solo seat while anyone is on a duet seat; a duet seat while a solo pianist plays, while
      it is taken, once the two are under way, or when the one waiting there and you are hidden from each other. */
  private pianoBusy(p: Player, x: number) {
    const d = this.duet, pn = this.piano
    if (x === PIANO_SEAT[0]) return !!(pn.by && pn.by !== p) || !!(d && d.bass !== p && d.melody !== p)
    if (pn.by && pn.by !== p) return true
    if (!d) return false
    const part = x === BASS_SEAT[0] ? 'bass' : 'melody', other = part === 'bass' ? d.melody : d.bass
    if (d[part] && d[part] !== p) return true
    if (d.ph !== 'wait' && other !== p) return true
    return !!(other && other !== p && this.hidden(p, other))
  }
  private seatedAt(at: readonly [number, number]) {
    for (const p of this.players.values()) if (p.sitting && !p.sofa && Math.floor(p.x) === at[0] && Math.floor(p.y) === at[1]) return p
    return null
  }
  private newDuet(song: string): DuetS {
    return { bass: null, melody: null, ph: 'wait', song, at: 0, picks: new Map(), rnd: new Set(), end: 0, res: null, inv: null, rec: null, key: '', gone: [] }
  }
  /** Who sits where, phase timers, invite expiry. Runs every tick after pianoTick. */
  private duetTick() {
    const now = this.now()
    let b = this.seatedAt(BASS_SEAT), m = this.seatedAt(MELODY_SEAT), d = this.duet, ch = false
    if (!d) { if (!b && !m) return; d = this.duet = this.newDuet(DUET.has((b ?? m)!.duetWant ?? '') ? (b ?? m)!.duetWant! : DUETS[0].id); ch = true }
    if (d.ph === 'play') {
      // mid-song: a player who stands up leaves their stem to fade out; nobody new takes the seat until the end
      for (const part of ['bass', 'melody'] as const) if (d[part] && (part === 'bass' ? b : m) !== d[part]) { d.gone.push(part); d[part] = null; ch = true }
      if (!d.bass && !d.melody) { this.duet = null; this.duetSend(); return }
      if (now >= d.at + DUET.get(d.song)!.durationSec * 1000) { d.gone = []; d.ph = d.bass && d.melody ? 'both' : 'wait'; d.res = null; ch = true }
    } else {
      if (d.bass !== b || d.melody !== m) {
        const sat = (b && b !== d.bass) || (m && m !== d.melody), left = (d.bass && d.bass !== b) || (d.melody && d.melody !== m)
        for (const p of [b, m]) if (p && p !== d.bass && p !== d.melody && p.duetWant && DUET.has(p.duetWant)) d.song = p.duetWant
        d.bass = b; d.melody = m; ch = true
        if (!b && !m) { this.duetInviteEnd('gone'); this.duet = null; this.duetSend(); return }
        if (left) { d.ph = 'wait'; d.res = null; d.picks.clear(); d.rnd.clear() }
        if (d.inv && (left && (d.inv.from !== b && d.inv.from !== m))) this.duetInviteEnd('gone')
        if (b && m) {
          if (d.inv) this.duetInviteEnd(d.inv.to === b || d.inv.to === m ? 'came' : 'taken')   // a passer-by sitting cancels the invite
          if (sat) this.duetPickStart(d)
        }
      }
      if (d.ph === 'pick' && now >= d.end) this.duetReveal(d)
      else if (d.ph === 'res' && d.res && now >= d.res.end) {
        const r = d.res
        if (r.offer && !r.done) { r.done = true; r.no = true; r.end = now + MAYBE_MS; ch = true }   // no answer = Not yet ("Maybe next time")
        else { this.duetCount(d); ch = true }
      } else if (d.ph === 'count' && now >= d.at) { d.ph = 'play'; ch = true }
    }
    if (d.inv && (now >= d.inv.exp || !this.byId.has(d.inv.to.id) || !this.byId.has(d.inv.from.id))) this.duetInviteEnd(now >= d.inv.exp ? 'late' : 'gone')
    if (ch) this.duetSend()
  }
  private duetPickStart(d: DuetS) {
    d.ph = 'pick'; d.picks.clear(); d.rnd.clear(); d.res = null; d.end = this.now() + PICK_MS
    const a = d.bass!, b = d.melody!, key = pairKey(a, b); d.key = key; d.rec = null
    this.ps.load(key).then(r => { if (this.duet === d && d.key === key) d.rec = r ?? { lv: 1, seg: 0, date: [] } }, () => {})
  }
  /** Both picked (or the 30 s ran out: a missing pick is a random song, never a match). Same song: In tune! (+ the
      level-up offer when the two are on a date together, below the top level, and haven't had one today); different:
      the piano picks — a 50/50 server coin flip between the two cards. */
  private duetReveal(d: DuetS) {
    for (const p of [d.bass!, d.melody!]) if (!d.picks.has(p)) { d.picks.set(p, DUETS[Math.floor(Math.random() * DUETS.length)].id); d.rnd.add(p) }
    const a = d.picks.get(d.bass!)!, b = d.picks.get(d.melody!)!, match = a === b && !d.rnd.size, now = this.now()
    const rec = d.rec, today = new Date(now).toISOString().slice(0, 10)
    const offer = match && !!rec && rec.date.includes(d.bass!.uid) && rec.date.includes(d.melody!.uid) && rec.lv < LV_MAX && rec.duetUp !== today
    const coin = match ? a : Math.random() < 0.5 ? a : b
    d.song = coin; d.ph = 'res'
    d.res = { match, coin, offer, yes: new Set(), no: false, done: !offer, up: 0, t0: now, end: now + (match ? (offer ? OFFER_MS : MATCH_HOLD_MS) : FLIP_MS + MISS_HOLD_MS) }
  }
  private duetCount(d: DuetS) {
    d.ph = 'count'; d.res = null; d.at = this.now() + DUET_LEAD_MS + DUET.get(d.song)!.countInSec * 1000
  }
  private duetOf(p: Player) { const d = this.duet; return d && (d.bass === p || d.melody === p) ? d : null }
  private duetPick(p: Player, id: unknown) {
    const d = this.duetOf(p); if (!d || d.ph !== 'pick' || typeof id !== 'string' || !DUET.has(id)) return
    d.picks.set(p, id)   // changeable until both have picked
    if (d.picks.size === 2) this.duetReveal(d)
    this.duetSend()
  }
  private duetOffer(p: Player, yes: boolean) {
    const d = this.duetOf(p), r = d?.res; if (!d || !r || !r.offer || r.done) return
    if (!yes) { r.done = true; r.no = true; r.end = this.now() + MAYBE_MS }
    else {
      r.yes.add(p)
      if (r.yes.size === 2 && d.rec) {
        const rec = d.rec, today = new Date(this.now()).toISOString().slice(0, 10)
        rec.lv = Math.min(LV_MAX, rec.lv + 1); rec.seg = 0; rec.duetUp = today; this.ps.save(d.key, rec)
        r.done = true; r.up = rec.lv; r.end = this.now() + LEVELUP_MS
        const a = d.bass!, b = d.melody!
        Promise.all([peerTag(b.uid), peerTag(a.uid)]).then(([tb, ta]) => {
          for (const [x, tag] of [[a, tb], [b, ta]] as const) if (this.byId.get(x.id) === x) x.sock.send(JSON.stringify({ t: 'dlv', peer: tag, lv: rec.lv }))
        })
      }
    }
    this.duetSend()
  }
  private duetCancel(p: Player) {
    const d = this.duetOf(p); if (!d || !(d.ph === 'count' || d.ph === 'pick' || d.ph === 'res') || !d.bass || !d.melody) return
    d.ph = 'both'; d.res = null; d.at = 0; this.duetSend()
  }
  private duetAgain(p: Player) { const d = this.duetOf(p); if (d && d.ph === 'both' && d.bass && d.melody) { this.duetPickStart(d); this.duetSend() } }
  /** "Start duet" in the picker: from the solo seat you shift onto Bass; from the floor you walk there. */
  private duetStart(p: Player, id: unknown) {
    if (typeof id !== 'string' || !DUET.has(id)) return
    p.duetWant = id
    const d = this.duetOf(p)
    if (d) { if (d.ph === 'wait') { d.song = id; this.duetSend() } return }
    if (this.duet) return p.sock.send(JSON.stringify({ t: 'note', k: 'piano-busy' }))
    if (this.piano.by === p) {
      this.piano = { by: null, song: null, at: 0, role: 'solo', seats: null }
      p.x = BASS_SEAT[0] + .5; p.y = BASS_SEAT[1] + .5; p.path = []; p.dir = null; p.sitting = true; p.sitAt = this.tickN
      this.pianoSend(); this.duetTick()
    } else this.go(p, BASS_SEAT[0], BASS_SEAT[1])
  }
  /** "Play solo instead": the one waiting moves to the middle and plays the whole duet (the _mix). */
  private duetSolo(p: Player) {
    const d = this.duetOf(p); if (!d || d.ph !== 'wait' || (d.bass && d.melody)) return
    const song = d.song; this.duetInviteEnd('cancel'); this.duet = null; this.duetSend()
    p.x = PIANO_SEAT[0] + .5; p.y = PIANO_SEAT[1] + .5; p.path = []; p.dir = null; p.sitting = true
    this.piano = { by: p, song, at: this.now() + LEAD_MS, role: 'solo', seats: null }; this.pianoSend()
  }
  /** The invite sheet lists only people with a heart for you: sat with you first (most recent first), then the café. */
  private canInvite(p: Player, o: Player) { return o !== p && o.sets.hearted.has(p.uid) && !this.hidden(p, o) && !this.duetOf(o) && this.piano.by !== o }
  private duetList(p: Player) {
    const met = [...p.sets.met], people = [...this.players.values()].filter(o => this.canInvite(p, o))
      .map(o => ({ id: o.id, sat: met.lastIndexOf(o.uid) })).sort((a, b) => (b.sat - a.sat)).map(o => ({ id: o.id, sat: o.sat >= 0 }))
    p.sock.send(JSON.stringify({ t: 'dlist', people }))
  }
  private duetInvite(p: Player, id: unknown) {
    const d = this.duetOf(p), o = typeof id === 'number' ? this.byId.get(id) : undefined
    if (!d || d.bass !== p || d.melody || d.ph !== 'wait' || d.inv || !o || !this.canInvite(p, o)) return
    d.inv = { from: p, to: o, exp: this.now() + INVITE_MS, yes: false }
    o.sock.send(JSON.stringify({ t: 'dinvite', from: p.id, song: d.song, ms: INVITE_MS }))
    this.duetSend()
  }
  private duetInviteAns(p: Player, yes: boolean) {
    const d = this.duet, inv = d?.inv; if (!d || !inv || inv.to !== p) return
    if (!yes) return this.duetInviteEnd('no')
    inv.yes = true; inv.exp = Math.max(inv.exp, this.now() + 20000)   // walking over
    p.duetWant = null; this.go(p, MELODY_SEAT[0], MELODY_SEAT[1])
    p.sock.send(JSON.stringify({ t: 'dinvite', from: 0, why: 'join' }))
  }
  /** why: cancel (the inviter) · no / late (→ the inviter: "Sam can't play right now") · taken (a passer-by sat) · came · gone */
  private duetInviteEnd(why: string) {
    const d = this.duet, inv = d?.inv; if (!d || !inv) return
    d.inv = null
    if (why !== 'came' && !inv.yes || why === 'taken') inv.to.sock.send(JSON.stringify({ t: 'dinvite', from: 0, why }))
    if (why === 'no' || why === 'late') inv.from.sock.send(JSON.stringify({ t: 'note', k: 'duet-cant', id: inv.to.id }))
    this.duetSend()
  }
  /** What v knows about the duet. Everyone sees who sits where and the song once it is fixed; the two seated see the
      pick game (never the other's pick until both have picked), the reveal and their invite. Someone hidden from a
      seated player sees no duet at all (and hears nothing). */
  duetView(v: Player) {
    const d = this.duet
    if (!d || [d.bass, d.melody].some(x => x && this.hidden(v, x))) return { t: 'duet', on: false }
    const me = d.bass === v ? 'bass' : d.melody === v ? 'melody' : null, o = me === 'bass' ? d.melody : me === 'melody' ? d.bass : null
    const fixed = d.ph === 'count' || d.ph === 'play'
    const out: any = { t: 'duet', on: true, bass: d.bass?.id ?? 0, melody: d.melody?.id ?? 0, ph: d.ph, now: this.now(),
      song: fixed || me ? d.song : null, at: fixed ? d.at : 0, gone: d.gone, me }
    if (me) {
      if (d.ph === 'pick') out.pick = { end: d.end, mine: d.picks.get(v) ?? null, them: !!o && d.picks.has(o) }
      if (d.ph === 'res' && d.res && o) {
        const r = d.res
        out.res = { match: r.match, coin: r.coin, mine: d.picks.get(v), theirs: d.picks.get(o), rnd: d.rnd.has(v), rndThem: d.rnd.has(o),
          offer: r.offer, yes: r.yes.has(v), them: r.yes.has(o), no: r.no, up: r.up, lv: d.rec?.lv ?? 1, t0: r.t0, end: r.end }
      }
      if (d.inv && d.inv.from === v) out.inv = { to: d.inv.to.id, exp: d.inv.exp }
    }
    return out
  }
  private duetSend() { for (const v of this.players.values()) v.sock.send(JSON.stringify(this.duetView(v))) }

  /** Either of the two said Not for me to the other. */
  refused(a: Player, b: Player) { return a.sets.passed.has(b.uid) || b.sets.passed.has(a.uid) }
  /** Walk off a seat onto the floor next to it (away from the table / piano). */
  private standUp(p: Player, seat: P) {
    const [x, y] = seat, t = ([[0, 1], [0, -1], [-1, 0], [1, 0]] as const).map(([dx, dy]) => [x + dx, y + dy] as P).find(([a, b]) => walkable(a, b) && !isSeat(a, b) && !isPianoSeat(a, b))
    if (t) { p.path = [t]; p.dir = null; p.sitting = false }
  }
  /** "Not for me", once a card has been revealed: ends the sitting for both and stands them up, records the refusal (the
      other sees a grey broken heart over you from now on, nobody else does), clears the hearts between the two, ends the
      level (no more cards) and any Start call, and tells the other, kindly, that you moved on. Not a block: both stay
      visible to each other. */
  private notForMe(p: Player) {
    const pr = this.pairOf(p); if (!pr || !(pr.rev || pr.n > 0)) return
    const o = other(pr, p), tb = TABLES.find(t => t.id === pr.tb)!
    const add = (x: Player, f: Field, y: Player) => { if (!x.sets[f].has(y.uid)) { x.sets[f].add(y.uid); this.store.add(x.uid, f, y.uid) } }
    add(p, 'passed', o); add(o, 'refusedBy', p)
    for (const [x, y] of [[p, o], [o, p]]) if (x.sets.hearted.delete(y.uid)) this.store.del?.(x.uid, 'hearted', y.uid)
    this.endPair(pr.tb)
    for (const x of [pr.a, pr.b]) this.standUp(x, x === pr.a ? tb.seats[0] : tb.seats[1])
    p.sock.send(JSON.stringify({ t: 'note', k: 'ended', id: o.id, name: o.name }))
    o.sock.send(JSON.stringify({ t: 'note', k: 'moved-on', id: p.id, name: p.name }))
  }
  /** The café call (both tapped Start call; the video runs between their phones): each side says when its video is
      connected ('callup') and when it ends ('calldown': hang up, the link dropped). Either side ending it ends it for both. */
  private callLive(p: Player, what: 'callup' | 'calldown') {
    const pr = this.pairOf(p); if (!pr?.live) return
    if (what === 'callup') pr.live.up.add(p)
    else { pr.live = null; other(pr, p).sock.send(JSON.stringify({ t: 'callend' })); p.sock.send(JSON.stringify({ t: 'callend' })) }
    this.coupleSync()
  }
  /** "Show our heart in the café": either of the two can turn it off; it shows only while both are on. */
  private coupleSwitch(p: Player, on: unknown) {
    const pr = this.pairOf(p); if (!pr?.live || typeof on !== 'boolean') return
    pr.live.sw.set(p, on); this.coupleSync()
  }
  /** Which tables show the couple heart: a call both sides report connected, both seated (the pair exists), both
      switches on. Everyone in the room (except anyone either of the two blocked) gets only on/off for the table. */
  coupleSync() {
    const want = new Set<number>()
    for (const pr of this.pairs.values()) if (pr.live && pr.live.up.size === 2 && [...pr.live.sw.values()].every(Boolean)) want.add(pr.tb)
    const ch: [number, boolean][] = []
    for (const tb of this.hearts) if (!want.has(tb)) ch.push([tb, false])
    for (const tb of want) if (!this.hearts.has(tb)) ch.push([tb, true])
    if (!ch.length) return
    this.hearts = want
    for (const [tb, on] of ch) {
      const pr = this.pairs.get(tb), msg = JSON.stringify({ t: 'couple', tb, on })
      for (const v of this.players.values()) if (!on || !pr || (!this.hidden(v, pr.a) && !this.hidden(v, pr.b))) v.sock.send(msg)
    }
  }
  /** Sofas: a casual hangout. Tapping one walks you to the floor in front of it, then you take the free slot nearest to
      where you tapped; up to SOFA_CAP a sofa, a full sofa says so. Room chat stays public; no cards. */
  private sofaGo(p: Player, i: unknown) {
    const sf = typeof i === 'number' ? SOFAS[i] : undefined; if (!sf) return
    if (p.sofa?.[0] === i) return
    const free = this.sofaFree(i as number); if (free < 0) { p.sock.send(JSON.stringify({ t: 'note', k: 'sofa-full' })); return }
    this.sofaLeave(p)
    const t: P = [sf.front[0], SOFA_FRONT_Y], path = findPath([Math.floor(p.x), Math.floor(p.y)], t); if (!path) return
    p.path = path; p.dir = null; p.stuck = 0; p.sofaWant = [i as number, free]
  }
  private sofaFree(i: number) {
    const used = new Set([...this.players.values()].filter(o => o.sofa?.[0] === i).map(o => o.sofa![1]))
    return SEAT_ORDER.find(k => !used.has(k)) ?? -1   // GD: L, then R, then M
  }
  private sofaSit(p: Player) {
    const [i] = p.sofaWant!; p.sofaWant = null
    const k = this.sofaFree(i); if (k < 0) { p.sock.send(JSON.stringify({ t: 'note', k: 'sofa-full' })); return }
    const [x, y] = SOFAS[i].slots[k]; p.sofa = [i, k]; p.x = x; p.y = y; p.path = []; p.dir = null; p.sitting = true; p.moving = false; p.sitAt = this.tickN
  }
  /** Standing up from a sofa puts you back on the floor in front of your slot. */
  private sofaLeave(p: Player) {
    if (!p.sofa) return
    const [x] = SOFAS[p.sofa[0]].slots[p.sofa[1]]; p.sofa = null; p.sitting = false; p.x = Math.floor(x) + .5; p.y = SOFA_FRONT_Y + .5
  }

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

  /** A voice emote: public, from the character; the set follows the profile's "I am"; 3 s cooldown per player (early sends dropped). */
  private emote(p: Player, e: unknown) {
    if (!isEmote(e)) return
    const t = this.now(), wait = p.emoteAt + EMOTE_COOLDOWN_MS - t
    if (wait > 0) return p.sock.send(JSON.stringify({ t: 'emote', ok: false, why: 'slow', wait }))
    p.emoteAt = t; const take = nextTake(setOf(p.iam), e, p.takes[e]); p.takes[e] = take
    const msg = JSON.stringify({ t: 'emote', id: p.id, e, take })
    for (const v of this.players.values()) if (v === p || !this.hidden(v, p)) v.sock.send(msg)
  }
  private say(p: Player, text: unknown) {
    const t = this.now(); p.says = p.says.filter(s => s > t - SAY_WINDOW_MS)
    const raw = typeof text === 'string' ? text.slice(0, 200) : ''
    if (p.says.length >= SAY_MAX) return p.sock.send(JSON.stringify({ t: 'said', ok: false, why: 'slow', text: raw, wait: p.says[0] + SAY_WINDOW_MS - t }))
    const v = check(text)
    if (!v.ok) { if (v.why !== 'empty') p.says.push(t); return p.sock.send(JSON.stringify({ t: 'said', ok: false, why: v.why, text: raw })) }
    const pr = this.pairOf(p)
    // what you said at a table is tagged with who heard it: it only goes into a report that person makes
    p.says.push(t); p.recent.push({ at: t, text: v.text, ...(pr ? { to: other(pr, p).uid } : {}) }); if (p.recent.length > 8) p.recent.shift()
    if (pr) {
      // at a table, speech is for the two of them: the text goes to the partner only; everyone else gets a "…" over the table
      const o = other(pr, p)
      p.sock.send(JSON.stringify({ t: 'said', ok: true, text: v.text, priv: 1 }))
      o.sock.send(JSON.stringify({ t: 'say', id: p.id, text: v.text, priv: 1 })); o.heard.push({ at: t, text: v.text }); if (o.heard.length > 8) o.heard.shift()
      const mm = JSON.stringify({ t: 'murmur', tb: pr.tb })
      for (const x of this.players.values()) if (x !== p && x !== o && !this.hidden(p, x) && !this.hidden(o, x)) x.sock.send(mm)
      return
    }
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
      if (this.piano.by === p || this.piano.by === o) this.pianoSend()
      for (const tb of this.hearts) { const pr = this.pairs.get(tb); if (pr && (pr.a === o || pr.b === o)) p.sock.send(JSON.stringify({ t: 'couple', tb, on: false })); if (pr && (pr.a === p || pr.b === p)) o.sock.send(JSON.stringify({ t: 'couple', tb, on: false })) }
    } else {
      this.store.report({
        at: this.now(), inst: this.name, by: p.uid, who: o.uid, why: typeof why === 'string' && REASONS.has(why) ? why : 'other',
        ctx: { said: o.recent.filter(x => !x.to || x.to === p.uid).slice(-5).map(({ at, text }) => ({ at, text })), heard: p.heard.slice(-5), where: [[+p.x.toFixed(2), +p.y.toFixed(2)], [+o.x.toFixed(2), +o.y.toFixed(2)]], tick: this.tickN },
      })
    }
    p.sock.send(JSON.stringify({ t: 'ack', what, id: o.id }))
  }
}
