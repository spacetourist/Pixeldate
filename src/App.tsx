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
/** Block button hidden for now (Callum); logic (block(), doSkip(true)) stays. */
const SHOW_BLOCK = false
const qn = (id: string) => 'Q' + (cardById(id)?.index ?? '')
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
/** Inline pixel tick: no mask-image fetch, so it paints in the same frame as the state change (Android Chrome bug). */
const TickMark = () => <svg className="tickmark" width="16" height="16" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M6 1h1v2H6zM5 3h1v1H5zM4 4h1v1H4zM3 5h1v1H3zM1 3h1v2H1zM2 5h1v1H2zM2 4h1v1H2z" /></svg>
const clampAge = (n: number) => Math.max(18, Math.min(99, Math.round(n) || 18))
/** Age field: free text while editing (can be empty), clamped to 18-99 on blur. */
function AgeField({ value, onChange, t }: { value: number; onChange: (n: number) => void; t: string }) {
  const [txt, setTxt] = useState(String(value))
  useEffect(() => { if (txt !== '' && +txt !== value) setTxt(String(value)) }, [value])
  return <input className="px-frame px-input fld" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={txt} data-t={t}
    onChange={e => { const v = e.target.value.replace(/\D/g, ''); setTxt(v); if (v) onChange(+v) }}
    onBlur={() => { const n = clampAge(+txt); setTxt(String(n)); onChange(n) }} />
}
type Msg = { from: 'me' | 'them' | 'sys'; text?: string; card?: string; pair?: string }
type Ans = Record<string, { me?: string; them?: string }>

function Meter({ level, pct }: { level: number; pct: number }) {
  return <div className="px-meter">{LEVELS.map((_, i) => i + 1 < level || level === 5 ? <i key={i} className="is-full" /> : i + 1 === level ? <i key={i} style={{ ['--f' as any]: Math.floor(pct / 10) }} /> : <i key={i} />)}</div>
}

