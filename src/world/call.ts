/* Pixeldate World · the café video call (GD couple/README: the call runs IN the café, the two stay at their table).
   After both tap Start call the server gives the pair one code; the host's phone opens peer pdw-<code>-h and the guest's
   calls it from pdw-<code>-g. Same media rules as the app (src/App.tsx, src/video.ts): the only video track sent is
   PixelCam's canvas, pixelated ON THIS PHONE to the pair's level; the raw camera is shown only here, as the self view.
   ICE: the app's STUN, plus Cloudflare TURN from the world server's GET /turn (invite-gated, rate-limited, capped to the
   free plan; world/src/turn.ts). If that fetch fails or the month's TURN budget is spent, the call uses STUN only.
   ?loopback uses the app's FakePeer (tabs in one browser; it echoes your own pixelated stream back as the "partner"). */
import { LB } from '../prefs'
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }]
export type TurnFrom = { url: string; invite: string; uid: string }
type Ice = { servers: RTCIceServer[]; turn: boolean }
/** /turn on the same host as the café socket (wss://h → https://h/turn) */
export const turnUrl = (ws: string) => ws.replace(/^ws/, 'http').replace(/\/+$/, '') + '/turn'
/** TURN credentials last an hour; reuse them for 50 min (each fetch counts against the month's budget). Failures aren't kept. */
const REUSE_MS = 50 * 60_000
let ice: { at: number; p: Promise<Ice> } | null = null
const isTurn = (s: RTCIceServer) => ([] as string[]).concat(s.urls as any).some(u => /^turns?:/.test(u))
export function iceServers(from?: TurnFrom): Promise<Ice> {
  if (ice && Date.now() - ice.at < REUSE_MS) return ice.p
  const p = (async (): Promise<Ice> => {
    try { if (!from || LB) throw 0
      const r = await fetch(from.url + '?p=' + encodeURIComponent(from.uid), { headers: { 'x-pd-invite': from.invite }, signal: AbortSignal.timeout(4000) })
      const j = await r.json(), t: RTCIceServer[] = Array.isArray(j?.iceServers) ? j.iceServers.filter(isTurn) : []
      return t.length ? { servers: [...STUN, ...t], turn: true } : { servers: STUN, turn: false } } catch { return { servers: STUN, turn: false } }
  })()
  const e = ice = { at: Date.now(), p }; void p.then(x => { if (!x.turn && ice === e) ice = null })
  return p
}
/** how long the guest keeps dialling while the host's peer comes up */
const DIAL_MS = 30000, RETRY_MS = 900, DIAL_AFTER_MS = 1000
export type CallEnd = 'hangup' | 'lost' | 'media' | 'remote'
export class CafeCall {
  raw: MediaStream | null = null; out: MediaStream | null = null; remote: MediaStream | null = null
  up = false; ended = false; muted = false; camOff = false
  /** false when this call had no TURN relay (fetch failed or budget spent): a failed call then shows a quiet note */
  relay = true
  private cam: { setLevel(l: number): void; stop(): void } | null = null; private peer: any = null; private mc: any = null; private t0 = Date.now()
  onUp: () => void = () => {}; onEnd: (why: CallEnd) => void = () => {}; onChange: () => void = () => {}
  constructor(public code: string, public host: boolean, public lv: number, public from?: TurnFrom) {}
  async start() {
    const md = navigator.mediaDevices
    this.raw = await md?.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: true }).catch(() => md.getUserMedia({ audio: true })).catch(() => null) ?? null
    if (this.ended) return this.stopMedia()
    if (!this.raw) return this.end('media')
    if (this.raw.getVideoTracks().length) { const { PixelCam } = await import('../video'); const c = new PixelCam(this.raw); c.setLevel(this.lv); this.cam = c
      this.out = new MediaStream([...c.out.getVideoTracks(), ...this.raw.getAudioTracks()]) } else this.out = this.raw
    const Peer = LB ? (await import('../fakepeer')).FakePeer : (await import('peerjs')).default
    const ic = await iceServers(this.from); this.relay = ic.turn; const servers = ic.servers; if (this.ended) return this.stopMedia()
    const me = `pdw-${this.code}-${this.host ? 'h' : 'g'}`, them = `pdw-${this.code}-${this.host ? 'g' : 'h'}`
    const p = this.peer = new (Peer as any)(me, { config: { iceServers: servers } })
    p.on('error', (e: any) => { if (this.ended) return
      if (e?.type === 'peer-unavailable' && !this.host && !this.up && Date.now() - this.t0 < DIAL_MS) { try { this.mc?.close() } catch {} this.mc = null; setTimeout(() => this.dial(them), RETRY_MS) }
      else if (e?.type !== 'peer-unavailable') this.end('lost') })
    p.on('open', () => { if (!this.host) setTimeout(() => this.dial(them), DIAL_AFTER_MS) })   // give the host's peer a moment to come up
    if (this.host) p.on('call', (mc: any) => { if (mc.peer !== them || this.mc) { try { mc.close() } catch {} return } mc.answer(this.out); this.hook(mc) })
  }
  private dial(them: string) { if (this.ended || this.up || this.mc) return; this.hook(this.peer.call(them, this.out!)) }
  private hook(mc: any) {
    this.mc = mc
    mc.on('stream', (s: MediaStream) => { if (this.ended) return; this.remote = s; this.onChange(); if (!this.up) { this.up = true; this.onUp() } })
    mc.on('close', () => { if (this.up) this.end('lost') })
    const pc: RTCPeerConnection | undefined = mc.peerConnection
    pc?.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.end('lost') })
  }
  setLevel(l: number) { this.lv = l; this.cam?.setLevel(l) }
  setMuted(m: boolean) { this.muted = m; for (const t of this.raw?.getAudioTracks() ?? []) t.enabled = !m; this.onChange() }
  setCamOff(o: boolean) { this.camOff = o; for (const t of this.out?.getVideoTracks() ?? []) t.enabled = !o; this.onChange() }
  private stopMedia() { this.cam?.stop(); for (const t of this.raw?.getTracks() ?? []) t.stop(); for (const t of this.out?.getTracks() ?? []) t.stop() }
  /** hang up / the link dropped / the server says it ended: everything stops, once */
  end(why: CallEnd) {
    if (this.ended) return; this.ended = true
    try { this.mc?.close() } catch {} try { this.peer?.destroy() } catch {}
    this.stopMedia(); this.onEnd(why)
  }
}
