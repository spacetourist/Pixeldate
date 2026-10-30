/* Pixeldate World · the café piano (v1: solo). One person on the bench picks a piece; the server keeps its start time and
   every client schedules Web Audio against that time (late joiners seek in). Volume falls off with distance from the
   piano and is panned from the mono source; a "Now playing" chip with a remembered mute is shown to everyone. Audio is
   fetched only when a piece is picked or playing (never on café entry): Opus, else AAC. The Audio Engineer's files and
   manifest are in /audio/piano/ (credits in LICENSES.md there). Duets: shared/piano.ts keeps the seats and count-in. */
import { useState } from 'react'
import { PIECES, PIECE, isOriginal, shortTitle, mmss, gainAt, panAt, PIANO_AT, STOP_FADE_S, type Piece } from '../../world/shared/piano.ts'
import speakerOn from './art/markers/speaker-on.png'
import speakerOff from './art/markers/speaker-off.png'

export const PIANO_CREDIT = 'Piano samples: VSCO 2 Community Edition (Versilian Studios / Ivy Audio), CC0'
const BASE = import.meta.env.BASE_URL + 'audio/piano/'
const MUTE_KEY = 'pd.pianoMute'
/** test-only: ?skew=ms (localhost) pretends this device's clock is off by that much, to prove the clock sync */
const SKEW = (() => { const v = +(new URLSearchParams(location.search).get('skew') ?? 0); return /^(127\.0\.0\.1|localhost)$/.test(location.hostname) && Number.isFinite(v) ? v : 0 })()
const localNow = () => Date.now() + SKEW

export type PianoState = { by: number; song: string | null; at: number }
type Play = { id: string; at: number; src: AudioBufferSourceNode | null; g: GainNode | null; loading: boolean; startCtx?: number }

export class PianoAudio {
  ctx: AudioContext | null = null
  /** server clock = local clock + offset (best of the pings by round trip) */
  offset = 0; rtt = Infinity
  muted = localStorage.getItem(MUTE_KEY) === '1'
  gain = 0; pan = 0
  requests: string[] = []
  state: PianoState = { by: 0, song: null, at: 0 }
  private buffers = new Map<string, Promise<AudioBuffer | null>>()
  private play: Play | null = null
  private dist: GainNode | null = null; private panner: StereoPannerNode | null = null; private master: GainNode | null = null
  private fmt: 'ogg' | 'm4a' = (() => { try { return new Audio().canPlayType('audio/ogg; codecs=opus') ? 'ogg' : 'm4a' } catch { return 'm4a' } })()
  constructor(private send: (o: object) => void) {}
  serverNow() { return localNow() + this.offset }
  /** server ms → this page's performance.now() time base (the renderer's clock) */
  perfAt(serverMs: number) { return performance.now() + (serverMs - this.serverNow()) }
  /** five pings a join; replies are { t:'tm', c, s } */
  sync() { for (let i = 0; i < 5; i++) setTimeout(() => this.send({ t: 'tm', c: localNow() }), i * 150) }
  onTm(m: { c: number; s: number }) {
    const t = localNow(), rtt = t - m.c; if (rtt < 0 || rtt > 5000) return
    if (rtt <= this.rtt) { this.rtt = rtt; this.offset = m.s + rtt / 2 - t }
  }
  /** a server 'hi' / 'piano' carries its clock too: a first guess until the pings come back */
  hint(serverMs: number) { if (this.rtt === Infinity) this.offset = serverMs - localNow() }
  /** the first tap or key in the café: browsers only let sound start from a user gesture */
  unlock() {
    if (!this.ctx) { try { this.ctx = new AudioContext({ latencyHint: 'playback' }) } catch { return }
      const c = this.ctx; this.master = c.createGain(); this.panner = c.createStereoPanner(); this.dist = c.createGain()
      this.dist.connect(this.panner).connect(this.master).connect(c.destination); this.master.gain.value = this.muted ? 0 : 1; this.dist.gain.value = this.gain }
    if (this.ctx.state !== 'running') void this.ctx.resume().then(() => this.kick())
    else this.kick()
  }
  get unlocked() { return this.ctx?.state === 'running' }
  setMuted(m: boolean) { this.muted = m; localStorage.setItem(MUTE_KEY, m ? '1' : '0'); if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.03) }
  /** where I am (tiles): distance volume and pan */
  listen(x: number, y: number) {
    const d = Math.hypot(x - PIANO_AT[0], y - PIANO_AT[1]); this.gain = gainAt(d); this.pan = panAt(PIANO_AT[0] - x)
    if (this.gain > 0 && this.play && !this.play.src) this.fetchIfHeard()
    if (this.ctx && this.dist && this.panner) { this.dist.gain.setTargetAtTime(this.gain, this.ctx.currentTime, 0.08); this.panner.pan.setTargetAtTime(this.pan, this.ctx.currentTime, 0.08) }
  }
  url(id: string) { return BASE + id + '.' + this.fmt }
  /** fetch + decode one piece (once); the pianist's pick warms it, nothing else does */
  load(id: string) {
    let b = this.buffers.get(id); if (b) return b
    const u = this.url(id); this.requests.push(u)
    b = fetch(u).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))
      .then(a => { const c = this.ctx ?? new OfflineAudioContext(1, 1, 48000); return c.decodeAudioData(a) }).catch(() => { this.buffers.delete(id); return null })
    this.buffers.set(id, b); return b
  }
  /** the server's piano message */
  set(s: PianoState & { why?: string }) {
    const prev = this.state; this.state = { by: s.by, song: s.song, at: s.at }
    if (prev.song === s.song && prev.at === s.at) return
    this.stop(s.why === 'end' ? 0 : STOP_FADE_S)
    if (s.song && PIECE.has(s.song)) { this.play = { id: s.song, at: s.at, src: null, g: null, loading: false }; this.fetchIfHeard() }
  }
  /** lazy: a song is only fetched by people in earshot; walking into range later fetches it and seeks in */
  private fetchIfHeard() {
    const p = this.play; if (!p || p.loading || this.gain <= 0 || this.buffers.has(p.id)) { if (p && this.buffers.has(p.id)) this.kick(); return }
    p.loading = true; void this.load(p.id).then(() => { if (this.play === p) p.loading = false; this.kick() })
  }
  /** (re)start the current song at the right place, once it's loaded and sound is unlocked */
  private kick() {
    const p = this.play, c = this.ctx; if (!p || p.src || !c || c.state !== 'running' || !this.dist) return
    void this.buffers.get(p.id)?.then(buf => {
      if (!buf || this.play !== p || p.src) return
      const dur = PIECE.get(p.id)!.durationSec, pos = (this.serverNow() - p.at) / 1000
      if (pos >= dur) return
      const src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; src.connect(g).connect(this.dist!)
      if (pos < 0) src.start(c.currentTime - pos); else src.start(c.currentTime, pos)
      src.stop(c.currentTime + (dur - pos) + 0.05)
      src.onended = () => { if (this.play === p) { this.play = null; this.buffers.delete(p.id) } }   // the song is over: free its buffer
      p.src = src; p.g = g; p.startCtx = c.currentTime - pos
    })
  }
  private stop(fade: number) {
    const p = this.play; this.play = null; if (!p) return
    if (p.src && p.g && this.ctx) { const t = this.ctx.currentTime
      if (fade > 0) { p.g.gain.setValueAtTime(p.g.gain.value, t); p.g.gain.linearRampToValueAtTime(0, t + fade); p.src.stop(t + fade + 0.02) } else p.src.stop() }
  }
  /** seconds into the song as heard here (Web Audio clock), or null; tests compare it across clients */
  pos() { const p = this.play; return p?.src && this.ctx && p.startCtx !== undefined ? this.ctx.currentTime - p.startCtx : null }
}

