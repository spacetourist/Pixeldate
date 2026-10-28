/* The "Pixel you" screens (upload -> Got you! -> tweak, plus Build it by hand), per GD's mocks m1/m2/m3 and SPEC.
   v0.4: wired in as signup step 3 (skippable) and You › Profile › Your character (edit), via <Flow> props; ?avatar=flow
   still mounts it standalone for testing. Lazy chunk.
   Downloads (WASM + models) start only when the user picks the photo route; Build it by hand never downloads. The
   photo is shown from a local object URL and analysed in our own Worker; only the ~200 B options JSON is stored. */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Mode, Progress, Result } from '../index'
import { composeRGBA, drawAvatar, loadAtlas, type Atlas, type KitOptions } from '../kit/compose'
import { ACCS, BASE, BEARDS, BOTTOMS, BUILDS, CLOTH, HAIRC, HAIRS, SAMPLES, SHOES, SKIN, TOPS } from '../kit/kit.gen'
import { NEUTRAL, mapDescriptor, parseOptions, preview, save, type Mapped, type Row } from '../kit/map'
import silhouette from '../kit/silhouette.png'
import './flow.css'

const MODE: Mode = new URLSearchParams(location.search).get('seg') === 'full' ? 'full' : 'lite'
type Screen = 'upload' | 'got' | 'tweak' | 'done'
type Tab = 'Body' | 'Hair' | 'Top' | 'Bottom' | 'Shoes' | 'Extras'
const TABS: Tab[] = ['Body', 'Hair', 'Top', 'Bottom', 'Shoes', 'Extras']
const ROW_TAB: Record<Row, Tab> = { skin: 'Body', hair: 'Hair', top: 'Top', bottom: 'Bottom', legs: 'Bottom', shoes: 'Shoes', extras: 'Extras' }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')
const mb = (n: number) => (n / 1e6).toFixed(1)
let api: Promise<typeof import('../index')> | null = null
const detection = () => (api ??= import('../index'))

function Px({ atlas, o, scale }: { atlas: Atlas | null; o: KitOptions; scale: number }) {
  const c = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (atlas && c.current) drawAvatar(c.current, atlas, o, scale) }, [atlas, o, scale])
  return <canvas ref={c} width={24 * scale} height={32 * scale} aria-hidden />
}

/** The app's health-bar meter markup (.hp: 5 cells x 10 ticks) driven by download progress. */
function Meter({ p }: { p: Progress | null }) {
  const pct = p && p.total ? Math.min(100, (p.loaded / p.total) * 100) : 0, ticks = Math.floor(pct / 2) // 50 ticks
  return <div className="hp hp--lg" role="progressbar" aria-label="Getting the pixel kit ready" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
    {[0, 1, 2, 3, 4].map(i => { const t = ticks - i * 10, st = t >= 10 ? 'full' : t > 0 ? 'cur' : ''
      return <span key={i} className={`cell ${st}`}><i style={st === 'cur' ? { ['--p' as any]: t * 10 + '%' } : undefined} /></span> })}
  </div>
}

/** Where the flow is running: the signup step label and its Back, or the profile editor's. */
const Ctx = createContext<{ step?: string; onExit?: () => void }>({})
/** raw options JSON and raw exception text are developer-only: ?avatar=flow&avatar=debug */
const DBG = /[?&]avatar=debug\b/.test(location.search)
function Top({ onBack }: { onBack?: () => void }) {
  const { step, onExit } = useContext(Ctx)
  return <div className="av-top"><button className="av-back" aria-label="Back" onClick={onBack ?? onExit} data-t="av-back">‹</button>{step && <div className="av-step" data-t="av-step">{step}</div>}</div>
}

