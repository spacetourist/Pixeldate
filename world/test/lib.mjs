// Test/bot client for the world server (works against `wrangler dev` or the Node dev server: same URLs).
import { decodeSnap } from '../shared/proto.ts'
import { SAMPLES } from '../../src/avatar/kit/kit.gen.ts'
export const BASE = process.env.WORLD_URL || 'ws://127.0.0.1:8787'
let n = 0
export const sleep = ms => new Promise(r => setTimeout(r, ms))
export function profile(o = {}) {
  const i = n++
  return { name: o.name ?? 'Bot' + i, br: [25, 29], min: 18, max: 999, iam: 'woman', seek: 'everyone', uid: 'bot-' + crypto.randomUUID(), adult: true,
    pav: JSON.stringify({ v: 1, ...SAMPLES[i % SAMPLES.length] }), ...o }
}
export class Bot {
  constructor(p, { invite = 'dev-invite-1', room = 'cafe-1', follow = true } = {}) {
    this.p = p; this.invite = invite; this.room = room; this.follow = follow
    this.text = []; this.bin = []; this.ents = new Map(); this.pubs = new Map(); this.events = []; this.me = 0; this.inst = null; this.closed = null
  }
  connect() {
    return new Promise(res => {
      const ws = this.ws = new WebSocket(`${BASE}/parties/area/${this.room}`); ws.binaryType = 'arraybuffer'
      ws.onopen = () => ws.send(JSON.stringify({ t: 'join', invite: this.invite, p: this.p }))
      ws.onclose = e => { this.closed = e.code; clearInterval(this.ka); res({ t: 'closed', code: e.code }) }
      ws.onmessage = e => {
        if (typeof e.data !== 'string') {
          const b = new Uint8Array(e.data); this.bin.push(b); if (this.bin.length > 50) this.bin.shift(); this.binBytes = (this.binBytes || 0) + b.byteLength
          const s = decodeSnap(e.data); if (s) { this.tick = s.tick; this.ents = new Map(s.ents.map(x => [x.id, x])) }
          return
        }
        this.text.push(e.data); this.textBytes = (this.textBytes || 0) + e.data.length
        const m = JSON.parse(e.data); this.events.push(m)
        if (m.t === 'hi') { this.me = m.me; this.inst = m.inst; clearInterval(this.ka); this.ka = setInterval(() => { if (!this.dead) this.send({ t: 'ka' }) }, m.ka || 5000); res(m) }
        else if (m.t === 'no') res(m)
        else if (m.t === 'full') { if (this.follow) { this.room = m.next; ws.onclose = null; this.connect().then(res) } else res(m) }
        else if (m.t === 'add') this.pubs.set(m.p.id, m.p)
        else if (m.t === 'del') this.pubs.delete(m.p?.id ?? m.id)
      }
    })
  }
  send(o) { if (!this.dead && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)) }
  /** a hard disconnect: the socket stays open but nothing is ever sent again (lost signal, a killed tab with no close frame) */
  zombie() { this.dead = true; clearInterval(this.ka) }
  last(t) { for (let i = this.events.length - 1; i >= 0; i--) if (this.events[i].t === t) return this.events[i] }
  async wait(pred, ms = 4000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = pred(); if (v) return v; await sleep(30) } return null }
  self() { return this.ents.get(this.me) }
  close() { clearInterval(this.ka); try { this.ws.close() } catch {} }
}
