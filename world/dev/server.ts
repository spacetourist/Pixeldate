/* Node stand-in for `wrangler dev`, used while wrangler/partyserver can't be installed on the box. Same URL scheme
   (/parties/area/cafe-N), same Room class, same 5 s join timeout, same tick timer lifecycle as the Area Durable Object;
   per-user records and reports are kept in memory (UserDO / Mod stand-ins).
   Run:  node world/dev/server.ts [port] [--cap=N]   (default port 8787, cap 40) */

import { WebSocketServer, type WebSocket } from 'ws'
import { createServer } from 'node:http'
import { Budget, memKV } from '../src/budget.ts'
import { handleTurn } from '../src/turn.ts'
import { Room, emptyRec, memPairs, type Rec, type Report, type Sock, type Store } from '../src/sim.ts'
import { TICK_MS } from '../shared/proto.ts'

let filterKind = 'obscenity'
try { await import('../src/profanity.ts') } catch { await import('../src/profanity-stub.ts'); filterKind = 'STUB (obscenity not installed)' }

// In-memory stand-ins for UserDO (per-user records) and Mod (reports); shared by every room in this process
const users = new Map<string, Rec>(), reports: Report[] = []
/** the app-wide pair store stand-in (Pair DO): one for every room in this process */
const pairs = memPairs()
const store: Store = {
  load: async uid => structuredClone(users.get(uid) ?? emptyRec()),
  add: (uid, f, other) => { let r = users.get(uid); if (!r) users.set(uid, r = emptyRec()); if (!r[f].includes(other)) r[f].push(other) },
  report: r => { reports.push(r) },
  del: (uid, f, other) => { const r = users.get(uid); if (r) r[f] = r[f].filter(x => x !== other) },
}
const INVITES = new Set(['dev-invite-1', 'dev-invite-2', 'dev-invite-3'])
const capArg = process.argv.find(a => a.startsWith('--cap='))
const CAP = capArg ? +capArg.slice(6) : undefined
/** WORLD_STALE_MS: tests use a short keepalive timeout so a hard disconnect is seen in seconds */
const STALE = process.env.WORLD_STALE_MS ? +process.env.WORLD_STALE_MS : undefined
const rooms = new Map<string, { room: Room; timer: ReturnType<typeof setInterval> | null }>()
const tickMs: number[] = []
function area(name: string) {
  let a = rooms.get(name)
  if (!a) { a = { room: new Room(name, store, { invites: INVITES, cap: CAP, staleMs: STALE, pairs }), timer: null }; rooms.set(name, a) }
  return a
}
const port = +(process.argv.find(a => /^\d+$/.test(a)) ?? process.env.WORLD_PORT ?? 8787)
/** the Budget stand-in (free-plan blocks), with a clock tests can move; /turn hands out a fake TURN entry */
const clock = { off: 0 }, budget = new Budget(memKV(), () => Date.now() + clock.off)
const http = createServer(async (req, res) => {
  const u = new URL(req.url ?? '/', 'http://127.0.0.1'), headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
  let r: Response
  if (u.pathname === '/turn') { void budget.hit(1); r = await handleTurn(new Request(u, { method: req.method, headers }), { invites: INVITES, gate: (w, ip) => budget.turn(w, ip), mock: true }) }
  else if (u.pathname === '/health') r = new Response('ok')
  else r = new Response('Pixeldate World', { status: 404 })
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()))
})
const wss = new WebSocketServer({ server: http, maxPayload: 262144 })
wss.on('connection', async (ws, req) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname, m = /^\/parties\/area\/(cafe-\d{1,3})$/.exec(path)
  if (!m) { ws.close(4004, 'no such room'); return }
  const day = await budget.join(1)
  if (day.busy) { ws.send(JSON.stringify({ t: 'no', why: 'busy' })); ws.close(4003, 'busy'); return }
  attach(ws, m[1])
})
http.listen(port, '127.0.0.1')
http.on('listening', () => console.log(`world dev server on ws://127.0.0.1:${port}/parties/area/cafe-1 · filter: ${filterKind}`))
export { reports, tickMs, rooms, filterKind, pairs, budget, clock }
function attach(ws: WebSocket, name: string) {
  const a = area(name), room = a.room
  const s: Sock = { send: d => { if (ws.readyState === 1) ws.send(d) }, close: (c, r) => ws.close(c, r) }
  room.connect(s)
  const jt = setTimeout(() => { if (room.pending.has(s)) { s.send(JSON.stringify({ t: 'no', why: 'timeout' })); ws.close(4001, 'timeout'); room.close(s) } }, 5000)
  let msgs = 0
  ws.on('message', async (data, binary) => {
    if (++msgs % 20 === 0) void budget.hit(1)   // DO WebSocket messages count 20:1 (as the Worker's Area does)
    await room.message(s, binary ? new ArrayBuffer(0) : data.toString())
    if (room.size && !a.timer) a.timer = setInterval(() => { tick(room); if (!room.size && a.timer) { clearInterval(a.timer); a.timer = null } }, TICK_MS)
  })
  ws.on('close', () => {
    clearTimeout(jt); room.close(s)
    if (!room.size && a.timer) { clearInterval(a.timer); a.timer = null }
  })
}
function tick(room: Room) {
  const t = performance.now(); room.tick(); tickMs.push(performance.now() - t)
  if (tickMs.length > 20000) tickMs.splice(0, 5000)
}
