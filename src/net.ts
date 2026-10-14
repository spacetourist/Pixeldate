import Peer, { type DataConnection } from 'peerjs'
import { LOBBY_SLOTS } from './config'
import { FakePeer } from './fakepeer'
export const LOOPBACK = location.search.includes('loopback')
const P: any = LOOPBACK ? FakePeer : Peer
// PeerJS's built-in TURN hosts (eu-0/us-0.turn.peerjs.com) no longer resolve, so set ICE ourselves.
// Add a TURN server at build time with VITE_ICE_SERVERS='[{"urls":"turn:...","username":"..","credential":".."}]'.
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }, ...JSON.parse(import.meta.env.VITE_ICE_SERVERS || '[]')]
const OPTS = { config: { iceServers: ICE } }
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
    const p: Peer = id ? new P(id, OPTS) : new P(OPTS)
    const t = setTimeout(() => { p.destroy(); bad(new Error('timeout')) }, 8000)
    // only fatal until open: a later 'peer-unavailable' (failed knock) must NOT destroy the peer
    const fail = (e: any) => { dlog('open ' + (id || 'peer') + ' failed: ' + e?.type); clearTimeout(t); p.destroy(); bad(e) }
    p.on('open', () => { clearTimeout(t); p.off('error', fail); ok(p) }); p.on('error', fail)
  })
}
function onceData(c: DataConnection, ms: number): Promise<any> {
  return quiet(new Promise((ok, bad) => { const t = setTimeout(() => bad(new Error('timeout')), ms); c.once('data', d => { clearTimeout(t); ok(d) }); c.once('close', () => { clearTimeout(t); bad(new Error('closed')) }) }))
}
/** Mark a promise as handled (callers still see the rejection when they await it). */
function quiet<T>(x: Promise<T>) { x.catch(() => {}); return x }
/** ?debug: log the RTC states of a data connection as they change. */
function watch(c: DataConnection, tag: string) {
  if (!DEBUG || LOOPBACK) return
  const pc = () => (c as any).peerConnection as RTCPeerConnection | undefined
  const on = () => { const x = pc(); if (!x) return void setTimeout(on, 50); const f = () => dlog(`${tag} ice=${x.iceConnectionState} conn=${x.connectionState}`); x.addEventListener('iceconnectionstatechange', f); x.addEventListener('connectionstatechange', f) }
  on()
}
function openConn(p: Peer, id: string, ms = 15000): Promise<DataConnection> {
  return new Promise((ok, bad) => {
    const c = p.connect(id, { reliable: true }); let done = false; watch(c, 'to ' + id.slice(-12))
    const fail = (e: any) => { if (!done) { done = true; p.off('error', pe); c.close(); bad(e) } }
    const pe = (e: any) => { if (e?.type === 'peer-unavailable' && String(e.message).includes(id)) fail(e) }
    p.on('error', pe); setTimeout(() => fail(new Error('timeout')), ms)
    c.on('open', () => { if (!done) { done = true; p.off('error', pe); ok(c) } })
  })
}
/** Queue data until the app attaches its listener (App replays conn.q), so early messages aren't lost. */
const buffer = (c: DataConnection) => { const x = c as any; x.q = []; x.qf = (d: any) => x.q.push(d); c.on('data', x.qf); return c }
/** peer = their personal peer id (for calls); conn may be a lobby-slot connection. */
export interface Match { conn: DataConnection; them: Profile; peer: string }

/** The personal peer: has id pd-<code>, receives the match connection and calls. */
export class Net {
  peer!: Peer; code = ''; busy = false; searching = false
  private slot: Peer | null = null // kept while a match made through it is live
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
      // direct "join with a code"
      c.on('open', async () => {
        try {
          const h = await onceData(c, 10000)
          if (h?.t !== 'hello' || this.busy || !okWith(this.me, h.p, true)) { c.send({ t: 'no' }); setTimeout(() => c.close(), 300); return }
          this.busy = true; this.searching = false; c.send({ t: 'ok', p: this.me }); this.onIncomingByCode?.({ conn: c, them: h.p, peer: c.peer })
        } catch { c.close() }
      })
    })
  }
  async joinCode(code: string): Promise<Match> {
    const c = await openConn(this.peer, 'pd-' + code.trim().toLowerCase(), 8000)
    c.send({ t: 'hello', p: this.me }); const r = await onceData(c, 10000)
    if (r?.t !== 'ok') { c.close(); throw new Error('They are busy or unavailable') }
    this.busy = true; return { conn: c, them: r.p, peer: c.peer }
  }
  cancel() { this.searching = false }
  /** Match over: free the lobby slot it came through. */
  release() { const s = this.slot; this.slot = null; setTimeout(() => s?.destroy(), 600) }
  private lock = false
  /** Random matching: hold one lobby slot for the whole search, and meanwhile knock on the other slots one by one. */
  async find(skipUids: Set<string>, log = dlog): Promise<Match | null> {
    this.searching = true; this.busy = false; this.lock = false; this.slot?.destroy(); this.slot = null
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
    if (won) this.slot = slot; else slot?.destroy() // a match made via my slot uses the slot's connection
    return won
  }
  private async claim(skipUids: Set<string>, win: (m: Match) => void, log: (s: string) => void): Promise<Peer | null> {
    for (let n = 0; n < LOBBY_SLOTS; n++) {
      let slot: Peer
      try { slot = await openPeer(slotId(this.me.iam, this.me.seek, n)) } catch { continue }
      log('claimed ' + slot.id.slice(16))
      slot.on('error', (e: any) => log('slot error ' + e?.type))
      slot.on('connection', c => {
        log('knock from ' + c.peer); watch(c, 'from ' + c.peer)
        const h = onceData(c, 15000) // listen before 'open' so the hello can't be missed
        c.on('open', () => log('open from ' + c.peer))
        ;(async () => {
          const hi = await h
          if (this.lock || !this.searching || hi?.t !== 'hello' || !okWith(this.me, hi.p, false) || skipUids.has(hi.p.uid)) { log('declined ' + (hi?.p?.uid === this.me.uid ? '(same uid)' : '')); c.send({ t: 'no' }); setTimeout(() => c.close(), 500); return }
          this.lock = true; const g = onceData(c, 8000); c.send({ t: 'ok', p: this.me, id: this.peer.id })
          if ((await g)?.t !== 'go') throw new Error('no go')
          win({ conn: buffer(c), them: hi.p, peer: hi.id })
        })().catch((e: any) => { this.lock = false; log('handshake failed ' + (e?.type || e?.message)); c.close() })
      })
      return slot
    }
    log('no free slot'); return null
  }
  private async knock(id: string, skipUids: Set<string>, log: (s: string) => void): Promise<Match | null> {
    if (this.lock) return null
    const c = await openConn(this.peer, id)
    log('open to ' + id.slice(16))
    try {
      const r = onceData(c, 10000); c.send({ t: 'hello', p: this.me, id: this.peer.id }); const a = await r
      if (a?.t !== 'ok' || this.lock || !this.searching || !okWith(this.me, a.p, false) || skipUids.has(a.p.uid)) { log('knock ' + id.slice(16) + ': declined'); c.send({ t: 'bye' }); throw 0 }
      this.lock = true; c.send({ t: 'go' }) // this connection becomes the match connection
      return { conn: buffer(c), them: a.p, peer: a.id }
    } catch (e) { setTimeout(() => c.close(), 500); if (e === 0) return null; throw e }
  }

}
