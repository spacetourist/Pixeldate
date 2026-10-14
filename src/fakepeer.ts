// Test-only stand-in for PeerJS (?loopback). Pages in one browser talk over BroadcastChannel so the
// real lobby/match code can be exercised where WebRTC is unavailable (e.g. CI boxes without UDP).
type H = Record<string, ((...a: any[]) => void)[]>
class Em { h: H = {}; on(e: string, f: any) { (this.h[e] ||= []).push(f); return this } once(e: string, f: any) { const g = (...a: any[]) => { this.off(e, g); f(...a) }; return this.on(e, g) }
  off(e: string, f: any) { this.h[e] = (this.h[e] || []).filter(x => x !== f); return this } emit(e: string, ...a: any[]) { [...(this.h[e] || [])].forEach(f => f(...a)) } }
const bc = new BroadcastChannel('pd-loopback'); const live = new Map<string, FakePeer>(); const conns = new Map<string, FakeConn>()
const rid = () => Math.random().toString(36).slice(2, 10)
bc.onmessage = ({ data: m }) => {
  if (m.k === 'claim' && live.has(m.id)) bc.postMessage({ k: 'taken', id: m.id, nonce: m.nonce })
  else if (m.k === 'taken') pendingClaims.get(m.nonce)?.()
  else if (m.k === 'conn' && live.has(m.to)) { const p = live.get(m.to)!; const c = new FakeConn(m.cid, m.from, p, true); bc.postMessage({ k: 'ack', cid: m.cid }); p.emit('connection', c); setTimeout(() => c.emit('open'), 10) }
  else if (m.k === 'ack') pendingConns.get(m.cid)?.()
  else if (m.k === 'data') conns.get(m.cid + (m.side ? ':a' : ':b'))?.emit('data', m.d)
  else if (m.k === 'close') { const c = conns.get(m.cid + (m.side ? ':a' : ':b')); if (c && c.open) { c.open = false; c.emit('close') } }
}
const pendingClaims = new Map<string, () => void>(), pendingConns = new Map<string, () => void>()
class FakeConn extends Em {
  open = false
  constructor(public cid: string, public peer: string, public owner: FakePeer, public answerer: boolean) { super(); conns.set(cid + (answerer ? ':b' : ':a'), this); this.on('open', () => { this.open = true }) }
  send(d: any) { if (!this.open) throw new Error('closed'); bc.postMessage({ k: 'data', cid: this.cid, side: this.answerer, d }) }
  close() { if (!this.open) return; this.open = false; bc.postMessage({ k: 'close', cid: this.cid, side: this.answerer }); setTimeout(() => this.emit('close')) }
}
export class FakePeer extends Em {
  id = ''; destroyed = false
  constructor(id?: any) {
    super(); const want = typeof id === 'string' ? id : rid(); const nonce = rid(); let taken = false
    pendingClaims.set(nonce, () => { taken = true }); bc.postMessage({ k: 'claim', id: want, nonce })
    setTimeout(() => { pendingClaims.delete(nonce); if (taken || live.has(want)) this.emit('error', { type: 'unavailable-id', message: want }); else { this.id = want; live.set(want, this); this.emit('open', want) } }, 250)
  }
  connect(to: string) {
    const cid = rid(), c = new FakeConn(cid, to, this, false); let ok = false
    pendingConns.set(cid, () => { ok = true; setTimeout(() => c.emit('open'), 10) }); bc.postMessage({ k: 'conn', to, from: this.id, cid })
    setTimeout(() => { pendingConns.delete(cid); if (!ok) this.emit('error', { type: 'peer-unavailable', message: 'Could not connect to peer ' + to }) }, 400)
    return c
  }
  call(to: string, s: MediaStream) { const mc = new Em() as any; mc.peer = to; mc.close = () => {}; setTimeout(() => mc.emit('stream', s), 300); return mc } // echoes the already-pixelated outgoing stream
  reconnect() {} destroy() { this.destroyed = true; if (live.get(this.id) === this) live.delete(this.id) }
}
