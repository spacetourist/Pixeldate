import { useEffect, useMemo, useRef, useState } from 'react'
import type { MediaConnection } from 'peerjs'
import { LEVELS, METER, DEV_SKIP_STAGE } from './config'
import { localDeck, cardById, type QuestionSource } from './deck'
import { pixelatePhoto, loadImage, animateReveal } from './pixel'
import { mountReveal } from './reveal'
import { PixelCam } from './video'
type Kind = 'voice' | 'video'
/** What we send on a call: pixelated video + mic, or mic only. */
type Media = { stream: MediaStream; out: MediaStream; setLevel(l: number): void; stop(): void }
import { Net, block, type Profile, type Gender, type Seek, type Match } from './net'

const B = import.meta.env.BASE_URL
const deck: QuestionSource = localDeck
const Ic = ({ n, s = 16 }: { n: string; s?: number }) => <i className="ic" style={{ width: s * 2, height: s * 2, WebkitMaskImage: `url(${B}px/icons/${s}/${n}.svg)`, maskImage: `url(${B}px/icons/${s}/${n}.svg)` }} />
// per tab, so two tabs in one browser are different people
const uid = () => { let u = sessionStorage.getItem('pd-uid'); if (!u) { u = crypto.randomUUID(); sessionStorage.setItem('pd-uid', u) } return u }
const AV = (k: 'a' | 'b' | 'c', big = false) => `${B}px/hero/avatar-${k}-${big ? '32' : '18'}@2x.png`
// hidden dev tools (level-skip request): ?dev=1 (remembered for the session) or long-press the level badge
if (/[?&]dev=1/.test(location.search)) sessionStorage.setItem('pd-dev', '1')
const isDev = () => sessionStorage.getItem('pd-dev') === '1'
/** Boot splash: heart resolves through logo-1..5 (200 ms steps), holds to 1200 ms, steps out by 1400 ms. */
function Splash({ ready }: { ready: boolean }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const [t, setT] = useState(reduce ? 4 : 0); const [out, setOut] = useState(false); const [gone, setGone] = useState(false)
  const r = useRef(ready); r.current = ready
  useEffect(() => {
    if (reduce) { const a = setTimeout(() => setOut(true), 600), b = setTimeout(() => setGone(true), 800); return () => { clearTimeout(a); clearTimeout(b) } }
    const t0 = performance.now(); let id = 0
    const tick = () => { const e = performance.now() - t0; setT(Math.floor(e / 200)); if (e >= 1200 && r.current) { setOut(true); setTimeout(() => setGone(true), 200); return } id = window.setTimeout(tick, 50) }
    tick(); return () => clearTimeout(id)
  }, [])
  if (gone) return null
  const f = Math.min(t, 4), lit = t <= 4 ? t + 1 : (t % 5) + 1 // after 1200 ms while not ready: loop the loader
  return <div className={`splash dither ${out ? 'out' : ''}`} data-t="splash" data-frame={f + 1}>
    {[1, 2, 3, 4, 5].map(n => <img key={n} src={`${B}px/logo/logo-${n}.svg`} width={244} height={36} style={{ display: n === f + 1 ? 'block' : 'none' }} alt={n === 5 ? 'pixeldate' : ''} />)}
    <p className="px-label mauve">GET CLOSER TO SEE CLEARER</p>
    <div className="load">{[1, 2, 3, 4, 5].map(n => <i key={n} className={n <= lit ? 'on' : ''} />)}</div>
  </div>
}
const NoEntry = () => <svg className="noentry" viewBox="0 0 14 14" width={28} height={28} shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M6 0h1v1h-1zM7 0h1v1h-1zM3 1h1v1h-1zM4 1h1v1h-1zM5 1h1v1h-1zM6 1h1v1h-1zM7 1h1v1h-1zM8 1h1v1h-1zM9 1h1v1h-1zM10 1h1v1h-1zM2 2h1v1h-1zM3 2h1v1h-1zM4 2h1v1h-1zM5 2h1v1h-1zM8 2h1v1h-1zM9 2h1v1h-1zM10 2h1v1h-1zM11 2h1v1h-1zM1 3h1v1h-1zM2 3h1v1h-1zM3 3h1v1h-1zM4 3h1v1h-1zM10 3h1v1h-1zM11 3h1v1h-1zM12 3h1v1h-1zM1 4h1v1h-1zM2 4h1v1h-1zM3 4h1v1h-1zM4 4h1v1h-1zM5 4h1v1h-1zM11 4h1v1h-1zM12 4h1v1h-1zM1 5h1v1h-1zM2 5h1v1h-1zM4 5h1v1h-1zM5 5h1v1h-1zM6 5h1v1h-1zM11 5h1v1h-1zM12 5h1v1h-1zM0 6h1v1h-1zM1 6h1v1h-1zM5 6h1v1h-1zM6 6h1v1h-1zM7 6h1v1h-1zM12 6h1v1h-1zM13 6h1v1h-1zM0 7h1v1h-1zM1 7h1v1h-1zM6 7h1v1h-1zM7 7h1v1h-1zM8 7h1v1h-1zM12 7h1v1h-1zM13 7h1v1h-1zM1 8h1v1h-1zM2 8h1v1h-1zM7 8h1v1h-1zM8 8h1v1h-1zM9 8h1v1h-1zM11 8h1v1h-1zM12 8h1v1h-1zM1 9h1v1h-1zM2 9h1v1h-1zM8 9h1v1h-1zM9 9h1v1h-1zM10 9h1v1h-1zM11 9h1v1h-1zM12 9h1v1h-1zM1 10h1v1h-1zM2 10h1v1h-1zM3 10h1v1h-1zM9 10h1v1h-1zM10 10h1v1h-1zM11 10h1v1h-1zM12 10h1v1h-1zM2 11h1v1h-1zM3 11h1v1h-1zM4 11h1v1h-1zM5 11h1v1h-1zM8 11h1v1h-1zM9 11h1v1h-1zM10 11h1v1h-1zM11 11h1v1h-1zM3 12h1v1h-1zM4 12h1v1h-1zM5 12h1v1h-1zM6 12h1v1h-1zM7 12h1v1h-1zM8 12h1v1h-1zM9 12h1v1h-1zM10 12h1v1h-1zM6 13h1v1h-1zM7 13h1v1h-1z" /></svg>
/** "This is how they'll meet you": plays the 5-level reveal for a freshly picked photo (local only). */
function PhotoReveal({ src, onConfirm, onChange }: { src: string; onConfirm: () => void; onChange: () => void }) {
  const box = useRef<HTMLDivElement>(null); const [ready, setReady] = useState(false)
  useEffect(() => { let off = () => {}, dead = false; setReady(false)
    loadImage(src).then(img => { if (!dead && box.current) off = mountReveal(box.current, img, setReady) })
    return () => { dead = true; off() } }, [src])
  return <div className="reveal">
    <header className="rv-bar"><span className="kicker">CREATE YOUR PROFILE</span><span className="steps" aria-label="Step 2 of 3"><i className="on" /><i className="on" /><i /></span></header>
    <div className="copy"><h1 className="h1">This is how they'll meet you.</h1><p className="read m">Every answer you share together brings you into focus.</p></div>
    <div ref={box} className="rv-box" data-t="reveal" />
    <div className={`rv-acts ${ready ? '' : 'hid'}`}>
      <button className="px-frame px-btn" data-t="photo-confirm" onClick={onConfirm}><span className="px-btn__label">Looks good, continue</span></button>
      <button className="ghost" type="button" data-t="photo-change" onClick={onChange}>CHANGE PHOTO</button></div>
  </div>
}
type Msg = { from: 'me' | 'them' | 'sys'; text?: string; card?: string }
type Ans = Record<string, { me?: string; them?: string }>

