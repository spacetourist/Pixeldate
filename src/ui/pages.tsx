/* R5 · You (16), Settings (17) and Matches history (09). Lazy chunk: none of this is in the first paint.
   Everything shown or changed here lives on this device only (src/prefs.ts). */
import { useEffect, useMemo, useRef, useState } from 'react'
import { LEVELS } from '../config'
import { pixelatePhoto } from '../pixel'
import { AGE_TOP, EDGES, seasonOf, snapRange } from '../signup/shared'
import { bracketLabel, bracketOf, type Gender, type Profile, type Seek } from '../net'
import { prefs, setPref, osMotion, osSolid, history, blockedList, unblock, ls, type Hist, type View } from '../prefs'
import { Icon, Hp, Av, LV_COLOR } from './parts'
import { Toasts, toast } from './toast'
import '../styles/pages.css'

export type PageId = 'matches' | 'profile' | 'settings'
export interface Current { name: string; br: [number, number]; lv: number; pct: number; av?: string; sub: string }
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const seekLabel = (p: Profile) => `${cap(p.seek)} · ${p.min}–${p.max >= AGE_TOP ? AGE_TOP + '+' : p.max}`
const HOW = { skipped: 'you skipped', moved: 'they moved on', left: 'they left', blocked: 'blocked' } as const
const DAY = 864e5
export function when(t: number, now = Date.now()) {
  const d = new Date(t), today = new Date(now); today.setHours(0, 0, 0, 0)
  if (t >= +today) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (t >= +today - DAY) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'short' })
}
const shortDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })

/** Modal dialog in the app's own style (never window.confirm). Focus starts on the safe choice; Escape cancels. */
export function Confirm({ title, body, yes, onNo, t, children }: { title: string; body: React.ReactNode; yes: React.ReactNode; onNo(): void; t: string; children?: React.ReactNode }) {
  const no = useRef<HTMLButtonElement>(null), back = useRef(document.activeElement as HTMLElement | null)
  useEffect(() => { no.current?.focus(); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onNo() }; addEventListener('keydown', k); return () => { removeEventListener('keydown', k); back.current?.focus?.() } }, [])
  return <div className="layer" data-t={t} role="alertdialog" aria-modal="true" aria-labelledby={t + '-h'} aria-describedby={t + '-p'} onClick={e => { if (e.target === e.currentTarget) onNo() }}>
    <div className="modal fx"><h2 id={t + '-h'}>{title}</h2><div id={t + '-p'} className="mbody">{body}</div>{children}
      <div className="acts acts--row"><button className="btn fx btn--secondary" ref={no} data-t={t + '-cancel'} onClick={onNo}>Cancel</button>{yes}</div></div></div>
}

const Toggle = ({ on, os, onChange, label, t }: { on: boolean; os?: boolean; onChange(v: boolean): void; label: string; t: string }) =>
  <button type="button" className={`toggle ${on || os ? 'is-on' : ''} ${os ? 'is-disabled' : ''}`} role="switch" aria-checked={on || !!os} aria-disabled={os || undefined} aria-label={label} data-t={t}
    onClick={() => { if (!os) onChange(!on) }}><i /></button>

function Shell({ page, go, onCall, children }: { page: PageId; go(p: PageId | null): void; onCall(): void; children: React.ReactNode }) {
  const ri = (k: PageId, n: 'heart' | 'user' | 'gear', l: string) => <button className={`ri ${page === k ? 'on' : ''}`} aria-current={page === k ? 'page' : undefined} data-t={'rail-' + k} onClick={() => go(k)}><Icon n={n} c={page === k ? 'var(--cta)' : 'currentColor'} s={3} />{l}</button>
  const tb = (k: PageId, n: 'heart' | 'user' | 'gear', l: string) => <button className={`btn btn--ghost btn--icon btn--sm fx ${page === k ? 'is-on' : ''}`} aria-label={l} aria-current={page === k ? 'page' : undefined} data-t={'top-' + k} onClick={() => go(k)}><Icon n={n} c={page === k ? 'var(--cta)' : 'var(--text)'} s={2} /></button>
  return <div className="app"><div className="shell shell--page" data-t={'page-' + page}>
    <nav className="rail" aria-label="Sections">
      <span className="logo" aria-hidden="true"><Icon n="heart" c="var(--c-coral)" s={5} /></span>
      {ri('matches', 'heart', 'Match')}
      <button className="ri" data-t="rail-call" onClick={onCall}><Icon n="call" s={3} />Call</button>
      <span className="sp" />
      {ri('profile', 'user', 'You')}{ri('settings', 'gear', 'Settings')}
    </nav>
    <header className="stop"><button className="logo" style={{ ['--logo' as any]: '28px' }} aria-label="Back" data-t="top-back" onClick={() => go(null)}><Icon n="heart" c="var(--c-coral)" s={3} /><span>pixel<b>date</b></span></button>
      {tb('matches', 'heart', 'Your matches')}{tb('profile', 'user', 'You')}{tb('settings', 'gear', 'Settings')}</header>
    <main className="smain pgmain"><Toasts where="page" />{children}</main>
  </div></div>
}
const Title = ({ icon, eb, h, t, children }: { icon: 'heart' | 'user' | 'gear'; eb: string; h: string; t?: string; children?: React.ReactNode }) =>
  <div className="ptitle"><div><div className="eyebrow"><Icon n={icon} c="var(--c-coral)" s={2} />{eb}</div><h1 className="px" tabIndex={-1} data-t={t}>{h}</h1></div>{children}</div>
