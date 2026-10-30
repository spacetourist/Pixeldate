/* Pixeldate World · Cloudflare Worker. One Durable Object per café instance (Area, via PartyServer), one per user
   (User: met / hearted / passed / refusedBy / blocked / blockedBy) and a singleton Mod that keeps reports in SQLite.
   Routes: /parties/area/cafe-N (WebSocket) · /dev/reports (DEV only, for tests) · /health */
import { Server, routePartykitRequest, type Connection } from 'partyserver'
import { DurableObject } from 'cloudflare:workers'
import './profanity.ts'
import { Room, emptyRec, type Field, type Rec, type Report, type Sock, type Store } from './sim.ts'
import { TICK_MS } from '../shared/proto.ts'

interface Env { Area: DurableObjectNamespace<Area>; User: DurableObjectNamespace<User>; Mod: DurableObjectNamespace<Mod>; INVITES?: string; DEV?: string }

export class User extends DurableObject<Env> {
  async load(): Promise<Rec> { return { ...emptyRec(), ...(await this.ctx.storage.get<Rec>('rec')) } }
  async add(f: Field, other: string) {
    const r = await this.load(); if (r[f].includes(other)) return
    r[f].push(other); if (r[f].length > 5000) r[f].shift(); await this.ctx.storage.put('rec', r)
  }
}
const store = (env: Env): Store => ({
  load: uid => env.User.get(env.User.idFromName(uid)).load(),
  add: (uid, f, other) => { env.User.get(env.User.idFromName(uid)).add(f, other).catch(() => {}) },
  report: r => { env.Mod.get(env.Mod.idFromName('mod')).report(r).catch(() => {}) },
})
/** Reports: one storage key per report (time-ordered), in the Mod object's SQLite-backed storage. */
export class Mod extends DurableObject<Env> {
  async report(r: Report) { await this.ctx.storage.put(`r:${String(r.at).padStart(15, '0')}:${crypto.randomUUID()}`, r) }
  async list() { return [...(await this.ctx.storage.list<Report>({ prefix: 'r:', reverse: true, limit: 200 })).values()] }
}

export class Area extends Server<Env> {
  static options = { hibernate: false }
  room!: Room; timer: ReturnType<typeof setInterval> | null = null; joinTimers = new Map<Connection, ReturnType<typeof setTimeout>>()
  onStart() { this.room = new Room(this.name, store(this.env), { invites: new Set((this.env.INVITES ?? "").split(',').map(s => s.trim()).filter(Boolean)) }) }
  onConnect(c: Connection) {
    const s = c as unknown as Sock
    this.room.connect(s)
    // a socket that never sends a valid join is dropped after 5 s
    this.joinTimers.set(c, setTimeout(() => { if (this.room.pending.has(s)) { c.send(JSON.stringify({ t: 'no', why: 'timeout' })); c.close(4001, 'timeout'); this.room.close(s) } }, 5000))
  }
  async onMessage(c: Connection, m: string | ArrayBuffer | ArrayBufferView) {
    await this.room.message(c as unknown as Sock, typeof m === 'string' ? m : new ArrayBuffer(0))
    if (this.room.size && !this.timer) this.timer = setInterval(() => this.room.tick(), TICK_MS)
  }
  onClose(c: Connection) { this.gone(c) }
  onError(c: Connection) { this.gone(c) }
  gone(c: Connection) {
    clearTimeout(this.joinTimers.get(c)); this.joinTimers.delete(c); this.room.close(c as unknown as Sock)
    if (!this.room.size && this.timer) { clearInterval(this.timer); this.timer = null }
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url)
    if (u.pathname.startsWith('/parties/')) {
      if (!/^\/parties\/area\/cafe-\d{1,3}$/.test(u.pathname)) return new Response('no such room', { status: 404 })
      return (await routePartykitRequest(req, env as unknown as Record<string, unknown>)) ?? new Response('not found', { status: 404 })
    }
    if (u.pathname === '/dev/reports' && env.DEV === '1') return Response.json(await env.Mod.get(env.Mod.idFromName('mod')).list())
    if (u.pathname === '/health') return new Response('ok')
    return new Response('Pixeldate World', { status: 404 })
  },
}