function Upload({ onPhoto, onHand, onCurrent, onSkip, progress, busy, error }: { onPhoto: (f: File) => void; onHand: () => void; onCurrent?: () => void; onSkip?: () => void; progress: Progress | null; busy: string; error: { message: string; detail?: string } | null }) {
  const start = () => { void detection().then(m => m.preload(MODE, p => (window as any).__pdFlowProgress?.(p))) }
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f) }
  const loading = progress && progress.loaded < progress.total
  return <>
    <Top />
    <h1 className="av-t">Make your<br /><b>pixel you</b></h1>
    <p className="av-p">One full-length photo and we'll build a character that dresses like you. It shows on your profile before photos unlock.</p>
    {progress || busy ? <div className="av-load" style={{ margin: '20px 20px 0' }} aria-live="polite">
      <div className="meterhead">{loading || !busy ? 'Getting the pixel kit ready' : busy}<span>{progress ? Math.floor((progress.loaded / progress.total) * 100) : 0}%</span></div>
      <Meter p={progress} />
      <small>{progress ? `${mb(progress.loaded)} of ${mb(progress.total)} MB · once per phone, then it's instant` : ''}</small>
    </div> : <div className="av-drop"><div><img src={silhouette} width={144} height={192} alt="" /><small>Head to toe · good light · just you</small></div></div>}
    {error && <div className="av-err" role="alert" style={{ marginTop: 14 }}>{error.message}{error.detail && <small>{error.detail}</small>}</div>}
    <div style={{ padding: '14px 20px 0' }}><span className="av-chip">🔒 Your photo never leaves this phone</span></div>
    <div className="av-cta">
      <label className="av-btn y">Take a photo<input type="file" accept="image/*" capture="environment" onClick={start} onChange={pick} data-t="av-camera" /></label>
      <label className="av-btn">Choose from library<input id="pd-file" type="file" accept="image/*" onClick={start} onChange={pick} data-t="av-library" /></label>
      {onCurrent && <button className="av-btn" onClick={onCurrent} data-t="av-current">Tweak my current character</button>}
      <button className="av-link" onClick={onHand} data-t="av-hand">{loading ? 'Slow connection? Build it by hand' : 'Build it by hand'}</button>
      {onSkip && <button className="av-link av-skip" onClick={onSkip} data-t="av-skip">Skip for now</button>}
    </div>
  </>
}

function boxes(r: Extract<Result, { ok: true }>) {
  const L = r.landmarks, { w, h } = r.size, s = Math.max(150 / w, 300 / h), ox = (150 - w * s) / 2, oy = (300 - h * s) / 2
  const bb = (ids: number[], pad = 0.04) => {
    const xs = ids.map(i => L[i].x), ys = ids.map(i => L[i].y)
    const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys), y1 = Math.max(...ys)
    return { left: ox + x0 * w * s, top: oy + y0 * h * s, width: (x1 - x0) * w * s, height: (y1 - y0) * h * s }
  }
  const head = r.masks.find(m => m.name === 'head')!
  return {
    head: { left: ox + head.x0 * s, top: oy + head.y0 * s, width: head.w * s, height: head.h * s },
    torso: bb([11, 12, 23, 24]), legs: bb([23, 24, 27, 28, 29, 30, 31, 32]),
  }
}

function Rows({ o, check, onRow }: { o: KitOptions; check: Mapped['check']; onRow: (r: Row) => void }) {
  const cl = (k: string) => CLOTH[k]?.[0], dress = o.top === 'dress'
  const rows: [Row, string, string | undefined, string][] = [
    ['skin', 'Skin', SKIN[o.skin]?.[0], cap(o.skin)],
    ['hair', 'Hair', HAIRC[o.hairc]?.[0], `${cap(o.hairc)} · ${o.hair}`],
    ['top', 'Top', cl(o.topc), `${cap(o.topc)} ${o.top}`],
    ['bottom', 'Bottom', cl(dress ? o.topc : o.bottomc), dress ? 'Part of the dress' : `${cap(o.bottomc)} ${o.bottom}`],
    ['legs', 'Legs', o.tights ? cl(o.tights) : SKIN[o.skin]?.[0], o.tights ? `${cap(o.tights)} tights` : dress || ['skirt', 'shorts'].includes(o.bottom) ? 'Bare' : 'Covered'],
    ['shoes', 'Shoes', cl(o.shoec), `${cap(o.shoec)} ${o.shoes}`],
    ['extras', 'Extras', o.acc && o.acc !== 'none' ? cl(o.accc || (o.acc === 'glasses' ? 'black' : 'butter')) : undefined, o.acc && o.acc !== 'none' ? cap(o.acc) : 'None'],
  ]
  return <div className="av-rows">{rows.map(([k, label, sw, text]) =>
    <button key={k} className="av-row" onClick={() => onRow(k)} data-t={'av-row-' + k}><i style={{ background: sw ?? 'repeating-linear-gradient(45deg,#2A2150 0 4px,#161033 4px 8px)' }} /><span>{label}</span>{text}{check[k] && <em className="av-check">CHECK</em>}</button>)}</div>
}