const OnDevice = ({ children }: { children: React.ReactNode }) => <p className="ondevice" data-t="on-device"><Icon n="lock" c="var(--c-mint)" />{children}</p>

/* ── 09 · Your matches ── */
function Matches({ current, onOpen, onFind }: { current: Current | null; onOpen(): void; onFind(): void }) {
  const list = useMemo(() => history().filter(h => h.end), [])
  const row = (h: Hist) => <div className="mrow fx" key={h.id} data-t="hist-row">
    <Av src={h.av} level={h.lv} size={64} />
    <div><div className="nm">{h.name}, {bracketLabel(h.br)}</div><div className="sub">{when(h.end!)} · LV {h.lv} {LEVELS[h.lv - 1].name} · {HOW[h.how || 'left']}</div></div>
    <span className="chip chip--locked">Ended</span><Hp level={h.lv} pct={h.pct} cls="hp--sm" /></div>
  return <>
    <Title icon="heart" eb="This week" h="Your matches" t="matches-h">{!current && <button className="btn fx btn--sm" data-t="matches-find" onClick={onFind}><Icon n="search" c="var(--edge)" />Find someone</button>}</Title>
    <p className="help lede">People you met in the last 7 days. One match at a time: a match ends when either of you skips or leaves, and every new match starts again as Strangers.</p>
    <div className="cols2"><div className="mlist">
      {current && <div className="mrow on fx" data-t="hist-now"><Av src={current.av} level={current.lv} size={64} />
        <div><div className="nm">{current.name}, {bracketLabel(current.br)}</div><div className="sub">Now · LV {current.lv} {LEVELS[current.lv - 1].name}{current.sub}</div></div>
        <button className="btn fx btn--sm" data-t="hist-open" onClick={onOpen}>Open</button><Hp level={current.lv} pct={current.pct} cls="hp--sm" /></div>}
      {list.map(row)}
      {!current && !list.length && <div className="card fx empty" data-t="matches-empty"><Icon n="heart" c="var(--c-coral)" s={4} />
        <h2 className="px">No matches yet</h2><p>When you level up with someone, they show up here for 7 days.</p>
        <button className="btn fx btn--block" onClick={onFind}><Icon n="search" c="var(--edge)" s={3} />Find someone</button></div>}
    </div>
    <div className="card fx rules"><div className="eyebrow"><Icon n="lock" c="var(--text-muted)" />Rules for history</div>
      <p>Levels never carry over: a new match always starts at Stranger. Blocked people never appear. History clears after 7 days.</p>
      <OnDevice>Kept on this device only. Nobody else can see it.</OnDevice></div></div>
  </>
}

