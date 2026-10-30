/* Pixeldate World · Cloudflare Worker. One Durable Object per café instance (Area, via PartyServer), one per user
   (User: met / hearted / passed / refusedBy / blocked / blockedBy) and a singleton Mod that keeps reports in SQLite.
   A singleton Budget keeps the free-plan blocks (src/budget.ts): TURN estimate / actual caps and the daily request count.
   Routes: /parties/area/cafe-N (WebSocket) · /turn (TURN credentials, src/turn.ts) · /dev/reports, /dev/budget (DEV only,
   for tests) · /health */
import { Server, routePartykitRequest, type Connection } from 'partyserver'
import { DurableObject } from 'cloudflare:workers'
import './profanity.ts'
import { Room, emptyRec, type Field, type PairRec, type PairStore, type Rec, type Report, type Sock, type Store } from './sim.ts'
import { TICK_MS } from '../shared/proto.ts'
import { Budget as Gate, graphqlUsage, type KV } from './budget.ts'
import { handleTurn } from './turn.ts'

interface Env { Area: DurableObjectNamespace<Area>; User: DurableObjectNamespace<User>; Mod: DurableObjectNamespace<Mod>; Pair: DurableObjectNamespace<Pair>; Budget: DurableObjectNamespace<Budget>
  INVITES?: string; DEV?: string; STALE_MS?: string; TURN_KEY_ID?: string; TURN_KEY_API_TOKEN?: string; TURN_MOCK?: string; CF_ANALYTICS_TOKEN?: string; CF_ACCOUNT_ID?: string }

/** The free-plan blocks (one object for the whole app). */
export class Budget extends DurableObject<Env> {
  g: Gate
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const kv: KV = { get: k => ctx.storage.get(k), put: (k, v) => ctx.storage.put(k, v) }
    this.g = new Gate(kv, Date.now, env.CF_ANALYTICS_TOKEN && env.CF_ACCOUNT_ID ? graphqlUsage(env.CF_ACCOUNT_ID, env.CF_ANALYTICS_TOKEN) : undefined)
  }
  turn(who: string, ip: string) { return this.g.turn(who, ip) }
  hit(n: number) { return this.g.hit(n) }
  join(n: number) { return this.g.join(n) }
  status() { return this.g.status() }
  setForTest(o: Parameters<Gate['setForTest']>[0]) { return this.g.setForTest(o) }
}
const budget = (env: Env) => env.Budget.get(env.Budget.idFromName('budget'))
/** worker requests seen by this isolate and not yet added to today's count (flushed with the next join, /turn or batch) */
let pendingReq = 0
const invitesOf = (env: Env) => new Set((env.INVITES ?? '').split(',').map(s => s.trim()).filter(Boolean))
/** over today's soft cap: a tiny socket that says so and closes (the café's Durable Object never wakes) */
function busySocket(): Response {
  const [client, server] = Object.values(new WebSocketPair()); server.accept()
  server.send(JSON.stringify({ t: 'no', why: 'busy' })); server.close(4003, 'busy')
  return new Response(null, { status: 101, webSocket: client })
}

export class User extends DurableObject<Env> {
  async load(): Promise<Rec> { return { ...emptyRec(), ...(await this.ctx.storage.get<Rec>('rec')) } }
  async add(f: Field, other: string) {
    const r = await this.load(); if (r[f].includes(other)) return
    r[f].push(other); if (r[f].length > 5000) r[f].shift(); await this.ctx.storage.put('rec', r)
  }
  async del(f: Field, other: string) {
    const r = await this.load(); if (!r[f].includes(other)) return
    r[f] = r[f].filter(x => x !== other); await this.ctx.storage.put('rec', r)
  }
}
const store = (env: Env): Store => ({
  load: uid => env.User.get(env.User.idFromName(uid)).load(),
  add: (uid, f, other) => { env.User.get(env.User.idFromName(uid)).add(f, other).catch(() => {}) },
  report: r => { env.Mod.get(env.Mod.idFromName('mod')).report(r).catch(() => {}) },
  del: (uid, f, other) => { env.User.get(env.User.idFromName(uid)).del(f, other).catch(() => {}) },
})
/** One object per pair (named by the two uids, sorted): their level, meter and date opt-ins, shared by every room and
    instance of every space, so a pair picks up where they left off wherever they meet next. */