function Got({ atlas, res, photo, m, setM, onTweak, onDone, onBack }: { atlas: Atlas | null; res: Extract<Result, { ok: true }>; photo: string; m: Mapped; setM: (m: Mapped) => void; onTweak: (t?: Tab) => void; onDone: () => void; onBack: () => void }) {
  const b = useMemo(() => boxes(res), [res]), o = preview(m.options)
  const set = (k: 'build' | 'hair', v: string) => setM({ ...m, options: { ...m.options, [k]: v } })
  return <>
    <Top onBack={onBack} />
    <h1 className="av-t">Got you!</h1>
    <p className="av-p">Here's what we picked up. Tap anything to change it.</p>
    <div className="av-got">
      <div className="av-photo"><img src={photo} alt="Your photo" />
        <i style={{ ...b.head, borderColor: '#48E5C2' }} /><i style={{ ...b.torso, borderColor: '#FFD84D' }} /><i style={{ ...b.legs, borderColor: '#FF6F59' }} />
        <span>only on this phone</span></div>
      <div className="av-stage"><Px atlas={atlas} o={o} scale={6} /></div>
    </div>
    <h2 className="av-h">Your build {!m.options.build && <em>PICK ONE</em>}</h2>
    <div className="av-tiles three" role="radiogroup" aria-label="Build">{BUILDS.map(k =>
      <button key={k} role="radio" aria-checked={m.options.build === k} className={'av-tile' + (m.options.build === k ? ' sel' : '')} onClick={() => set('build', k)} data-t={'av-build-' + k}>
        <Px atlas={atlas} o={{ ...o, build: k }} scale={3} /><span>{cap(k)}</span></button>)}</div>
    <h2 className="av-h">Your hair {!m.options.hair && <em>PICK ONE</em>}</h2>
    <div className="av-tiles" role="radiogroup" aria-label="Hairstyle">{m.hairChoices.slice(0, 4).map(k =>
      <button key={k} role="radio" aria-checked={m.options.hair === k} className={'av-tile zoom' + (m.options.hair === k ? ' sel' : '')} onClick={() => set('hair', k)} data-t={'av-hair-' + k}>
        <Px atlas={atlas} o={{ ...o, hair: k }} scale={4} />{k === m.bestHair && <b>BEST MATCH</b>}</button>)}</div>
    <Rows o={o} check={m.check} onRow={r => onTweak(ROW_TAB[r])} />
    <div className="av-cta foot">
      <button className="av-btn y" disabled={!m.options.build || !m.options.hair} onClick={onDone} data-t="av-thatsme">That's me</button>
      <button className="av-btn" onClick={() => onTweak()} data-t="av-tweak">Tweak it</button>
    </div>
  </>
}

