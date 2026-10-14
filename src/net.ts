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
/** Every slot I could match with (including my own combo), shuffled. */
function joinSlots(me: Profile) {
  const ids: string[] = []
  for (const g of G[me.seek]) for (const s of SEEKS) if (G[s].includes(me.iam)) for (let n = 0; n < LOBBY_SLOTS; n++) ids.push(slotId(g, s, n))
  return ids.sort(() => Math.random() - 0.5)
}
export const DEBUG = location.search.includes('debug')
let dbgEl: HTMLElement | null = null
export function dlog(s: string) {
  console.log('[lobby]', s); if (!DEBUG) return
  if (!dbgEl) { dbgEl = document.createElement('pre'); dbgEl.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:40vh;overflow:auto;margin:0;padding:4px;font:10px monospace;background:#000c;color:#0f0;z-index:9999;white-space:pre-wrap;pointer-events:none'; document.body.appendChild(dbgEl) }
  dbgEl.textContent = (new Date().toTimeString().slice(0, 8) + ' ' + s + '\n' + dbgEl.textContent).slice(0, 4000)
}
export const blocked = (): string[] => JSON.parse(store.getItem('pd-blocked') || '[]')
export const block = (uid: string) => store.setItem('pd-blocked', JSON.stringify([...new Set([...blocked(), uid])]))
const okWith = (me: Profile, them: Profile, byCode: boolean) => !blocked().includes(them.uid) && them.uid !== me.uid && (byCode || compatible(me, them))

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
function openPeer(id?: string): Promise<Peer> {
  return new Promise((ok, bad) => {
    const p: Peer = id ? new P(id) : new P()
    const t = setTimeout(() => { p.destroy(); bad(new Error('timeout')) }, 8000)
    // only fatal until open: a later 'peer-unavailable' (failed knock) must NOT destroy the peer
    const fail = (e: any) => { dlog('open ' + (id || 'peer') + ' failed: ' + e?.type); clearTimeout(t); p.destroy(); bad(e) }
    p.on('open', () => { clearTimeout(t); p.off('error', fail); ok(p) }); p.on('error', fail)
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
/** Queue data until the app attaches its listener (App replays conn.q), so early messages aren't lost. */
const buffer = (c: DataConnection) => { const x = c as any; x.q = []; x.qf = (d: any) => x.q.push(d); c.on('data', x.qf); return c }
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
      if (w) { this.pending.delete(c.peer); buffer(c); c.on('open', () => w(c)); return } // buffer until the app listens
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
  private lock = false
  /** Random matching: hold one lobby slot for the whole search, and meanwhile knock on the other slots one by one. */
  async find(skipUids: Set<string>, log = dlog): Promise<Match | null> {
    this.searching = true; this.busy = false; this.lock = false
    log('me ' + this.peer.id + ' ' + this.me.iam + '/' + this.me.seek + ' uid ' + this.me.uid.slice(0, 6))
    let slot: Peer | null = null, won: Match | null = null
    const win = (m: Match) => { if (!won) { won = m; this.busy = true; this.searching = false; log('matched ' + m.them.name) } }
    while (this.searching) {
      if (!slot || slot.destroyed || slot.disconnected) { slot?.destroy(); slot = await this.claim(skipUids, win, log) }
      for (const id of joinSlots(this.me)) {
        if (!this.searching) break
        if (id === slot?.id) continue
        const m = await this.knock(id, skipUids, log).catch(e => { log('knock ' + id.slice(16) + ': ' + (e?.type || e?.message)); return null })
        if (m) win(m)
      }
      if (this.searching) await sleep(2000 + Math.random() * 3000)
    }
    const s = slot; setTimeout(() => s?.destroy(), 1500)
    return won
  }
  private async claim(skipUids: Set<string>, win: (m: Match) => void, log: (s: string) => void): Promise<Peer | null> {
    for (let n = 0; n < LOBBY_SLOTS; n++) {
      let slot: Peer
      try { slot = await openPeer(slotId(this.me.iam, this.me.seek, n)) } catch { continue }
      log('claimed ' + slot.id.slice(16))
      slot.on('error', (e: any) => log('slot error ' + e?.type))
      slot.on('connection', c => {
        log('knock from ' + c.peer)
        const h = onceData(c, 8000) // listen before 'open' so the hello can't be missed
        c.on('open', async () => {
          try {
            const hi = await h
            if (this.lock || !this.searching || hi?.t !== 'hello' || !okWith(this.me, hi.p, false) || skipUids.has(hi.p.uid)) { log('declined ' + (hi?.p?.uid === this.me.uid ? '(same uid)' : '')); c.send({ t: 'no' }); return }
            this.lock = true; const g = onceData(c, 6000); c.send({ t: 'ok', p: this.me, id: this.peer.id })
            if ((await g)?.t !== 'go') throw new Error('no go')
            const conn = openConn(this.peer, hi.id, 8000); win({ conn: buffer(await conn), them: hi.p })
          } catch (e: any) { this.lock = false; log('handshake failed ' + (e?.type || e?.message)) }
        })
      })
      return slot
    }
    log('no free slot'); return null
  }
  private async knock(id: string, skipUids: Set<string>, log: (s: string) => void): Promise<Match | null> {
    if (this.lock) return null
    const c = await openConn(this.peer, id, 6000)
    try {
      const r = onceData(c, 5000); c.send({ t: 'hello', p: this.me, id: this.peer.id }); const a = await r
      if (a?.t !== 'ok' || this.lock || !okWith(this.me, a.p, false) || skipUids.has(a.p.uid) || !this.searching) { log('knock ' + id.slice(16) + ': declined'); c.send({ t: 'bye' }); return null }
      this.lock = true
      try {
        const conn = await new Promise<DataConnection>((ok, bad) => { this.pending.set(a.id, ok); c.send({ t: 'go' }); setTimeout(() => { this.pending.delete(a.id); bad(new Error('no callback')) }, 10000) })
        return { conn, them: a.p }
      } catch (e) { this.lock = false; throw e }
    } finally { setTimeout(() => c.close(), 500) }
  }

}
