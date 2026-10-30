/* Pixeldate World · café (phase 1). Lazy chunk: reached only through ?world=cafe, so none of this is in the initial JS. */
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { savedProfile, saveProfile, loadPhoto, LB } from '../prefs'
import { LEVELS } from '../config'
import { pixelateCanvas, loadImage, animateReveal } from '../pixel'
import type { Profile } from '../net'
import { BRACKETS, BUBBLE_MS, MAX_SAY, MAX_ANS, PHOTO_MAX, bracketLabel, type Pub, type ServerMsg, type Table } from '../../world/shared/proto.ts'
import { findPath, nearestWalkable } from '../../world/shared/path.ts'
import { walkable, TABLES } from '../../world/shared/map.ts'
import { WorldNet } from './net.ts'
import { startLook } from '../avatar/kit/defaults.ts'
import { Renderer, MW, MH, type Layout } from './render.ts'
import './world.css'
const Char = lazy(() => import('../avatar/kit/Char'))

/** Dev server URL. A ?ws= override is honoured only for this machine, so a crafted link can't send your profile elsewhere. */
function serverUrl() {
  const q = new URLSearchParams(location.search).get('ws')
  if (q && /^wss?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(q)) return q
  return (import.meta.env.VITE_WORLD_URL as string | undefined) || 'ws://127.0.0.1:8787'
}
const WHY: Record<string, string> = {
  contact: "Not sent: no numbers, emails, handles or links in the café.", language: 'Not sent: keep it kind.',
  long: `Not sent: ${MAX_SAY} characters max.`, slow: 'Slow down a little: 3 bubbles per 15 seconds.', empty: '',
}
const REFUSED: Record<string, string> = { invite: "That invite code isn't on the list.", adult: 'The café is 18+ only.', profile: 'Your profile needs a refresh: make it again in the app.',
  timeout: 'Took too long to join. Try again.', closed: 'Lost the connection to the café.', replaced: 'You joined from another tab.' }
const REASONS: [string, string][] = [['rude', 'Rude or abusive'], ['sexual', 'Sexual content'], ['spam', 'Spam or selling'], ['underage', 'Might be under 18'], ['fake', 'Fake profile'], ['other', 'Something else']]
/** GD v04: gap between stacked bubbles, in art px; desktop chat log length */
const STACK_GAP = 2, LOG_MAX = 40
type Bubble = { text: string; until: number; mine?: boolean; held?: string }
/** The join profile: bracket only (never age or birthday), prefs for the server's both-ways check, character JSON (never an
    image). Kept here rather than importing net.ts's wire(), so the world chunk shares no module with the app's first load. */
const joinP = (p: Profile) => ({ name: p.name, br: BRACKETS.find(([lo, hi]) => Math.min(p.age, 70) >= lo && Math.min(p.age, 70) <= hi) ?? BRACKETS[0], min: Math.max(18, p.min), max: Math.max(18, p.max),
  iam: p.iam, seek: p.seek, uid: p.uid, adult: true, pav: typeof p.pav === 'string' && p.pav.length <= 512 && p.pav[0] === '{' ? p.pav : JSON.stringify(startLook(p.iam)) })
/** what the server sends one of the two at a table (Table view + the card) */
type Tbl = Table & { q: { id: string; text: string } | null; with: number }
const ANSWHY: Record<string, string> = { contact: 'Not sent: no numbers, emails, handles or links.', language: 'Not sent: keep it kind.', long: `Not sent: ${MAX_ANS} characters max.`, empty: '' }
/** "…" over a table while the two there are talking (GD: everyone else only sees that something is being said) */
const MURMUR_MS = 2500
/** My photo, pixelated ON THIS PHONE to the pair's level (the app's own pixelateCanvas: blocks x blocks PNG, 512 JPEG at 5) */
async function myPhotoAt(lv: number) {
  const src = await loadPhoto(); if (!src) return null
  const c = pixelateCanvas(await loadImage(src), lv)
  if (lv < 5) return c.toDataURL('image/png')
  for (const q of [0.85, 0.7, 0.55, 0.4]) { const d = c.toDataURL('image/jpeg', q); if (d.length <= PHOTO_MAX) return d }
  return null
}
/** Start call hand-off to the app (src/handoff.ts reads it): this tab's sessionStorage, then the app with the same ?loopback */
function handoff(m: { code: string; host: boolean; lv: number }) {
  sessionStorage.setItem('pd.handoff', JSON.stringify({ code: m.code, host: m.host, lv: m.lv, at: Date.now() }))
  location.href = './' + (LB ? '?loopback' : '')
}
const layoutOf = (): Layout => innerWidth >= 900 && innerWidth > innerHeight ? 'desk' : 'phone'

