/* Pixeldate World · the café piano (v1: solo). One person on the bench picks a piece; the server keeps its start time and
   every client schedules Web Audio against that time (late joiners seek in). Volume falls off with distance from the
   piano and is panned from the mono source; a "Now playing" chip with a remembered mute is shown to everyone. Audio is
   fetched only when a piece is picked or playing (never on café entry): Opus, else AAC. The Audio Engineer's files and
   manifest are in /audio/piano/ (credits in LICENSES.md there). Duets: shared/piano.ts keeps the seats and count-in. */
import { useState } from 'react'
import { PIECES, PIECE, isOriginal, shortTitle, mmss, gainAt, panAt, PIANO_AT, STOP_FADE_S, type Piece } from '../../world/shared/piano.ts'
import { DUET, LEAVE_FADE_S, PREVIEW_SEC, type Part } from '../../world/shared/duet.ts'
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
/** a duet: the two stems start on the same AudioContext time (downbeat − 0.1 s, the stems' built-in lead), the count-in at
    downbeat − countInSec; a part whose player stood up fades out over LEAVE_FADE_S (linear) and keeps running silent */
type DuetPlay = { id: string; at: number; loading: boolean; started: boolean; src: Partial<Record<Part, AudioBufferSourceNode>>; g: Partial<Record<Part, GainNode>>
  count: AudioBufferSourceNode | null; gone: Set<Part>; startCtx?: number }
