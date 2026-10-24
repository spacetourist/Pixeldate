import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MediaConnection } from 'peerjs'
import { LEVELS, METER, DEV_SKIP_STAGE } from './config'
import { localDeck, cardById, type QuestionSource } from './deck'
import { pixelatePhoto, loadImage, animateReveal } from './pixel'
import { mountReveal } from './reveal'
import { Icon, Hp, MeterHead, LevelMap, Av, LvBadge, LV_DESC, LV_COLOR, AV_BLOCKS, coarse } from './ui/parts'
type Kind = 'voice' | 'video'
/** What we send on a call: pixelated video + mic, or mic only. */
type Media = { stream: MediaStream; out: MediaStream; setLevel(l: number): void; stop(): void }
import { Net, block, store, bracketOf, bracketLabel, type Profile, type Gender, type Seek, type Match } from './net'

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
type Msg = { from: 'me' | 'them' | 'sys'; text?: string; card?: string; pair?: string }
type Ans = Record<string, { me?: string; them?: string }>

function Meter({ level, pct }: { level: number; pct: number }) {
  return <div className="px-meter">{LEVELS.map((_, i) => i + 1 < level || level === 5 ? <i key={i} className="is-full" /> : i + 1 === level ? <i key={i} style={{ ['--f' as any]: Math.floor(pct / 10) }} /> : <i key={i} />)}</div>
}

/** Meter that ticks up one art px (10%) at a time from `from` to `to` after the card flip. */
function TickMeter({ level, from, to }: { level: number; from: number; to: number }) {
  const [p, setP] = useState(from)
  useEffect(() => { setP(from); let v = from; const t0 = setTimeout(() => { const i = setInterval(() => { v = Math.min(to, v + 10); setP(v); if (v >= to) clearInterval(i) }, 90) }, 450); return () => clearTimeout(t0) }, [from, to])
  return <><MeterHead level={level} pct={p} /><Hp level={level} pct={p} /></>
}
const AGE_TOP = 70 // slider top; 70 means "70+" (no upper limit, see wants() in net.ts)
function Banner() {
  const u = (x: string, e: string) => `${B}px/img/create-profile-banner${x}.${e}`
  const set = (e: string) => `${u('', e)} 1x, ${u('@2x', e)} 2x, ${u('@3x', e)} 3x`
  return <div className="px-frame cp-banner" data-t="banner"><picture>
    <source type="image/webp" srcSet={set('webp')} /><img src={u('', 'png')} srcSet={set('png')} width={412} height={200} alt="" /></picture>
    <div className="cp-ov"><h1 className="cp-h">Create your profile</h1><p className="cp-s">Blurry until you both choose.</p></div></div>
}
/** Segmented radio pair: real radio inputs, so arrow keys / screen readers work natively. */
function Seg({ name, value, opts, onChange, label }: { name: string; value: string; opts: [string, string][]; onChange: (v: string) => void; label: string }) {
  return <div className="seg" role="radiogroup" aria-labelledby={label}>{opts.map(([v, l]) =>
    <label key={v} className={'px-frame seg-o' + (value === v ? ' on' : '')} data-t={name + '-' + v}>
      <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} /><span>{l}</span></label>)}</div>
}
/** One track, two thumbs (two native ranges stacked). Thumbs can't cross; 70 = 70+. */
/** Range stops = bracket edges. Lower thumb picks a bracket start, upper thumb the next start (max = edge - 1). 70 = "70+". */
const EDGES = [18, 25, 30, 35, 40, 50, 60, 70]
const snapEdge = (n: number) => EDGES.reduce((b, e) => Math.abs(e - n) < Math.abs(b - n) ? e : b, EDGES[0])
/** Migrate any min/max (old saved or non-edge) to bracket edges: min -> edge, max -> edge - 1 (or 70+). */
export const snapRange = (min: number, max: number): [number, number] => {
  let i = EDGES.indexOf(snapEdge(min)), j = max >= 70 ? 7 : EDGES.indexOf(snapEdge(max + 1)); if (i > 6) i = 6; if (j <= i) j = i + 1
  return [EDGES[i], j === 7 ? 70 : EDGES[j] - 1] }
