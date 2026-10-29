/* R2 signup: a 5-step split. 1 You · 2 Your photo (+ 2b the ladder) · 3 Your character (Pixel You, SPEC step 3, lazy,
   skippable) · 4 Birthday · 5 Who you'd like to meet.
   Photos are only ever pixelated on this device; the raw image stays in memory here and is handed to the app. */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { store, bracketOf, bracketLabel, type Profile, type Gender, type Seek } from '../net'
import { Icon } from '../ui/parts'
import type { IconName } from '../ui/icons'
import { Ladder } from './Ladder'
import { PixelPick } from '../ui/pixel-gender'
import { toast, dismiss, Toasts } from '../ui/toast'
import { AGE_TOP, EDGES, ageFrom, reduceMotion, seasonOf, snapRange } from './shared'

const B = import.meta.env.BASE_URL
const STEPS = ['You', 'Your photo', 'Your character', 'Birthday', 'Who you’d like to meet']
const N = STEPS.length
// Pixel You (flow + kit atlas) is its own lazy chunk; the detection engine and models load only on its photo route
const loadFlow = () => import('../avatar/flow/flow')
const AvatarFlow = lazy(loadFlow)
// per tab, so two tabs in one browser are different people
const uid = () => { let u = sessionStorage.getItem('pd-uid'); if (!u) { u = crypto.randomUUID(); sessionStorage.setItem('pd-uid', u) } return u }
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