function Tweak({ atlas, o, setO, m, tab, setTab, onDone, onBack }: { atlas: Atlas | null; o: KitOptions; setO: (o: KitOptions) => void; m: Mapped | null; tab: Tab; setTab: (t: Tab) => void; onDone: () => void; onBack: () => void }) {
  const [more, setMore] = useState(false)
  const check = m?.check ?? {}
  const tabCheck: Partial<Record<Tab, boolean>> = {}
  for (const [r, on] of Object.entries(check)) if (on) tabCheck[ROW_TAB[r as Row]] = true
  const set = (p: Partial<KitOptions>) => setO({ ...o, ...p })
  let kinds: readonly string[] = [], key: keyof KitOptions = 'build', best: string | undefined, zoom = false
  let pal: Record<string, readonly string[]> = CLOTH, ck: keyof KitOptions = 'topc', title = 'Closest styles to your photo'
  if (tab === 'Body') { kinds = BUILDS; key = 'build'; pal = SKIN; ck = 'skin'; title = 'Build' }
  if (tab === 'Hair') { kinds = m && !more ? m.hairChoices.slice(0, 4) : HAIRS; key = 'hair'; best = m?.bestHair; pal = HAIRC; ck = 'hairc'; zoom = true; if (!m) title = 'Hairstyle' }
  if (tab === 'Top') { kinds = TOPS; key = 'top'; best = m?.options.top; ck = 'topc'; title = 'Style' }
  if (tab === 'Bottom') { kinds = BOTTOMS; key = 'bottom'; best = m?.options.bottom; ck = 'bottomc'; title = 'Style' }
  if (tab === 'Shoes') { kinds = SHOES; key = 'shoes'; ck = 'shoec'; title = 'Style' }
  if (tab === 'Extras') { kinds = ACCS; key = 'acc'; best = m?.options.acc; ck = 'accc'; title = 'Extras' }
  const cur = (o[ck] as string | undefined) ?? (tab === 'Extras' ? (o.acc === 'glasses' ? 'black' : 'butter') : undefined)
  const swatches = !(tab === 'Bottom' && o.top === 'dress') && !(tab === 'Extras' && (!o.acc || o.acc === 'none'))
  return <>
    <Top onBack={onBack} />
    <div className="av-big"><Px atlas={atlas} o={o} scale={8} /></div>
    <div className="av-tabs" role="tablist">{TABS.map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => { setTab(t); setMore(false) }} data-t={'av-tab-' + t}>{t}{tabCheck[t] && <sup title="check this" />}</button>)}</div>
    <p className="av-p" style={{ fontSize: 13 }}>{title}{tabCheck[tab] && <> <em className="av-check" style={{ marginLeft: 6 }}>CHECK</em></>}</p>
    <div className="av-tiles" style={kinds.length === 3 ? { gridTemplateColumns: 'repeat(3,1fr)' } : undefined}>{kinds.map(k =>
      <button key={k} className={'av-tile' + (zoom ? ' zoom' : '') + (o[key] === k ? ' sel' : '')} onClick={() => set(k === 'dress' ? { top: k } : { [key]: k } as Partial<KitOptions>)} data-t={`av-opt-${key}-${k}`}>
        <Px atlas={atlas} o={{ ...o, [key]: k }} scale={zoom ? 4 : 3} />{best === k && m && <b>BEST MATCH</b>}{!zoom && <span>{cap(k)}</span>}</button>)}</div>
    {tab === 'Hair' && m && <button className="av-link" onClick={() => setMore(!more)} style={{ marginTop: 6 }}>{more ? 'Fewer styles' : 'All 12 styles'}</button>}
    {tab === 'Extras' && <><p className="av-p" style={{ fontSize: 13 }}>Facial hair</p>
      <div className="av-sw">{BEARDS.map(k => <button key={k} className={'av-tile' + ((o.beard || 'none') === k ? ' sel' : '')} style={{ width: 'auto', height: 36, padding: '0 10px', display: 'grid', placeItems: 'center' }} onClick={() => set({ beard: k })}>{cap(k)}</button>)}</div></>}
    {swatches && <><p className="av-p" style={{ fontSize: 13 }}>{tab === 'Body' ? 'Skin' : 'Colour'}</p>
      <div className="av-sw">{Object.entries(pal).map(([k, v]) => <button key={k} title={cap(k)} aria-label={cap(k)} className={cur === k ? 'sel' : ''} style={{ background: v[0] }} onClick={() => set({ [ck]: k } as Partial<KitOptions>)} />)}</div></>}
    {tab === 'Bottom' && (o.top === 'dress' || o.bottom === 'skirt' || o.bottom === 'shorts') && <><p className="av-p" style={{ fontSize: 13 }}>Legs · tights</p>
      <div className="av-sw"><button title="Bare" aria-label="Bare legs" className={'none' + (!o.tights ? ' sel' : '')} onClick={() => set({ tights: null })} />
        {Object.entries(CLOTH).map(([k, v]) => <button key={k} title={cap(k)} aria-label={cap(k) + ' tights'} className={o.tights === k ? 'sel' : ''} style={{ background: v[0] }} onClick={() => set({ tights: k })} />)}</div></>}
    <div className="av-cta"><button className="av-btn y" onClick={onDone} data-t="av-looks">Looks like me</button></div>
  </>
}