function AgeRange({ min, max, onChange }: { min: number; max: number; onChange: (a: number, b: number) => void }) {
  const i = EDGES.indexOf(min), j = max >= 70 ? 7 : EDGES.indexOf(max + 1), f = (k: number) => k / 7 * 100
  const val = (k: number) => k === 7 ? 70 : EDGES[k] - 1, show = (n: number) => n >= AGE_TOP ? AGE_TOP + '+' : String(n)
  return <div className="range" style={{ ['--lo' as any]: f(i) + '%', ['--hi' as any]: f(j) + '%' }}>
    <div className="range-h"><span className="px-label">AGED</span><span className="px-label-b px-coral" data-t="range-val" aria-live="polite">{show(min)} – {show(max)}</span></div>
    <div className="range-t"><i />
      <input type="range" min={0} max={7} step={1} value={i} aria-label="Minimum age" aria-valuetext={String(min)} data-t="min" onChange={e => { const k = Math.min(+e.target.value, j - 1); onChange(EDGES[k], max) }} />
      <input type="range" min={0} max={7} step={1} value={j} aria-label="Maximum age" aria-valuetext={show(max)} data-t="max" onChange={e => { const k = Math.max(+e.target.value, i + 1); onChange(min, val(k)) }} /></div>
  </div>
}
/** After upload: the photo at each level, pre-pixelated (same pixelateCanvas as what's sent), tap for full screen. */
function Minis({ src, onChange }: { src: string; onChange: () => void }) {
  const [urls, setUrls] = useState<string[]>([]); const [open, setOpen] = useState<number | null>(null); const [sel, setSel] = useState(0)
  useEffect(() => { if (open !== null) setSel(open) }, [open])
  useEffect(() => { let live = true; loadImage(src).then(im => { if (live) setUrls(LEVELS.map((_, i) => pixelatePhoto(im, i + 1))) }); return () => { live = false } }, [src])
  useEffect(() => { if (open === null) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); if (e.key === 'ArrowRight') setOpen(o => Math.min(4, (o ?? 0) + 1)); if (e.key === 'ArrowLeft') setOpen(o => Math.max(0, (o ?? 0) - 1)) }
    history.pushState({ pdViewer: 1 }, ''); const pop = () => setOpen(null)
    addEventListener('keydown', k); addEventListener('popstate', pop)
    return () => { removeEventListener('keydown', k); removeEventListener('popstate', pop) } }, [open === null])
  const close = () => { if (history.state?.pdViewer) history.back(); else setOpen(null) }
  let x0 = 0
  return <div className="minis-wrap">
    <div className="minis" data-t="minis">{LEVELS.map((L, i) => <button key={i} className={'mini-b' + (sel === i ? ' sel' : '')} aria-pressed={sel === i} data-t={'mini-' + (i + 1)} aria-label={`Preview at ${L.name}`} onClick={() => setOpen(i)}>
      {urls[i] && <img src={urls[i]} alt="" className={i < 4 ? 'px' : ''} />}<span className="px-label">{L.blocks || "FULL"}</span></button>)}</div>
    <button type="button" className="tlink" data-t="photo-change-link" onClick={onChange}>Change photo</button>
    {open !== null && <div className="viewer" data-t="viewer" role="dialog" aria-label={`Photo at ${LEVELS[open].name}`} onClick={close}
      onTouchStart={e => { x0 = e.touches[0].clientX }} onTouchEnd={e => { const d = e.changedTouches[0].clientX - x0; if (Math.abs(d) > 50) { e.preventDefault(); setOpen(o => Math.max(0, Math.min(4, (o ?? 0) + (d < 0 ? 1 : -1)))) } }}>
      <button className="px-frame px-iconbtn vx" aria-label="Close" data-t="viewer-close" onClick={e => { e.stopPropagation(); close() }}>✕</button>
      <img src={urls[open]} alt="" className={open < 4 ? 'px' : ''} onClick={e => e.stopPropagation()} />
      <div className="vnav" onClick={e => e.stopPropagation()}>
        <button className="px-frame px-btn-ghost" disabled={open === 0} aria-label="Previous level" onClick={() => setOpen(open - 1)}>◀</button>
        <span className="vstep" data-t="viewer-name">LV {open + 1} · {LEVELS[open].name.toUpperCase()} · {LEVELS[open].blocks ? LEVELS[open].blocks + ' BLOCKS' : 'FULL'}</span>
        <button className="px-frame px-btn-ghost" disabled={open === 4} aria-label="Next level" onClick={() => setOpen(open + 1)}>▶</button></div>
    </div>}
  </div>
}
const MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ')
type Season = 'winter' | 'spring' | 'summer' | 'autumn'
const seasonOf = (m: number): Season => m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn'
const SEASON_PX: Record<Season, string[]> = { winter: ['..#..', '#.#.#', '.###.', '#.#.#', '..#..'], spring: ['.#.#.', '#####', '.###.', '..#..', '.##..'], summer: ['#.#.#', '.###.', '#####', '.###.', '#.#.#'], autumn: ['...##', '..###', '.###.', '###..', '#....'] }
const SeasonIc = ({ s, px = 3 }: { s: Season; px?: number }) => <svg className={'sic s-' + s} width={px * 5} height={px * 5} viewBox="0 0 5 5" shapeRendering="crispEdges" aria-hidden="true">
  {SEASON_PX[s].flatMap((row, y) => [...row].map((ch, x) => ch === '#' ? <rect key={x + '-' + y} x={x} y={y} width="1" height="1" fill="currentColor" /> : null))}</svg>
