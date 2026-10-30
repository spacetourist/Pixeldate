/* Pixeldate World · GET /turn: short-lived TURN credentials for the café video call. Same rules in the Worker and the Node
   dev server. Invite-gated like the WebSocket (header x-pd-invite), rate-limited per player (?p=<uid>) and per IP, and
   capped by the Budget (src/budget.ts). It never fails the call: when TURN is off, spent or down, the answer is 200 with
   an empty iceServers list and the client keeps its STUN-only setup.
   Answer: { iceServers: RTCIceServer[], turn: boolean, ttl?: number, why?: 'off' | 'budget' | 'actual' | 'upstream' }
   Errors: 403 { why: 'invite' } · 400 { why: 'player' } · 429 { why: 'rate' } */
import { LIMITS, type TurnGate } from './budget.ts'
export interface TurnDeps {
  invites: Set<string>
  gate: (who: string, ip: string) => Promise<TurnGate>
  keyId?: string; keyToken?: string
  /** dev/tests: hand out a fake TURN entry instead of calling Cloudflare */
  mock?: boolean
  fetch?: typeof fetch
}
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'x-pd-invite', 'Access-Control-Max-Age': '86400', 'Cache-Control': 'no-store' }
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
const UID = /^[A-Za-z0-9-]{8,64}$/  // same as the join check (sim.ts)
/** Browsers block port 53; drop those URLs (and any entry left with none). */
export const cleanIce = (list: any[]): RTCIceServer[] => (Array.isArray(list) ? list : []).map(s => {
  const urls = (Array.isArray(s?.urls) ? s.urls : [s?.urls]).filter((u: unknown) => typeof u === 'string' && /^(stun|turns?):/.test(u) && !/:53(\?|$)/.test(u))
  return urls.length ? { ...s, urls } : null
}).filter(Boolean) as RTCIceServer[]
export async function handleTurn(req: Request, d: TurnDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'GET') return json({ why: 'method' }, 405)
  const u = new URL(req.url), inv = (req.headers.get('x-pd-invite') ?? '').trim(), who = u.searchParams.get('p') ?? ''
  if (!inv || !d.invites.has(inv)) return json({ why: 'invite' }, 403)
  if (!UID.test(who)) return json({ why: 'player' }, 400)
  if (!d.mock && !(d.keyId && d.keyToken)) return json({ iceServers: [], turn: false, why: 'off' })
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'local'
  const g = await d.gate(who, ip)
  if (!g.ok) return g.why === 'rate' ? json({ why: 'rate' }, 429) : json({ iceServers: [], turn: false, why: g.why })
  if (d.mock) return json({ iceServers: [{ urls: ['turn:turn.invalid:3478?transport=udp', 'turn:turn.invalid:53?transport=udp'], username: 'mock', credential: 'mock' }].map(s => cleanIce([s])[0]), turn: true, ttl: LIMITS.TTL_S })
  try {
    const r = await (d.fetch ?? fetch)(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(d.keyId!)}/credentials/generate-ice-servers`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + d.keyToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: LIMITS.TTL_S }), signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error('upstream ' + r.status)
    const j: any = await r.json(), ice = cleanIce(j?.iceServers)
    if (!ice.some(s => (s.urls as string[]).some(x => x.startsWith('turn')))) throw new Error('no turn')
    return json({ iceServers: ice, turn: true, ttl: LIMITS.TTL_S })
  } catch { return json({ iceServers: [], turn: false, why: 'upstream' }) }
}