function World() {
  const prof = savedProfile<Profile>()
  const qs = new URLSearchParams(location.search)
  const [invite, setInvite] = useState(qs.get('invite') || localStorage.getItem('pd.invite') || '')
  const [adult, setAdult] = useState(!!prof?.adult)
  const [phase, setPhase] = useState<'gate' | 'joining' | 'in' | 'refused'>('gate')
  const [why, setWhy] = useState('')
  const [inst, setInst] = useState(''); const [count, setCount] = useState(0)
  const [layout, setLayout] = useState<Layout>(layoutOf())
  const [sel, setSel] = useState<Pub | null>(null); const [menu, setMenu] = useState<'' | 'report' | 'block'>('')
  const [card, setCard] = useState<Tbl | null>(null)
  // the table for two: the date's photo (pixelated on their phone to our level), our private lines, answer box state
  const [photo, setPhoto] = useState<{ id: number; lv: number; data: string } | null>(null)
  const [priv, setPriv] = useState<{ k: number; mine: boolean; text: string }[]>([]), privEl = useRef<HTMLOListElement>(null)
  const [ans, setAns] = useState(''), [ansErr, setAnsErr] = useState(''), [asking, setAsking] = useState(false)
  const murmurs = useRef(new Map<number, number>()), withRef = useRef(0)
  const [note, setNote] = useState(''); const [text, setText] = useState('')
  // desktop chat log: recent bubbles that went out (the server only relays text that passed the filter; held lines stay out)
  const [log, setLog] = useState<{ k: number; name: string; text: string; mine: boolean }[]>([]), logEl = useRef<HTMLOListElement>(null), logK = useRef(0)
  const addLog = (name: string, text: string, mine: boolean) => setLog(l => [...l.slice(-(LOG_MAX - 1)), { k: ++logK.current, name, text, mine }])
  const net = useRef<WorldNet | null>(null), ren = useRef<Renderer | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null), stage = useRef<HTMLDivElement>(null), over = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null)
  const bubbles = useRef(new Map<number, Bubble>()), noteT = useRef(0), target = useRef<[number, number] | null>(null)

  const addPriv = (text: string, mine: boolean) => setPriv(l => [...l.slice(-(LOG_MAX - 1)), { k: ++logK.current, mine, text }])
  const flash = (s: string) => { setNote(s); clearTimeout(noteT.current); noteT.current = window.setTimeout(() => setNote(''), 4000) }
  const enter = () => {
    if (!prof || !invite.trim() || !adult) return
    localStorage.setItem('pd.invite', invite.trim()); if (!prof.adult) void saveProfile({ ...prof, adult: true })
    const n = new WorldNet(serverUrl(), invite.trim(), joinP(prof)); net.current = n; setPhase('joining')
    n.onmsg = (m: ServerMsg | any) => {
      if (m.t === 'hi') { setInst(m.inst); setPhase('in') }
      else if (m.t === 'no') { setWhy(REFUSED[m.why] || 'Could not join.'); setPhase('refused'); n.close() }
      else if (m.t === 'add' || m.t === 'del') { setCount(n.pubs.size); if (m.t === 'del') { bubbles.current.delete(m.id); setSel(s => s && s.id === m.id ? null : s) } }
      else if (m.t === 'say' && m.id !== n.me) { bubbles.current.set(m.id, { text: m.text, until: performance.now() + BUBBLE_MS })
        if (m.priv) addPriv(m.text, false); else addLog(n.pubs.get(m.id)?.name ?? 'Someone', m.text, false) }
      else if (m.t === 'murmur') murmurs.current.set(m.tb, performance.now() + MURMUR_MS)
      else if (m.t === 'said') {
        if (m.ok) { bubbles.current.set(n.me, { text: m.text, until: performance.now() + BUBBLE_MS, mine: true }); if (m.priv) addPriv(m.text, true); else addLog(prof?.name ?? 'You', m.text, true) }
        else if (m.why === 'slow') flash(WHY.slow)
        else if (m.why !== 'empty') { bubbles.current.set(n.me, { text: m.text, until: performance.now() + BUBBLE_MS, mine: true, held: m.why }); flash(WHY[m.why]) }
      }
      else if (m.t === 'card') {
        const c = m.q && m.with ? m as Tbl : null
        if (!c || c.with !== withRef.current) { setPriv([]); setPhoto(null); setAns(''); setAnsErr(''); setAsking(false) }   // a new partner (or none): start clean
        withRef.current = c?.with ?? 0; setCard(c); if (c?.mine) { setAns(''); setAnsErr('') }
      }
      else if (m.t === 'ansno') setAnsErr(ANSWHY[m.why] ?? 'Not sent.')
      else if (m.t === 'photo') { if (m.id === withRef.current) setPhoto(m) }
      else if (m.t === 'note') { const who = n.pubs.get(withRef.current)?.name ?? 'They'
        flash(m.k === 'date-no' ? `${who} said not now. You can keep talking.` : m.k === 'call-declined' ? `${who} said not now to a call.` : `${who} cancelled the call.`) }
      else if (m.t === 'call') { flash('Starting your video call…'); setTimeout(() => { n.close(); handoff(m) }, 700) }
      else if (m.t === 'ack') { if (m.what === 'block') { setSel(null); setMenu(''); flash("Blocked. You won't see each other in the café again.") }
        if (m.what === 'report') { setMenu(''); flash('Thanks. Report sent to the Pixeldate team.') } if (m.what === 'heart') flash('Heart sent. If it is mutual you will both know.') }
      else if (m.t === 'mutual') flash(`It's mutual with ${n.pubs.get(m.id)?.name ?? 'them'}!`)
    }
    n.open('cafe-1')
  }
  useEffect(() => { if (prof && invite && adult && qs.get('auto') === '1') enter() }, [])

  // game loop + DOM overlay (bubbles, names) positioned every frame; React only re-renders for panels
  useEffect(() => {
    if (phase !== 'in' || !canvas.current) return
    const r = ren.current = new Renderer(canvas.current), n = net.current!
    const size = () => { const L = layoutOf(); setLayout(L); const b = stage.current!.getBoundingClientRect(); r.resize(b.width, b.height, devicePixelRatio || 1, L) }
    size(); const ro = new ResizeObserver(size); ro.observe(stage.current!)
    const els = new Map<number, HTMLDivElement>(), mels = new Map<number, HTMLDivElement>(), lay: { id: number; el: HTMLDivElement; left: number; top: number; w: number; H: number; tx: number }[] = []; let raf = 0, lastU = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop); r.frame(n, now)
      const me = n.ents.get(n.me); if (me && target.current && Math.floor(me.x) === target.current[0] && Math.floor(me.y) === target.current[1]) { target.current = null; r.path = [] }
      // GD's 9-slice bubble (world.css): the box is snapped to whole art px (u CSS px) so the slices stay crisp, and the
      // tail tip sits 2 art px above the head (r.tip), on the head's centre column unless the bubble is pushed in from an edge
      const u = r.k / r.dpr, ov = over.current!; if (u !== lastU) { ov.style.setProperty('--u', u + 'px'); lastU = u; for (const el of els.values()) el.dataset.w = '' }
      for (const [id, b] of bubbles.current) {
        const e = n.ents.get(id), tip = r.tip(id); if (now > b.until || !e) { bubbles.current.delete(id); continue }
        let el = els.get(id); if (!el) { el = document.createElement('div'); el.dataset.t = 'bubble'; ov.append(el); els.set(id, el) }
        el.className = 'w-bubble' + (b.mine ? ' mine' : '') + (b.held ? ' held' : ''); el.dataset.id = String(id); el.dataset.held = b.held || ''
        if (el.dataset.text !== b.text) { el.textContent = b.text; el.dataset.text = b.text; el.dataset.w = '' }
        if (!el.dataset.w) {   // measure the natural size once per text / scale change, then snap it to the art grid
          el.style.width = el.style.height = ''; const bb = el.getBoundingClientRect()
          const w = Math.max(12, Math.ceil(bb.width / u - 1e-3)) * u, h = Math.max(12, Math.ceil(bb.height / u - 1e-3)) * u
          el.style.width = w + 'px'; el.style.height = h + 'px'; el.dataset.w = String(w); el.dataset.h = String(h)
        }
        if (!tip) { el.style.visibility = 'hidden'; continue } el.style.visibility = ''
        const w = +el.dataset.w!, h = +el.dataset.h!, cols = Math.round(w / u), W = ov.clientWidth
        let tx = Math.floor((cols - 1) / 2) * u, left = tip[0] - tx
        if (left < 0) left += Math.ceil(-left / u) * u; else if (left + w > W) left -= Math.ceil((left + w - W) / u) * u
        tx = Math.min(Math.max(tip[0] - left, 4 * u), w - 5 * u); left = tip[0] - tx   // tail stays ≥4 art px from either side
        lay.push({ id, el, left, top: tip[1] - h - 4 * u, w, H: h + 4 * u, tx })
      }
      // GD v04: bubbles that would overlap stack upward, 2 art px apart (tail included), lowest first; each keeps its
      // tail on its own speaker's column, so a nudged bubble still points down at who said it
      lay.sort((a, b) => b.top + b.H - (a.top + a.H) || a.id - b.id)
      const put: typeof lay = [], g = STACK_GAP * u
      for (const b of lay) {
        const b0 = b.top
        for (let hit = true; hit;) { hit = false
          for (const p of put) if (b.left < p.left + p.w + g && p.left < b.left + b.w + g && b.top < p.top + p.H + g && p.top < b.top + b.H + g) { b.top = p.top - g - b.H; hit = true } }
        put.push(b); b.el.dataset.lift = String(Math.round((b0 - b.top) / u))
        b.el.style.setProperty('--tx', b.tx + 'px'); b.el.style.transform = `translate(${b.left}px, ${b.top}px)`
      }
      lay.length = 0
      for (const [id, el] of els) if (!bubbles.current.has(id)) { el.remove(); els.delete(id) }
      for (const [tb, until] of murmurs.current) {
        let el = mels.get(tb); const t = TABLES[tb]
        if (now > until || !t) { murmurs.current.delete(tb); el?.remove(); mels.delete(tb); continue }
        if (!el) { el = document.createElement('div'); el.className = 'w-murmur'; el.dataset.t = 'w-murmur'; el.dataset.tb = String(tb); el.textContent = '…'; el.setAttribute('aria-hidden', 'true'); ov.append(el); mels.set(tb, el) }
        const [x, y] = r.toCss(t.x + 1, t.y - 1); el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`
      }
    }
    raf = requestAnimationFrame(loop)
    ;(window as any).__world = { net: n, r, bubbles: bubbles.current,
      state: () => ({ me: n.me, inst: n.inst, k: r.k, dpr: r.dpr, css: [r.cssW, r.cssH], vw: r.vw, vh: r.vh, map: [MW, MH], cam: [r.camX, r.camY], camT: r.camT, fps: r.fps, gl: r.kind, arrows: r.arrows, art: r.art, layout: layoutOf(), bytes: n.bytes,
        ents: [...n.ents.values()].map(e => ({ id: e.id, x: e.x, y: e.y, f: e.f, name: n.pubs.get(e.id)?.name })) }),
      css: (id: number) => { const e = n.ents.get(id); if (!e) return null; const b = canvas.current!.getBoundingClientRect(), [x, y] = r.toCss(e.x, e.y); return [b.left + x, b.top + y - 10 * r.k / r.dpr] },
      tileCss: (tx: number, ty: number) => { const b = canvas.current!.getBoundingClientRect(), [x, y] = r.toCss(tx + 0.5, ty + 0.5); return [b.left + x, b.top + y] } }
    return () => { cancelAnimationFrame(raf); ro.disconnect(); r.destroy() }
  }, [phase])

  useEffect(() => { const e = logEl.current; if (e) e.scrollTop = e.scrollHeight }, [log])
  useEffect(() => { const e = privEl.current; if (e) e.scrollTop = e.scrollHeight }, [priv])
  // my photo goes to the person I'm sat with, pixelated here to our level, again each time the level goes up
  const tLv = card?.lv ?? 0, tWith = card?.with ?? 0
  useEffect(() => { if (!tLv || !tWith) return; let live = true
    void myPhotoAt(tLv).then(d => { if (live && d && withRef.current === tWith) net.current?.send({ t: 'photo', lv: tLv, data: d }) }).catch(() => {})
    return () => { live = false } }, [tLv, tWith])

  // keyboard: arrows/WASD walk, Enter talks, Esc closes
  useEffect(() => {
    if (phase !== 'in') return
    const held = new Set<string>(), K: Record<string, [number, number]> = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }
    const steer = () => { let dx = 0, dy = 0; for (const k of held) { dx += K[k][0]; dy += K[k][1] } net.current?.send({ t: 'dir', dx: Math.sign(dx), dy: Math.sign(dy) }); if (held.size) { target.current = null; if (ren.current) ren.current.path = [] } }
    const down = (e: KeyboardEvent) => {
      const typing = document.activeElement === input.current
      if (e.key === 'Escape') { if (typing) input.current!.blur(); else { setMenu(''); setSel(null); if (ren.current) ren.current.sel = 0 } return }
      if (typing || (e.target as HTMLElement).closest?.('button, input, select, textarea')) return
      if (e.key === 'Enter') { e.preventDefault(); input.current?.focus(); return }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (K[key] && !e.repeat) { e.preventDefault(); held.add(key); steer() } else if (K[key]) e.preventDefault()
    }
    const up = (e: KeyboardEvent) => { const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (held.delete(key)) steer() }
    const blur = () => { if (held.size) { held.clear(); steer() } }
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', blur)
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', blur) }
  }, [phase])

  // the phone keyboard: keep the chat bar (and the café above it) in the visible part of the screen
  useEffect(() => {
    const vv = window.visualViewport; if (!vv) return
    const f = () => document.documentElement.style.setProperty('--kb', Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) + 'px')
    f(); vv.addEventListener('resize', f); vv.addEventListener('scroll', f); return () => { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f) }
  }, [])

  const tap = (e: React.PointerEvent) => {
    const n = net.current, r = ren.current; if (!n || !r) return
    const b = canvas.current!.getBoundingClientRect(), cx = e.clientX - b.left, cy = e.clientY - b.top
    const id = r.pick(n, cx, cy, performance.now())
    if (id) { const p = n.pubs.get(id); if (p) { setSel(p); setMenu(''); r.sel = id } return }
    if (sel) { setSel(null); setMenu(''); r.sel = 0 }
    const [tx, ty] = r.toTile(cx, cy); let t: [number, number] | null = [Math.floor(tx), Math.floor(ty)]
    if (!walkable(t[0], t[1])) t = nearestWalkable(t[0], t[1]); if (!t) return
    n.send({ t: 'go', x: t[0], y: t[1] }); const me = n.ents.get(n.me)
    r.path = me ? findPath([Math.floor(me.x), Math.floor(me.y)], t) ?? [] : []; target.current = t
  }
  const say = (e: React.FormEvent) => { e.preventDefault(); const t = text.trim(); if (!t) return; net.current?.send({ t: 'say', text: t }); setText('') }
  const act = (t: 'heart' | 'pass' | 'block') => { if (sel) net.current?.send({ t, id: sel.id }); if (t === 'pass') { setSel(null); if (ren.current) ren.current.sel = 0 } }
  const close = () => { setSel(null); setMenu(''); if (ren.current) ren.current.sel = 0 }

  if (phase !== 'in') return (
    <main className="w-gate" data-t="w-gate">
      <h1 className="w-title">Pixeldate <span>World</span></h1>
      <p className="w-sub">The café · walk up, say hi, sit at a table for two.</p>
      {!prof ? <p className="w-warn" data-t="w-noprofile">Make your profile in the app first, then come back. <a href="./">Open Pixeldate</a></p> : <>
        <p className="w-who">Joining as <b>{prof.name}</b></p>
        <label className="w-field"><span>Invite code</span><input data-t="w-invite" value={invite} onChange={e => setInvite(e.target.value)} autoComplete="off" spellCheck={false} /></label>
        <label className={'w-adult' + (adult ? ' is-on' : '')}><input type="checkbox" data-t="w-adult" checked={adult} onChange={e => setAdult(e.target.checked)} /> <span>I'm 18 or over</span></label>
        <button className="w-btn" data-t="w-enter" disabled={!invite.trim() || !adult || phase === 'joining'} onClick={enter}>{phase === 'joining' ? 'Joining…' : 'Enter the café'}</button>
        {phase === 'refused' && <p className="w-warn" role="alert" data-t="w-refused">{why}</p>}
      </>}
    </main>)

  const selName = sel && <>{sel.name} <span className="w-br">{bracketLabel(sel.br)}</span></>
  const person = sel && (
    <section className="w-panel w-person" data-t="w-person" aria-label={`${sel.name}`}>
      <header><b data-t="w-person-name">{selName}</b><button className="w-x" aria-label="Close" onClick={close}>×</button></header>
      {menu === '' && <div className="w-acts">
        <button className="w-btn sm heart" data-t="w-heart" onClick={() => act('heart')}>♥ Heart</button>
        <button className="w-btn sm ghost" data-t="w-pass" onClick={() => act('pass')}>Pass</button>
        <button className="w-btn sm ghost" data-t="w-report" onClick={() => setMenu('report')}>Report</button>
        <button className="w-btn sm danger" data-t="w-block" onClick={() => setMenu('block')}>Block</button></div>}
      {menu === 'report' && <div className="w-list" data-t="w-reasons"><p>What's wrong?</p>
        {REASONS.map(([k, l]) => <button key={k} className="w-btn sm ghost" data-t={'w-why-' + k} onClick={() => net.current?.send({ t: 'report', id: sel.id, why: k })}>{l}</button>)}</div>}
      {menu === 'block' && <div className="w-list" data-t="w-confirm"><p>Block {sel.name}? You won't see each other in any café room again. They aren't told.</p>
        <div className="w-acts"><button className="w-btn sm danger" data-t="w-block-yes" onClick={() => act('block')}>Block</button><button className="w-btn sm ghost" onClick={() => setMenu('')}>Cancel</button></div></div>}
    </section>)
  const tname = card ? net.current?.pubs.get(card.with)?.name ?? 'your date' : ''
  const sendAns = (e: React.FormEvent) => { e.preventDefault(); const t = ans.trim(); if (!t) return; setAnsErr(''); net.current?.send({ t: 'ans', text: t }) }
  const cardEl = card && card.q && <TablePanel card={card} name={tname} pav={net.current?.pubs.get(card.with)?.pav} photo={photo} desk={layout === 'desk'}
    ans={ans} setAns={setAns} ansErr={ansErr} onAns={sendAns} priv={priv} privEl={privEl} asking={asking} setAsking={setAsking}
    send={o => net.current?.send(o as any)} />
  const left = MAX_SAY - text.length
  const bar = (
    <form className="w-say" onSubmit={say} data-t="w-say">
      <input ref={input} data-t="w-input" value={text} maxLength={MAX_SAY} onChange={e => setText(e.target.value)} placeholder={card?.q ? `Say something to ${tname}` : layout === 'desk' ? 'Say something (Enter)' : 'Say something'} enterKeyHint="send" autoComplete="off" aria-label="Say something" />
      <span className={'w-left' + (left < 10 ? ' low' : '')} aria-hidden="true">{left}</span>
      <button className="w-btn sm" data-t="w-send" disabled={!text.trim()}>Say</button></form>)
  const room = card?.q ? `${count} here · at a table` : `${count} here`
  return (
    <main className={'w-room ' + layout} data-t="w-room" data-layout={layout}>
      <header className="w-top"><b>Café</b><span data-t="w-inst">{inst.replace('cafe-', 'room ')}</span><span data-t="w-count" data-n={count}>{room}</span>
        <a className="w-leave" href="./" onClick={() => net.current?.close()}>Leave</a></header>
      <div className="w-stage" ref={stage}><canvas ref={canvas} data-t="w-canvas" onPointerDown={tap} />
        <div className="w-over" ref={over} aria-live={layout === 'desk' ? 'off' : 'polite'} /></div>
      <aside className="w-side" data-t="w-side">
        {person}{cardEl}
        {note && <p className="w-note" role="status" data-t="w-note">{note}</p>}
        {layout === 'desk' && <section className="w-log" data-t="w-log" aria-label="Chat">
          <h2 className="w-log-h">Chat</h2>
          <ol ref={logEl} role="log" aria-live="polite">{log.length ? log.map(l => <li key={l.k} className={l.mine ? 'mine' : undefined} data-mine={l.mine ? '1' : undefined}><b>{l.mine ? 'You' : l.name}</b> <span>{l.text}</span></li>)
            : <li className="w-log-empty">What people say shows up here.</li>}</ol></section>}
        {bar}
        {layout === 'desk' && <p className="w-help" data-t="w-help">Click to walk · arrows/WASD · Enter to talk · Esc to close · click someone for options · sit at a table with someone for a question card</p>}
      </aside>
    </main>)
}
/** The date's photo, as sharp as our level allows (pixelated on their phone; drawn nearest-neighbour, the app's reveal on level up) */
function Photo({ photo, name, size }: { photo: { lv: number; data: string } | null; name: string; size: number }) {
  const cv = useRef<HTMLCanvasElement>(null), prev = useRef<HTMLImageElement | null>(null), dpr = Math.max(1, Math.round(devicePixelRatio || 1))
  useEffect(() => { if (!photo || !cv.current) return; let live = true
    void loadImage(photo.data).then(img => { if (!live || !cv.current) return; animateReveal(cv.current, prev.current, img); prev.current = img; cv.current.dataset.lv = String(photo.lv); cv.current.dataset.px = String(img.naturalWidth) })
    return () => { live = false } }, [photo?.data])
  return <div className="w-photo" style={{ width: size, height: size }}>
    <canvas ref={cv} width={size * dpr} height={size * dpr} data-t="w-photo" role="img" aria-label={photo ? `${name}'s photo at level ${photo.lv}` : `${name}'s photo`} />
    {!photo && <span className="w-photo-ph" data-t="w-photo-ph" aria-hidden="true">?</span>}</div>
}
type Send = (o: { t: string; [k: string]: unknown }) => void
function TablePanel({ card, name, pav, photo, desk, ans, setAns, ansErr, onAns, priv, privEl, asking, setAsking, send }: { card: Tbl; name: string; pav?: string; photo: { lv: number; data: string } | null; desk: boolean
  ans: string; setAns: (s: string) => void; ansErr: string; onAns: (e: React.FormEvent) => void; priv: { k: number; mine: boolean; text: string }[]; privEl: React.RefObject<HTMLOListElement | null>
  asking: boolean; setAsking: (b: boolean) => void; send: Send }) {
  const lv = LEVELS[card.lv - 1], dating = card.date.me && card.date.them, canCall = dating && card.lv >= card.video
  return (
    <section className="w-panel w-card w-table" data-t="w-card" data-lv={card.lv} aria-label={`Table for two with ${name}`}>
      <div className="w-strip" data-t="w-strip">
        <Photo photo={photo} name={name} size={desk ? 96 : 64} />
        <Suspense fallback={<span className="w-port" style={{ width: (desk ? 3 : 2) * 24, height: (desk ? 3 : 2) * 32 }} />}>
          <span className="w-port">{pav ? <Char json={pav} scale={desk ? 3 : 2} label={`${name}'s Pixel You`} t="w-portrait" /> : null}</span></Suspense>
        <div className="w-strip-txt"><span className="w-with" data-t="w-with">{name}</span>
          <span className="w-lv" data-t="w-lv">Lv {card.lv} · {lv?.name}</span>
          <span className="w-meter" data-t="w-meter" role="meter" aria-valuemin={1} aria-valuemax={LEVELS.length} aria-valuenow={card.lv} aria-label="Your level together">
            {LEVELS.map(l => <i key={l.n} className={l.n <= card.lv ? 'on' : undefined} />)}</span></div>
      </div>
      <p className="w-q" data-t="w-q">{card.q!.text}</p>
      {card.rev ? <div className="w-rev" data-t="w-rev">
          <p className="w-a mine"><b>You</b> <span data-t="w-rev-mine">{card.rev.mine}</span></p>
          <p className="w-a"><b>{name}</b> <span data-t="w-rev-theirs">{card.rev.theirs}</span></p>
          <p className="w-done" data-t="w-done"><span className="w-tick" aria-hidden="true">✓</span> Card done · {card.lv > 1 ? `Level ${card.lv}: ${lv?.name}` : 'answered together'}</p>
          <button className="w-btn sm" data-t="w-next" onClick={() => send({ t: 'next' })}>Next card</button></div>
        : <div className="w-ans" data-t="w-ans">
          {card.mine ? <p className="w-a mine" data-t="w-mine"><span className="w-tick" aria-hidden="true">✓</span> <b>You answered</b> <span>{card.mine}</span></p>
            : <form className="w-ansf" onSubmit={onAns}><input data-t="w-ans-input" value={ans} maxLength={MAX_ANS} onChange={e => setAns(e.target.value)} placeholder="Your answer" aria-label="Your answer" enterKeyHint="send" autoComplete="off" />
              <button className="w-btn sm" data-t="w-ans-send" disabled={!ans.trim()}>Answer</button></form>}
          {ansErr && <p className="w-err" role="alert" data-t="w-ans-err">{ansErr}</p>}
          <p className={'w-them' + (card.them ? ' on' : '')} data-t="w-them">{card.them ? <><span className="w-tick" aria-hidden="true">✓</span> {name} has answered</> : card.mine ? `Waiting for ${name}…` : `${name} hasn't answered yet`}</p>
          <p className="w-hint">You'll both see the answers once you've both answered.</p></div>}
      <div className="w-priv" data-t="w-priv"><p className="w-priv-h" data-t="w-priv-label"><span aria-hidden="true">🔒</span> Only you two can see this</p>
        <ol ref={privEl} role="log" aria-live="polite">{priv.length ? priv.map(l => <li key={l.k} className={l.mine ? 'mine' : undefined}><b>{l.mine ? 'You' : name}</b> <span>{l.text}</span></li>)
          : <li className="w-log-empty">Say something below: only {name} sees it. Everyone else sees “…”.</li>}</ol></div>
      <div className="w-call" data-t="w-callrow">
        {card.call === 'in' ? <><p data-t="w-call-in">{name} tapped Start call. Nobody's on camera until you tap too.</p>
            <div className="w-acts"><button className="w-btn sm heart" data-t="w-call-yes" onClick={() => send({ t: 'callyes' })}>Start call</button><button className="w-btn sm ghost" data-t="w-call-no" onClick={() => send({ t: 'callno' })}>Not now</button></div></>
          : card.call === 'out' ? <><p data-t="w-call-out">Waiting for {name} to tap Start call…</p>
            <div className="w-acts"><button className="w-btn sm ghost" data-t="w-call-cancel" onClick={() => send({ t: 'callno' })}>Cancel</button></div></>
          : <>
            <button className="w-btn sm heart w-callbtn" data-t="w-call" disabled={!canCall} onClick={() => send({ t: 'call' })}>Start call</button>
            {!dating && (card.date.them ? <div className="w-ask" data-t="w-date-in"><p>{name} asked you for a date.</p>
                <div className="w-acts"><button className="w-btn sm" data-t="w-date-yes" onClick={() => send({ t: 'date', yes: true })}>Yes</button><button className="w-btn sm ghost" data-t="w-date-no" onClick={() => send({ t: 'date', yes: false })}>Not now</button></div></div>
              : card.date.me ? <p className="w-small" data-t="w-date-out">You asked {name} for a date · waiting for them</p>
              : asking ? <div className="w-ask" data-t="w-date-confirm"><p>Ask {name} for a date? Video calls open once you both say yes.</p>
                <div className="w-acts"><button className="w-btn sm" data-t="w-date-ask" onClick={() => { setAsking(false); send({ t: 'date', yes: true }) }}>Ask</button><button className="w-btn sm ghost" onClick={() => setAsking(false)}>Cancel</button></div></div>
              : <button className="w-link" data-t="w-date" onClick={() => setAsking(true)}>Ask for a date</button>)}
            {dating && <p className="w-small on" data-t="w-dating">You're both up for a date ♥</p>}</>}
      </div>
    </section>)
}
export function mount(el: HTMLElement) { createRoot(el).render(<World />) }