export class Pair extends DurableObject<Env> {
  async get(): Promise<PairRec | null> { return (await this.ctx.storage.get<PairRec>('rec')) ?? null }
  async put(r: PairRec) { await this.ctx.storage.put('rec', r) }
}
const pairs = (env: Env): PairStore => ({
  load: async k => (await env.Pair.get(env.Pair.idFromName(k)).get()) ?? undefined,
  save: (k, r) => { env.Pair.get(env.Pair.idFromName(k)).put(r).catch(() => {}) },
})
/** Reports: one storage key per report (time-ordered), in the Mod object's SQLite-backed storage. */
export class Mod extends DurableObject<Env> {
  async report(r: Report) { await this.ctx.storage.put(`r:${String(r.at).padStart(15, '0')}:${crypto.randomUUID()}`, r) }
  async list() { return [...(await this.ctx.storage.list<Report>({ prefix: 'r:', reverse: true, limit: 200 })).values()] }
}

export class Area extends Server<Env> {
  static options = { hibernate: false }
  room!: Room; timer: ReturnType<typeof setInterval> | null = null; msgs = 0; flushAt = 0; joinTimers = new Map<Connection, ReturnType<typeof setTimeout>>()
  /** pair levels live in the app-wide Pair objects, not in this instance */
  async onStart() {
    this.room = new Room(this.name, store(this.env), { invites: new Set((this.env.INVITES ?? "").split(',').map(s => s.trim()).filter(Boolean)),
      staleMs: this.env.STALE_MS ? +this.env.STALE_MS : undefined, pairs: pairs(this.env) })
  }
  onConnect(c: Connection) {
    const s = c as unknown as Sock
    this.room.connect(s)
    // a socket that never sends a valid join is dropped after 5 s
    this.joinTimers.set(c, setTimeout(() => { if (this.room.pending.has(s)) { c.send(JSON.stringify({ t: 'no', why: 'timeout' })); c.close(4001, 'timeout'); this.room.close(s) } }, 5000))
  }
  async onMessage(c: Connection, m: string | ArrayBuffer | ArrayBufferView) {
    // WebSocket messages count against the free plan's daily requests at 20:1; added to the day's count once a minute
    this.msgs++; if (Date.now() - this.flushAt > 60_000) this.flush()
    await this.room.message(c as unknown as Sock, typeof m === 'string' ? m : new ArrayBuffer(0))
    if (this.room.size && !this.timer) this.timer = setInterval(() => { this.room.tick(); this.idle() }, TICK_MS)
  }
  onClose(c: Connection) { this.gone(c) }
  onError(c: Connection) { this.gone(c) }
  gone(c: Connection) {
    clearTimeout(this.joinTimers.get(c)); this.joinTimers.delete(c); this.room.close(c as unknown as Sock)
    this.idle()
  }
  /** the tick (and its prune of silent sockets) stops as soon as the room is empty */
  idle() { if (!this.room.size && this.timer) { clearInterval(this.timer); this.timer = null; this.flush() } }
  flush() { this.flushAt = Date.now(); const n = Math.floor(this.msgs / 20); if (!n) return; this.msgs -= n * 20; budget(this.env).hit(n).catch(() => {}) }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const u = new URL(req.url); pendingReq++
    if (u.pathname.startsWith('/parties/')) {
      if (!/^\/parties\/area\/cafe-\d{1,3}$/.test(u.pathname)) return new Response('no such room', { status: 404 })
      if (req.headers.get('Upgrade') === 'websocket') {
        const n = pendingReq; pendingReq = 0
        const day = await budget(env).join(n).catch(() => ({ busy: false }))
        if (day.busy) return busySocket()
      }
      return (await routePartykitRequest(req, env as unknown as Record<string, unknown>)) ?? new Response('not found', { status: 404 })
    }
    if (u.pathname === '/turn') {
      const n = pendingReq; pendingReq = 0; const b = budget(env); ctx.waitUntil(b.hit(n).catch(() => 0))
      return handleTurn(req, { invites: invitesOf(env), gate: (who, ip) => b.turn(who, ip), keyId: env.TURN_KEY_ID, keyToken: env.TURN_KEY_API_TOKEN, mock: env.TURN_MOCK === '1' })
    }
    if (pendingReq >= 50) { const n = pendingReq; pendingReq = 0; ctx.waitUntil(budget(env).hit(n).catch(() => 0)) }
    if (u.pathname === '/dev/budget' && env.DEV === '1') {
      const b = budget(env); if (req.method === 'POST') await b.setForTest(await req.json())
      return Response.json(await b.status())
    }
    if (u.pathname === '/dev/reports' && env.DEV === '1') return Response.json(await env.Mod.get(env.Mod.idFromName('mod')).list())
    if (u.pathname === '/health') return new Response('ok')
    return new Response('Pixeldate World', { status: 404 })
  },
}
