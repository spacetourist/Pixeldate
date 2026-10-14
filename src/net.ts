import Peer, { type DataConnection } from 'peerjs'
import { LOBBY_SLOTS } from './config'
import { FakePeer } from './fakepeer'
export const LOOPBACK = location.search.includes('loopback')
const P: any = LOOPBACK ? FakePeer : Peer
export const store = LOOPBACK ? sessionStorage : localStorage

export type Gender = 'man' | 'woman'
export type Seek = 'men' | 'women' | 'everyone'
export interface Profile { name: string; age: number; min: number; max: number; iam: Gender; seek: Seek; uid: string }

const G: Record<Seek, Gender[]> = { men: ['man'], women: ['woman'], everyone: ['man', 'woman'] }
const SEEKS: Seek[] = ['men', 'women', 'everyone']
export const wants = (a: Profile, b: Profile) => G[a.seek].includes(b.iam) && b.age >= a.min && b.age <= a.max
export const compatible = (a: Profile, b: Profile) => wants(a, b) && wants(b, a)
const slotId = (g: Gender, s: Seek, n: number) => `pixeldate-lobby-${g}-${s}-${n}`
/** Slots held by people I could match: their gender is one I seek, and they seek my gender. */
function joinSlots(me: Profile) {
  const ids: string[] = []
  for (const g of G[me.seek]) for (const s of SEEKS) if (G[s].includes(me.iam)) for (let n = 0; n < LOBBY_SLOTS; n++) ids.push(slotId(g, s, n))
  return ids.sort(() => Math.random() - 0.5)
}
export const blocked = (): string[] => JSON.parse(store.getItem('pd-blocked') || '[]')
export const block = (uid: string) => store.setItem('pd-blocked', JSON.stringify([...new Set([...blocked(), uid])]))
const okWith = (me: Profile, them: Profile, byCode: boolean) => !blocked().includes(them.uid) && them.uid !== me.uid && (byCode || compatible(me, them))

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
function openPeer(id?: string): Promise<Peer> {
  return new Promise((ok, bad) => {
    const p: Peer = id ? new P(id) : new P()
    const t = setTimeout(() => { p.destroy(); bad(new Error('timeout')) }, 8000)
    p.on('open', () => { clearTimeout(t); ok(p) }); p.on('error', e => { clearTimeout(t); p.destroy(); bad(e) })
  })
}
function onceData(c: DataConnection, ms: number): Promise<any> {
  return new Promise((ok, bad) => { const t = setTimeout(() => bad(new Error('timeout')), ms); c.once('data', d => { clearTimeout(t); ok(d) }); c.once('close', () => { clearTimeout(t); bad(new Error('closed')) }) })
}
function openConn(p: Peer, id: string, ms = 5000): Promise<DataConnection> {
  return new Promise((ok, bad) => {
    const c = p.connect(id, { reliable: true }); let done = false
    const fail = (e: any) => { if (!done) { done = true; p.off('error', pe); c.close(); bad(e) } }
    const pe = (e: any) => { if (e?.type === 'peer-unavailable' && String(e.message).includes(id)) fail(e) }
    p.on('error', pe); setTimeout(() => fail(new Error('timeout')), ms)
    c.on('open', () => { if (!done) { done = true; p.off('error', pe); ok(c) } })
  })
}
export interface Match { conn: DataConnection; them: Profile }