/** the pick screen's previews: this phone only, one at a time */
type Preview = { id: string; src: AudioBufferSourceNode | null; t0: number }
/** a piece's length: a solo piece, or a duet (its mix when one person plays both parts) */
export const lengthOf = (id: string) => PIECE.get(id)?.durationSec ?? DUET.get(id)?.durationSec ?? 0

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
    if (this.ctx.state !== 'running') void this.ctx.resume().then(() => { this.kick(); this.duetKick() })
    else { this.kick(); this.duetKick() }
  }
  get unlocked() { return this.ctx?.state === 'running' }
  setMuted(m: boolean) { this.muted = m; localStorage.setItem(MUTE_KEY, m ? '1' : '0'); if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.03) }
  /** where I am (tiles): distance volume and pan */
  listen(x: number, y: number) {
    const d = Math.hypot(x - PIANO_AT[0], y - PIANO_AT[1]); this.gain = gainAt(d); this.pan = panAt(PIANO_AT[0] - x)
    if (this.gain > 0 && this.play && !this.play.src) this.fetchIfHeard()
    if (this.gain > 0 && this.duet && !this.duet.started) this.duetFetch()
    if (this.ctx && this.dist && this.panner) { this.dist.gain.setTargetAtTime(this.gain, this.ctx.currentTime, 0.08); this.panner.pan.setTargetAtTime(this.pan, this.ctx.currentTime, 0.08) }
  }
  /** a solo piece, or a duet's mix (Play solo instead: one person plays both parts) */
  url(id: string) { return BASE + (DUET.has(id) ? 'duets/' + id + '_mix' : id) + '.' + this.fmt }
  /** duet files: stems <id>_bass / _melody, count-in countin_<id>, previews preview_<id> */
  durl(name: string) { return BASE + 'duets/' + name + '.' + this.fmt }
  /** fetch + decode one piece (once); the pianist's pick warms it, nothing else does */
  load(id: string, u = this.url(id)) {
    let b = this.buffers.get(id); if (b) return b
    this.requests.push(u)
    b = fetch(u).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))
      .then(a => { const c = this.ctx ?? new OfflineAudioContext(1, 1, 48000); return c.decodeAudioData(a) }).catch(() => { this.buffers.delete(id); return null })
    this.buffers.set(id, b); return b
  }
  /** one-shots (voice emotes, duet pick stingers): small, kept decoded once heard; through the piano's mute (master) */
  private clips = new Map<string, Promise<AudioBuffer | null>>()
  played: { path: string; gain: number; pan: number }[] = []
  clipUrl(path: string) { return import.meta.env.BASE_URL + 'audio/' + path + '.' + this.fmt }
  oneShot(path: string, gain = 1, pan = 0) {
    const c = this.ctx; if (!c || !this.master || gain <= 0.001) return false
    const u = this.clipUrl(path); let b = this.clips.get(u)
    if (!b) { this.requests.push(u); b = fetch(u).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))).then(a => c.decodeAudioData(a)).catch(() => { this.clips.delete(u); return null }); this.clips.set(u, b) }
    this.played.push({ path, gain, pan }); if (this.played.length > 20) this.played.shift()
    void b.then(buf => { if (!buf || c.state !== 'running') return
      const src = c.createBufferSource(), g = c.createGain(), pn = c.createStereoPanner(); src.buffer = buf; g.gain.value = gain; pn.pan.value = pan
      src.connect(g).connect(pn).connect(this.master!); src.start() })
    return true
  }
  /** the server's piano message */
  set(s: PianoState & { why?: string }) {
    const prev = this.state; this.state = { by: s.by, song: s.song, at: s.at }
    if (prev.song === s.song && prev.at === s.at) return
    this.stop(s.why === 'end' ? 0 : STOP_FADE_S)
    if (s.song && (PIECE.has(s.song) || DUET.has(s.song))) { this.play = { id: s.song, at: s.at, src: null, g: null, loading: false }; this.fetchIfHeard() }
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
      const dur = lengthOf(p.id), pos = (this.serverNow() - p.at) / 1000
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
  /** the server's duet view (count / play fix the song and the downbeat; gone = parts whose player stood up mid-song) */
  duet: DuetPlay | null = null
  setDuet(v: { on: boolean; ph?: string; song?: string | null; at?: number; gone?: Part[] }) {
    const live = v.on && (v.ph === 'count' || v.ph === 'play') && !!v.song && DUET.has(v.song) && !!v.at
    const d = this.duet
    if (!live) { if (d) this.duetStop(v.on && v.ph === 'both' && this.duetPos() !== null && this.duetPos()! >= DUET.get(d.id)!.durationSec - 0.2 ? 0 : STOP_FADE_S); return }
    if (!d || d.id !== v.song || d.at !== v.at) { if (d) this.duetStop(STOP_FADE_S)
      this.duet = { id: v.song!, at: v.at!, loading: false, started: false, src: {}, g: {}, count: null, gone: new Set() }; this.duetFetch() }
    const n = this.duet!
    for (const part of v.gone ?? []) if (!n.gone.has(part)) { n.gone.add(part); const g = n.g[part]
      if (g && this.ctx) { const t = this.ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + LEAVE_FADE_S) } }
  }
  /** the two players warm the coin's stems as soon as the reveal says which duet it is */
  warmDuet(id: string) { if (DUET.has(id)) for (const k of ['_bass', '_melody'] as const) void this.load(id + k, this.durl(id + k)); void this.load('countin_' + id, this.durl('countin_' + id)) }
  private duetFetch() {
    const d = this.duet; if (!d || d.started) return
    if (d.loading || this.buffers.has(d.id + '_bass')) { if (this.buffers.has(d.id + '_bass')) this.duetKick(); return }
    if (this.gain <= 0) return
    d.loading = true; this.warmDuet(d.id)
    void Promise.all([this.buffers.get(d.id + '_bass'), this.buffers.get(d.id + '_melody'), this.buffers.get('countin_' + d.id)]).then(() => this.duetKick())
  }
  private duetKick() {
    const d = this.duet, c = this.ctx; if (!d || d.started || !c || c.state !== 'running' || !this.dist) return
    void Promise.all([this.buffers.get(d.id + '_bass'), this.buffers.get(d.id + '_melody'), this.buffers.get('countin_' + d.id)]).then(([bb, mb, cb]) => {
      if (!bb || !mb || this.duet !== d || d.started) return
      const du = DUET.get(d.id)!, lead = du.downbeatOffsetSec
      // server ms → this AudioContext: the downbeat lands at ctx time D; the stems begin `lead` before it
      const D = c.currentTime + (d.at - this.serverNow()) / 1000, s0 = D - lead, now = c.currentTime + 0.02
      d.started = true; if (now - s0 >= du.durationSec) return
      if (cb && D - du.countInSec > now) { const src = c.createBufferSource(); src.buffer = cb; src.connect(this.dist!); src.start(D - du.countInSec); d.count = src }
      const start = Math.max(now, s0), off = start - s0
      for (const [part, buf] of [['bass', bb], ['melody', mb]] as const) {
        const src = c.createBufferSource(), g = c.createGain(); src.buffer = buf
        if (d.gone.has(part)) g.gain.value = 0
        src.connect(g).connect(this.dist!); src.start(start, off); d.src[part] = src; d.g[part] = g
      }
      d.startCtx = s0
      d.src.bass!.onended = () => { if (this.duet === d) { this.duet = null; for (const k of ['_bass', '_melody']) this.buffers.delete(d.id + k) } }
    })
  }
  private duetStop(fade: number) {
    const d = this.duet; this.duet = null; if (!d || !this.ctx) return
    const t = this.ctx.currentTime; d.count?.stop()
    for (const part of ['bass', 'melody'] as const) { const src = d.src[part], g = d.g[part]; if (!src || !g) continue
      if (fade > 0) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade); src.stop(t + fade + 0.02) } else src.stop() }
  }
  /** seconds since the duet's stems began (they lead the downbeat by downbeatOffsetSec), or null */
  duetPos() { const d = this.duet; return d?.started && this.ctx && d.startCtx !== undefined ? this.ctx.currentTime - d.startCtx : null }
  /** test hook: each stem's current gain (1 = playing, 0 = faded out) */
  duetGains() { const d = this.duet; return d ? { bass: d.g.bass?.gain.value ?? null, melody: d.g.melody?.gain.value ?? null, count: !!d.count } : null }

  /** previews (mock I): 8 s, local, through the piano bus (my mute), one at a time; the button never picks */
  pv: Preview | null = null
  pvChange: (() => void) | null = null
  preview(id: string) {
    if (this.pv?.id === id) return this.previewStop()
    this.previewStop(); this.unlock(); const c = this.ctx; if (!c || !this.master || !DUET.has(id)) return
    const p: Preview = { id, src: null, t0: performance.now() }; this.pv = p; this.pvChange?.()
    void this.load('preview_' + id, this.durl('preview_' + id)).then(buf => {
      if (!buf || this.pv !== p) { if (this.pv === p) this.previewStop(); return }
      const src = c.createBufferSource(); src.buffer = buf; src.connect(this.master!); src.start(); p.src = src; p.t0 = performance.now()
      src.onended = () => { if (this.pv === p) { this.pv = null; this.pvChange?.() } }
    })
  }
  previewStop() { const p = this.pv; this.pv = null; if (!p) return; try { p.src?.stop() } catch {} this.pvChange?.() }
  /** 0..1 through the current preview */
  pvFrac() { const p = this.pv; return p ? Math.min(1, (performance.now() - p.t0) / (PREVIEW_SEC * 1000)) : 0 }

  /** seconds into the song as heard here (Web Audio clock), or null; tests compare it across clients */
  pos() { const p = this.play; return p?.src && this.ctx && p.startCtx !== undefined ? this.ctx.currentTime - p.startCtx : null }
}