/* ── 16 · You ── */
function You({ me, photo, level, inMatch, onSave }: { me: Profile; photo: HTMLImageElement | null; level: number; inMatch: boolean; onSave(p: Profile, photo?: string): Promise<void> | void }) {
  const lad = useMemo(() => photo ? LEVELS.map((_, i) => pixelatePhoto(photo, i + 1)) : [], [photo])
  const [ed, setEd] = useState<'' | 'name' | 'iam' | 'seek'>(''); const [d, setD] = useState(me); const file = useRef<HTMLInputElement>(null)
  const edit = (k: typeof ed) => { setD(me); setEd(k) }
  const save = async (p: Profile) => { await onSave(p); setEd('') }
  const pick = (f?: File) => { if (!f) return; const r = new FileReader(); r.onload = () => onSave(me, String(r.result)); r.readAsDataURL(f) }
  const br = bracketLabel(bracketOf(Math.min(me.age, 70)))
  const btn = (k: typeof ed) => <button className="btn btn--ghost btn--sm fx" data-t={'edit-' + k} onClick={() => edit(k)}>Edit</button>
  const acts = (ok: boolean, p: Profile) => <span className="eacts"><button className="btn fx btn--ghost btn--sm" onClick={() => setEd('')}>Cancel</button><button className="btn fx btn--sm" data-t="edit-save" disabled={!ok} onClick={() => save(p)}>Save</button></span>
  const seg = <V extends string>(v: V, opts: [V, string][], on: (v: V) => void, lab: string) => <div className="seg seg--sm" role="group" aria-label={lab}>{opts.map(([k, l]) =>
    <button key={k} type="button" className={v === k ? 'on' : ''} aria-pressed={v === k} data-t={'opt-' + k} onClick={() => on(k)}>{l}</button>)}</div>
  const s = seasonOf(me.bm)
  return <>
    <Title icon="user" eb="You" h={me.name} t="you-h" />
    <div className="cols2">
      <div className="card fx seecard"><div className="eyebrow"><Icon n="eye" c="var(--cta)" />How matches see you right now</div>
        <div className="ladder" data-t="you-ladder">{LEVELS.map((L, i) => <figure key={i} className={i + 1 === level ? 'on' : ''}>
          <span className="lf"><span><img src={lad[i]} alt={`You at ${L.name}`} /></span></span>
          <figcaption><b style={{ color: LV_COLOR(i + 1) }}>LV {i + 1}</b></figcaption></figure>)}</div>
        <p className="help">{inMatch ? `Your match sees LV ${level} · ${LEVELS[level - 1].name}.` : 'Every match starts at LV 1 · Stranger.'} The photo is pixelated on this device before it's sent.</p>
        <div className="row"><button className="btn btn--secondary fx btn--sm" data-t="change-photo" onClick={() => file.current?.click()}><Icon n="image" />Change photo</button>
          <input ref={file} type="file" accept="image/*" hidden data-t="photo-file" onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} /></div></div>
      <div className="setgrp fx"><h3>Profile</h3>
        <div className="setrow"><div className="tx"><b>Name</b>{ed === 'name' ? null : <span data-t="you-name">{me.name}</span>}</div>
          {ed === 'name' ? <><label className="field fx efield"><input autoFocus value={d.name} maxLength={20} aria-label="Name" data-t="edit-name-input" onChange={e => setD({ ...d, name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && d.name.trim()) save({ ...d, name: d.name.trim() }) }} /></label>{acts(!!d.name.trim(), { ...d, name: d.name.trim() })}</> : btn('name')}</div>
        <div className="setrow"><div className="tx"><b>I am</b><span>{cap(me.iam)}</span></div>
          {ed === 'iam' ? <>{seg<Gender>(d.iam, [['man', 'Man'], ['woman', 'Woman']], v => setD({ ...d, iam: v }), 'I am')}{acts(true, d)}</> : btn('iam')}</div>
        <div className="setrow"><div className="tx"><b>Age bracket</b><span>{br} · from your birthday, which stays on this device</span></div></div>
        <div className="setrow"><div className="tx"><b>Birth season badge</b><span>Shown from Spark</span></div><span className="chip chip--edge"><Icon n={s} c="var(--c-mint)" /> {cap(s)}-born</span></div>
        <div className="setrow"><div className="tx"><b>I want to meet</b><span data-t="you-seek">{seekLabel(me)}</span></div>
          {ed === 'seek' ? <div className="eseek">{seg<Seek>(d.seek, [['women', 'Women'], ['men', 'Men'], ['everyone', 'Everyone']], v => setD({ ...d, seek: v }), 'I want to meet')}
            <span className="range"><label className="field fx"><select aria-label="From age" value={d.min} onChange={e => { const [a, b] = snapRange(+e.target.value, Math.max(d.max, +e.target.value)); setD({ ...d, min: a, max: b }) }}>{EDGES.slice(0, -1).map(x => <option key={x} value={x}>{x}</option>)}</select></label>
              <span>to</span><label className="field fx"><select aria-label="To age" value={d.max} onChange={e => setD({ ...d, max: +e.target.value })}>{EDGES.slice(1).map(x => x === 70 ? 70 : x - 1).filter(x => x > d.min).map(x => <option key={x} value={x}>{x === 70 ? '70+' : x}</option>)}</select></label></span>
            {acts(true, d)}</div> : btn('seek')}</div>
        {inMatch && <p className="help">Changes apply to your next match.</p>}
      </div></div>
  </>
}