function Meter({ level, pct }: { level: number; pct: number }) {
  return <div className="px-meter">{LEVELS.map((_, i) => i + 1 < level || level === 5 ? <i key={i} className="is-full" /> : i + 1 === level ? <i key={i} style={{ ['--f' as any]: Math.floor(pct / 10) }} /> : <i key={i} />)}</div>
}

function Onboard({ onDone }: { onDone: (p: Profile, photo: string) => void }) {
  const [name, setName] = useState(''); const [photo, setPhoto] = useState(''); const [okPhoto, setOkPhoto] = useState(false); const fileIn = useRef<HTMLInputElement>(null); const [adult, setAdult] = useState(false)
  const [iam, setIam] = useState<Gender>('man'); const [seek, setSeek] = useState<Seek>('everyone')
  const [age, setAge] = useState(30); const [min, setMin] = useState(18); const [max, setMax] = useState(99)
  const [cam, setCam] = useState<MediaStream | null>(null); const vid = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (cam && vid.current) { vid.current.srcObject = cam; vid.current.play() } }, [cam])
  const snap = () => { const v = vid.current!, c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d')!.drawImage(v, 0, 0); setPhoto(c.toDataURL('image/jpeg', .9)); setOkPhoto(false); cam!.getTracks().forEach(t => t.stop()); setCam(null) }
  const file = (f?: File) => { if (f) { const r = new FileReader(); r.onload = () => { setPhoto(String(r.result)); setOkPhoto(false) }; r.readAsDataURL(f) } }
  const ok = name.trim() && photo && okPhoto && adult && age >= 18 && min <= max
  const input = <input ref={fileIn} type="file" accept="image/*" hidden data-t="gallery" onChange={e => { file(e.target.files?.[0]); e.target.value = '' }} />
  if (photo && !okPhoto) return <div className="screen scroll">{input}<PhotoReveal src={photo} onConfirm={() => setOkPhoto(true)} onChange={() => fileIn.current?.click()} /></div>
  return <div className="screen scroll">{input}
    <header className="bar"><img src={`${B}px/logo/logo-2.svg`} alt="pixeldate" /></header>
    <h1 className="h2">Create your profile</h1>
    <label className="px-label lab">NAME</label>
    <input className="px-frame px-input fld" value={name} maxLength={20} onChange={e => setName(e.target.value)} placeholder="Your first name" data-t="name" />
    <label className="px-label lab">PHOTO</label>
    <div className="photo-row">
      <div className="thumb">{cam ? <video ref={vid} muted playsInline /> : photo ? <img src={photo} /> : <img src={AV('a', true)} className="ph" />}</div>
      <div className="col">
        {cam ? <button className="px-frame px-btn-small" onClick={snap}>SNAP</button>
          : <button className="px-frame px-btn-ghost" onClick={async () => { try { setCam(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })) } catch { alert('No camera') } }}>CAMERA</button>}
        <button className="px-frame px-btn-ghost" onClick={() => fileIn.current?.click()}>{photo ? 'CHANGE' : 'GALLERY'}</button>
      </div>
    </div>
    <div className="grid2">
      <div><label className="px-label lab">I AM</label>
        <select className="px-frame px-input fld" value={iam} onChange={e => setIam(e.target.value as Gender)} data-t="iam"><option value="man">A man</option><option value="woman">A woman</option></select></div>
      <div><label className="px-label lab">MY AGE</label>
        <input className="px-frame px-input fld" type="number" min={18} max={99} value={age} onChange={e => setAge(+e.target.value)} data-t="age" /></div>
    </div>
    <label className="px-label lab">I'D LIKE TO MEET</label>
    <select className="px-frame px-input fld" value={seek} onChange={e => setSeek(e.target.value as Seek)} data-t="seek"><option value="men">Men</option><option value="women">Women</option><option value="everyone">Everyone</option></select>
    <label className="px-label lab">AGED</label>
    <div className="grid2">
      <input className="px-frame px-input fld" type="number" min={18} max={99} value={min} onChange={e => setMin(+e.target.value)} data-t="min" />
      <input className="px-frame px-input fld" type="number" min={18} max={99} value={max} onChange={e => setMax(+e.target.value)} data-t="max" />
    </div>
    <label className="tick read"><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} data-t="adult" /><span className="px-frame box">{adult && <Ic n="check" s={8} />}</span> I am 18 or over</label>
    <button className="px-frame px-btn" disabled={!ok} data-t="start" onClick={() => onDone({ name: name.trim(), age, min, max, iam, seek, uid: uid() }, photo)}><span className="px-btn__label">Continue</span></button>
  </div>
}