/** GD's piano picker (piano-picker-390): who's at the piano, the songs (title, composer or "Pixeldate original", length),
    Play <title> (butter) / Stop, and Stand up. */
export function PianoPanel({ mine, playing, near, sel, setSel, onPlay, onStop, onStand, portrait, duetRows, duetFoot }: { mine: boolean; playing: string | null; near: number
  sel: string; setSel: (id: string) => void; onPlay: (id: string) => void; onStop: () => void; onStand: () => void; portrait: React.ReactNode
  /** 2c: the Duets section under the solo songs, and the foot when a duet is selected (Start duet) */
  duetRows?: React.ReactNode; duetFoot?: React.ReactNode }) {
  const isDuet = !PIECE.has(sel) && !!duetRows, pick = PIECE.get(sel) ?? PIECES[0]
  return <section className={'w-panel w-pick' + (duetRows ? ' w-duet' : '')} data-t="w-piano" aria-label="Piano">
    <h2>Piano<button className="w-x" data-t="w-piano-x" aria-label="Stand up" onClick={onStand}>×</button></h2>
    <div className="w-player"><span className="w-av">{portrait}</span>
      <span className="w-pt"><b>You</b><span data-t="w-hear">At the piano · {near} here will hear it</span></span>
      <span className="w-live"><span className="w-pulsed" />{playing ? 'Playing' : 'Seated'}</span></div>
    <div className={duetRows ? 'w-dlist' : undefined}>{duetRows && <p className="sec solo">Solo</p>}<ul className="w-songs songs" role="radiogroup" aria-label="Songs">{PIECES.map(p =>
      <li key={p.id} role="radio" aria-checked={!isDuet && p.id === pick.id} tabIndex={0} className={!isDuet && p.id === pick.id ? 'sel' : undefined} data-t="w-song" data-id={p.id}
        onClick={() => setSel(p.id)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSel(p.id) } }}>
        <span className="rad" /><span><span className="n">{p.title}</span>{isOriginal(p) && <span className="orig" data-t="w-orig">Original</span>}
          <span className="c">{isOriginal(p) ? 'Pixeldate original' : p.composer}</span></span><span className="d">{mmss(p.durationSec)}</span></li>)}</ul>{duetRows}</div>
    {mine && isDuet && !playing ? duetFoot : mine && <div className="w-pick-foot">
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