/* ── 17 · Settings ── */
function Settings({ onView, onLogout, onDelete, onReport }: { onView(v: View): void; onLogout(): void; onDelete(): void; onReport(): void }) {
  const [, bump] = useState(0); const re = () => bump(x => x + 1)
  const [bl, setBl] = useState(blockedList)
  const [conf, setConf] = useState<'' | 'delete' | 'logout'>('')
  const view = prefs.view(), om = osMotion(), os = osSolid()
  const p = (k: 'motion' | 'solid' | 'sounds') => (v: boolean) => { setPref(k, v); re() }
  return <>
    <Title icon="gear" eb="Settings" h="Settings" t="settings-h" />
    <div className="cols2"><div className="col">
      <div className="setgrp fx" data-t="grp-match"><h3>Match screen</h3>
        <div className="setrow"><div className="tx"><b>Default view</b><span>Stage puts their photo behind the chat</span></div>
          <div className="seg seg--sm viewtoggle" role="group" aria-label="Default view">{(['stage', 'compact'] as const).map(v =>
            <button key={v} type="button" className={view === v ? 'on' : ''} aria-pressed={view === v} data-t={'set-view-' + v} onClick={() => { setPref('view', v); onView(v); re() }}><Icon n={v} /><em>{cap(v)}</em></button>)}</div></div>
        <div className="setrow"><div className="tx"><b id="l-motion">Reduce motion</b><span>{om ? 'On because your device asks for less motion.' : 'Reveals become a short fade. No shakes or bursts.'}</span></div>
          <Toggle on={prefs.motion()} os={om} onChange={p('motion')} label="Reduce motion" t="set-motion" /></div>
        <div className="setrow"><div className="tx"><b>Solid panels</b><span>{os ? 'On because your device asks for less transparency.' : 'No see-through panels over photos'}</span></div>
          <Toggle on={prefs.solid()} os={os} onChange={p('solid')} label="Solid panels" t="set-solid" /></div>
        <div className="setrow"><div className="tx"><b>Sounds</b><span>Level-up chime and combo blip</span></div>
          <Toggle on={prefs.sounds()} onChange={p('sounds')} label="Sounds" t="set-sounds" /></div>
      </div>
      <div className="card fx ondev"><div className="eyebrow"><Icon n="lock" c="var(--c-mint)" />All on this device</div>
        <p>Pixeldate has no accounts and no server that keeps your data. Your name, photo, birthday, matches, blocked list and these settings are stored only in this browser. A match only ever receives your photo already pixelated to the level you both chose.</p></div>
    </div>
    <div className="col">
      <div className="setgrp fx" data-t="grp-safety"><h3>Safety</h3>
        {bl.length ? bl.map(b => <div className="setrow" key={b.uid} data-t="blocked-row"><Av src={b.av} level={1} size={40} />
          <div className="tx"><b>{b.name || 'Someone'}{b.br ? ', ' + bracketLabel(b.br) : ''}</b><span>Blocked{b.at ? ' · ' + shortDate(b.at) : ''}</span></div>
          <button className="btn btn--ghost btn--sm fx" data-t="unblock" onClick={() => { unblock(b.uid); setBl(blockedList()); toast({ id: 'unblock', role: 'success', icon: 'check', t: 'notice-unblocked', title: `Unblocked ${b.name || 'them'}`, body: 'They can be matched with you again.' }) }}>Unblock</button></div>)
          : <div className="setrow" data-t="blocked-empty"><div className="tx"><b>Blocked people</b><span>Nobody blocked. People you block never match with you again.</span></div></div>}
        <button className="setrow linkrow" data-t="report" onClick={onReport}><span className="tx"><b>Report a problem</b><span>Write down what happened and block them</span></span><Icon n="next" c="var(--text-muted)" s={2} /></button>
      </div>
      <div className="setgrp fx" data-t="grp-account"><h3>Account</h3>
        <button className="setrow linkrow" data-t="logout" onClick={() => setConf('logout')}><span className="tx"><b>Log out</b><span>Forget your profile here. Settings and blocked list stay.</span></span><Icon n="logout" c="var(--text-muted)" s={2} /></button>
        <div className="setrow"><div className="tx"><b style={{ color: 'var(--error)' }}>Delete profile</b><span>Removes your photo, name and everything else on this device. This can't be undone.</span></div>
          <button className="btn btn--danger btn--sm fx" data-t="delete" onClick={() => setConf('delete')}>Delete</button></div>
      </div>
    </div></div>
    {conf === 'delete' && <Confirm t="confirm-delete" title="Delete your profile?" onNo={() => setConf('')}
      body={<p>This removes your name, photo, birthday, matches, blocked list and settings from this device, and ends any match. It can't be undone.</p>}
      yes={<button className="btn fx btn--danger" data-t="confirm-delete-yes" onClick={onDelete}>Delete profile</button>} />}
    {conf === 'logout' && <Confirm t="confirm-logout" title="Log out?" onNo={() => setConf('')}
      body={<p>Your name and photo are removed from this device and any match ends. Your settings, history and blocked list stay here.</p>}
      yes={<button className="btn fx" data-t="confirm-logout-yes" onClick={onLogout}>Log out</button>} />}
  </>
}

/** Report: there is no server to send it to, so say so; the note is saved here and the person can be blocked. */
export function Report({ who, onBlock, onClose }: { who: { uid: string; name: string } | null; onBlock(): void; onClose(): void }) {
  const [txt, setTxt] = useState(''); const [blk, setBlk] = useState(!!who)
  const done = () => { try { const r = JSON.parse(ls.getItem('pd.reports') || '[]'); r.push({ at: Date.now(), uid: who?.uid, name: who?.name, text: txt.trim() }); ls.setItem('pd.reports', JSON.stringify(r.slice(-20))) } catch {}
    if (blk && who) onBlock(); toast({ id: 'report', role: 'success', icon: 'check', t: 'notice-report', title: 'Report saved on this device', body: blk && who ? `${who.name} is blocked.` : undefined }); onClose() }
  return <Confirm t="report-dlg" title="Report a problem" onNo={onClose}
    body={<p>Pixeldate has no server that keeps chats, so there's no team to send this to from the app. Your note is saved on this device{who ? `, and you can block ${who.name} so you never match again.` : '.'}</p>}
    yes={<button className="btn fx" data-t="report-save" disabled={!txt.trim() && !blk} onClick={done}>Save</button>}>
    <label className="field fx rtext"><textarea rows={4} value={txt} onChange={e => setTxt(e.target.value)} placeholder="What happened?" aria-label="What happened?" data-t="report-text" /></label>
    {who && <label className="rblock"><Toggle on={blk} onChange={setBlk} label={`Block ${who.name}`} t="report-block" /><span>Block {who.name}</span></label>}
  </Confirm>
}

export default function Pages(p: { page: PageId; go(p: PageId | null): void; onCall(): void; me: Profile; photo: HTMLImageElement | null; level: number; current: Current | null; reportWho: { uid: string; name: string } | null
  onOpen(): void; onFind(): void; onSave(p: Profile, photo?: string): Promise<void> | void; onView(v: View): void; onLogout(): void; onDelete(): void; onBlock(): void }) {
  const [rep, setRep] = useState(false)
  const h1 = useRef(false)
  useEffect(() => { if (h1.current) (document.querySelector('.ptitle h1') as HTMLElement | null)?.focus?.({ preventScroll: true }); h1.current = true; scrollTo(0, 0) }, [p.page])
  return <Shell page={p.page} go={p.go} onCall={p.onCall}>
    {p.page === 'matches' ? <Matches current={p.current} onOpen={p.onOpen} onFind={p.onFind} />
      : p.page === 'profile' ? <You me={p.me} photo={p.photo} level={p.current ? p.level : 1} inMatch={!!p.current} onSave={p.onSave} />
      : <Settings onView={p.onView} onLogout={p.onLogout} onDelete={p.onDelete} onReport={() => setRep(true)} />}
    {rep && <Report who={p.reportWho} onBlock={p.onBlock} onClose={() => setRep(false)} />}
  </Shell>
}