export default function App() {
  const [me, setMe] = useState<Profile | null>(null); const [photo, setPhoto] = useState<HTMLImageElement | null>(null)
  const net = useRef<Net | null>(null); const [code, setCode] = useState('')
  const [screen, setScreen] = useState<'onboard' | 'lobby' | 'finding' | 'match'>('onboard')
  const [notice, setNotice] = useState(''); const [joinCode, setJoinCode] = useState('')
  const [m, setM] = useState<Match | null>(null)
  const skip = useRef(new Set<string>())

  // match state
  const [level, setLevel] = useState(1); const [pct, setPct] = useState(0)
  const [taps, setTaps] = useState({ me: false, them: false }); const [ans, setAns] = useState<Ans>({})
  const [credited, setCredited] = useState<string[]>([]); const [msgs, setMsgs] = useState<Msg[]>([])
  const [tab, setTab] = useState<'profile' | 'chat' | 'call'>('profile'); const [draft, setDraft] = useState('')
  const [answering, setAnswering] = useState<string | null>(null)
  const theirImgs = useRef<Record<number, HTMLImageElement>>({}); const shown = useRef<HTMLImageElement | null>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const [call, setCall] = useState<{ cam: Media; mc: MediaConnection; kind: Kind; remote?: MediaStream } | null>(null)
  const [ring, setRing] = useState<{ dir: 'in' | 'out'; kind: Kind } | null>(null); const [muted, setMuted] = useState(false); const [camOff, setCamOff] = useState(false)
  const ready = useRef<{ cam: Media; kind: Kind } | null>(null) // media grabbed on accept, used when their call arrives
  const [dev, setDev] = useState(isDev); const matchedAt = useRef(''); const lp = useRef(0) // long-press on the level badge toggles dev tools
  const myAv = useMemo(() => photo ? pixelatePhoto(photo, 1) : AV('a'), [photo])
  const [skipReq, setSkip] = useState<'in' | 'out' | null>(null)
  const st = useRef({ level, taps, pct, call, m, ring, skipReq }); st.current = { level, taps, pct, call, m, ring, skipReq }

  const send = (d: any) => { try { st.current.m?.conn.send(d) } catch {} }
  /* PRIVACY GUARANTEE: everything leaving this device is already reduced to the shared level.
   - Photo: pixelatePhoto() sends a `blocks` x `blocks` image (never the original), re-sent when the level changes.
   - Video: the only video track sent is PixelCam's canvas.captureStream(), whose canvas is `blocks` px wide.
   - Levels: my level rises only after I consented locally (my tap / my skip request or my accept) AND the
     other side did; a remote message alone can never raise it. 'drop' messages are only accepted if lower. */
  const sendPhoto = (l: number) => { if (photo) send({ t: 'photo', level: l, data: pixelatePhoto(photo, l) }) }

  const start = async (p: Profile, ph: string) => {
    setMe(p); setPhoto(await loadImage(ph)); setScreen('lobby')
    const n = new Net(p); net.current = n; await n.start(); setCode(n.code)
    n.onIncomingByCode = mm => beginMatch(mm)
    n.peer.on('call', async mc => {
      if (mc.peer !== st.current.m?.peer) { mc.close(); return }
      const r = ready.current; ready.current = null; if (!r) { mc.close(); return } // only calls we accepted
      r.cam.setLevel(st.current.level); mc.answer(r.cam.out); hookCall(r.cam, mc, r.kind)
    })
  }
  // permissions are only requested here, when a call is accepted / answered
  const getCam = async (kind: Kind): Promise<Media | null> => {
    try {
      if (kind === 'voice') { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); return { stream: s, out: s, setLevel() {}, stop: () => s.getTracks().forEach(t => t.stop()) } }
      const c = new PixelCam(await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: true })); (window as any).__pdCam = c
      return { stream: c.stream, out: new MediaStream([...c.out.getVideoTracks(), ...c.stream.getAudioTracks()]), setLevel: l => c.setLevel(l), stop: () => c.stop() }
    } catch { alert(kind === 'voice' ? 'Microphone unavailable' : 'Camera unavailable'); return null }
  }
  const hookCall = (cam: Media, mc: MediaConnection, kind: Kind) => {
    setRing(null); setMuted(false); setCamOff(false); setTab('call')
    setCall({ cam, mc, kind }); mc.on('stream', s => setCall(c => c && { ...c, remote: s })); mc.on('close', () => endCall(false))
  }
  const requestCall = (kind: Kind) => { setRing({ dir: 'out', kind }); send({ t: 'callreq', kind }) }
  const cancelRing = () => { setRing(null); send({ t: 'callcancel' }) }
  const acceptCall = async () => {
    const r = st.current.ring; if (!r) return; const cam = await getCam(r.kind)
    if (!cam) { setRing(null); send({ t: 'callans', ok: false }); return }
    ready.current = { cam, kind: r.kind }; setRing(null); send({ t: 'callans', ok: true }); setTab('call')
  }
  const declineCall = () => { setRing(null); send({ t: 'callans', ok: false }) }
  const onCallAns = async (ok: boolean) => {
    const r = st.current.ring; if (r?.dir !== 'out') return
    if (!ok) { setRing(null); setMsgs(x => [...x, { from: 'sys', text: 'CALL DECLINED' }]); return }
    const cam = await getCam(r.kind); if (!cam || !st.current.m) { setRing(null); send({ t: 'endcall' }); return }
    cam.setLevel(st.current.level); hookCall(cam, net.current!.peer.call(st.current.m.peer, cam.out, { metadata: { kind: r.kind } }), r.kind)
  }
  const toggleMute = () => { const v = !muted; call?.cam.stream.getAudioTracks().forEach(t => t.enabled = !v); setMuted(v) }
  const toggleCam = () => { const v = !camOff; call?.cam.out.getVideoTracks().forEach(t => t.enabled = !v); setCamOff(v) }
  const endCall = (tell = true) => { setRing(null); const r = ready.current; ready.current = null; r?.cam.stop(); const c = st.current.call; if (!c) return; c.cam.stop(); c.mc.close(); setCall(null); if (tell) send({ t: 'endcall' }) }
  useEffect(() => { call?.cam.setLevel(level) }, [level, call])

  const find = async () => {
    setScreen('finding'); setNotice('')
    const mm = await net.current!.find(skip.current)
    if (mm) beginMatch(mm); else setScreen(s => s === 'finding' ? 'lobby' : s)
  }
  const doJoin = async () => {
    try { setNotice('Connecting…'); beginMatch(await net.current!.joinCode(joinCode)) } catch (e: any) { setNotice(e.message || 'Could not connect') }
  }
  const beginMatch = (mm: Match) => {
    theirImgs.current = {}; shown.current = null
    setLevel(1); setPct(0); setTaps({ me: false, them: false }); setAns({}); setCredited([]); setMsgs([]); setTab('profile'); setAnswering(null); setSkip(null); matchedAt.current = new Date().toTimeString().slice(0, 5)
    setM(mm); setScreen('match')
    mm.conn.on('data', onData); const x = mm.conn as any; if (x.qf) { mm.conn.off('data', x.qf); x.q.forEach(onData) } mm.conn.on('close', () => leave('They left the match.'))
  }
  const leave = (why: string, again = false) => {
    endCall(false); const c = st.current.m; if (!c) return; st.current.m = null; setM(null)
    setTimeout(() => { try { c.conn.close() } catch {} }, 300); net.current!.busy = false; net.current!.release()
    setNotice(why); setScreen('lobby'); if (again) setTimeout(find, 50)
  }
  const doSkip = (blk = false) => { const t = st.current.m?.them; if (!t) return; if (blk) block(t.uid); skip.current.add(t.uid); send({ t: 'skip' }); leave(blk ? 'Blocked. Finding someone new.' : 'Skipped. Finding someone new.', true) }

  useEffect(() => { if (m) sendPhoto(level) }, [m, level])
  // meter: time together
  useEffect(() => { if (!m || level === 5) return; const t = setInterval(() => setPct(p => Math.min(100, p + METER.percentPerMinute / 60)), 1000); return () => clearInterval(t) }, [m, level])
  // card credit when BOTH answered
  useEffect(() => { for (const [id, a] of Object.entries(ans)) if (a.me && a.them && !credited.includes(id)) { setCredited(c => [...c, id]); setPct(p => Math.min(100, p + METER.cardBonus)); setMsgs(x => [...x, { from: 'sys', text: `${cardById(id)!.id.replace(/L\dQ/, 'Q')} ANSWERED +${METER.cardBonus}%` }]) } }, [ans])
  const raise = (from: number) => { setLevel(l => l === from && l < 5 ? l + 1 : l); setPct(0); setTaps({ me: false, them: false }) }
  useEffect(() => { if (taps.me && taps.them) raise(level) }, [taps])

  function onData(d: any) {
    const s = st.current
    switch (d?.t) {
      case 'chat': setMsgs(x => [...x, { from: 'them', text: d.text }]); break
      case 'card': setMsgs(x => [...x, { from: 'them', card: d.id }]); break
      case 'ans': setAns(a => ({ ...a, [d.id]: { ...a[d.id], them: d.text } })); break
      case 'tap': if (d.level === s.level) setTaps(t => ({ ...t, them: true })); break
      case 'drop': if (!(d.level >= 1 && d.level < s.level)) break; setLevel(d.level); setPct(0); setTaps({ me: false, them: false }); setMsgs(x => [...x, { from: 'sys', text: `${s.m?.them.name.toUpperCase()} LOWERED TO ${LEVELS[d.level - 1].name.toUpperCase()}` }]); break
      case 'photo': loadImage(d.data).then(img => { if (d.level === st.current.level) (window as any).__pd = { photoW: img.naturalWidth, photoH: img.naturalHeight }; theirImgs.current[d.level] = img; if (d.level === st.current.level) paint(img) }); break
      case 'skip': leave('They moved on. Finding someone new.', true); break
      case 'skipreq': if (DEV_SKIP_STAGE && d.level === s.level && s.level < 5) setSkip('in'); break
      case 'skipans': if (st.current.skipReq === 'out' && d.ok && d.level === s.level) raise(s.level); setSkip(null); if (!d.ok) setMsgs(x => [...x, { from: 'sys', text: 'SKIP DECLINED' }]); break
      case 'endcall': endCall(false); break
      case 'callreq': if (st.current.call) send({ t: 'callans', ok: false }); else setRing({ dir: 'in', kind: d.kind === 'voice' ? 'voice' : 'video' }); break
      case 'callcancel': setRing(r => r?.dir === 'in' ? null : r); break
      case 'callans': onCallAns(!!d.ok); break
    }
  }
  const paint = (img: HTMLImageElement) => {
    const c = cv.current; if (!c) { shown.current = img; return }
    const prev = shown.current; shown.current = img
    if (prev && img.naturalWidth > prev.naturalWidth) animateReveal(c, prev, img); else animateReveal(c, null, img)
  }
  useEffect(() => { const i = theirImgs.current[level]; if (i) paint(i) }, [level])
  useEffect(() => { if (tab === 'profile' && shown.current && cv.current) animateReveal(cv.current, null, shown.current) }, [tab, screen])

  const used = new Set(Object.keys(ans).filter(k => ans[k].me && ans[k].them))
  const card = level < 6 ? deck.next(Math.min(level, 5), used) : null
  const answer = (id: string, text: string) => { setAns(a => ({ ...a, [id]: { ...a[id], me: text } })); send({ t: 'ans', id, text }); setAnswering(null) }
  const tapReveal = () => { if (pct < 100 || level === 5) return; setTaps(t => ({ ...t, me: true })); send({ t: 'tap', level }) }
  const drop = () => { if (level === 1) return; const l = level - 1; setLevel(l); setPct(0); setTaps({ me: false, them: false }); send({ t: 'drop', level: l }) }
  const chat = () => { if (!draft.trim()) return; send({ t: 'chat', text: draft }); setMsgs(x => [...x, { from: 'me', text: draft }]); setDraft('') }
  const dropCard = (id: string) => { send({ t: 'card', id }); setMsgs(x => [...x, { from: 'me', card: id }]); setTab('chat') }

  const remoteV = useRef<HTMLVideoElement>(null); const localV = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (remoteV.current && call?.remote) { remoteV.current.srcObject = call.remote; remoteV.current.play().catch(() => {}) } if (localV.current && call) { localV.current.srcObject = call.kind === 'video' ? call.cam.stream : null; localV.current.play().catch(() => {}) } }, [call, tab])

  if (screen === 'onboard') return <div className="app px"><Onboard onDone={start} /><Splash ready /></div>

  const Q = ({ id, inChat }: { id: string; inChat?: boolean; key?: any }) => {
    const q = cardById(id)!; const a = ans[id] || {}; const both = a.me && a.them
    return <div className={`px-frame px-card px-qcard qcard ${both ? 'px-card--hot' : ''}`} data-t="card" data-card={id}>
      <div className="px-qcard__top"><span className="px-frame px-tag">{LEVELS[q.level - 1].name.toUpperCase()} · Q{q.index}</span>
        <span className="px-qcard__meta"><Ic n="sparkle" s={8} />{both || q.level === 1 || q.level === 3 || q.level === 5 ? `+${METER.cardBonus}%` : `+${METER.cardBonus}% TOGETHER`}</span></div>
      <p className="px-qcard__q">{q.text}</p>
      {both && <p className="answers px-label">YOU: <b className="px-cream">{a.me}</b><br />{m?.them.name.toUpperCase()}: <b className="px-cream">{a.them}</b></p>}
      {answering === id ? <form className="ansrow" onSubmit={e => { e.preventDefault(); const v = (e.currentTarget.elements[0] as HTMLInputElement).value.trim(); if (v) answer(id, v) }}>
        <input className="px-frame px-input fld" autoFocus placeholder="Your answer" data-t="ans-input" /><button className="px-frame px-btn-small" data-t="ans-send">SEND</button></form>
        : <div className="px-qcard__foot">
          <span className={`px-av ${a.them ? 'on' : ''}`} data-t="dot-them"><img src={a.them ? AV('b') : `${B}px/sprites/avatar-empty-18.png`} />{a.them && <img className="px-tick" src={`${B}px/sprites/tick.png`} />}</span>
          <span className={`px-av ${a.me ? 'on' : ''}`} data-t="dot-me"><img src={a.me ? AV('a') : `${B}px/sprites/avatar-empty-18.png`} />{a.me && <img className="px-tick" src={`${B}px/sprites/tick.png`} />}</span>
          <span className="px-label">{both ? 'BOTH ANSWERED' : a.them ? `${m?.them.name.toUpperCase()} ANSWERED` : a.me ? 'WAITING' : 'NEW CARD'}</span>
          {!a.me && <button className={`px-frame ${inChat ? 'px-btn-small' : 'px-btn-ghost'}`} data-t="answer" onClick={() => setAnswering(id)}>ANSWER</button>}
          {!inChat && a.me && !both && <button className="px-frame px-btn-ghost" onClick={() => dropCard(id)}>TO CHAT</button>}
        </div>}
    </div>
  }
  const lv = LEVELS[level - 1], nx = LEVELS[level]
  const askSkip = () => { setSkip('out'); send({ t: 'skipreq', level }) }
  const ansSkip = (ok: boolean) => { setSkip(null); send({ t: 'skipans', ok, level }); if (ok) raise(level) } // my accept = my consent
  const skipBar = !DEV_SKIP_STAGE || !dev || level >= 5 ? null : skipReq === 'in' ? <div className="px-frame px-card ringin" data-t="skip-in"><p className="px-text"><b className="px-coral">{m?.them.name}</b> wants to skip to {nx?.name}</p>
      <div className="row2"><button className="px-frame px-btn-small" data-t="skip-accept" onClick={() => ansSkip(true)}>ACCEPT</button><button className="px-frame px-btn-ghost" data-t="skip-decline" onClick={() => ansSkip(false)}>DECLINE</button></div></div>
    : skipReq === 'out' ? <p className="px-label" data-t="skip-out">ASKED TO SKIP TO {nx?.name.toUpperCase()}… WAITING</p>
    : <button className="px-frame px-btn-ghost callbar" data-t="skip-stage" onClick={askSkip}>DEV · SKIP TO {nx?.name.toUpperCase()}</button>
  const them = m?.them.name || ''
  const callBar = call ? <button className="px-frame px-btn-ghost callbar" data-t="to-call" onClick={() => setTab('call')}><Ic n="call" s={8} /> IN CALL · OPEN</button>
    : ring?.dir === 'in' ? <div className="px-frame px-card ringin" data-t="ring-in"><p className="px-text"><b className="px-coral">{them}</b> wants a {ring.kind} call</p>
      <div className="row2"><button className="px-frame px-btn-small" data-t="call-accept" onClick={acceptCall}>ACCEPT</button><button className="px-frame px-btn-ghost" data-t="call-decline" onClick={declineCall}>DECLINE</button></div></div>
    : ring ? <div className="px-frame px-card ringin" data-t="ring-out"><p className="px-text">Calling {them} ({ring.kind})… waiting for them to accept</p><button className="px-frame px-btn-ghost" onClick={cancelRing}>CANCEL</button></div>
    : <div className="row2 callbar"><button className="px-frame px-btn-small" data-t="call-voice" onClick={() => requestCall('voice')}><Ic n="call" s={8} /> VOICE CALL</button>
      <button className="px-frame px-btn-small" data-t="call-video" onClick={() => requestCall('video')}><Ic n="call" s={8} /> VIDEO CALL</button></div>
  const press = () => { lp.current = window.setTimeout(() => { const v = !dev; sessionStorage.setItem('pd-dev', v ? '1' : ''); setDev(v) }, 800) }
  const unpress = () => clearTimeout(lp.current)
  const theirAv = theirImgs.current[level]?.src || AV('b', true)
  return <div className="app px">
    {screen !== 'match' ? <div className="screen scroll home">
      <header className="bar"><img src={`${B}px/logo/logo-2.svg`} alt="pixeldate" /><img className="av" src={myAv} alt="" /></header>
      <div className="stage">
        <img src={`${B}px/hero/hero-dusk@2x.png`} width={390} height={300} alt="" />
        <span className="px-frame px-chip chip"><Ic n="heart" s={8} /> {me!.seek === 'everyone' ? 'EVERYONE' : me!.seek.toUpperCase()} · {me!.min}–{me!.max}</span>
        {screen === 'finding' && <div className="sprite" data-t="finding" />}
      </div>
      <div className="copy">{screen === 'finding' ? <><h1 className="h1">Finding someone…</h1><p className="read m">Hang tight. As soon as someone is free, you'll both start as Strangers.</p></>
        : <><h1 className="h1">Hi {me!.name},<br />ready to meet?</h1><p className="read m">We'll pair you with someone at random. You both start as Strangers: 8 blocks.</p></>}</div>
      {notice && <p className="px-label px-coral-l">{notice.toUpperCase()}</p>}
      {screen === 'finding' ? <button className="px-frame px-btn big" data-t="cancel" onClick={() => { net.current!.cancel(); setScreen('lobby') }}><span className="px-btn__label">Cancel</span></button>
        : <button className="px-frame px-btn big" data-t="find" disabled={!code} onClick={find}><Ic n="matches" /><span className="px-btn__label">{code ? 'Find someone' : 'Connecting…'}</span></button>}
      <div className="ladder"><div className="mtop"><span className="px-label-b px-cream">STRANGER</span><span className="px-label">LV 1 OF 5</span></div><Meter level={1} pct={0} /></div>
      <div className="px-frame px-card codecard">
        <p className="px-label">MEETING A FRIEND? <b className="px-cream" data-t="code">{code ? code.toUpperCase() : '…'}</b></p>
        <div className="ansrow"><input className="px-frame px-input fld" value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="Friend's code" data-t="joincode" />
          <button className="px-frame px-btn-small" onClick={doJoin} data-t="join">JOIN</button></div>
      </div>
      <p className="px-label safe"><Ic n="lock" s={8} /> 18+ · SKIP OR BLOCK ANYTIME</p>
    </div> : <div className="screen">
      <header className="top">
        <img className="av l" src={theirAv} alt="" />
        <div className="who"><div className="px-text">{them}, {m!.them.age}</div>
          <div className="sub"><span className="px-label-b px-coral" data-t="lvbadge" onPointerDown={press} onPointerUp={unpress} onPointerLeave={unpress} onContextMenu={e => e.preventDefault()}>{lv.name.toUpperCase()}{dev ? ' · DEV' : ''}</span>
            <span className="mini">{LEVELS.map((_, i) => <i key={i} className={i + 1 < level || level === 5 ? 'f' : i + 1 === level && pct >= 50 ? 'h' : ''} />)}</span></div></div>
        <button className="px-frame px-btn-ghost sk" data-t="skip" onClick={() => doSkip()}>SKIP</button>
        <button className="px-frame px-iconbtn ib" title={`Block ${them}`} aria-label={`Block ${them}`} data-t="block" onClick={() => confirm(`Block ${them} and never match again?`) && doSkip(true)}><NoEntry /></button>
      </header>
      {ring?.dir === 'in' && tab !== 'call' ? callBar : call && tab !== 'call' ? callBar : null}
      {(tab !== 'profile' || skipReq === 'in') && skipBar}
      <div className="body scroll">
        {tab === 'profile' && <>
          <div className="px-frame px-card prof">
            <div className="photo"><canvas ref={cv} width={480} height={480} data-t="their-photo" />
              <span className="px-frame px-chip chip"><Ic n="heart" s={8} /> LV {level} · {lv.name.toUpperCase()}</span>
              <div className="px-frame px-plate plate"><span className="px-title">{m!.them.name}, {m!.them.age}</span></div></div>
            <div className="meterrow">
              <div className="mtop"><b className="px-label-b px-cream">{lv.name.toUpperCase()}</b>{nx && <span className="px-label">{Math.floor(pct)}% TO <b className="px-coral">{nx.name.toUpperCase()}</b></span>}</div>
              <div className="mtop"><Meter level={level} pct={pct} /><button className="px-label linkbtn" data-t="drop" disabled={level === 1} onClick={drop}>LOWER LEVEL <Ic n="chevron" s={8} /></button></div>
            </div>
          </div>
          {card && Q({ id: card.id })}
          {taps.them && !taps.me && <p className="px-text px-coral-l hint"><Ic n="heart" s={8} /> {m!.them.name} has tapped. Your turn</p>}
          {taps.me && !taps.them && <p className="px-text px-muted hint">Waiting for {m!.them.name} to tap…</p>}
          {level < 5 && (pct >= 100
            ? <button className="px-frame px-btn" data-t="reveal" data-state="ready" onClick={tapReveal} disabled={taps.me}><Ic n="sparkle" /><span className="px-btn__label">Reveal more</span><span className="px-btn__meta lbl-ink">{nx?.name.toUpperCase()}</span></button>
            : <button className="px-frame px-btn px-btn--locked" data-t="reveal" data-state="locked"><Ic n="lock" /><span className="px-btn__label">Reveal more</span><span className="px-btn__meta">{Math.floor(pct)}%</span></button>)}
        </>}
        {tab === 'chat' && <div className="chat">
          <p className="px-meta day">MATCHED · {matchedAt.current}</p>
          {<p className="px-label sys"><Ic n="sparkle" s={8} /> NOW AT <b className="px-coral">{lv.name.toUpperCase()}</b> · {lv.blocks || 'FULL'}{lv.blocks ? ' BLOCKS' : ''}</p>}
          {msgs.map((x, i) => x.from === 'sys' ? <p key={i} className="px-label sys">{x.text}</p>
            : x.card ? <div key={i}>{Q({ id: x.card, inChat: true })}</div> : <div key={i} className={`px-frame px-bubble ${x.from === 'me' ? 'px-bubble--me me' : ''} bub msg`} data-t={'msg-' + x.from}>{x.text}</div>)}
        </div>}
        {tab === 'call' && <div className="call">
          {call ? <>
            <div className="remote">{call.kind === 'video' ? <video ref={remoteV} playsInline data-t="remote-video" />
              : <>{theirImgs.current[level] && <img className="avatar" src={theirImgs.current[level].src} />}<video ref={remoteV} playsInline data-t="remote-audio" className="hid" /></>}
              {!call.remote && <p className="px-label">CONNECTING…</p>}
              <span className="px-frame px-chip chip">LV {level} · {lv.name.toUpperCase()}</span></div>
            {call.kind === 'video' && <video ref={localV} className="self" muted playsInline />}
            <div className="row3">
              <button className="px-frame px-btn-small" data-t="mute" onClick={toggleMute}>{muted ? 'UNMUTE' : 'MUTE'}</button>
              {call.kind === 'video' && <button className="px-frame px-btn-small" data-t="cam-off" onClick={toggleCam}>{camOff ? 'CAM ON' : 'CAM OFF'}</button>}
              <button className="px-frame px-btn-small hang" data-t="hangup" onClick={() => endCall()}>HANG UP</button></div>
            <div className="row2"><button className="px-frame px-btn-ghost" data-t="call-reveal" disabled={pct < 100 || level === 5 || taps.me} onClick={tapReveal}>REVEAL MORE {pct < 100 ? Math.floor(pct) + '%' : ''}</button>
              <button className="px-frame px-btn-ghost" data-t="call-drop" disabled={level === 1} onClick={drop}>LOWER LEVEL</button></div>
            {taps.them && !taps.me && <p className="px-text px-coral-l hint">{them} has tapped. Your turn</p>}
            {card && Q({ id: card.id })}
          </> : <>
            {callBar}
            <p className="meta">Pixelated on your phone before it's sent: {them} sees you at {lv.name}. They accept first.</p></>}
        </div>}
      </div>
      {tab === 'chat' && level === 1 && card && msgs.length === 0 && !Object.keys(ans).length && <div className="pinned" data-t="pinned-card">{Q({ id: card.id, inChat: true })}</div>}
      {tab === 'chat' && <form className="composer" onSubmit={e => { e.preventDefault(); chat() }}>
        <input className="px-frame px-input fld" value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Message ${them}`} data-t="chat-input" />
        <button className="px-frame px-iconbtn" data-t="chat-send"><Ic n="send" /></button></form>}
      <nav className="px-nav nav">
        {(['profile', 'chat', 'call'] as const).map(t => <a key={t} className={tab === t ? 'on' : ''} data-t={'tab-' + t} onClick={() => setTab(t)}><Ic n={t === 'profile' ? 'matches' : t} />{t === 'profile' ? 'MATCH' : t === 'chat' ? 'CHAT' : 'CALL'}</a>)}
      </nav>
    </div>}
  </div>
}