/** Meter that ticks up one art px (10%) at a time from `from` to `to` after the card flip. */
function TickMeter({ level, from, to }: { level: number; from: number; to: number }) {
  const [p, setP] = useState(from)
  useEffect(() => { setP(from); let v = from; const t0 = setTimeout(() => { const i = setInterval(() => { v = Math.min(to, v + 10); setP(v); if (v >= to) clearInterval(i) }, 90) }, 450); return () => clearTimeout(t0) }, [from, to])
  return <div className="tick-meter"><Meter level={level} pct={p} /><span className="px-label-b px-coral">+{METER.cardBonus}%</span></div>
}
const AGE_TOP = 70 // slider top; 70 means "70+" (no upper limit, see wants() in net.ts)
function Banner() {
  const u = (x: string, e: string) => `${B}px/img/create-profile-banner${x}.${e}`
  const set = (e: string) => `${u('', e)} 1x, ${u('@2x', e)} 2x, ${u('@3x', e)} 3x`
  return <div className="px-frame cp-banner" data-t="banner"><picture>
    <source type="image/webp" srcSet={set('webp')} /><img src={u('', 'png')} srcSet={set('png')} width={412} height={200} alt="" /></picture>
    <div className="cp-ov"><h1 className="cp-h">Create your profile</h1><p className="cp-s">Stay pixelated until you choose.</p></div></div>
}
/** Segmented radio pair: real radio inputs, so arrow keys / screen readers work natively. */
function Seg({ name, value, opts, onChange, label }: { name: string; value: string; opts: [string, string][]; onChange: (v: string) => void; label: string }) {
  return <div className="seg" role="radiogroup" aria-labelledby={label}>{opts.map(([v, l]) =>
    <label key={v} className={'px-frame seg-o' + (value === v ? ' on' : '')} data-t={name + '-' + v}>
      <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} /><span>{l}</span></label>)}</div>
}
/** One track, two thumbs (two native ranges stacked). Thumbs can't cross; 70 = 70+. */
function AgeRange({ min, max, onChange }: { min: number; max: number; onChange: (a: number, b: number) => void }) {
  const f = (n: number) => (n - 18) / (AGE_TOP - 18) * 100, show = (n: number) => n >= AGE_TOP ? AGE_TOP + '+' : String(n)
  return <div className="range" style={{ ['--lo' as any]: f(min) + '%', ['--hi' as any]: f(max) + '%' }}>
    <div className="range-h"><span className="px-label">AGED</span><span className="px-label-b px-coral" data-t="range-val" aria-live="polite">{show(min)} – {show(max)}</span></div>
    <div className="range-t"><i />
      <input type="range" min={18} max={AGE_TOP} value={min} aria-label="Minimum age" data-t="min" onChange={e => onChange(Math.min(+e.target.value, max), max)} />
      <input type="range" min={18} max={AGE_TOP} value={max} aria-label="Maximum age" aria-valuetext={show(max)} data-t="max" onChange={e => onChange(min, Math.max(+e.target.value, min))} /></div>
  </div>
}
/** After upload: the photo at each level, pre-pixelated (same pixelateCanvas as what's sent), tap for full screen. */
function Minis({ src, onChange }: { src: string; onChange: () => void }) {
  const [urls, setUrls] = useState<string[]>([]); const [open, setOpen] = useState<number | null>(null)
  useEffect(() => { let live = true; loadImage(src).then(im => { if (live) setUrls(LEVELS.map((_, i) => pixelatePhoto(im, i + 1))) }); return () => { live = false } }, [src])
  useEffect(() => { if (open === null) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); if (e.key === 'ArrowRight') setOpen(o => Math.min(4, (o ?? 0) + 1)); if (e.key === 'ArrowLeft') setOpen(o => Math.max(0, (o ?? 0) - 1)) }
    history.pushState({ pdViewer: 1 }, ''); const pop = () => setOpen(null)
    addEventListener('keydown', k); addEventListener('popstate', pop)
    return () => { removeEventListener('keydown', k); removeEventListener('popstate', pop) } }, [open === null])
  const close = () => { if (history.state?.pdViewer) history.back(); else setOpen(null) }
  let x0 = 0
  return <div className="minis-wrap">
    <div className="minis" data-t="minis">{LEVELS.map((L, i) => <button key={i} className="mini-b" data-t={'mini-' + (i + 1)} aria-label={`Preview at ${L.name}`} onClick={() => setOpen(i)}>
      {urls[i] && <img src={urls[i]} alt="" className={i < 4 ? 'px' : ''} />}<span className="px-label">{L.blocks || "FULL"}</span></button>)}</div>
    <button className="px-frame px-btn-ghost" onClick={onChange}>CHANGE</button>
    {open !== null && <div className="viewer" data-t="viewer" role="dialog" aria-label={`Photo at ${LEVELS[open].name}`} onClick={close}
      onTouchStart={e => { x0 = e.touches[0].clientX }} onTouchEnd={e => { const d = e.changedTouches[0].clientX - x0; if (Math.abs(d) > 50) { e.preventDefault(); setOpen(o => Math.max(0, Math.min(4, (o ?? 0) + (d < 0 ? 1 : -1)))) } }}>
      <button className="px-frame px-iconbtn vx" aria-label="Close" data-t="viewer-close" onClick={e => { e.stopPropagation(); close() }}>✕</button>
      <img src={urls[open]} alt="" className={open < 4 ? 'px' : ''} onClick={e => e.stopPropagation()} />
      <div className="vnav" onClick={e => e.stopPropagation()}>
        <button className="px-frame px-btn-ghost" disabled={open === 0} aria-label="Previous level" onClick={() => setOpen(open - 1)}>◀</button>
        <span className="px-label-b px-cream" data-t="viewer-name">LV {open + 1} · {LEVELS[open].name.toUpperCase()} · {LEVELS[open].blocks ? LEVELS[open].blocks + ' BLOCKS' : 'FULL'}</span>
        <button className="px-frame px-btn-ghost" disabled={open === 4} aria-label="Next level" onClick={() => setOpen(open + 1)}>▶</button></div>
    </div>}
  </div>
}
function Onboard({ onDone }: { onDone: (p: Profile, photo: string) => void }) {
  const [name, setName] = useState(''); const [photo, setPhoto] = useState(''); const [okPhoto, setOkPhoto] = useState(false); const fileIn = useRef<HTMLInputElement>(null); const [adult, setAdult] = useState(false)
  const [iam, setIam] = useState<Gender>('man'); const [seek, setSeek] = useState<Seek>('women')
  const [age, setAge] = useState(30); const [min, setMin] = useState(18); const [max, setMax] = useState(AGE_TOP)
  const [cam, setCam] = useState<MediaStream | null>(null); const vid = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (cam && vid.current) { vid.current.srcObject = cam; vid.current.play() } }, [cam])
  const snap = () => { const v = vid.current!, c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d')!.drawImage(v, 0, 0); setPhoto(c.toDataURL('image/jpeg', .9)); setOkPhoto(false); cam!.getTracks().forEach(t => t.stop()); setCam(null) }
  const file = (f?: File) => { if (f) { const r = new FileReader(); r.onload = () => { setPhoto(String(r.result)); setOkPhoto(false) }; r.readAsDataURL(f) } }
  const ok = name.trim() && photo && okPhoto && adult
  const input = <input ref={fileIn} type="file" accept="image/*" hidden data-t="gallery" onChange={e => { file(e.target.files?.[0]); e.target.value = '' }} />
  if (photo && !okPhoto) return <div className="screen scroll">{input}<PhotoReveal src={photo} onConfirm={() => setOkPhoto(true)} onChange={() => fileIn.current?.click()} /></div>
  return <div className="screen scroll">{input}
    <Banner />
    <label className="px-label lab" htmlFor="pd-name">NAME</label>
    <input id="pd-name" className="px-frame px-input fld" value={name} maxLength={20} onChange={e => setName(e.target.value)} placeholder="Your first name" data-t="name" />
    <label className="px-label lab">PHOTO</label>
    {photo && !cam ? <Minis src={photo} onChange={() => fileIn.current?.click()} /> : <div className="photo-row">
      <div className="thumb">{cam ? <video ref={vid} muted playsInline /> : <img src={AV('a', true)} className="ph" alt="" />}</div>
      <div className="col">
        {cam ? <button className="px-frame px-btn-small" onClick={snap}>SNAP</button>
          : <button className="px-frame px-btn-ghost" onClick={async () => { try { setCam(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })) } catch { alert('No camera') } }}>CAMERA</button>}
        <button className="px-frame px-btn-ghost" onClick={() => fileIn.current?.click()}>GALLERY</button>
      </div>
    </div>}
    <div className="grid2">
      <div><span className="px-label lab" id="lab-iam">I AM</span>
        <Seg label="lab-iam" name="iam" value={iam} onChange={v => setIam(v as Gender)} opts={[['man', 'Man'], ['woman', 'Woman']]} /></div>
      <div><label className="px-label lab">MY AGE</label>
        <AgeField value={age} onChange={setAge} t="age" /></div>
    </div>
    <fieldset className="meet"><legend className="px-label lab" id="lab-seek">I WANT TO MEET</legend>
      <Seg label="lab-seek" name="seek" value={seek} onChange={v => setSeek(v as Seek)} opts={[['men', 'Men'], ['women', 'Women']]} />
      <AgeRange min={min} max={max} onChange={(a, b) => { setMin(a); setMax(b) }} />
    </fieldset>
    <label className="tick read"><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} data-t="adult" /><span className="px-frame box" data-t="adult-box" data-on={adult ? 1 : 0} aria-hidden="true">{adult && <TickMark />}</span> I am 18 or over</label>
    <button className="px-frame px-btn" disabled={!ok} data-t="start" onClick={() => { const a = clampAge(age), [lo, hi] = [Math.max(18, Math.min(min, max)), Math.min(AGE_TOP, Math.max(min, max))]; setAge(a); setMin(lo); setMax(hi); onDone({ name: name.trim(), age: a, min: lo, max: hi, iam, seek, uid: uid() }, photo) }}><span className="px-btn__label">Continue</span></button>
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
  const [readyOpen, setReadyOpen] = useState(false); const [lvup, setLvup] = useState<{ from: number; to: number } | null>(null); const prevLv = useRef(1); const lvCv = useRef<HTMLCanvasElement>(null); const [photoV, setPhotoV] = useState(0)
  const [evt, setEvt] = useState<{ id: string; kind: 'turn' | 'pair'; from: number } | null>(null); const [unread, setUnread] = useState(0)
  const st = useRef({ level, taps, pct, call, m, ring, skipReq, ans, tab }); st.current = { level, taps, pct, call, m, ring, skipReq, ans, tab }

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
    setLevel(1); setPct(0); setTaps({ me: false, them: false }); setAns({}); setCredited([]); setMsgs([]); setTab('profile'); setAnswering(null); setSkip(null); setEvt(null); setReadyOpen(false); setLvup(null); prevLv.current = 1; setUnread(0); matchedAt.current = new Date().toTimeString().slice(0, 5)
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
  useEffect(() => { for (const [id, a] of Object.entries(ans)) if (a.me && a.them && !credited.includes(id)) { setCredited(c => [...c, id]); setEvt({ id, kind: 'pair', from: pct }); setPct(p => Math.min(100, p + METER.cardBonus)); setMsgs(x => [...x, { from: 'sys', pair: id }]) } }, [ans])
  const raise = (from: number) => { setLevel(l => l === from && l < 5 ? l + 1 : l); setPct(0); setTaps({ me: false, them: false }) }
  useEffect(() => { if (taps.me && taps.them) raise(level) }, [taps])
  useEffect(() => { if (pct >= 100 && level < 5 && m) setReadyOpen(true) }, [pct >= 100])
  useEffect(() => { if (taps.them || taps.me) setReadyOpen(true) }, [taps.them, taps.me])
  // level-up event (both consented): overlay on any tab + a system card in the chat; drops are silent here
  useEffect(() => { const p = prevLv.current; prevLv.current = level
    if (level > p && m) { setReadyOpen(false); setEvt(null); setLvup({ from: p, to: level }); const L = LEVELS[level - 1]; setMsgs(x => [...x, { from: 'sys', text: `NOW AT ${L.name.toUpperCase()} · ${L.blocks ? L.blocks + ' BLOCKS' : 'FULL PHOTO'}` }]) } }, [level])
  useEffect(() => { const c = lvCv.current, to = theirImgs.current[lvup?.to ?? 0]; if (!lvup || !c || !to) return
    const from = theirImgs.current[lvup.from] || null; if (matchMedia('(prefers-reduced-motion: reduce)').matches) animateReveal(c, null, to); else animateReveal(c, from, to) }, [lvup, photoV])

  function onData(d: any) {
    const s = st.current
    switch (d?.t) {
      case 'chat': setMsgs(x => [...x, { from: 'them', text: d.text }]); if (s.tab !== 'chat') setUnread(n => n + 1); break
      case 'card': setMsgs(x => [...x, { from: 'them', card: d.id }]); break
      case 'ans': if (!cardById(d.id) || s.ans[d.id]?.them) break
        setAns(a => ({ ...a, [d.id]: { ...a[d.id], them: String(d.text) } })) // kept in state only; shown once I've answered too
        if (!s.ans[d.id]?.me) { setEvt({ id: d.id, kind: 'turn', from: 0 }); setMsgs(x => [...x, { from: 'sys', text: `${s.m?.them.name.toUpperCase()} ANSWERED ${qn(d.id)} · YOUR TURN` }]); if (s.tab !== 'chat') setUnread(n => n + 1) }
        break
      case 'tap': if (d.level === s.level) setTaps(t => ({ ...t, them: true })); break
      case 'drop': if (!(d.level >= 1 && d.level < s.level)) break; setLevel(d.level); setPct(0); setTaps({ me: false, them: false }); setMsgs(x => [...x, { from: 'sys', text: `${s.m?.them.name.toUpperCase()} LOWERED TO ${LEVELS[d.level - 1].name.toUpperCase()}` }]); break
      case 'photo': loadImage(d.data).then(img => { if (d.level === st.current.level) (window as any).__pd = { photoW: img.naturalWidth, photoH: img.naturalHeight }; theirImgs.current[d.level] = img; setPhotoV(v => v + 1); if (d.level === st.current.level) paint(img) }); break
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
  useEffect(() => { if (tab === 'chat') setUnread(0) }, [tab])
  useEffect(() => { if (evt?.kind !== 'turn') return; const t = setTimeout(() => setEvt(e => e === evt ? null : e), 6000); return () => clearTimeout(t) }, [evt])
  useEffect(() => { if (tab === 'profile' && shown.current && cv.current) animateReveal(cv.current, null, shown.current) }, [tab, screen])

  const used = new Set(Object.keys(ans).filter(k => ans[k].me && ans[k].them))
  const card = level < 6 ? deck.next(Math.min(level, 5), used) : null
  // one path for every entry point (pinned, chat, match tab, call tab): update card state, send, log
  const answer = (id: string, text: string) => {
    if (ans[id]?.me) return
    setAns(a => ({ ...a, [id]: { ...a[id], me: text } })); send({ t: 'ans', id, text }); setAnswering(null)
    if (!ans[id]?.them) setMsgs(x => [...x, { from: 'sys', text: `YOU ANSWERED ${qn(id)} · WAITING FOR ${m?.them.name.toUpperCase()}` }])
    if (evt?.kind === 'turn' && evt.id === id) setEvt(null)
  }
  const tapReveal = () => { if (pct < 100 || level === 5) return; setTaps(t => ({ ...t, me: true })); setReadyOpen(true); send({ t: 'tap', level }) }
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
        <span className="px-frame px-chip chip"><Ic n="heart" s={8} /> {me!.seek === 'everyone' ? 'EVERYONE' : me!.seek.toUpperCase()} · {me!.min}–{me!.max >= AGE_TOP ? AGE_TOP + '+' : me!.max}</span>
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
        {SHOW_BLOCK && <button className="px-frame px-iconbtn ib" title={`Block ${them}`} aria-label={`Block ${them}`} data-t="block" onClick={() => confirm(`Block ${them} and never match again?`) && doSkip(true)}><NoEntry /></button>}
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

          {msgs.map((x, i) => x.pair ? <div key={i} className="px-frame px-card px-qcard px-card--hot pair" data-t="pair-log">
              <div className="px-qcard__top"><span className="px-frame px-tag">{qn(x.pair)}</span><span className="px-qcard__meta"><Ic n="sparkle" s={8} />+{METER.cardBonus}%</span></div>
              <p className="px-qcard__q">{qn(x.pair)} · {cardById(x.pair)!.text}</p>
              <p className="read"><b className="px-coral">You:</b> {ans[x.pair]?.me}</p><p className="read" data-t="pair-them"><b className="px-coral-l">{them}:</b> {ans[x.pair]?.them}</p></div>
            : x.from === 'sys' ? <p key={i} className="px-label sys">{x.text}</p>
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
      {tab === 'chat' && level === 1 && card && !ans[card.id]?.me && !msgs.some(x => x.from !== 'sys') && <div className="pinned" data-t="pinned-card">{Q({ id: card.id, inChat: true })}</div>}
      {tab === 'chat' && <form className="composer" onSubmit={e => { e.preventDefault(); chat() }}>
        <input className="px-frame px-input fld" value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Message ${them}`} data-t="chat-input" />
        <button className="px-frame px-iconbtn" data-t="chat-send"><Ic n="send" /></button></form>}
      {evt?.kind === 'turn' && <button className="px-frame px-card turn" data-t="ans-turn" onClick={() => { setEvt(null); setTab('profile'); setAnswering(evt.id) }}>
        <span className="px-frame px-card cardback" aria-hidden="true"><b>?</b></span>
        <span><span className="px-label-b px-cream">{them.toUpperCase()} ANSWERED, YOUR TURN</span><br /><span className="meta">{qn(evt.id)} · {cardById(evt.id)?.text}</span></span></button>}
      {evt?.kind === 'pair' && ans[evt.id]?.me && ans[evt.id]?.them && <div className="modal" data-t="ans-pair" role="dialog" aria-label="Both answered" onClick={e => { if (e.target === e.currentTarget) setEvt(null) }}>
        <div className="pairbox">
          <p className="px-label-b px-cream ctr">{qn(evt.id)} · BOTH ANSWERED</p>
          <p className="read ctr">{cardById(evt.id)?.text}</p>
          <div className="flips"><div className="px-frame px-card px-qcard flip me"><span className="px-label-b">YOU</span><p className="read">{ans[evt.id].me}</p></div>
            <div className="px-frame px-card px-qcard flip them"><span className="px-label-b">{them.toUpperCase()}</span><p className="read">{ans[evt.id].them}</p></div>
            <div className="burst" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6, 7].map(k => <i key={k} style={{ ['--a' as any]: k * 45 + 'deg' }}><Ic n="heart" s={8} /></i>)}</div></div>
          <TickMeter level={level} from={evt.from} to={pct} />
          {pct >= 100 && level < 5 ? <button className="px-frame px-btn" data-t="evt-reveal" onClick={() => { setEvt(null); setTab('profile'); tapReveal() }}><Ic n="sparkle" /><span className="px-btn__label">Reveal more</span></button>
            : <button className="px-frame px-btn" data-t="evt-close" onClick={() => setEvt(null)}><span className="px-btn__label">Keep chatting</span></button>}
        </div></div>}
      {readyOpen && !evt && !lvup && level < 5 && pct >= 100 && <div className="modal" data-t="ready" role="dialog" aria-label="Ready to see more" onClick={e => { if (e.target === e.currentTarget) setReadyOpen(false) }}>
        <div className="pairbox ctr pulse">
          <p className="kicker" style={{ justifyContent: 'center' }}><Ic n="sparkle" s={8} /> METER FULL</p>
          <h2 className="h1 ctr">Ready to see more?</h2>
          <div className="tick-meter shimmer"><Meter level={level} pct={100} /></div>
          <p className="read m">{taps.me ? `Waiting for ${them}…` : taps.them ? `${them} is ready. Your turn to reveal ${nx?.name}.` : `You both filled the meter. Reveal ${nx?.name} when you're both ready.`}</p>
          {taps.me ? <p className="px-label-b px-cream" data-t="ready-waiting"><span className="beat"><Ic n="heart" s={8} /></span> WAITING FOR {them.toUpperCase()}…</p>
            : <button className="px-frame px-btn big" data-t="ready-reveal" onClick={tapReveal}><Ic n="sparkle" /><span className="px-btn__label">Reveal more</span></button>}
          <button className="ghost" onClick={() => setReadyOpen(false)}>LATER</button>
        </div></div>}
      {lvup && <div className="modal lvup" data-t="lvup" onClick={() => setLvup(null)}>
        <div className="pairbox ctr">
          <div className="lvphoto"><canvas ref={lvCv} width={480} height={480} />
            <div className="burst gold" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => <i key={k} style={{ ['--a' as any]: k * 36 + 'deg' }}><Ic n={k % 2 ? 'sparkle' : 'heart'} s={8} /></i>)}</div></div>
          <h2 className="h1 ctr stamp" data-t="lvup-name">LV {lvup.to} · {LEVELS[lvup.to - 1].name.toUpperCase()}</h2>
          <span className="px-frame px-tag stamp2">{LEVELS[lvup.to - 1].blocks ? `${LEVELS[lvup.to - 1].blocks} BLOCKS` : 'FULL PHOTO'}</span>
          <div className="tick-meter"><Meter level={lvup.to} pct={0} /></div>
          <button className="px-frame px-btn" data-t="lvup-close" onClick={() => setLvup(null)}><span className="px-btn__label">Keep chatting</span></button>
        </div></div>}
      <nav className="px-nav nav">
        {(['profile', 'chat', 'call'] as const).map(t => <a key={t} className={tab === t ? 'on' : ''} data-t={'tab-' + t} onClick={() => setTab(t)}><Ic n={t === 'profile' ? 'matches' : t} />{t === 'profile' ? 'MATCH' : t === 'chat' ? 'CHAT' : 'CALL'}{t === 'chat' && unread > 0 && tab !== 'chat' && <span className="unread" data-t="unread">{unread}</span>}</a>)}
      </nav>
    </div>}
  </div>
}
