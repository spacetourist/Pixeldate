/* Pixeldate World · café (phase 1). Lazy chunk: reached only through ?world=cafe, so none of this is in the initial JS. */
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { savedProfile, saveProfile } from '../prefs'
import type { Profile } from '../net'
import { BRACKETS, BUBBLE_MS, MAX_SAY, bracketLabel, type Pub, type ServerMsg } from '../../world/shared/proto.ts'
import { findPath, nearestWalkable } from '../../world/shared/path.ts'
import { walkable } from '../../world/shared/map.ts'
import { WorldNet } from './net.ts'
import { Renderer, MW, MH, type Layout } from './render.ts'
import './world.css'

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
type Bubble = { text: string; until: number; mine?: boolean; held?: string }
/** The join profile: bracket only (never age or birthday), prefs for the server's both-ways check, character JSON (never an
    image). Kept here rather than importing net.ts's wire(), so the world chunk shares no module with the app's first load. */
const joinP = (p: Profile) => ({ name: p.name, br: BRACKETS.find(([lo, hi]) => Math.min(p.age, 70) >= lo && Math.min(p.age, 70) <= hi) ?? BRACKETS[0], min: Math.max(18, p.min), max: Math.max(18, p.max),
  iam: p.iam, seek: p.seek, uid: p.uid, adult: true, ...(typeof p.pav === 'string' && p.pav.length <= 512 && p.pav[0] === '{' ? { pav: p.pav } : {}) })
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
  const [card, setCard] = useState<{ q: { id: string; text: string }; with: number } | null>(null)
  const [note, setNote] = useState(''); const [text, setText] = useState('')
  const net = useRef<WorldNet | null>(null), ren = useRef<Renderer | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null), stage = useRef<HTMLDivElement>(null), over = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null)
  const bubbles = useRef(new Map<number, Bubble>()), noteT = useRef(0), target = useRef<[number, number] | null>(null)

  const flash = (s: string) => { setNote(s); clearTimeout(noteT.current); noteT.current = window.setTimeout(() => setNote(''), 4000) }
  const enter = () => {
    if (!prof || !invite.trim() || !adult) return
    localStorage.setItem('pd.invite', invite.trim()); if (!prof.adult) void saveProfile({ ...prof, adult: true })
    const n = new WorldNet(serverUrl(), invite.trim(), joinP(prof)); net.current = n; setPhase('joining')
    n.onmsg = (m: ServerMsg | any) => {
      if (m.t === 'hi') { setInst(m.inst); setPhase('in') }
      else if (m.t === 'no') { setWhy(REFUSED[m.why] || 'Could not join.'); setPhase('refused'); n.close() }
      else if (m.t === 'add' || m.t === 'del') { setCount(n.pubs.size + 1); if (m.t === 'del') { bubbles.current.delete(m.id); setSel(s => s && s.id === m.id ? null : s) } }
      else if (m.t === 'say' && m.id !== n.me) bubbles.current.set(m.id, { text: m.text, until: performance.now() + BUBBLE_MS })
      else if (m.t === 'said') {
        if (m.ok) bubbles.current.set(n.me, { text: m.text, until: performance.now() + BUBBLE_MS, mine: true })
        else if (m.why === 'slow') flash(WHY.slow)
        else if (m.why !== 'empty') { bubbles.current.set(n.me, { text: m.text, until: performance.now() + BUBBLE_MS, mine: true, held: m.why }); flash(WHY[m.why]) }
      }
      else if (m.t === 'card') setCard(m.q ? { q: m.q, with: m.with } : null)
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
    const els = new Map<number, HTMLDivElement>(); let raf = 0, lastU = 0
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
        el.style.setProperty('--tx', tx + 'px'); el.style.transform = `translate(${left}px, ${tip[1] - h - 4 * u}px)`
      }
      for (const [id, el] of els) if (!bubbles.current.has(id)) { el.remove(); els.delete(id) }
    }
    raf = requestAnimationFrame(loop)
    ;(window as any).__world = { net: n, r, bubbles: bubbles.current,
      state: () => ({ me: n.me, inst: n.inst, k: r.k, dpr: r.dpr, css: [r.cssW, r.cssH], vw: r.vw, vh: r.vh, map: [MW, MH], cam: [r.camX, r.camY], camT: r.camT, fps: r.fps, gl: r.kind, arrows: r.arrows, art: r.art, layout: layoutOf(), bytes: n.bytes,
        ents: [...n.ents.values()].map(e => ({ id: e.id, x: e.x, y: e.y, f: e.f, name: n.pubs.get(e.id)?.name })) }),
      css: (id: number) => { const e = n.ents.get(id); if (!e) return null; const b = canvas.current!.getBoundingClientRect(), [x, y] = r.toCss(e.x, e.y); return [b.left + x, b.top + y - 10 * r.k / r.dpr] },
      tileCss: (tx: number, ty: number) => { const b = canvas.current!.getBoundingClientRect(), [x, y] = r.toCss(tx + 0.5, ty + 0.5); return [b.left + x, b.top + y] } }
    return () => { cancelAnimationFrame(raf); ro.disconnect(); r.destroy() }
  }, [phase])

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
  const cardEl = card && (
    <section className="w-panel w-card" data-t="w-card"><p className="w-kick">Table for two <span className="w-with" data-t="w-with">with {net.current?.pubs.get(card.with)?.name ?? 'someone'}</span></p>
      <p className="w-q" data-t="w-q">{card.q.text}</p><button className="w-btn sm" data-t="w-next" onClick={() => net.current?.send({ t: 'next' })}>Next card</button></section>)
  const left = MAX_SAY - text.length
  const bar = (
    <form className="w-say" onSubmit={say} data-t="w-say">
      <input ref={input} data-t="w-input" value={text} maxLength={MAX_SAY} onChange={e => setText(e.target.value)} placeholder={layout === 'desk' ? 'Say something (Enter)' : 'Say something'} enterKeyHint="send" autoComplete="off" aria-label="Say something" />
      <span className={'w-left' + (left < 10 ? ' low' : '')} aria-hidden="true">{left}</span>
      <button className="w-btn sm" data-t="w-send" disabled={!text.trim()}>Say</button></form>)
  return (
    <main className={'w-room ' + layout} data-t="w-room" data-layout={layout}>
      <header className="w-top"><b>Café</b><span data-t="w-inst">{inst.replace('cafe-', 'room ')}</span><span data-t="w-count">{count} here</span>
        <a className="w-leave" href="./" onClick={() => net.current?.close()}>Leave</a></header>
      <div className="w-stage" ref={stage}><canvas ref={canvas} data-t="w-canvas" onPointerDown={tap} />
        <div className="w-over" ref={over} aria-live="polite" /></div>
      <aside className="w-side">
        {note && <p className="w-note" role="status" data-t="w-note">{note}</p>}
        {person}{cardEl}
        {layout === 'desk' && !person && !cardEl && <p className="w-help">Click to walk · arrows or WASD · Enter to talk · Esc to close. Click someone for their name and options. Sit at a table with someone to get a question card.</p>}
        {bar}
      </aside>
    </main>)
}
export function mount(el: HTMLElement) { createRoot(el).render(<World />) }
