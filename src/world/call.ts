/* Pixeldate World · the café video call (GD couple/README: the call runs IN the café, the two stay at their table).
   After both tap Start call the server gives the pair one code; the host's phone opens peer pdw-<code>-h and the guest's
   calls it from pdw-<code>-g. Same media rules as the app (src/App.tsx, src/video.ts): the only video track sent is
   PixelCam's canvas, pixelated ON THIS PHONE to the pair's level; the raw camera is shown only here, as the self view.
   ICE: the app's STUN, plus Metered TURN when the build has VITE_METERED_KEY (unchanged; the TURN question is open).
   ?loopback uses the app's FakePeer (tabs in one browser; it echoes your own pixelated stream back as the "partner"). */
import { LB } from '../prefs'
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }]
let ice: Promise<RTCIceServer[]> | null = null
const iceServers = () => ice ||= (async () => {
  const key = import.meta.env.VITE_METERED_KEY as string | undefined
  try { if (!key || LB) throw 0
    const r = await fetch('https://pixeldate.metered.live/api/v1/turn/credentials?apiKey=' + key, { signal: AbortSignal.timeout(4000) })
    const t: RTCIceServer[] = await r.json(); if (!Array.isArray(t)) throw 0; return [...STUN, ...t] } catch { return STUN as RTCIceServer[] }
})()
/** how long the guest keeps dialling while the host's peer comes up */
const DIAL_MS = 30000, RETRY_MS = 900, DIAL_AFTER_MS = 1000
export type CallEnd = 'hangup' | 'lost' | 'media' | 'remote'
export class CafeCall {
  raw: MediaStream | null = null; out: MediaStream | null = null; remote: MediaStream | null = null
  up = false; ended = false; muted = false; camOff = false
  private cam: { setLevel(l: number): void; stop(): void } | null = null; private peer: any = null; private mc: any = null; private t0 = Date.now()
  onUp: () => void = () => {}; onEnd: (why: CallEnd) => void = () => {}; onChange: () => void = () => {}
  constructor(public code: string, public host: boolean, public lv: number) {}
  async start() {
    const md = navigator.mediaDevices
    this.raw = await md?.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: true }).catch(() => md.getUserMedia({ audio: true })).catch(() => null) ?? null
    if (this.ended) return this.stopMedia()
    if (!this.raw) return this.end('media')
    if (this.raw.getVideoTracks().length) { const { PixelCam } = await import('../video'); const c = new PixelCam(this.raw); c.setLevel(this.lv); this.cam = c
      this.out = new MediaStream([...c.out.getVideoTracks(), ...this.raw.getAudioTracks()]) } else this.out = this.raw
    const Peer = LB ? (await import('../fakepeer')).FakePeer : (await import('peerjs')).default
    const servers = await iceServers(); if (this.ended) return this.stopMedia()
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