/** GD's piano picker (piano-picker-390): who's at the piano, the songs (title, composer or "Pixeldate original", length),
    Play <title> (butter) / Stop, and Stand up. */
export function PianoPanel({ mine, playing, near, sel, setSel, onPlay, onStop, onStand, portrait }: { mine: boolean; playing: string | null; near: number
  sel: string; setSel: (id: string) => void; onPlay: (id: string) => void; onStop: () => void; onStand: () => void; portrait: React.ReactNode }) {
  const pick = PIECE.get(sel) ?? PIECES[0]
  return <section className="w-panel w-pick" data-t="w-piano" aria-label="Piano">
    <h2>Piano<button className="w-x" data-t="w-piano-x" aria-label="Stand up" onClick={onStand}>×</button></h2>
    <div className="w-player"><span className="w-av">{portrait}</span>
      <span className="w-pt"><b>You</b><span data-t="w-hear">At the piano · {near} here will hear it</span></span>
      <span className="w-live"><span className="w-pulsed" />{playing ? 'Playing' : 'Seated'}</span></div>
    <ul className="w-songs" role="radiogroup" aria-label="Songs">{PIECES.map(p =>
      <li key={p.id} role="radio" aria-checked={p.id === pick.id} tabIndex={0} className={p.id === pick.id ? 'sel' : undefined} data-t="w-song" data-id={p.id}
        onClick={() => setSel(p.id)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSel(p.id) } }}>
        <span className="rad" /><span><span className="n">{p.title}</span>{isOriginal(p) && <span className="orig" data-t="w-orig">Original</span>}
          <span className="c">{isOriginal(p) ? 'Pixeldate original' : p.composer}</span></span><span className="d">{mmss(p.durationSec)}</span></li>)}</ul>
    {mine && <div className="w-pick-foot">
      {playing ? <button className="w-btn" data-t="w-piano-stop" onClick={onStop}>Stop {shortTitle(PIECE.get(playing)!)}</button>
        : <button className="w-btn" data-t="w-piano-play" onClick={() => onPlay(pick.id)}>Play {shortTitle(pick)}</button>}
      <button className="w-btn ghost" data-t="w-piano-stand" onClick={onStand}>Stand up</button></div>}
    <p className="w-credit" data-t="w-credit">{PIANO_CREDIT}</p>
  </section>
}
/** GD's "Now playing" chip + mute toggle (speaker art at 3x in a 40x36 button), shown to everyone while a song plays. */
export function NowPlaying({ piece, by, muted, onMute }: { piece: Piece; by: string; muted: boolean; onMute: () => void }) {
  return <div className="w-np" data-t="w-np"><span className="w-chip"><span aria-hidden="true">♪</span> Now playing: <b data-t="w-np-title">{shortTitle(piece)}</b><span className="by">· {by}</span></span>
    <button className={'w-mute' + (muted ? ' off' : '')} data-t="w-mute" aria-pressed={muted} aria-label={muted ? 'Unmute the piano' : 'Mute the piano'} onClick={onMute}>
      <img src={muted ? speakerOff : speakerOn} alt="" width={33} height={27} /></button></div>
}
export function usePianoSel() { return useState(PIECES[0].id) }