/** Age on the 1st of the birth month. */
const ageFrom = (by: number, bm: number, now = new Date()) => now.getFullYear() - by - (now.getMonth() + 1 < bm ? 1 : 0)
const NOW_Y = new Date().getFullYear(), Y_MIN = NOW_Y - 70, Y_MAX = NOW_Y - 18, ROW = 32
/** GD birthday picker: month tiles + scroll-snap year reel. The year/month stay on this device. */
function Birthday({ by, bm, onChange }: { by: number; bm: number; onChange: (by: number, bm: number) => void }) {
  const reel = useRef<HTMLDivElement>(null), years = useMemo(() => Array.from({ length: Y_MAX - Y_MIN + 1 }, (_, i) => Y_MIN + i), [])
  const t = useRef(0)
  useEffect(() => { const r = reel.current; if (r) r.scrollTop = (by - Y_MIN) * ROW }, []) // initial position only
  const onScroll = () => { clearTimeout(t.current); t.current = window.setTimeout(() => { const r = reel.current; if (!r) return; const y = Y_MIN + Math.round(r.scrollTop / ROW); if (y !== by && y >= Y_MIN && y <= Y_MAX) onChange(y, bm) }, 60) }
  const go = (y: number) => { const v = Math.max(Y_MIN, Math.min(Y_MAX, y)); reel.current?.scrollTo({ top: (v - Y_MIN) * ROW, behavior: 'smooth' }); onChange(v, bm) }
  const age = bm ? ageFrom(by, bm) : null, br = age !== null && age >= 18 ? bracketLabel(bracketOf(Math.min(age, 70))) : null
  return <div className="bday" data-t="bday">
    <p className="px-label lab">WHEN DID YOUR STORY START?</p>
    <h2 className="h2 bday-h">Your birthday</h2>
    <p className="px-meta bday-sub">Matches only ever see your age bracket.</p>
    <span className="px-label lab" id="lab-month">MONTH</span>
    <div className="months" role="radiogroup" aria-labelledby="lab-month">{MONTHS.map((m, i) => <button key={m} type="button" role="radio" aria-checked={bm === i + 1}
      className={'px-frame mtile' + (bm === i + 1 ? ' on' : '')} data-t={'month-' + (i + 1)} onClick={() => onChange(by, i + 1)}><SeasonIc s={seasonOf(i + 1)} /><span>{m}</span></button>)}</div>
    <span className="px-label lab" id="lab-year">YEAR</span>
    <div className="reel-box"><div className="reel-sel" aria-hidden="true" />
      <div className="reel" ref={reel} onScroll={onScroll} tabIndex={0} role="listbox" aria-labelledby="lab-year" aria-activedescendant={'yr-' + by} data-t="year-reel"
        onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); go(by - 1) } if (e.key === 'ArrowDown') { e.preventDefault(); go(by + 1) } }}>
        {years.map(y => <div key={y} id={'yr-' + y} role="option" aria-selected={y === by} className={'yr' + (y === by ? ' on' : '')} onClick={() => go(y)}>{y}</div>)}</div></div>
    <div className="px-frame px-card youare" data-t="bday-readout" aria-live="polite">
      <div><span className="px-label">YOU ARE</span><b>{age === null ? 'Pick your month' : `${Math.min(age, 70)}${age >= 70 ? '+' : ''} · ${seasonOf(bm)}-born`}</b></div>
      <div className="ms"><span className="px-label">MATCHES SEE</span><b className="px-coral" data-t="bracket">{br || '—'}</b></div></div>
    {age !== null && age < 18 && <p className="under18" role="alert" data-t="under18">You need to be 18 or over to use Pixeldate.</p>}
    <p className="px-meta bday-sub">Your birth season badge unlocks at Spark as an icebreaker.</p>
  </div>
}
function Onboard({ onDone }: { onDone: (p: Profile, photo: string) => void }) {
  const [name, setName] = useState(''); const [photo, setPhoto] = useState(''); const [okPhoto, setOkPhoto] = useState(false); const fileIn = useRef<HTMLInputElement>(null); const [adult, setAdult] = useState(false)
  const [iam, setIam] = useState<Gender>('man'); const [seek, setSeek] = useState<Seek>('women')
  const saved = (() => { try { return JSON.parse(store.getItem('pd-bday') || '') } catch { return null } })()
  const [by, setBy] = useState<number>(saved?.by || NOW_Y - 25); const [bm, setBm] = useState<number>(saved?.bm || 0); const age = bm ? ageFrom(by, bm) : 0
  const [min, setMin] = useState(18); const [max, setMax] = useState(AGE_TOP)
  const [cam, setCam] = useState<MediaStream | null>(null); const vid = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (cam && vid.current) { vid.current.srcObject = cam; vid.current.play() } }, [cam])
  const snap = () => { const v = vid.current!, c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d')!.drawImage(v, 0, 0); setPhoto(c.toDataURL('image/jpeg', .9)); setOkPhoto(false); cam!.getTracks().forEach(t => t.stop()); setCam(null) }
  const file = (f?: File) => { if (f) { const r = new FileReader(); r.onload = () => { setPhoto(String(r.result)); setOkPhoto(false) }; r.readAsDataURL(f) } }
  const ok = name.trim() && photo && okPhoto && adult && bm > 0 && age >= 18
  const input = <input ref={fileIn} type="file" accept="image/*" hidden data-t="gallery" onChange={e => { file(e.target.files?.[0]); e.target.value = '' }} />
  if (photo && !okPhoto) return <div className="screen scroll">{input}<PhotoReveal src={photo} onConfirm={() => setOkPhoto(true)} onChange={() => fileIn.current?.click()} /></div>
  return <div className="screen scroll">{input}
    <Banner />
    <label className="px-label lab" htmlFor="pd-name">NAME</label>
    <input id="pd-name" className="px-frame px-input fld" value={name} maxLength={20} onChange={e => setName(e.target.value)} placeholder="Username" data-t="name" />
    <label className="px-label lab">PHOTO</label>
    {photo && !cam ? <Minis src={photo} onChange={() => fileIn.current?.click()} /> : <div className="photo-row">
      {cam ? <div className="thumb"><video ref={vid} muted playsInline /></div>
        : <button type="button" className="addself" data-t="add-selfie" onClick={() => fileIn.current?.click()}><svg width="24" height="24" viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M4 2h4v1h2v1h1v6H1V4h1V3h2zM2 4v5h8V4zM5 5h2v1h1v2H7v1H5V8H4V6h1zM5 6v2h2V6z" /></svg><span>Add a selfie</span></button>}
      <div className="col">
        {cam ? <button className="px-frame px-btn-small" onClick={snap}>SNAP</button>
          : <button className="px-frame px-btn-ghost pbtn" onClick={async () => { try { setCam(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })) } catch { alert('No camera') } }}>Camera</button>}
        <button className="px-frame px-btn-ghost pbtn" onClick={() => fileIn.current?.click()}>Gallery</button>
      </div>
    </div>}
    <span className="px-label lab" id="lab-iam">I AM</span>
    <Seg label="lab-iam" name="iam" value={iam} onChange={v => setIam(v as Gender)} opts={[['man', 'Man'], ['woman', 'Woman']]} />
    <Birthday by={by} bm={bm} onChange={(y, m) => { setBy(y); setBm(m) }} />
    <fieldset className="meet"><legend className="px-label lab" id="lab-seek">I WANT TO MEET</legend>
      <Seg label="lab-seek" name="seek" value={seek} onChange={v => setSeek(v as Seek)} opts={[['men', 'Men'], ['women', 'Women']]} />
      <AgeRange min={min} max={max} onChange={(a, b) => { setMin(a); setMax(b) }} />
    </fieldset>
    <label className="tick read"><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} data-t="adult" /><span className="px-frame box" data-t="adult-box" data-on={adult ? 1 : 0} aria-hidden="true">{adult && <TickMark />}</span> I am 18 or over</label>
    <button className="px-frame px-btn" disabled={!ok} data-t="start" style={{ marginTop: 16 }} onClick={() => { const a = Math.min(age, 70), [lo, hi] = snapRange(min, max); if (a < 18) return; store.setItem('pd-bday', JSON.stringify({ by, bm })); setMin(lo); setMax(hi); onDone({ name: name.trim(), age: a, by, bm, min: lo, max: hi, iam, seek, uid: uid() }, photo) }}><span className="px-btn__label">Continue</span></button>
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
  const [view, setView] = useState<'stage' | 'compact'>(() => { try { return localStorage.getItem('pd.view') === 'compact' ? 'compact' : 'stage' } catch { return 'stage' } })
  const theirImgs = useRef<Record<number, HTMLImageElement>>({}); const shown = useRef<HTMLImageElement | null>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const [call, setCall] = useState<{ cam: Media; mc: MediaConnection; kind: Kind; remote?: MediaStream } | null>(null)
  const [ring, setRing] = useState<{ dir: 'in' | 'out'; kind: Kind } | null>(null); const [muted, setMuted] = useState(false); const [camOff, setCamOff] = useState(false)
  const ready = useRef<{ cam: Media; kind: Kind } | null>(null) // media grabbed on accept, used when their call arrives
  const [dev, setDev] = useState(isDev); const matchedAt = useRef(''); const lp = useRef(0) // long-press on the level badge toggles dev tools
  const myAv = useMemo(() => photo ? pixelatePhoto(photo, 1) : AV('a'), [photo])
  const [skipReq, setSkip] = useState<'in' | 'out' | null>(null)
  const [themSeason, setThemSeason] = useState<Season | null>(null); const seasonSent = useRef(false)
  const [readyOpen, setReadyOpen] = useState(false); const [lvup, setLvup] = useState<{ from: number; to: number } | null>(null); const prevLv = useRef(1); const lvCv = useRef<HTMLCanvasElement>(null); const [photoV, setPhotoV] = useState(0)
  // Chat log sticks to the newest message unless the reader has scrolled up (>80px from the bottom).
  const logEl = useRef<HTMLDivElement>(null), stick = useRef(true)
  const onLogScroll = () => { const l = logEl.current; if (l) stick.current = l.scrollHeight - l.scrollTop - l.clientHeight < 80 }
  useLayoutEffect(() => { const l = logEl.current; if (l && stick.current) l.scrollTop = l.scrollHeight }, [msgs, tab, view])
  const [evt, setEvt] = useState<{ id: string; kind: 'turn' | 'pair'; from: number } | null>(null); const [unread, setUnread] = useState(0)
  const st = useRef({ level, taps, pct, call, m, ring, skipReq, ans, tab }); st.current = { level, taps, pct, call, m, ring, skipReq, ans, tab }

  const send = (d: any) => { try { st.current.m?.conn.send(d) } catch {} }
  useEffect(() => { (window as any).__pdThem = m?.them }, [m]) // test hook: what the peer actually sent
  // birth season is shared only once Spark (level 2) is reached; year/month never leave the device
  useEffect(() => { if (m && me && level >= 2 && !seasonSent.current && me.bm) { seasonSent.current = true; send({ t: 'season', s: seasonOf(me.bm) }) } }, [level, m])
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
      const { PixelCam } = await import('./video'); const c = new PixelCam(await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: true })); (window as any).__pdCam = c
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
    if (!ok) { setRing(null); setMsgs(x => [...x, { from: 'sys', text: 'Call declined' }]); return }
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
    setLevel(1); setPct(0); setTaps({ me: false, them: false }); setAns({}); setThemSeason(null); seasonSent.current = false; setCredited([]); setMsgs([]); setTab('profile'); setAnswering(null); setSkip(null); setEvt(null); setReadyOpen(false); setLvup(null); prevLv.current = 1; setUnread(0); matchedAt.current = new Date().toTimeString().slice(0, 5)
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
    if (level > p && m) { setReadyOpen(false); setEvt(null); setLvup({ from: p, to: level }); const L = LEVELS[level - 1]; setMsgs(x => [...x, { from: 'sys', text: `Now at ${L.name} · ${L.blocks ? L.blocks + ' blocks' : 'full photo'}` }]) } }, [level])
  useEffect(() => { const c = lvCv.current, to = theirImgs.current[lvup?.to ?? 0]; if (!lvup || !c || !to) return
    const from = theirImgs.current[lvup.from] || null; if (matchMedia('(prefers-reduced-motion: reduce)').matches) animateReveal(c, null, to); else animateReveal(c, from, to) }, [lvup, photoV])

  function onData(d: any) {
    const s = st.current
    switch (d?.t) {
      case 'chat': setMsgs(x => [...x, { from: 'them', text: d.text }]); if (s.tab !== 'chat') setUnread(n => n + 1); break
      case 'card': setMsgs(x => [...x, { from: 'them', card: d.id }]); break
      case 'ans': if (!cardById(d.id) || s.ans[d.id]?.them) break
        setAns(a => ({ ...a, [d.id]: { ...a[d.id], them: String(d.text) } })) // kept in state only; shown once I've answered too
        if (!s.ans[d.id]?.me) { setEvt({ id: d.id, kind: 'turn', from: 0 }); setMsgs(x => [...x, { from: 'sys', text: `${s.m?.them.name} answered ${qn(d.id)} · your turn` }]); if (s.tab !== 'chat') setUnread(n => n + 1) }
        break
      case 'tap': if (d.level === s.level) setTaps(t => ({ ...t, them: true })); break
      case 'season': if (['winter', 'spring', 'summer', 'autumn'].includes(d.s)) setThemSeason(d.s); break
      case 'drop': if (!(d.level >= 1 && d.level < s.level)) break; setLevel(d.level); setPct(0); setTaps({ me: false, them: false }); setMsgs(x => [...x, { from: 'sys', text: `${s.m?.them.name} lowered to ${LEVELS[d.level - 1].name}` }]); break
      case 'photo': loadImage(d.data).then(img => { if (d.level === st.current.level) (window as any).__pd = { photoW: img.naturalWidth, photoH: img.naturalHeight }; theirImgs.current[d.level] = img; setPhotoV(v => v + 1); if (d.level === st.current.level) paint(img) }); break
      case 'skip': leave('They moved on. Finding someone new.', true); break
      case 'skipreq': if (DEV_SKIP_STAGE && d.level === s.level && s.level < 5) setSkip('in'); break
      case 'skipans': if (st.current.skipReq === 'out' && d.ok && d.level === s.level) raise(s.level); setSkip(null); if (!d.ok) setMsgs(x => [...x, { from: 'sys', text: 'Skip declined' }]); break
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

  const used = new Set(Object.keys(ans).filter(k => ans[k].me && ans[k].them))
  const card = level < 6 ? deck.next(Math.min(level, 5), used) : null
  // one path for every entry point (pinned, chat, match tab, call tab): update card state, send, log
  const answer = (id: string, text: string) => {
    if (ans[id]?.me) return
    setAns(a => ({ ...a, [id]: { ...a[id], me: text } })); send({ t: 'ans', id, text }); setAnswering(null)
    if (!ans[id]?.them) setMsgs(x => [...x, { from: 'sys', text: `You answered ${qn(id)} · waiting for ${m?.them.name}` }])
    if (evt?.kind === 'turn' && evt.id === id) setEvt(null)
  }
  const tapReveal = () => { if (pct < 100 || level === 5) return; setTaps(t => ({ ...t, me: true })); setReadyOpen(true); send({ t: 'tap', level }) }
  const drop = () => { if (level === 1) return; const l = level - 1; setLevel(l); setPct(0); setTaps({ me: false, them: false }); send({ t: 'drop', level: l }) }
  const chat = () => { if (!draft.trim()) return; send({ t: 'chat', text: draft }); setMsgs(x => [...x, { from: 'me', text: draft }]); setDraft('') }
  const dropCard = (id: string) => { send({ t: 'card', id }); setMsgs(x => [...x, { from: 'me', card: id }]); setTab('chat') }

  const remoteV = useRef<HTMLVideoElement>(null); const localV = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (remoteV.current && call?.remote) { remoteV.current.srcObject = call.remote; remoteV.current.play().catch(() => {}) } if (localV.current && call) { localV.current.srcObject = call.kind === 'video' ? call.cam.stream : null; localV.current.play().catch(() => {}) } }, [call, tab, view])

  const theirAv = useMemo(() => coarse(theirImgs.current[level], AV_BLOCKS[level - 1]), [level, photoV])
  // the photo canvas moves between the stage and the compact plate: repaint the current level when it remounts
  useEffect(() => { if (shown.current && cv.current) animateReveal(cv.current, null, shown.current) }, [screen, view])
  useEffect(() => { const mk = (window as any).__pdMock; if (mk) import('./mock').then(x => x.runMock(mk, mockApi.current)) }, [])
  const mockApi = useRef<any>(null)
  mockApi.current = { start: async (p: Profile, ph: string) => { setMe(p); setPhoto(await loadImage(ph)) }, beginMatch, setTab, setView, setPct, setMsgs, setAns, setCredited, setThemSeason, setEvt, setLvup,
    jump: (l: number) => { prevLv.current = l; setLevel(l); setPct(0) } }
  if (screen === 'onboard') return <div className="legacy"><div className="app px"><Onboard onDone={start} /><Splash ready /></div></div>

  const them = m?.them.name || ''
  const lv = LEVELS[level - 1], nx = LEVELS[level]
  const Q = ({ id, inChat }: { id: string; inChat?: boolean; key?: any }) => {
    const q = cardById(id)!; const a = ans[id] || {}; const both = !!(a.me && a.them)
    const together = !(q.level === 1 || q.level === 3 || q.level === 5)
    const state = both ? 'both' : a.me ? 'you' : a.them ? 'them' : 'new'
    return <div className={`qcard fx ${state === 'you' ? 'qcard--you' : both ? 'qcard--both' : ''}`} data-t="card" data-card={id} data-state={state}>
      <div className="qh"><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon n="cards" c="var(--c-mint)" /> {LEVELS[q.level - 1].name} · Q{q.index}{both ? ' · both answered' : ''}</span>
        <span className="plus">+{METER.cardBonus}%{together || both ? ' together' : ''}</span></div>
      <p className="q">{q.text}</p>
      <div className="qf">{answering === id ? <form className="ansfield" style={{ flex: 1 }} onSubmit={e => { e.preventDefault(); const v = (e.currentTarget.elements[0] as HTMLInputElement).value.trim(); if (v) answer(id, v) }}>
          <label className="field fx" style={{ ['--fill' as any]: '#071A20' }}><input autoFocus placeholder="Your answer" aria-label="Your answer" data-t="ans-input" /></label><button className="btn fx btn--mint btn--sm" data-t="ans-send">Send</button></form>
        : both ? <div className="ans" style={{ flex: 1 }}><b>{them}</b><span>{a.them}</span><b>You</b><span>{a.me}</span></div>
        : <>
          <span className="who"><span className={`slot ${a.me ? 'ok on' : ''}`} data-t="dot-me"><img src={myAv} alt="" /></span><span className={`slot ${a.them ? 'ok on' : ''}`} data-t="dot-them">{theirAv && <img src={theirAv} alt="" />}</span></span>
          {state === 'new' ? <span>New card · answers stay hidden until you both reply</span> : state === 'you' ? <span>You answered · waiting for {them}…</span> : <span style={{ color: 'var(--c-coral-hi)' }}>{them} answered · your turn</span>}
          {!a.me && <button className="btn fx btn--mint btn--sm" data-t="answer" onClick={() => setAnswering(id)}>Answer</button>}
          {!inChat && a.me && <button className="btn fx btn--ghost btn--sm" data-t="to-chat" onClick={() => dropCard(id)}>To chat</button>}
        </>}</div>
    </div>
  }
  const askSkip = () => { setSkip('out'); send({ t: 'skipreq', level }) }
  const ansSkip = (ok: boolean) => { setSkip(null); send({ t: 'skipans', ok, level }); if (ok) raise(level) } // my accept = my consent
  const devBar = !DEV_SKIP_STAGE || !dev || level >= 5 || skipReq === 'in' ? null : skipReq === 'out' ? <p className="devbar" data-t="skip-out">Asked to skip to {nx?.name}… waiting</p>
    : <div className="devbar"><button className="btn fx btn--ghost btn--sm" data-t="skip-stage" onClick={askSkip}>Dev · skip to {nx?.name}</button></div>
  const press = () => { lp.current = window.setTimeout(() => { const v = !dev; sessionStorage.setItem('pd-dev', v ? '1' : ''); setDev(v) }, 800) }
  const unpress = () => clearTimeout(lp.current)
  const devPress = { onPointerDown: press, onPointerUp: unpress, onPointerLeave: unpress, onContextMenu: (e: React.MouseEvent) => e.preventDefault() }
  const setViewP = (v: 'stage' | 'compact') => { setView(v); try { localStorage.setItem('pd.view', v) } catch {} }
  const go = (t: 'profile' | 'chat' | 'call') => setTab(t)
  // chat system lines: level-ups get a heart + bold level, my answered card a check (as in the design)
  const sysLine = (t: string) => { const lv = /^(Now at [^·]+?)( · .*)$/.exec(t)
    return lv ? <><Icon n="heart" c="var(--c-coral)" /><b>{lv[1]}</b>{lv[2]}</> : t.startsWith('You answered') ? <><Icon n="check" c="var(--c-mint)" />{t}</> : t }
  const dataTab = tab === 'profile' ? 'match' : tab
  const event = !!lvup
  const lvc = LV_COLOR(level)
  const seasonChip = themSeason ? <span className="chip chip--edge" data-t="season-badge"><Icon n={themSeason} c="var(--c-mint)" /> {themSeason[0].toUpperCase() + themSeason.slice(1)}-born</span> : null
  const photoCanvas = <canvas ref={cv} width={480} height={480} data-t="their-photo" aria-label={`${them}'s photo at ${lv.name}`} role="img" />
  const remoteInStage = view === 'stage' && tab === 'call' && call?.kind === 'video'
  const remoteVideo = <video ref={remoteV} playsInline data-t="remote-video" />

  if (screen === 'match' && m) return <div className={`app ${event ? 'is-event' : ''}`} data-tab={dataTab} data-view={view} data-stage={view === 'stage' ? '' : undefined} data-level={level}>
    <div className="stage" style={{ ['--focal' as any]: '50% 26%', ['--clar' as any]: level === 5 ? 1 : Math.min(1, pct / 100) }} aria-hidden={view !== 'stage'}>
      {view === 'stage' && photoCanvas}
      {remoteInStage && remoteVideo}
      <div className="tint" /><div className="tint2" /><div className="scrim-l" /><div className="scrim-b" />
    </div>
    <div className="m">
      <nav className="rail" aria-label="Sections">
        <span className="logo" aria-hidden="true"><Icon n="heart" c="var(--c-coral)" s={5} /></span>
        <button className={`ri ${tab !== 'call' ? 'on' : ''}`} aria-current={tab !== 'call' ? 'page' : undefined} data-t="rail-match" onClick={() => go('profile')}><Icon n="heart" c={tab !== 'call' ? 'var(--cta)' : 'currentColor'} s={3} />Match</button>
        <button className={`ri ${tab === 'call' ? 'on' : ''}`} aria-current={tab === 'call' ? 'page' : undefined} data-t="rail-call" onClick={() => go('call')}><Icon n="call" c={tab === 'call' ? 'var(--cta)' : 'currentColor'} s={3} />Call</button>
      </nav>
      <header className="mhead">
        <div className="who"><Av src={theirAv} level={level} size={40} />
          <div style={{ minWidth: 0 }}><div className="nm">{them}, {bracketLabel(m.them.br)}</div><div className="sub" {...devPress}>LV {level} · {lv.name}{dev && <span className="devsfx"> · dev</span>}</div></div></div>
        <LvBadge level={level} data-t="lvbadge" {...devPress}>{dev && <span className="devsfx"> · dev</span>}</LvBadge>
        <div className="seg seg--sm viewtoggle" role="group" aria-label="Photo view">
          <button className={view === 'stage' ? 'on' : ''} aria-pressed={view === 'stage'} data-t="view-stage" onClick={() => setViewP('stage')} title="Stage view"><Icon n="stage" /><em>Stage</em></button>
          <button className={view === 'compact' ? 'on' : ''} aria-pressed={view === 'compact'} data-t="view-compact" onClick={() => setViewP('compact')} title="Compact view"><Icon n="compact" /><em>Compact</em></button>
        </div>
        <button className="btn fx btn--secondary btn--sm" data-t="skip" onClick={() => doSkip()}><Icon n="skip" />Skip</button>
        {SHOW_BLOCK && <button className="btn fx btn--ghost btn--icon btn--sm" title={`Block ${them}`} aria-label={`Block ${them}`} data-t="block" onClick={() => confirm(`Block ${them} and never match again?`) && doSkip(true)}><NoEntry /></button>}
      </header>
      <section className="hud" aria-label={`${them} · level`}>
        <div className="cab-photo">{view === 'compact' && photoCanvas}
          <span className="chip chip--edge"><Icon n="heart" c={lvc} /> LV {level} · {lv.name}</span>
          <div className="plate"><span className="px">{them}, <span data-t="them-bracket">{bracketLabel(m.them.br)}</span></span>{view === 'compact' && seasonChip && <span className="chip chip--edge"><Icon n={themSeason!} c="var(--c-mint)" /> {themSeason![0].toUpperCase() + themSeason!.slice(1)}-born</span>}</div></div>
        <div className="stage-name px on-stage">{them}</div>
        <p className="lvdesc on-stage">{LV_DESC[level - 1]}</p>
        <div className="chips"><span className="chip chip--edge">{bracketLabel(m.them.br)}</span>
          {seasonChip || <span className="chip chip--locked"><Icon n="lock" c="var(--locked)" /> Birth season unlocks at Spark</span>}</div>
        <div className="meterpanel panel panel--stage fx">
          <div className="mp-meter"><MeterHead level={level} pct={pct} /><Hp level={level} pct={pct} /></div>
          <LevelMap level={level} pct={pct} cls="map--sm" />
          {level < 5 ? <div className="revealrow">{pct >= 100
            ? <button className="btn fx btn--lg" data-t="reveal" data-state="ready" onClick={tapReveal} disabled={taps.me}><Icon n="spark" />{taps.me ? `Waiting for ${them}…` : 'Reveal more'}<span className="meta">{nx?.name}</span></button>
            : <button className="btn fx btn--lg is-disabled" data-t="reveal" data-state="locked" aria-disabled="true"><Icon n="lock" />Reveal more<span className="meta">{Math.floor(pct)}%</span></button>}</div>
            : <div className="revealrow"><button className="btn fx btn--mint btn--lg" onClick={() => go('call')}><Icon n="cam" />Video call</button></div>}
          {(taps.them && !taps.me) ? <p className="hint"><Icon n="heart" c="var(--c-coral-hi)" /> {them} has tapped. Your turn</p> : taps.me && !taps.them ? <p className="hint muted">Waiting for {them} to tap…</p> : null}
          {level > 1 && <button className="lower" data-t="drop" onClick={drop}><Icon n="down" />Lower level</button>}
        </div>
        {tab === 'profile' && card && <div className="hudq">{Q({ id: card.id })}</div>}
      </section>
      <section className="callui" aria-label="Call">
        <div className="ctop"><span className="chip chip--edge">{call ? <><Icon n={call.kind === 'video' ? 'cam' : 'call'} c="var(--c-mint)" /> {call.kind === 'video' ? 'Video' : 'Voice'}{call.remote ? '' : ' · connecting…'}</> : <><Icon n="call" c="var(--c-mint)" /> Call</>}</span><LvBadge level={level} /></div>
        {call ? <>
          <div className="cname">{call.kind === 'video' && !remoteInStage && <div className="fx" style={{ ['--s' as any]: 'var(--step-lg)', padding: 3, maxWidth: 420 }}>{remoteVideo}</div>}
            {call.kind !== 'video' && <video ref={remoteV} playsInline data-t="remote-audio" className="hid" />}
            <span className="px">{them}</span></div>
          {call.kind === 'video' && <div className="pip fx"><video ref={localV} muted playsInline /><span className="chip chip--edge">You · {lv.name}</span></div>}
          <div className="cbar panel panel--stage fx">
            <p className="cnote"><Icon n="lock" c="var(--text-muted)" /> Pixelated on your phone before it's sent: {them} sees you at {lv.name}.</p>
            <div className="cbtns">
              <button className="btn fx btn--secondary btn--sm" data-t="mute" onClick={toggleMute}><Icon n="mic" />{muted ? 'Unmute' : 'Mute'}</button>
              {call.kind === 'video' && <button className="btn fx btn--secondary btn--sm" data-t="cam-off" onClick={toggleCam}><Icon n="cam" />{camOff ? 'Cam on' : 'Cam off'}</button>}
              <button className="btn fx btn--danger btn--sm" data-t="hangup" onClick={() => endCall()}><Icon n="hangup" />Hang up</button>
              <button className="btn fx btn--sm" data-t="call-reveal" disabled={pct < 100 || level === 5 || taps.me} onClick={tapReveal}><Icon n="spark" />Reveal more{pct < 100 ? ` ${Math.floor(pct)}%` : ''}</button>
              <button className="btn fx btn--ghost btn--sm" data-t="call-drop" disabled={level === 1} onClick={drop}><Icon n="down" />Lower level</button>
            </div>
            {taps.them && !taps.me && <p className="hint">{them} has tapped. Your turn</p>}
          </div>
        </> : <div className="idle">
          <span className="px on-stage" style={{ fontSize: 56, lineHeight: .9 }}>{them}</span>
          {ring?.dir === 'out' ? <div className="ringcard panel panel--stage fx" data-t="ring-out"><p>Calling {them} ({ring.kind})… waiting for them to accept</p><button className="btn fx btn--ghost btn--sm" onClick={cancelRing}>Cancel</button></div>
            : <div className="acts"><button className="btn fx btn--secondary" data-t="call-voice" onClick={() => requestCall('voice')}><Icon n="call" />Voice call</button>
              <button className="btn fx btn--mint" data-t="call-video" onClick={() => requestCall('video')}><Icon n="cam" />Video call</button></div>}
          <p className="cnote"><Icon n="lock" c="var(--text-muted)" /> Pixelated on your phone before it's sent: {them} sees you at {lv.name}. They accept first.</p>
        </div>}
      </section>
      <aside className="chat" aria-label={`Chat with ${them}`}>
        <div className="cin" />
        <div className="chead"><Av src={theirAv} level={level} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}><div className="nm">{them}, {bracketLabel(m.them.br)}</div><div className="sub">Matched · {matchedAt.current} · LV {level} {lv.name}</div></div>
          <button className="btn fx btn--secondary btn--icon btn--sm" aria-label="Voice call" data-t="chead-voice" onClick={() => { go('call'); if (!call && !ring) requestCall('voice') }}><Icon n="call" /></button>
          <button className="btn fx btn--secondary btn--icon btn--sm" aria-label="Video call" data-t="chead-video" onClick={() => { go('call'); if (!call && !ring) requestCall('video') }}><Icon n="cam" /></button></div>
        <div className="chatlog" role="log" aria-live="polite" ref={logEl} onScroll={onLogScroll}>
          <p className="day">Matched · {matchedAt.current}</p>
          {msgs.map((x, i) => x.pair ? <div key={i} className="pairlog fx" data-t="pair-log">
              <div className="ph"><Icon n="cards" c="var(--c-mint)" /> {LEVELS[cardById(x.pair)!.level - 1].name} · {qn(x.pair)} · both answered<span className="combo-k">Combo +{METER.cardBonus}%</span></div>
              <div className="pq">{cardById(x.pair)!.text}</div>
              <div className="pa"><b>{them}</b><span data-t="pair-them">{ans[x.pair]?.them}</span><b>You</b><span>{ans[x.pair]?.me}</span></div></div>
            : x.from === 'sys' ? <p key={i} className="sys">{sysLine(x.text || '')}</p>
            : x.card ? <div key={i}>{Q({ id: x.card, inChat: true })}</div>
            : <div key={i} className={`bub bub--${x.from === 'me' ? 'me' : 'them'}`} data-t={'msg-' + x.from}>{x.text}</div>)}
        </div>
        {card && !(ans[card.id]?.me && ans[card.id]?.them) && !msgs.some(x => x.card === card.id) && <div className="pinq" data-t="pinned-card">{Q({ id: card.id, inChat: true })}</div>}
        {devBar}
        <form className="composer" onSubmit={e => { e.preventDefault(); chat() }}>
          <label className="field fx"><input value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Message ${them}…`} aria-label={`Message ${them}`} data-t="chat-input" /></label>
          <button className="btn fx btn--coral btn--icon" aria-label="Send" data-t="chat-send"><Icon n="send" c="var(--edge)" /></button></form>
      </aside>
      <nav className="tabbar" aria-label="Sections">
        {(['profile', 'chat', 'call'] as const).map(t => <button key={t} className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} data-t={'tab-' + t} onClick={() => go(t)}>
          <Icon n={t === 'profile' ? 'heart' : t} s={3} />{t === 'profile' ? 'Match' : t === 'chat' ? 'Chat' : 'Call'}{t === 'chat' && unread > 0 && tab !== 'chat' && <span className="badge" data-t="unread">{unread}</span>}</button>)}
      </nav>
    </div>
    <div className="toastwrap" aria-live="polite">
      {call && tab !== 'call' && <button className="toast fx toast--success" data-t="to-call" onClick={() => go('call')}><span className="ic-wrap"><Icon n="call" c="var(--c-mint)" /></span><span><b>In call with {them}</b>Open call</span></button>}
      {skipReq === 'in' && DEV_SKIP_STAGE && dev && <div className="toast fx toast--warn" data-t="skip-in"><span><b>{them} wants to skip to {nx?.name}</b>Dev tool</span>
        <span className="acts"><button className="btn fx btn--sm" data-t="skip-accept" onClick={() => ansSkip(true)}>Accept</button><button className="btn fx btn--ghost btn--sm" data-t="skip-decline" onClick={() => ansSkip(false)}>Decline</button></span></div>}
      {evt?.kind === 'turn' && <button className="toast fx toast--turn" data-t="ans-turn" onClick={() => { setEvt(null); setTab('profile'); setAnswering(evt.id) }}>
        <span className="ic-wrap"><Icon n="cards" c="var(--c-mint)" /></span><span><b>{them} answered, your turn</b>{qn(evt.id)} · {cardById(evt.id)?.text}</span></button>}
    </div>
    {ring?.dir === 'in' && <div className="layer" data-t="ring-in" role="dialog" aria-label={`Incoming ${ring.kind} call`}>
      <div className="modal fx"><div style={{ display: 'grid', placeItems: 'center', marginBottom: 14 }}><Av src={theirAv} level={level} size={96} /></div>
        <p className="eyebrow"><Icon n="call" c="var(--cta)" /> Incoming · {ring.kind}</p><h2>{them} is calling</h2>
        <p>You'll see each other at {lv.name}. Pixelated on each phone before it's sent.</p>
        <div className="acts"><button className="btn fx btn--mint" data-t="call-accept" onClick={acceptCall}><Icon n="call" />Accept</button><button className="btn fx btn--danger" data-t="call-decline" onClick={declineCall}><Icon n="hangup" />Decline</button></div></div></div>}
    {evt?.kind === 'pair' && ans[evt.id]?.me && ans[evt.id]?.them && <div className="layer" data-t="ans-pair" role="dialog" aria-label="Both answered" onClick={e => { if (e.target === e.currentTarget) setEvt(null) }}>
      <div className="mwrap"><span className="stamp" aria-hidden="true">Combo!</span>
        <div className="modal fx"><p className="eyebrow"><Icon n="cards" c="var(--cta)" /> {qn(evt.id)} · both answered</p>
          <p className="qt">{cardById(evt.id)?.text}</p>
          <div className="flip"><div className="fx"><b>{them}</b><span>{ans[evt.id].them}</span></div><div className="fx"><b>You</b><span>{ans[evt.id].me}</span></div></div>
          <TickMeter level={level} from={evt.from} to={pct} />
          <div className="acts">{pct >= 100 && level < 5 ? <button className="btn fx btn--lg" data-t="evt-reveal" onClick={() => { setEvt(null); setTab('profile'); tapReveal() }}><Icon n="spark" />Reveal more</button>
            : <button className="btn fx" data-t="evt-close" onClick={() => setEvt(null)}>Keep chatting</button>}</div></div></div></div>}
    {readyOpen && !evt && !lvup && level < 5 && pct >= 100 && <div className="layer" data-t="ready" role="dialog" aria-label="Ready to see more" onClick={e => { if (e.target === e.currentTarget) setReadyOpen(false) }}>
      <div className="modal fx"><p className="eyebrow"><Icon n="spark" c="var(--cta)" /> Meter full</p>
        <h2>Ready to see more?</h2>
        <Hp level={level} pct={100} cls="hp--lg" />
        <p>{taps.me ? `Waiting for ${them}…` : taps.them ? `${them} is ready. Your turn to reveal ${nx?.name}.` : `You both filled the meter. Reveal ${nx?.name} when you're both ready.`}</p>
        <div className="acts">{taps.me ? <p className="eyebrow" data-t="ready-waiting"><Icon n="heart" c="var(--c-coral)" /> Waiting for {them}…</p>
          : <button className="btn fx btn--lg" data-t="ready-reveal" onClick={tapReveal}><Icon n="spark" />Reveal more</button>}
          <button className="btn fx btn--ghost" onClick={() => setReadyOpen(false)}>Later</button></div></div></div>}
    {lvup && <div className="event" data-t="lvup" onClick={() => setLvup(null)}>
      <div className="burst" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => <i key={k} style={{ ['--a' as any]: k * 36 + 'deg', ['--c' as any]: k % 2 ? 'var(--cta)' : 'var(--c-coral)' }} />)}</div>
      <div className="ev-in">
        <div className="lvphoto"><canvas ref={lvCv} width={480} height={480} /></div>
        <span className="stamp">Level up!</span>
        <h2 className="lvl" data-t="lvup-name" style={{ color: LV_COLOR(lvup.to) }}>LV {lvup.to} · {LEVELS[lvup.to - 1].name}</h2>
        <span className="blocks">{LEVELS[lvup.to - 1].blocks ? `${LEVELS[lvup.to - 1].blocks} blocks` : 'Full photo'} · {LV_DESC[lvup.to - 1]}</span>
        <div className="evpanel panel panel--stage fx" onClick={e => e.stopPropagation()}><Hp level={lvup.to} pct={0} /><LevelMap level={lvup.to} pct={0} cls="map--sm" />
          <button className="btn fx" data-t="lvup-close" onClick={() => setLvup(null)}>Keep chatting</button></div>
      </div></div>}
  </div>

  return <div className="legacy"><div className="app px">
    <div className="screen scroll home">
      <header className="bar"><img src={`${B}px/logo/logo-2.svg`} alt="pixeldate" /><img className="av" src={myAv} alt="" /></header>
      <div className="stage">
        <img src={`${B}px/hero/hero-dusk@2x.png`} width={390} height={300} alt="" />
        <span className="px-frame px-chip chip"><Ic n="heart" s={8} /> {me!.seek === 'everyone' ? 'EVERYONE' : me!.seek.toUpperCase()} · {me!.min}–{me!.max >= AGE_TOP ? AGE_TOP + '+' : me!.max}</span>
        {screen === 'finding' && <div className="sprite" data-t="finding" />}
      </div>
      <div className="copy">{screen === 'finding' ? <><h1 className="h1">Finding someone…</h1><p className="read m">Hang tight. As soon as someone is free, you'll both start as Strangers.</p></>
        : <><h1 className="h1 hi">Hi {me!.name}, ready to meet?</h1><p className="read m">We'll pair you with someone at random. You both start as Strangers: 8 blocks.</p></>}</div>
      {notice && <p className="px-label px-coral-l">{notice.toUpperCase()}</p>}
      {screen === 'finding' ? <button className="px-frame px-btn big" data-t="cancel" onClick={() => { net.current!.cancel(); setScreen('lobby') }}><span className="px-btn__label">Cancel</span></button>
        : <button className="px-frame px-btn big" data-t="find" disabled={!code} onClick={find}><Ic n="matches" /><span className="px-btn__label">{code ? 'Find someone' : 'Connecting…'}</span></button>}
      <div className="ladder"><div className="mtop"><span className="px-label-b px-cream">STRANGER</span><span className="px-label">LV 1 OF 5</span></div><Meter level={1} pct={0} /></div>
      <div className="px-frame px-card codecard">
        <p className="px-label">MEETING A FRIEND? <b className="px-cream" data-t="code">{code ? code.toUpperCase() : '…'}</b></p>
        <div className="ansrow"><input className="px-frame px-input fld" value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="Friend's code" data-t="joincode" />
          <button className="px-frame px-btn-small join" onClick={doJoin} data-t="join">JOIN</button></div>
      </div>
      <p className="px-label safe"><Ic n="lock" s={8} /> 18+ · SKIP OR BLOCK ANYTIME</p>
    </div>
  </div></div>
}