function AgeRange({ min, max, onChange }: { min: number; max: number; onChange: (a: number, b: number) => void }) {
  const i = EDGES.indexOf(min), j = max >= AGE_TOP ? 7 : EDGES.indexOf(max + 1), f = (k: number) => k / 7 * 100 + '%'
  const val = (k: number) => k === 7 ? AGE_TOP : EDGES[k] - 1, show = (n: number) => n >= AGE_TOP ? AGE_TOP + '+' : String(n)
  return <div className="card fx">
    <div className="meterhead"><span className="fl" id="lab-aged">Aged</span><span className="rv" data-t="range-val" aria-live="polite">{show(min)} – {show(max)}</span></div>
    <div className="range" style={{ ['--lo' as any]: f(i), ['--hi' as any]: f(j) }}>
      <div className="track"><span className="sel" /><span className="kn lo" /><span className="kn hi" />
        <input type="range" min={0} max={7} step={1} value={i} aria-label="Minimum age" aria-valuetext={String(min)} data-t="min" onChange={e => { const k = Math.min(+e.target.value, j - 1); onChange(EDGES[k], max) }} />
        <input type="range" min={0} max={7} step={1} value={j} aria-label="Maximum age" aria-valuetext={show(max)} data-t="max" onChange={e => { const k = Math.max(+e.target.value, i + 1); onChange(min, val(k)) }} /></div>
      <div className="ticks" aria-hidden="true">{EDGES.map(e => <span key={e}>{e === AGE_TOP ? '70+' : e}</span>)}</div>
    </div>
    <p className="help">Snaps to brackets. Matching works both ways: you'll only meet people whose range includes you.</p>
  </div>
}

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')
const NOW_Y = new Date().getFullYear(), Y_MIN = NOW_Y - 70, Y_MAX = NOW_Y - 18, ROW = 32
/** Month tiles + scroll-snap year reel. The year and month stay on this device. */
function Birthday({ by, bm, onChange }: { by: number; bm: number; onChange: (by: number, bm: number) => void }) {
  const reel = useRef<HTMLDivElement>(null), years = useMemo(() => Array.from({ length: Y_MAX - Y_MIN + 1 }, (_, i) => Y_MIN + i), [])
  const t = useRef(0)
  useEffect(() => { const r = reel.current; if (r) r.scrollTop = (by - Y_MIN) * ROW }, []) // initial position only
  const onScroll = () => { clearTimeout(t.current); t.current = window.setTimeout(() => { const r = reel.current; if (!r) return; const y = Y_MIN + Math.round(r.scrollTop / ROW); if (y !== by && y >= Y_MIN && y <= Y_MAX) onChange(y, bm) }, 60) }
  const go = (y: number) => { const v = Math.max(Y_MIN, Math.min(Y_MAX, y)); reel.current?.scrollTo({ top: (v - Y_MIN) * ROW, behavior: reduceMotion() ? 'auto' : 'smooth' }); onChange(v, bm) }
  const age = bm ? ageFrom(by, bm) : null, minor = age !== null && age < 18
  const br = age !== null && !minor ? bracketLabel(bracketOf(Math.min(age, AGE_TOP))) : null
  return <>
    <div className="bday" data-t="bday">
      <div><span className="fl" id="lab-month">Month</span>
        <div className="months" role="radiogroup" aria-labelledby="lab-month">{MONTHS.map((m, i) => { const s = seasonOf(i + 1), on = bm === i + 1
          return <button key={m} type="button" role="radio" aria-checked={on} className={`s-${s}${on ? ' on' : ''}`} data-t={'month-' + (i + 1)} onClick={() => onChange(by, i + 1)}>
            <Icon n={s} c={on ? 'var(--edge)' : 'var(--sc)'} s={3} />{m}</button> })}</div></div>
      <div><span className="fl" id="lab-year">Year</span>
        <div className="reel" ref={reel} onScroll={onScroll} tabIndex={0} role="listbox" aria-labelledby="lab-year" aria-activedescendant={'yr-' + by} data-t="year-reel"
          onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); go(by - 1) } if (e.key === 'ArrowDown') { e.preventDefault(); go(by + 1) } }}>
          {years.map(y => <span key={y} id={'yr-' + y} role="option" aria-selected={y === by} className={'yr' + (y === by ? ' on' : '')} onClick={() => go(y)}>{y}</span>)}</div></div>
    </div>
    {minor
      ? <div className="readout fx err" role="alert" data-t="under18"><span className="ro"><Icon n="alert" c="var(--error)" s={3} />
          <span><b>You need to be 18 or over to use Pixeldate.</b><span className="help">Your birthday stays on this device.</span></span></span></div>
      : <div className="readout fx" data-t="bday-readout" aria-live="polite">
          <span className="ro">{age === null ? <b>Pick your birth month</b> : <><b>You're {Math.min(age, AGE_TOP)}{age >= AGE_TOP ? '+' : ''}</b>
            <span className="chip chip--mint"><Icon n={seasonOf(bm)} c="var(--c-mint)" />{cap(seasonOf(bm))}-born</span></>}</span>
          <span className="label to">Matches see <span data-t="bracket">{br || '—'}</span></span></div>}
    {!minor && <p className="help lockhelp"><Icon n="lock" c="var(--text-muted)" /> Your birth season badge unlocks at Spark as an icebreaker. Year, month and exact age never leave this device.</p>}
  </>
}

const Eyebrow = ({ n, c, children }: { n: IconName; c: string; children: React.ReactNode }) => <div className="eyebrow"><Icon n={n} c={c} />{children}</div>

/** `resume`: a stored profile that is under 18 or has no valid birthday. It re-enters at Birthday (re-pick, so the
    bracket is rebuilt) and must pass the 18+ confirmation again before the app opens. */