export type FlowProps = {
  /** header label, e.g. the signup's "Step 3 of 5"; none on the standalone ?avatar=flow page (it isn't inside signup) */ step?: string
  /** options JSON already on the profile (edit): offers "Tweak my current character" */ initial?: string | null
  /** embedded: called with the options JSON from the done screen's Continue (nothing is written to localStorage) */ onSave?: (json: string) => void
  /** signup: "Skip for now" */ onSkip?: () => void
  /** Back from the first screen */ onExit?: () => void
}
export function Flow({ step, initial, onSave, onSkip, onExit }: FlowProps = {}) {
  const current = useMemo(() => parseOptions(initial), [initial])
  const [screen, setScreen] = useState<Screen>('upload'), [atlas, setAtlas] = useState<Atlas | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null), [busy, setBusy] = useState(''), [error, setError] = useState<{ message: string; detail?: string } | null>(null)
  const [res, setRes] = useState<Extract<Result, { ok: true }> | null>(null), [photo, setPhoto] = useState(''), [m, setM] = useState<Mapped | null>(null)
  const [o, setO] = useState<KitOptions>(NEUTRAL), [tab, setTab] = useState<Tab>('Body'), [saved, setSaved] = useState(''), [from, setFrom] = useState<Screen>('upload')
  // Atlas is itself a function, so wrap it: React would otherwise call it as a state updater.
  useEffect(() => { void loadAtlas().then(a => setAtlas(() => a)) }, [])
  useEffect(() => { (window as any).__pdFlowProgress = setProgress }, [])
  useEffect(() => { document.documentElement.dataset.avatarFlow = screen + (busy ? '-busy' : ''); (window as any).__pdFlow = { screen, progress, res, m, o, saved, error } }, [screen, busy, progress, res, m, o, saved, error])
  const onPhoto = async (f: File) => {
    setError(null); setBusy('Reading your photo')
    try {
      const d = await detection()
      await d.preload(MODE, setProgress)
      setBusy('Reading your photo')
      const r = await d.analysePhoto(f, MODE)
      if (!r.ok) { setError({ message: r.error.message, detail: r.error.detail }); return }
      if (photo) URL.revokeObjectURL(photo)
      const mapped = mapDescriptor(r.descriptor)
      setPhoto(URL.createObjectURL(f)); setRes(r); setM(mapped); setScreen('got')
    } catch (e) { setError({ message: "Couldn't get the pixel kit ready", detail: (DBG ? String((e as Error)?.message ?? e) + ' · ' : '') + 'Try again, or build it by hand.' }) }
    finally { setBusy('') }
  }
  const hand = () => { setM(null); setRes(null); setO(NEUTRAL); setTab('Body'); setFrom('upload'); setScreen('tweak') }
  const tweak = (t: Tab = 'Body') => { setO(preview(m!.options)); setTab(t); setFrom('got'); setScreen('tweak') }
  const fromCurrent = () => { setM(null); setRes(null); setO(current!); setTab('Body'); setFrom('upload'); setScreen('tweak') }
  // embedded: the JSON goes to the profile (onSave), not to pd.avatar
  const finish = (x: KitOptions) => { setSaved(onSave ? JSON.stringify({ ...x, v: 1 }) : save(x)); setO(x); setScreen('done') }
  return <Ctx.Provider value={{ step, onExit }}><div className="avf" data-t="av-flow"><div className="av-ph">
    {screen === 'upload' && <Upload onPhoto={onPhoto} onHand={hand} onCurrent={current ? fromCurrent : undefined} onSkip={onSkip} progress={progress} busy={busy} error={error} />}
    {screen === 'got' && res && m && <Got atlas={atlas} res={res} photo={photo} m={m} setM={setM} onTweak={tweak} onDone={() => finish(preview(m.options))} onBack={() => setScreen('upload')} />}
    {screen === 'tweak' && <Tweak atlas={atlas} o={o} setO={setO} m={m} tab={tab} setTab={setTab} onDone={() => finish(o)} onBack={() => setScreen(from)} />}
    {screen === 'done' && <><Top onBack={() => setScreen('tweak')} /><h1 className="av-t">That's <b>you</b></h1>
      <p className="av-p">Saved as a tiny character file. Your photo is never kept.</p>
      <div className="av-big"><Px atlas={atlas} o={o} scale={8} /></div>
      {onSave ? <div className="av-cta"><button className="av-btn y" onClick={() => onSave(saved)} data-t="av-continue">Continue</button></div>
        : DBG && <pre className="av-json" id="av-saved">{saved}</pre>}</>}
  </div></div></Ctx.Provider>
}
// test hook (flag route only): lets the harness check the TS compose against GD's kit.py renders pixel-for-pixel
;(window as any).__pdKit = { loadAtlas, composeRGBA, SAMPLES, BASE }
export function mount(el: HTMLElement) { createRoot(el).render(<Flow />) }
export default Flow
