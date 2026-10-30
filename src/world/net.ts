/* Pixeldate World client connection: JSON events in, one binary snapshot per tick, kept as two frames for interpolation. */
import { decodeSnap, TICK_MS, type ClientMsg, type Ent, type Pub, type ServerMsg } from '../../world/shared/proto.ts'
export interface Seen { id: number; x: number; y: number; f: number; px: number; py: number; t: number; dx: number; dy: number }
export type JoinP = Extract<ClientMsg, { t: 'join' }>['p']
export class WorldNet {
  ws: WebSocket | null = null; ka = 0
  me = 0; inst = ''; tick = 0; bytes = 0
  ents = new Map<number, Seen>()
  pubs = new Map<number, Pub>()
  url: string; invite: string; p: JoinP
  onmsg: (m: ServerMsg) => void = () => {}
  constructor(url: string, invite: string, p: JoinP) { this.url = url; this.invite = invite; this.p = p }
  open(room = 'cafe-1') {
    const ws = this.ws = new WebSocket(`${this.url}/parties/area/${room}`); ws.binaryType = 'arraybuffer'
    ws.onopen = () => this.send({ t: 'join', invite: this.invite, p: this.p })
    ws.onclose = e => { if (this.ws !== ws) return; clearInterval(this.ka); this.onmsg({ t: 'no', why: e.code === 4002 ? 'replaced' : 'closed' } as any) }
    ws.onmessage = e => {
      if (typeof e.data !== 'string') { this.bytes += e.data.byteLength; const s = decodeSnap(e.data); if (s) this.snap(s.tick, s.ents); return }
      const m = JSON.parse(e.data) as ServerMsg
      // keepalive at the rate the server asks for: a socket that goes quiet is dropped there (and stops counting as "here")
      if (m.t === 'hi') { this.me = m.me; this.inst = m.inst; this.ents.clear(); this.pubs.clear(); clearInterval(this.ka); this.ka = window.setInterval(() => this.send({ t: 'ka' }), m.ka || 5000) }
      else if (m.t === 'full') { this.ws = null; ws.close(); this.open(m.next); return }
      else if (m.t === 'add') this.pubs.set(m.p.id, m.p)
      else if (m.t === 'del') { this.pubs.delete(m.id); this.ents.delete(m.id) }
      this.onmsg(m)
    }
  }
  private snap(tick: number, list: Ent[]) {
    const now = performance.now(), seen = new Set<number>()
    for (const e of list) {
      seen.add(e.id); const o = this.ents.get(e.id)
      if (!o) { this.ents.set(e.id, { ...e, px: e.x, py: e.y, t: now, dx: 0, dy: 1 }); continue }
      const cx = this.lerpX(o, now), cy = this.lerpY(o, now), mx = e.x - o.x, my = e.y - o.y
      if (Math.abs(mx) + Math.abs(my) > 0.01) { o.dx = mx; o.dy = my }
      o.px = cx; o.py = cy; o.x = e.x; o.y = e.y; o.f = e.f; o.t = now
    }
    for (const id of this.ents.keys()) if (!seen.has(id)) this.ents.delete(id)
    this.tick = tick
  }
  /** Position drawn at time `now`: glides from where it was drawn last to the newest server position over one tick. */
  lerpX(o: Seen, now: number) { const k = Math.min(1, (now - o.t) / TICK_MS); return o.px + (o.x - o.px) * k }
  lerpY(o: Seen, now: number) { const k = Math.min(1, (now - o.t) / TICK_MS); return o.py + (o.y - o.py) * k }
  send(m: ClientMsg) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)) }
  close() { clearInterval(this.ka); const ws = this.ws; this.ws = null; ws?.close() }
}