/** The personal peer: has id pd-<code>, receives the match connection and calls. */
export class Net {
  peer!: Peer; code = ''; busy = false; searching = false
  private pending = new Map<string, (c: DataConnection) => void>()
  onIncomingByCode?: (m: Match) => void
  me: Profile
  constructor(me: Profile) { this.me = me }
  async start() {
    for (;;) {
      this.code = Math.random().toString(36).slice(2, 8)
      try { this.peer = await openPeer('pd-' + this.code); break } catch { await sleep(500) }
    }
    this.peer.on('disconnected', () => { try { this.peer.reconnect() } catch {} })
    this.peer.on('connection', async c => {
      const w = this.pending.get(c.peer)
      if (w) { this.pending.delete(c.peer); c.on('open', () => w(c)); return }
      // direct "join with a code"
      c.on('open', async () => {
        try {
          const h = await onceData(c, 5000)
          if (h?.t !== 'hello' || this.busy || !okWith(this.me, h.p, true)) { c.send({ t: 'no' }); setTimeout(() => c.close(), 300); return }
          this.busy = true; this.searching = false; c.send({ t: 'ok', p: this.me }); this.onIncomingByCode?.({ conn: c, them: h.p })
        } catch { c.close() }
      })
    })
  }
  async joinCode(code: string): Promise<Match> {
    const c = await openConn(this.peer, 'pd-' + code.trim().toLowerCase(), 8000)
    c.send({ t: 'hello', p: this.me }); const r = await onceData(c, 6000)
    if (r?.t !== 'ok') { c.close(); throw new Error('They are busy or unavailable') }
    this.busy = true; return { conn: c, them: r.p }
  }
  cancel() { this.searching = false }
  /** Random matching through well-known lobby slots on the public PeerJS server. */
  async find(skipUids: Set<string>, log = (_: string) => {}): Promise<Match | null> {
    this.searching = true; this.busy = false
    while (this.searching) {
      // 1) knock on every compatible slot at once; first compatible holder wins
      let winner: { c: DataConnection; r: any } | null = null
      const tries = joinSlots(this.me).map(async id => {
        const c = await openConn(this.peer, id, 7000)
        try {
          c.send({ t: 'hello', p: this.me, id: this.peer.id })
          const r = await onceData(c, 4000)
          if (r?.t !== 'ok' || !okWith(this.me, r.p, false) || skipUids.has(r.p.uid) || winner || !this.searching) throw new Error('no')
          winner = { c, r }; return winner
        } catch (e) { try { c.send({ t: 'bye' }) } catch {}; setTimeout(() => c.close(), 200); throw e }
      })
      log('scan ' + tries.length); const w = await Promise.any(tries).catch(() => null); log('scan done ' + !!w)
      if (w && this.searching) {
        try {
          const conn = await new Promise<DataConnection>((ok, bad) => { this.pending.set(w.r.id, ok); w.c.send({ t: 'go' }); setTimeout(() => bad(new Error('timeout')), 8000) })
          w.c.close(); this.busy = true; this.searching = false; log('joined ' + w.c.peer); return { conn, them: w.r.p }
        } catch { w.c.close() }
      } else if (w) w.c.close()
      await Promise.allSettled(tries)
      if (!this.searching) return null
      // 2) nobody compatible waiting: claim a slot of my own and wait there
      let slot: Peer | null = null
      for (let n = 0; n < LOBBY_SLOTS && !slot; n++) { try { slot = await openPeer(slotId(this.me.iam, this.me.seek, n)) } catch {} }
      if (!slot) { await sleep(1500 + Math.random() * 1500); continue }
      log('waiting in ' + slot.id)
      const m = await new Promise<Match | null>(done => {
        let taken = false
        const end = setTimeout(() => done(null), 6000 + Math.random() * 6000)
        const stop = setInterval(() => { if (!this.searching) { clearTimeout(end); clearInterval(stop); done(null) } }, 300)
        slot!.on('connection', c => c.on('open', async () => {
          try {
            const h = await onceData(c, 4000)
            if (taken || h?.t !== 'hello' || !okWith(this.me, h.p, false) || skipUids.has(h.p.uid)) { c.send({ t: 'no' }); return }
            taken = true; c.send({ t: 'ok', p: this.me, id: this.peer.id })
            const g = await onceData(c, 5000); if (g?.t !== 'go') { taken = false; return }
            const conn = await openConn(this.peer, h.id, 6000)
            clearTimeout(end); clearInterval(stop); done({ conn, them: h.p })
          } catch { taken = false }
        }))
      })
      slot.destroy() // free the slot for others
      if (m) { this.busy = true; this.searching = false; return m }
    }
    return null
  }
}