export default function Signup({ onDone, resume }: { onDone: (p: Profile, photo: string) => void; resume?: { p: Profile; photo: string } }) {
  const R = resume?.p
  const [step, setStep] = useState(R ? 4 : 1)
  const [name, setName] = useState(R?.name || ''); const [iam, setIam] = useState<Gender | null>(R?.iam || null)
  const [photo, setPhoto] = useState(resume?.photo || ''); const [pav, setPav] = useState<string | null>(R?.pav || null); const [okPhoto, setOkPhoto] = useState(!!R); const [ctas, setCtas] = useState(false)
  const saved = useMemo(() => { if (R) return null; try { return JSON.parse(store.getItem('pd-bday') || '') } catch { return null } }, []) // resume: no prefilled birthday
  const [by, setBy] = useState<number>(saved?.by || NOW_Y - 25); const [bm, setBm] = useState<number>(saved?.bm || 0); const age = bm ? ageFrom(by, bm) : 0
  const [seek, setSeek] = useState<Seek | null>(R?.seek || null); const [min, setMin] = useState(R ? snapRange(R.min, R.max)[0] : 18); const [max, setMax] = useState(R ? snapRange(R.min, R.max)[1] : AGE_TOP); const [adult, setAdult] = useState(false)
  const [cam, setCam] = useState<MediaStream | null>(null); const vid = useRef<HTMLVideoElement>(null); const fileIn = useRef<HTMLInputElement>(null)
  const h1 = useRef<HTMLHeadingElement>(null), moved = useRef(false)
  useEffect(() => { if (cam && vid.current) { vid.current.srcObject = cam; vid.current.play() } }, [cam])
  useEffect(() => () => cam?.getTracks().forEach(t => t.stop()), [cam])
  useEffect(() => { if (moved.current) h1.current?.focus({ preventScroll: true }); scrollTo(0, 0) }, [step, !!photo])
  // warm the post-signup app while the user is busy here (it is lazy so the first paint stays small)
  useEffect(() => { const w = () => void import('../App'); const id = (window.requestIdleCallback || setTimeout)(w, { timeout: 4000 } as any); return () => (window.cancelIdleCallback || clearTimeout)(id) }, [])

  const go = (n: number) => {
    moved.current = true
    setStep(n) // .pbody is keyed by step and plays a short CSS entry (none under reduced motion); no View Transition, so taps are never swallowed mid-animation
  }
  const setPic = (p: string) => { dismiss('cam'); setPhoto(p); setOkPhoto(false); setCtas(false); moved.current = true }
  const snap = () => { const v = vid.current!, c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d')!.drawImage(v, 0, 0); setPic(c.toDataURL('image/jpeg', .9)); cam!.getTracks().forEach(t => t.stop()); setCam(null) }
  const file = (f?: File) => { if (f) { const r = new FileReader(); r.onload = () => setPic(String(r.result)); r.readAsDataURL(f) } }
  const openCam = async () => { try { setCam(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })) } catch { toast({ id: 'cam', role: 'error', icon: 'cam', t: 'notice-cam', title: 'Camera unavailable', body: 'Another app may be using it, or access is blocked. Try Gallery instead.' }) } }
  const minor = bm > 0 && age < 18
  const finish = () => { const a = Math.min(age, AGE_TOP), [lo, hi] = snapRange(min, max); if (a < 18 || !iam || !seek) return; store.setItem('pd-bday', JSON.stringify({ by, bm })); setMin(lo); setMax(hi); onDone({ name: name.trim(), age: a, by, bm, min: lo, max: hi, iam, seek, uid: R?.uid || uid(), ...(pav ? { pav } : {}) }, photo) }

  const ladder = step === 2 && !!photo
  const next = (label: string, enabled: boolean, onClick: () => void, t = 'next') =>
    <button type="button" className="btn fx btn--lg" data-t={t} disabled={!enabled} onClick={onClick}>{label}{enabled && <Icon n="next" c="var(--edge)" />}</button>

  let body: React.ReactNode, foot: React.ReactNode, footCls = ''
  const H = (t: string) => <h1 className="px" ref={h1} tabIndex={-1}>{t}</h1>
  if (step === 1) {
    body = <>
      <div><Eyebrow n="heart" c="var(--c-coral)">Create your profile</Eyebrow>{H('Blurry until you both choose.')}</div>
      <div><label className="fl" htmlFor="pd-name">Name</label>
        <span className="field fx"><input id="pd-name" value={name} maxLength={20} autoComplete="given-name" enterKeyHint="next" onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim() && iam) go(2) }} placeholder="Your first name" data-t="name" aria-describedby="pd-name-h" /></span>
        <div className="help" id="pd-name-h">This is what matches see, with your age bracket. Max 20 characters.</div></div>
      <div><span className="fl" id="lab-iam">I am</span><PixelPick labelledby="lab-iam" name="iam" value={iam} onChange={setIam} opts={[['man', 'Man', 'man'], ['woman', 'Woman', 'woman']]} /></div>
    </>
    foot = next('Continue', !!(name.trim() && iam), () => go(2)) // no default "I am": Continue waits for a pick
  } else if (step === 2 && !ladder) {
    body = <>
      <div><Eyebrow n="heart" c="var(--c-coral)">Create your profile</Eyebrow>{H('Add a selfie')}
        <p className="lede">Your photo is pixelated on your phone before anything is sent. Matches start at 8 blocks.</p></div>
      <div className="drop fx">{cam ? <video ref={vid} muted playsInline className="cam" />
        : <><span className="av av--96 av--empty"><img alt="" /></span><Icon n="cam" c="var(--text-muted)" s={4} /><span className="muted">A clear, front-facing photo works best.</span></>}</div>
      <div className="pick">
        {cam ? <button type="button" className="btn fx btn--lg" data-t="snap" onClick={snap}><Icon n="cam" c="var(--edge)" s={3} />Snap</button>
          : <button type="button" className="btn fx btn--lg" data-t="camera" onClick={openCam}><Icon n="cam" c="var(--edge)" s={3} />Camera</button>}
        <button type="button" className="btn fx btn--secondary btn--lg" data-t="add-selfie" onClick={() => fileIn.current?.click()}><Icon n="image" c="var(--text)" s={3} />Gallery</button>
      </div>
    </>
    foot = next('Continue', false, () => {})
  } else if (ladder) {
    body = <>
      <div><Eyebrow n="spark" c="var(--cta)">Create your profile · this is the magic part</Eyebrow>{H('This is how they\'ll meet you.')}
        <p className="lede">Every answer you share together brings you into focus.</p></div>
      <Ladder src={photo} name={name} intro={!okPhoto} onCtas={setCtas} />
    </>
    footCls = 'rv-acts' + (ctas ? '' : ' hid')
    foot = <>
      <button type="button" className="btn fx btn--ghost btn--lg" data-t="photo-change" tabIndex={ctas ? 0 : -1} onClick={() => setPic('')}>Change photo</button>
      <button type="button" className="btn fx btn--lg" data-t="photo-confirm" tabIndex={ctas ? 0 : -1} onClick={() => { setOkPhoto(true); go(3) }} onPointerEnter={() => void loadFlow()} onFocus={() => void loadFlow()}>Looks good, continue<Icon n="next" c="var(--edge)" /></button>
    </>
  } else if (step === 3) {
    // SPEC: "Screens (step 3 of signup ...)". The flow is a full-screen phone layout of its own; Skip keeps signup moving.
    return <div className="app flow" data-step="3"><Suspense fallback={<div className="avf-wait" data-t="av-wait" />}>
      <AvatarFlow step={`Step 3 of ${N}`} initial={pav} onExit={() => go(2)} onSkip={() => { setPav(null); go(4) }} onSave={j => { setPav(j); go(4) }} /></Suspense></div>
  } else if (step === 4) {
    body = <>
      <div><Eyebrow n="spring" c="var(--c-mint)">When did your story start?</Eyebrow>{H('Your birthday')}<p className="lede">Matches only ever see your age bracket.</p></div>
      {R && <div className="readout fx err" role="alert" data-t="recheck"><span className="ro"><Icon n="alert" c="var(--error)" s={3} />
        <span><b>Pixeldate is 18+.</b><span className="help">Pick your birthday again and confirm you're 18 or over to continue.</span></span></span></div>}
      <Birthday by={by} bm={bm} onChange={(y, m) => { setBy(y); setBm(m) }} />
    </>
    foot = next('Continue', bm > 0 && !minor, () => go(5))
  } else {
    body = <>
      <div><Eyebrow n="heart" c="var(--c-coral)">Last step</Eyebrow>{H('Who would you like to meet?')}</div>
      <div><span className="fl" id="lab-seek">I want to meet</span><PixelPick labelledby="lab-seek" name="seek" value={seek} onChange={setSeek} opts={[['men', 'Men', 'man'], ['women', 'Women', 'woman']]} /></div>
      <label className={'card fx adult' + (adult ? ' is-on' : '')} data-t="adult-card">
        <span className="tx"><b id="adult-l">I'm 18 or over</b><span className="help" id="adult-h">Pixeldate is for adults only. Confirm to continue.</span></span>
        <input className="vh" type="checkbox" role="switch" required aria-required="true" aria-labelledby="adult-l" aria-describedby="adult-h" checked={adult} onChange={e => setAdult(e.target.checked)} data-t="adult" />
        <span className={'toggle' + (adult ? ' is-on' : '')} data-t="adult-box" data-on={adult ? 1 : 0} aria-hidden="true"><i /></span></label>
      <AgeRange min={min} max={max} onChange={(a, b) => { setMin(a); setMax(b) }} />
    </>
    const ok = !!(name.trim() && iam && seek && photo && okPhoto && adult && bm > 0 && age >= 18)
    foot = next('Continue', ok, finish, 'start')
  }
  const back = step === 1 ? <a className="btn fx btn--ghost btn--icon btn--sm" href={B} aria-label="Back to home" data-t="back"><Icon n="back" c="var(--text)" /></a>
    : <button type="button" className="btn fx btn--ghost btn--icon btn--sm" aria-label={'Back to ' + STEPS[step - 2]} data-t="back" onClick={() => go(step - 1)}><Icon n="back" c="var(--text)" /></button>

  return <div className="app flow" data-step={ladder ? '2b' : step}>
    <input ref={fileIn} type="file" accept="image/*" hidden data-t="gallery" onChange={e => { file(e.target.files?.[0]); e.target.value = '' }} />
    <div className="page">
      <aside className="pside"><img className="art" src={`${B}art/landing-hero-tall.webp`} alt="" loading="lazy" decoding="async" /><div className="art-tint" />
        <div><span className="logo" style={{ ['--logo' as any]: '40px' }}><Icon n="heart" c="var(--c-coral)" s={4} /><span>pixel<b>date</b></span></span></div>
        <div><p className="px ptitle">Create your profile</p><p className="lede">Blurry until you both choose.</p>
          <ol className="steplist">{STEPS.map((s, i) => <li key={s} className={i + 1 < step ? 'done' : i + 1 === step ? 'on' : ''} aria-current={i + 1 === step ? 'step' : undefined}>
            <b>{i + 1 < step ? <Icon n="check" c="var(--edge)" /> : i + 1}</b>{s}</li>)}</ol></div>
        <p className="label">18+ · Skip or block anytime</p></aside>
      <main className="pmain">
        <div className="ptop">{back}<span className="label" data-t="step-label">Step {step} of {N} · {STEPS[step - 1]}</span><span className="sp" /></div>
        <div className="stepper" aria-hidden="true">{STEPS.map((_, k) => k + 1).map(i => <i key={i} className={i < step ? 'done' : i === step ? 'on' : ''} />)}</div>
        <Toasts where="page" cls="ptoasts" />
        <div className="pbody" key={step + (photo && step === 2 ? 'b' : '')}>{body}</div>
        <div className={'pfoot ' + footCls}>{foot}</div>
      </main>
    </div>
  </div>
}
