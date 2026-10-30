/* Pixeldate World · café (phase 1). Lazy chunk: reached only through ?world=cafe, so none of this is in the initial JS. */
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { savedProfile, saveProfile, loadPhoto, LB } from '../prefs'
import { LEVELS } from '../config'
import { pixelateCanvas, loadImage, animateReveal } from '../pixel'
import type { Profile } from '../net'
import { BRACKETS, BUBBLE_MS, MAX_SAY, MAX_ANS, PHOTO_MAX, F_SIT, bracketLabel, type Pub, type ServerMsg, type Table } from '../../world/shared/proto.ts'
import { findPath, nearestWalkable } from '../../world/shared/path.ts'
import { walkable, isSeat, isPianoSeat, at, TABLES } from '../../world/shared/map.ts'
import { PIECE, PIANO_SEAT, hears, gainAt, panAt } from '../../world/shared/piano.ts'
import { EMOTES, EMOTE_LABEL, EMOTE_CREDIT, type Emote } from '../../world/shared/emote.ts'
import { SOFAS, sofaAt } from '../../world/shared/sofa.ts'
import { DUET, DUET_PX, BASS_SEAT, MELODY_SEAT, INVITE_MS } from '../../world/shared/duet.ts'
import { DuetPanel, DuetRows, InviteSheet, InviteCard, SoloDuetPanel, DuetCard, Px as DPx, type DuetOn, type Who } from './duet.tsx'
import { parseOptions } from '../avatar/kit/map.ts'
import { SAMPLES } from '../avatar/kit/kit.gen.ts'
import { PianoAudio, PianoPanel, NowPlaying, PIANO_CREDIT, usePianoSel, type PianoState } from './piano.tsx'
import { WorldNet } from './net.ts'
import { claimOf, getPairLv, setPairLv } from '../pairlv'
import { startLook } from '../avatar/kit/defaults.ts'
import { Renderer, MW, MH, type Layout } from './render.ts'
import heartPng from './art/markers/heart.png'
import coupleHeart3x from './art/couple/couple-heart@3x.png'
import { CafeCall, turnUrl, type CallEnd } from './call.ts'
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
  busy: "Café's busy, try later.", timeout: 'Took too long to join. Try again.', closed: 'Lost the connection to the café.', replaced: 'You joined from another tab.' }
const REASONS: [string, string][] = [['rude', 'Rude or abusive'], ['sexual', 'Sexual content'], ['spam', 'Spam or selling'], ['underage', 'Might be under 18'], ['fake', 'Fake profile'], ['other', 'Something else']]
/** GD v04: gap between stacked bubbles, in art px; desktop chat log length */
const STACK_GAP = 2, LOG_MAX = 40
type Bubble = { text: string; until: number; mine?: boolean; held?: string }
/** The join profile: bracket only (never age or birthday), prefs for the server's both-ways check, character JSON (never an
    image). Kept here rather than importing net.ts's wire(), so the world chunk shares no module with the app's first load. */
const joinP = (p: Profile) => ({ name: p.name, br: BRACKETS.find(([lo, hi]) => Math.min(p.age, 70) >= lo && Math.min(p.age, 70) <= hi) ?? BRACKETS[0], min: Math.max(18, p.min), max: Math.max(18, p.max),
  iam: p.iam, seek: p.seek, uid: p.uid, adult: true, pav: typeof p.pav === 'string' && p.pav.length <= 512 && p.pav[0] === '{' ? p.pav : JSON.stringify(startLook(p.iam)) })
/** what the server sends one of the two at a table (Table view + the card) */
type Tbl = Table & { q: { id: string; text: string; lv: number; i: number } | null; with: number }
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
/** GD couple/README: the café call stays in the café (the two keep their seats, the room can see their heart). The ended
    notes, by why the call stopped. */
const CALLEND: Record<CallEnd | 'server', string> = { hangup: 'Call ended.', remote: 'Call ended.', server: 'Call ended.', lost: 'The call dropped.', media: "Couldn't start your camera or mic, so the call didn't start." }
/** couple hearts that arrive before the renderer exists (a late joiner) */
const pendingHearts = new Set<number>()
const DUET_OFF = { on: false, bass: 0, melody: 0, ph: '', song: null, at: 0, gone: [] }
/** PLACEHOLDER glyphs for the emote effect over the emoter (GD's art to come) */
const EMOTE_FX: Partial<Record<Emote, string>> = { giggle: 'hehe', sigh: 'haah', gasp: '!', aww: 'aww', groan: 'ugh' }
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
  const [card, setCard] = useState<Tbl | null>(null), selRef = useRef<Pub | null>(null)
  // the table for two: the date's photo (pixelated on their phone to our level), our private lines, answer box state
  const [photo, setPhoto] = useState<{ id: number; lv: number; data: string } | null>(null)
  const [priv, setPriv] = useState<{ k: number; mine: boolean; text: string }[]>([]), privEl = useRef<HTMLOListElement>(null)
  const [ans, setAns] = useState(''), [ansErr, setAnsErr] = useState('')
  const murmurs = useRef(new Map<number, number>()), withRef = useRef(0)
  /** v05 pair levels: the partner tag we already sent our app-wide level for, this sitting */
  const claimed = useRef('')
  const [note, setNote] = useState(''); const [text, setText] = useState('')
  // desktop chat log: recent bubbles that went out (the server only relays text that passed the filter; held lines stay out)
  const [log, setLog] = useState<{ k: number; name: string; text: string; mine: boolean }[]>([]), logEl = useRef<HTMLOListElement>(null), logK = useRef(0)
  const addLog = (name: string, text: string, mine: boolean) => setLog(l => [...l.slice(-(LOG_MAX - 1)), { k: ++logK.current, name, text, mine }])
  const net = useRef<WorldNet | null>(null), ren = useRef<Renderer | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null), stage = useRef<HTMLDivElement>(null), over = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null)
  const standRef = useRef<(() => void) | null>(null)
  const bubbles = useRef(new Map<number, Bubble>()), noteT = useRef(0), target = useRef<[number, number] | null>(null)
  // the piano (solo v1) and the sofas: where I'm sat ('' / 'piano' / 'sofa'), what's playing, who'd hear it
  const pa = useRef<PianoAudio | null>(null), whereRef = useRef<'' | 'piano' | 'sofa'>('')
  const [where, setWhere] = useState<'' | 'piano' | 'sofa'>(''), [pianoS, setPianoS] = useState<PianoState>({ by: 0, song: null, at: 0 })
  const [near, setNear] = useState(0), [muted, setMuted] = useState(localStorage.getItem('pd.pianoMute') === '1'), [song, setSong] = usePianoSel()
  /** "Not for me": the kind card the other person gets ("<name> has moved on") */
  const [gone, setGone] = useState('')
  /** voice emotes: the last one per player (for the tray's pressed state + tests) */
  const emoteFx = useRef(new Map<number, { e: string; until: number }>())
  /** phone: the emote tray folds behind one button so it doesn't cover the floor */
  const [emoOpen, setEmoOpen] = useState(false)
  /** the café call (both tapped Start call): the live call, my heart switch (on each call), a re-render tick */
  const callRef = useRef<CafeCall | null>(null), [call, setCall] = useState<CafeCall | null>(null), [, setCallTick] = useState(0)
  const [heartOn, setHeartOn] = useState(true)
  /** 2c duets: the bench as the server says, the invite sheet (its list), an invite to me, the stinger played per reveal */
  const duetRef = useRef<DuetOn | null>(null), [duet, setDuetV] = useState<DuetOn | null>(null)
  const [invOpen, setInvOpen] = useState(false), [dlist, setDlist] = useState<{ id: number; sat: boolean }[] | null>(null)
  const [dinv, setDinv] = useState<{ from: number; song: string; until: number } | null>(null), stingT = useRef(0)

  const addPriv = (text: string, mine: boolean) => setPriv(l => [...l.slice(-(LOG_MAX - 1)), { k: ++logK.current, mine, text }])
  const flash = (s: string) => { setNote(s); clearTimeout(noteT.current); noteT.current = window.setTimeout(() => setNote(''), 4000) }
  const enter = () => {
    if (!prof || !invite.trim() || !adult) return
    localStorage.setItem('pd.invite', invite.trim()); if (!prof.adult) void saveProfile({ ...prof, adult: true })
    const n = new WorldNet(serverUrl(), invite.trim(), joinP(prof)); net.current = n; setPhase('joining')
    const A = pa.current = new PianoAudio(o => n.send(o as any))
    n.onmsg = (m: ServerMsg | any) => {
      if (m.t === 'hi') { setInst(m.inst); setPhase('in'); if (m.now) A.hint(m.now); A.sync() }
      else if (m.t === 'tm') A.onTm(m)
      else if (m.t === 'piano') { if (m.now) A.hint(m.now); A.set(m); setPianoS({ by: m.by, song: m.song, at: m.at }) }
      else if (m.t === 'duet') { if (m.now) A.hint(m.now); A.setDuet(m); const v = m.on ? m as DuetOn : null; duetRef.current = v; setDuetV(v)
        // the reveal's stinger, once per reveal, for the two players; and the chosen song's stems start loading
        if (v?.res && v.me && stingT.current !== v.res.t0) { stingT.current = v.res.t0; A.unlock(); A.oneShot('emotes/' + (v.res.match ? 'duetMatch_1' : 'duetMiss_1')); A.warmDuet(v.res.coin) }
        if (v?.me && v.song) A.warmDuet(v.song)
        if (!v?.me || v.melody) setInvOpen(false) }
      else if (m.t === 'dlist') setDlist(m.people)
      else if (m.t === 'dinvite') { if (m.from) { setDinv({ from: m.from, song: m.song ?? '', until: performance.now() + (m.ms ?? INVITE_MS) }); if (m.song) A.warmDuet(m.song) }
        else setDinv(d => { if (d && m.why === 'cancel') flash(`${n.pubs.get(d.from)?.name ?? 'They'} cancelled the duet invite.`); if (d && m.why === 'taken') flash('Someone else sat down first.'); return null }) }
      else if (m.t === 'dlv') setPairLv(m.peer, m.lv)
      else if (m.t === 'emote') {
        if (m.ok === false) flash('One at a time: wait a moment.')
        else { const e = n.ents.get(m.id), me = n.ents.get(n.me), t = performance.now()
          // from the character: the piano's distance falloff and pan, relative to where I stand
          const d = e && me ? Math.hypot(n.lerpX(e, t) - n.lerpX(me, t), n.lerpY(e, t) - n.lerpY(me, t)) : 0, dx = e && me ? n.lerpX(e, t) - n.lerpX(me, t) : 0
          A.oneShot('emotes/' + m.take, m.id === n.me ? 1 : gainAt(d), m.id === n.me ? 0 : panAt(dx))
          emoteFx.current.set(m.id, { e: m.e, until: t + 1200 }) } }
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
        if (!c || c.with !== withRef.current) { setPriv([]); setPhoto(null); setAns(''); setAnsErr('') }   // a new partner (or none): start clean
        withRef.current = c?.with ?? 0; setCard(c); if (c?.mine) { setAns(''); setAnsErr('') }
        // the pair's level is app-wide (src/pairlv.ts): tell the server what this phone remembers for them, once a sitting;
        // once it has reconciled (rc), remember what the server says, so the app chat picks up at the same level
        if (!c) claimed.current = ''
        else if (c.peer) {
          if (claimed.current !== c.peer) { claimed.current = c.peer; n.send({ t: 'pairlv', ...claimOf(c.peer) }) }
          const r = getPairLv(c.peer); if (c.rc ? r?.lv !== c.lv || r.drop : c.lv > (r?.lv ?? 0)) setPairLv(c.peer, c.lv)
        }
      }
      else if (m.t === 'ansno') setAnsErr(ANSWHY[m.why] ?? 'Not sent.')
      else if (m.t === 'photo') { if (m.id === withRef.current) setPhoto(m) }
      else if (m.t === 'note') { const who = n.pubs.get(withRef.current)?.name ?? 'They'
        if (m.k === 'moved-on') { setGone(m.name || who); return }
        if (m.k === 'ended') { flash(`You ended the date with ${m.name || who}.`); return }
        if (m.k === 'table-no') { flash("That table isn't for the two of you. Try another seat."); return }
        if (m.k === 'sofa-full') { flash('That sofa is full. Try the other one.'); return }
        if (m.k === 'piano-busy') { flash('Someone is at the piano.'); return }
        if (m.k === 'duet-cant') { flash(`${n.pubs.get(m.id)?.name ?? 'They'} can't play right now`); return }
        flash(m.k === 'date-no' ? `${who} said not now. You can keep talking.` : m.k === 'call-declined' ? `${who} said not now to a call. You can keep talking.` : `${who} cancelled the call.`) }
      else if (m.t === 'call') { callRef.current?.end('hangup')
        const c = new CafeCall(m.code, m.host, m.lv, { url: turnUrl(serverUrl()), invite: invite.trim(), uid: prof!.uid }); callRef.current = c; setCall(c); setHeartOn(true); flash('Starting your video call…')
        c.onUp = () => { n.send({ t: 'callup' } as any); setCallTick(x => x + 1) }; c.onChange = () => setCallTick(x => x + 1)
        c.onEnd = why => { if (callRef.current === c) { callRef.current = null; setCall(null) } if (why !== 'remote') n.send({ t: 'calldown' } as any); flash(why === 'lost' && !c.up && !c.relay && !LB ? "The call couldn't connect on this network right now." : CALLEND[why]) }
        void c.start().catch(() => c.end('media')) }
      else if (m.t === 'callend') callRef.current?.end('remote')
      else if (m.t === 'couple') { const h = ren.current?.hearts ?? pendingHearts; if (m.on) h.add(m.tb); else h.delete(m.tb) }
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
    for (const tb of pendingHearts) r.hearts.add(tb); pendingHearts.clear()
    const size = () => { const L = layoutOf(); setLayout(L); const b = stage.current!.getBoundingClientRect(); r.resize(b.width, b.height, devicePixelRatio || 1, L) }
    size(); const ro = new ResizeObserver(size); ro.observe(stage.current!)
    let dwrap: HTMLDivElement | null = null, pill: HTMLButtonElement | null = null; const tags: HTMLDivElement[] = []
    const els = new Map<number, HTMLDivElement>(), mels = new Map<number, HTMLDivElement>(), fels = new Map<number, HTMLDivElement>(), lay: { id: number; el: HTMLDivElement; left: number; top: number; w: number; H: number; tx: number }[] = []; let raf = 0, lastU = 0, lastN = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const A = pa.current!, ps = A.state; r.piano = { by: ps.by, song: ps.song, at: ps.song ? A.perfAt(ps.at) : 0 }
      const dv = duetRef.current; r.duet = dv ? { on: true, bass: dv.bass, melody: dv.melody, ph: dv.ph, song: dv.song, at: dv.at ? A.perfAt(dv.at) : 0, gone: dv.gone } : DUET_OFF
      r.frame(n, now)
      const me = n.ents.get(n.me)
      if (me) { A.listen(n.lerpX(me, now), n.lerpY(me, now)); const sat = (me.f & F_SIT) !== 0, fx = Math.floor(me.x), fy = Math.floor(me.y)
        const w = sat && isPianoSeat(fx, fy) ? 'piano' : sat && at(fx, fy) === 'S' ? 'sofa' : ''
        if (w !== whereRef.current) { whereRef.current = w; setWhere(w) }
        if (now - lastN > 500) { lastN = now; let c = 0; for (const e of n.ents.values()) if (e.id !== n.me && hears(e.x, e.y)) c++; setNear(c) } }
      if (me && target.current && Math.floor(me.x) === target.current[0] && Math.floor(me.y) === target.current[1]) { target.current = null; r.path = [] }
      // GD's 9-slice bubble (world.css): the box is snapped to whole art px (u CSS px) so the slices stay crisp, and the
      // tail tip sits 2 art px above the head (r.tip), on the head's centre column unless the bubble is pushed in from an edge
      const u = r.k / r.dpr, ov = over.current!; if (u !== lastU) { ov.style.setProperty('--u', u + 'px'); lastU = u; for (const el of els.values()) el.dataset.w = '' }
      for (const [id, b] of bubbles.current) {
        const e = n.ents.get(id), tip = r.tip(id); if (now > b.until || !e) { bubbles.current.delete(id); continue }
        // GD: at a table for two the pair's own lines live in "Just you two"; no bubbles over the two of them (the phone
        // strip would clip them), so neither sees an overhead bubble for the pair while seated
        if (withRef.current && (id === n.me || id === withRef.current)) { els.get(id)?.remove(); els.delete(id); continue }
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
      // PLACEHOLDER emote effect over the one who emoted (until GD's art): a small pixel tag that rises and fades, 1.2 s
      for (const [id, fx] of emoteFx.current) {
        let el = fels.get(id); const tip = r.tip(id)
        if (now > fx.until || !n.ents.get(id)) { emoteFx.current.delete(id); el?.remove(); fels.delete(id); continue }
        if (!el) { el = document.createElement('div'); el.className = 'w-emofx'; el.dataset.t = 'w-emofx'; el.setAttribute('aria-hidden', 'true'); ov.append(el); fels.set(id, el) }
        if (el.dataset.e !== fx.e || el.dataset.k !== String(fx.until)) { el.dataset.e = fx.e; el.dataset.k = String(fx.until); el.dataset.id = String(id); el.textContent = EMOTE_FX[fx.e as Emote] ?? '♪'
          el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '' }
        if (!tip) { el.style.visibility = 'hidden'; continue } el.style.visibility = ''
        el.style.transform = `translate(${Math.round(tip[0])}px, ${Math.round(tip[1] - 2 * u)}px)`
      }
      for (const [id, el] of fels) if (!emoteFx.current.has(id)) { el.remove(); fels.delete(id) }
      // 2c: the mint "Sit beside me" pill over the open Melody seat (everyone, while a duet waits) and, while it plays,
      // the Bass / Melody tags under the bench (GD mock C); in art px from DUET_PX, snapped like the bubbles
      if (!dwrap) { dwrap = document.createElement('div'); dwrap.className = 'w-duet w-wrap-duet'; ov.append(dwrap)
        pill = document.createElement('button'); pill.className = 'bub w-sitpill'; pill.dataset.t = 'w-sit-beside'; pill.textContent = 'Sit beside me'
        pill.onpointerdown = ev => ev.stopPropagation(); pill.onclick = () => goSeat(MELODY_SEAT)
        for (const k of ['bass', 'mel'] as const) { const t = document.createElement('div'); t.className = 'tagw ' + k; t.dataset.t = 'w-duet-tag'; t.dataset.part = k === 'mel' ? 'melody' : 'bass'
          t.innerHTML = `<span class="k">${k === 'mel' ? 'Melody' : 'Bass'}</span><span class="w"></span>`; tags.push(t) }
        dwrap.append(pill, ...tags) }
      const showPill = !!dv && dv.ph === 'wait' && !!dv.bass && !dv.melody && dv.me !== 'bass' || !!dv && dv.ph === 'wait' && dv.me === 'bass' && !dv.melody
      pill!.hidden = !showPill; pill!.style.pointerEvents = dv?.me ? 'none' : 'auto'
      if (showPill) { const [x, y] = r.toCss((DUET_PX.seatOpen[0] + 12) / 16, (DUET_PX.seatOpen[1] - 4) / 16); pill!.style.left = Math.round(x) + 'px'; pill!.style.top = Math.round(y) + 'px' }
      const showTags = !!dv && (dv.ph === 'play' || dv.ph === 'count') && !dv.me
      tags.forEach((t, i) => { const part = i ? 'melody' : 'bass', id = dv?.[part] ?? 0; t.hidden = !showTags || !id; if (t.hidden) return
        const w = t.lastChild as HTMLElement, nm = n.pubs.get(id)?.name ?? ''; if (w.textContent !== nm) w.textContent = nm
        const sx = i ? DUET_PX.melody[0] + 10 : DUET_PX.bass[0] + 10, [x, y] = r.toCss(sx / 16, (DUET_PX.bench[1] + 16) / 16); t.style.left = Math.round(x) + 'px'; t.style.top = Math.round(y + 2) + 'px' })
      for (const [tb, until] of murmurs.current) {
        let el = mels.get(tb); const t = TABLES[tb]
        if (now > until || !t) { murmurs.current.delete(tb); el?.remove(); mels.delete(tb); continue }
        if (!el) { el = document.createElement('div'); el.className = 'w-murmur'; el.dataset.t = 'w-murmur'; el.dataset.tb = String(tb); el.setAttribute('aria-hidden', 'true'); ov.append(el); mels.set(tb, el) }
        // GD's table-typing strip (16x16 frames): bottom-centre (the tail tip) 4 art px above the table top, snapped to art px
        const [x, y] = r.toCss(t.x + 1, t.y - 1 - 4 / 16); el.style.transform = `translate(${Math.round(x / u) * u - 8 * u}px, ${Math.round(y / u) * u - 16 * u}px)`
      }
    }
    raf = requestAnimationFrame(loop)
    ;(window as any).__world = { net: n, r, bubbles: bubbles.current,
      state: () => ({ me: n.me, inst: n.inst, k: r.k, dpr: r.dpr, css: [r.cssW, r.cssH], vw: r.vw, vh: r.vh, map: [MW, MH], cam: [r.camX, r.camY], camT: r.camT, fps: r.fps, gl: r.kind, arrows: r.arrows, art: r.art, layout: layoutOf(), bytes: n.bytes,
        ents: [...n.ents.values()].map(e => ({ id: e.id, x: e.x, y: e.y, f: e.f, name: n.pubs.get(e.id)?.name })) }),
      css: (id: number) => { const e = n.ents.get(id); if (!e) return null; const b = canvas.current!.getBoundingClientRect(), [x, y] = r.toCss(e.x, e.y); return [b.left + x, b.top + y - 10 * r.k / r.dpr] },
      couple: () => ({ hearts: [...r.hearts], on: r.coupleOn, call: callRef.current ? { up: callRef.current.up, host: callRef.current.host, lv: callRef.current.lv, muted: callRef.current.muted, camOff: callRef.current.camOff } : null }),
      emoteFx: () => [...emoteFx.current.entries()].map(([id, f]) => ({ id, e: f.e })),
      emote: { played: () => pa.current!.played.slice(), requests: () => pa.current!.requests.slice(), master: () => (pa.current as any)?.master?.gain.value ?? null },
      piano: { pos: () => pa.current!.pos(), gain: () => pa.current!.gain, pan: () => pa.current!.pan, muted: () => pa.current!.muted, state: () => pa.current!.state,
        requests: () => [...pa.current!.requests], serverNow: () => pa.current!.serverNow(), offset: () => pa.current!.offset, unlocked: () => pa.current!.unlocked, notes: () => r.notesOn },
      duet: { v: () => duetRef.current, r: () => ({ ...r.duetOn }), gains: () => pa.current!.duetGains(), pos: () => pa.current!.duetPos(), pv: () => pa.current!.pv?.id ?? null, pvFrac: () => pa.current!.pvFrac() },
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
  // the call's pixelation follows the pair's level; no table (stood up, the date ended) means no call
  useEffect(() => { if (call && tLv) call.setLevel(tLv) }, [call, tLv])
  useEffect(() => { if (call && !card?.q) call.end('hangup') }, [call, card?.q])
  useEffect(() => () => callRef.current?.end('hangup'), [])

  // keyboard: arrows/WASD walk, Enter talks, Esc closes
  useEffect(() => {
    if (phase !== 'in') return
    const held = new Set<string>(), K: Record<string, [number, number]> = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }
    const steer = () => { let dx = 0, dy = 0; for (const k of held) { dx += K[k][0]; dy += K[k][1] } net.current?.send({ t: 'dir', dx: Math.sign(dx), dy: Math.sign(dy) }); if (held.size) { target.current = null; if (ren.current) ren.current.path = [] } }
    const down = (e: KeyboardEvent) => {
      const typing = document.activeElement === input.current || document.activeElement?.tagName === 'INPUT'
      if (e.key === 'Escape') { if (typing) (document.activeElement as HTMLElement).blur(); else if (selRef.current) { setMenu(''); setSel(null); if (ren.current) ren.current.sel = 0 } else standRef.current?.(); return }
      if (typing || (e.target as HTMLElement).closest?.('button, input, select, textarea')) return
      if (e.key === 'Enter') { e.preventDefault(); input.current?.focus(); return }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (K[key] && !e.repeat) { e.preventDefault(); held.add(key); steer() } else if (K[key]) e.preventDefault()
    }
    const up = (e: KeyboardEvent) => { const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (held.delete(key)) steer() }
    const blur = () => { if (held.size) { held.clear(); steer() } }
    // browsers only start sound from a gesture: the first tap or key in the café unlocks the piano's audio
    const unlock = () => pa.current?.unlock()
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', blur); addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true)
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', blur); removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true) }
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
    // a sofa: walk to it and sit (the server picks a free spot, or says it's full)
    const si = sofaAt(t[0], t[1])
    if (si >= 0) { const f = SOFAS[si].front; n.send({ t: 'sofa', i: si } as any); const me = n.ents.get(n.me); r.path = me ? findPath([Math.floor(me.x), Math.floor(me.y)], f) ?? [] : []; target.current = f; return }
    // the piano or its bench: a duet waiting with a seat open → that seat (Melody beside the one waiting); a tapped duet
    // seat → that seat; otherwise the solo seat in the middle
    if (at(t[0], t[1]) === 'K' || isPianoSeat(t[0], t[1])) { const d = duetRef.current
      const open: readonly [number, number] | null = d && d.ph === 'wait' && !d.me ? (d.bass && !d.melody ? MELODY_SEAT : d.melody && !d.bass ? BASS_SEAT : null) : null
      t = open ? [open[0], open[1]] : isPianoSeat(t[0], t[1]) ? t : [PIANO_SEAT[0], PIANO_SEAT[1]] }
    if (!walkable(t[0], t[1])) t = nearestWalkable(t[0], t[1]); if (!t) return
    n.send({ t: 'go', x: t[0], y: t[1] }); const me = n.ents.get(n.me)
    r.path = me ? findPath([Math.floor(me.x), Math.floor(me.y)], t) ?? [] : []; target.current = t
  }
  const goSeat = (s: readonly [number, number]) => { const n = net.current, r = ren.current; if (!n) return; pa.current?.unlock(); n.send({ t: 'go', x: s[0], y: s[1] }); const me = n.ents.get(n.me)
    if (r) r.path = me ? findPath([Math.floor(me.x), Math.floor(me.y)], [s[0], s[1]]) ?? [] : []; target.current = [s[0], s[1]] }
  const say = (e: React.FormEvent) => { e.preventDefault(); const t = text.trim(); if (!t) return; net.current?.send({ t: 'say', text: t }); setText('') }
  const act = (t: 'heart' | 'pass' | 'block') => { if (sel) net.current?.send({ t, id: sel.id }); if (t === 'pass') { setSel(null); if (ren.current) ren.current.sel = 0 } }
  const close = () => { setSel(null); setMenu(''); if (ren.current) ren.current.sel = 0 }
  /** X / Esc at a table: step off the seat onto the nearest free floor tile next to it (the server then ends the pair) */
  const stand = () => { const n = net.current, me = n?.ents.get(n.me); if (!n || !me) return
    const x = Math.floor(me.x), y = Math.floor(me.y), si = sofaAt(x, y)
    if (si >= 0) { const f = SOFAS[si].front; n.send({ t: 'go', x: f[0], y: f[1] }); return }   // off the sofa onto the floor in front of it
    const t = ([[0, 1], [0, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [-1, -1], [1, -1]] as const).map(([dx, dy]) => [x + dx, y + dy] as [number, number]).find(([a, b]) => walkable(a, b) && !isSeat(a, b) && !isPianoSeat(a, b))
    if (!t) return; n.send({ t: 'go', x: t[0], y: t[1] }); target.current = t; if (ren.current) ren.current.path = [t] }
  standRef.current = card?.q || where ? stand : null

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

  selRef.current = sel
  const selName = sel && <>{sel.name} <span className="w-br">{bracketLabel(sel.br)}</span></>
  const person = sel && (
    <section className="w-panel w-person" data-t="w-person" aria-label={`${sel.name}`}>
      <header>{sel.pav && <span className="w-pport"><Suspense fallback={null}><Char json={sel.pav} scale={2} label={`${sel.name}'s Pixel You`} t="w-portrait" /></Suspense></span>}<b data-t="w-person-name">{selName}</b><button className="w-x" aria-label="Close" onClick={close}>×</button></header>
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
  const left = MAX_SAY - text.length
  const bar = (
    <form className="w-say" onSubmit={say} data-t="w-say">
      <input ref={input} data-t="w-input" value={text} maxLength={MAX_SAY} onChange={e => setText(e.target.value)} placeholder={layout === 'desk' && !card?.q ? 'Say something (Enter)' : 'Say something'} enterKeyHint="send" autoComplete="off" aria-label="Say something" />
      <span className={'w-left' + (left < 10 ? ' low' : '')} aria-hidden="true">{left}</span>
      <button className={'w-btn sm' + (card?.q ? ' ghost' : '')} data-t="w-send" disabled={!text.trim()}>Say</button></form>)
  const seated = !!card?.q
  const callEl = call && card?.q ? <CallPanel call={call} name={tname} heartOn={heartOn} desk={layout === 'desk'}
    onHeart={v => { setHeartOn(v); net.current?.send({ t: 'cheart', on: v } as any) }} /> : null
  const cardEl = card && card.q && <TablePanel card={card} callEl={callEl} name={tname} pav={net.current?.pubs.get(card.with)?.pav} photo={photo} desk={layout === 'desk'}
    ans={ans} setAns={setAns} ansErr={ansErr} onAns={sendAns} priv={priv} privEl={privEl} say={bar} send={o => net.current?.send(o as any)} stand={stand} />
  const myPav = net.current?.p.pav
  const myPortrait = myPav ? <Suspense fallback={null}><Char json={myPav} scale={2} label="Your Pixel You" t="w-piano-av" /></Suspense> : null
  const nn = net.current, who: Who = { me: nn?.me ?? 0, name: id => id === nn?.me ? 'You' : nn?.pubs.get(id)?.name ?? 'Someone', pav: id => id === nn?.me ? nn?.p.pav : nn?.pubs.get(id)?.pav }
  const dsend = (o: object) => net.current?.send(o as any)
  const soloDuet = pianoS.by === nn?.me && pianoS.song && DUET.has(pianoS.song) ? pianoS.song : null
  const pianoEl = where === 'piano' && (duet?.me && pa.current ? <DuetPanel v={duet} who={who} A={pa.current} send={dsend} onStand={stand} onInvite={() => { setDlist(null); setInvOpen(true); dsend({ t: 'dlist' }) }} />
    : soloDuet && pa.current ? <SoloDuetPanel id={soloDuet} at={pianoS.at} near={near} A={pa.current} portrait={myPortrait} onStop={() => dsend({ t: 'pstop' })} onStand={stand} />
    : <PianoPanel mine={pianoS.by === net.current?.me} playing={pianoS.by === net.current?.me ? pianoS.song : null} near={near} sel={song}
    setSel={id => { setSong(id); if (DUET.has(id)) pa.current?.warmDuet(id); else void pa.current?.load(id) }} onPlay={id => net.current?.send({ t: 'piano', id } as any)} onStop={() => net.current?.send({ t: 'pstop' } as any)} onStand={stand}
    portrait={myPortrait} duetRows={<DuetRows sel={song} setSel={id => { setSong(id); pa.current?.warmDuet(id) }} />}
    duetFoot={<div className="w-pick-foot"><button className="w-btn" data-t="w-duet-start" onClick={() => { pa.current?.unlock(); dsend({ t: 'dstart', id: song }) }}><DPx i="DUO" c="#05020F" />Start duet</button>
      <button className="w-btn ghost" data-t="w-piano-stand" onClick={stand}>Stand up</button></div>} />)
  const duetPlaying = duet && (duet.ph === 'play' || duet.ph === 'count') && duet.song ? DUET.get(duet.song) : undefined
  const playing = pianoS.song ? PIECE.get(pianoS.song) : undefined, soloDuetAny = pianoS.song && pianoS.by ? DUET.get(pianoS.song) : undefined
  const pianist = pianoS.by === net.current?.me ? 'You' : net.current?.pubs.get(pianoS.by)?.name ?? 'Someone'
  // GD end-received-390: a gentle card for the one turned down (never says why); the grey broken heart over the person
  // who ended it is the server's, and only they see it
  const goneEl = gone && <section className="w-gentle" data-t="w-gone" role="status"><h2><b>{gone}</b> has moved on.</h2>
    <p>Thanks for the chat <img src={heartPng} alt="" width={18} height={16} data-t="w-gone-heart" /></p>
    <button className="w-btn" data-t="w-gone-ok" onClick={() => setGone('')}>OK</button></section>
  return (
    <main className={'w-room ' + layout + (seated ? ' seated' : '')} data-t="w-room" data-layout={layout} data-seated={seated ? '1' : undefined}>
      <header className="w-top"><b>Café</b><span data-t="w-inst">{inst.replace('cafe-', 'room ')}</span><span data-t="w-count" data-n={count}>{count} here</span>
        <a className="w-leave" href="./" onClick={() => net.current?.close()}>Leave</a></header>
      <div className="w-stage" ref={stage}><canvas ref={canvas} data-t="w-canvas" onPointerDown={tap} />
        <div className="w-over" ref={over} aria-live={layout === 'desk' ? 'off' : 'polite'} />
        {/* voice emote tray: PLACEHOLDER text buttons until GD's art (flagged) */}
        {layout === 'phone' && <button className={'w-emo w-emo-tg' + (emoOpen ? ' on' : '')} data-t="w-emote-toggle" aria-expanded={emoOpen} aria-label={emoOpen ? 'Close voice emotes' : 'Voice emotes'}
          onPointerDown={ev => ev.stopPropagation()} onClick={() => setEmoOpen(o => !o)}>{emoOpen ? '×' : '♪'}</button>}
        {(layout === 'desk' || emoOpen) && <div className={'w-emotes' + (layout === 'phone' ? ' folded' : '')} data-t="w-emotes" role="group" aria-label="Voice emotes">{EMOTES.map(e =>
          <button key={e} className="w-emo" data-t="w-emote" data-e={e} aria-label={EMOTE_LABEL[e]} onPointerDown={ev => ev.stopPropagation()}
            onClick={() => { pa.current?.unlock(); net.current?.send({ t: 'emote', e } as any); if (layout === 'phone') setEmoOpen(false) }}>{EMOTE_LABEL[e as Emote]}</button>)}</div>}
        {playing && pianoS.by > 0 && <NowPlaying piece={playing} by={pianist} muted={muted} onMute={() => { const v = !muted; setMuted(v); pa.current?.setMuted(v) }} />}
        {!playing && soloDuetAny && <NowPlaying piece={{ title: soloDuetAny.title } as any} by={`${pianist} · both parts`} muted={muted} onMute={() => { const v = !muted; setMuted(v); pa.current?.setMuted(v) }} />}
        {duetPlaying && <NowPlaying piece={{ title: duetPlaying.title } as any} by="duet" muted={muted} onMute={() => { const v = !muted; setMuted(v); pa.current?.setMuted(v) }} />}
        {duet && duetPlaying && duet.ph === 'play' && !duet.me && !sel && pa.current && <DuetCard v={duet} who={who} A={pa.current} />}
        {invOpen && duet?.me === 'bass' && <InviteSheet people={dlist} who={who} song={duet.song} pending={!!duet.inv} onInvite={id => { dsend({ t: 'dinv', id }); setInvOpen(false) }} onClose={() => setInvOpen(false)} />}
        {dinv && pa.current && <InviteCard from={dinv.from} song={dinv.song} until={dinv.until} who={who} A={pa.current} send={dsend} />}</div>
      <aside className="w-side" data-t="w-side">
        {person}
        {note && <p className="w-note" role="status" data-t="w-note">{note}</p>}
        {goneEl}
        {cardEl}
        {pianoEl}
        {where === 'sofa' && <section className="w-panel w-sofa" data-t="w-sofa"><p>On the sofa · everyone can hear the room chat</p>
          <button className="w-btn sm ghost" data-t="w-sofa-stand" onClick={stand}>Stand up</button></section>}
        {/* GD v05: at a table the "Just you two" chat (with the bar) replaces the room log */}
        {!seated && layout === 'desk' && <section className="w-log" data-t="w-log" aria-label="Chat">
          <h2 className="w-log-h">Chat</h2>
          <ol ref={logEl} role="log" aria-live="polite">{log.length ? log.map(l => <li key={l.k} className={l.mine ? 'mine' : undefined} data-mine={l.mine ? '1' : undefined}><b>{l.mine ? 'You' : l.name}</b> <span>{l.text}</span></li>)
            : <li className="w-log-empty">What people say shows up here.</li>}</ol></section>}
        {!seated && bar}
        {!seated && layout === 'desk' && <p className="w-help" data-t="w-help">Click to walk · arrows/WASD · Enter to talk · Esc to close · click someone for options · sit at a table with someone for a question card · tap the piano to play</p>}
        {!seated && layout === 'desk' && <p className="w-help w-credit" data-t="w-credit-help">{PIANO_CREDIT} · {EMOTE_CREDIT}</p>}
      </aside>
    </main>)
}
/** The date's photo at 64 CSS px (GD v05): 64 is a multiple of every level's block count (8/16/32/64), so the blocks stay
    whole; pixelated on their phone, drawn nearest-neighbour, the app's reveal on level up. Until it arrives (or if they have
    none), their Pixel You portrait, integer-scaled. */
const PHOTO_CSS = 64
function Photo({ photo, name, pav, id }: { photo: { lv: number; data: string } | null; name: string; pav?: string; id: number }) {
  // GD: never an empty slot. A look that won't parse (or none) falls back to the same sample look the café draws for them
  const look = pav && parseOptions(pav) ? pav : JSON.stringify(SAMPLES[id % SAMPLES.length])
  const cv = useRef<HTMLCanvasElement>(null), prev = useRef<HTMLImageElement | null>(null), dpr = Math.max(1, Math.round(devicePixelRatio || 1))
  useEffect(() => { if (!photo || !cv.current) return; let live = true
    void loadImage(photo.data).then(img => { if (!live || !cv.current) return; animateReveal(cv.current, prev.current, img); prev.current = img; cv.current.dataset.lv = String(photo.lv); cv.current.dataset.px = String(img.naturalWidth) })
    return () => { live = false } }, [photo?.data])
  return <div className="w-photo" style={{ width: PHOTO_CSS, height: PHOTO_CSS }}>
    <canvas ref={cv} width={PHOTO_CSS * dpr} height={PHOTO_CSS * dpr} data-t="w-photo" hidden={!photo} role="img" aria-label={photo ? `${name}'s photo at level ${photo.lv}` : `${name}'s photo`} />
    {!photo && <span className="w-photo-ph" data-t="w-photo-ph"><Suspense fallback={null}><Char json={look} scale={2} label={`${name}'s Pixel You`} t="w-portrait" /></Suspense></span>}</div>
}
type Send = (o: { t: string; [k: string]: unknown }) => void
/** GD's 1-bit pixel icons from the v05 table mocks (rows of '#'), drawn as crisp rects at n CSS px per pixel */
const ICONS = { x: '##....##/###..###/.######./..####../..####../.######./###..###/##....##', lock: '..###../.#...#./.#...#./#######/###.###/###.###/#######',
  cam: '#######.../#######..#/#######.##/##########/#######.##/#######..#/#######...', mic: '..##../.####./.####./.####./#.##.#/.#..#./..##../..##..', hang: '.######./##....##/#......#', tick: '......##/.....##./##..##../.####.../..##....' }
function Px({ i, n = 2, c = 'currentColor' }: { i: keyof typeof ICONS; n?: number; c?: string }) {
  const rows = ICONS[i].split('/'), w = rows[0].length, h = rows.length
  return <svg className="i" width={w * n} height={h * n} viewBox={`0 0 ${w} ${h}`} fill={c} aria-hidden="true">
    {rows.flatMap((r, y) => [...r].map((ch, x) => ch === '#' ? <rect key={x + ',' + y} x={x} y={y} width={1} height={1} /> : null))}</svg>
}
/** GD v05 table-for-two sheet: who (photo + level meter), the question card, "Just you two" chat, Start call. */
function TablePanel({ card, callEl, name, pav, photo, desk, ans, setAns, ansErr, onAns, priv, privEl, say, send, stand }: { card: Tbl; callEl?: React.ReactNode; name: string; pav?: string; photo: { lv: number; data: string } | null; desk: boolean
  ans: string; setAns: (s: string) => void; ansErr: string; onAns: (e: React.FormEvent) => void; priv: { k: number; mine: boolean; text: string }[]; privEl: React.RefObject<HTMLOListElement | null>
  say: React.ReactNode; send: Send; stand: () => void }) {
  const L = LEVELS[card.lv - 1], nextL = LEVELS[card.lv], vL = LEVELS[card.video - 1], q = card.q!, qL = LEVELS[(q.lv || card.lv) - 1]
  const [ask, setAsk] = useState<'' | 'nfm' | 'block'>(''), canNfm = !!card.rev   // GD: only once a card is revealed
  const canCall = card.lv >= card.video, rev = card.rev, fresh = rev && !card.up && card.seg > 0 && card.lv < LEVELS.length ? card.seg - 1 : -1
  return (<>
    <section className="w-panel w-who" data-t="w-strip" aria-label={`Table for two with ${name}`}>
      <Photo photo={photo} name={name} pav={pav} id={card.with} />
      <div className="w-who-txt"><p className="w-with" data-t="w-with">{name}</p>
        <p className="w-lv" data-t="w-lv"><b>Level {card.lv}</b> {L?.name}{nextL && <span className="w-to" data-t="w-to">· {card.seg}/5 to {nextL.name}</span>}</p>
        <div className="w-meter" data-t="w-meter" data-seg={card.seg} role="meter" aria-valuemin={0} aria-valuemax={5} aria-valuenow={card.seg} aria-label={nextL ? `${card.seg} of 5 cards to Level ${card.lv + 1}` : 'Top level'}>
          {[0, 1, 2, 3, 4].map(i => <i key={i} className={i === fresh ? 'new' : i < card.seg ? 'on' : undefined} data-t={i === fresh ? 'w-seg-new' : undefined} />)}
          {rev && (card.up ? <span className="w-plus" data-t="w-plus">Level up!</span> : fresh >= 0 && <span className="w-plus" data-t="w-plus">+1</span>)}</div></div>
      <button className="w-stand" data-t="w-stand" aria-label="Stand up" onClick={stand}><Px i="x" /></button>
      {/* Block is there from the first second at the table, before any card is answered */}
      <button className="w-link w-tblock" data-t="w-tblock" onClick={() => setAsk('block')}>Block</button>
    </section>
    {ask === 'block' && <section className="w-panel w-ask" data-t="w-tblock-confirm"><p>Block {name}? You won't see each other in any café room again. They aren't told.</p>
      <div className="w-acts"><button className="w-btn sm danger" data-t="w-tblock-yes" onClick={() => { send({ t: 'block', id: card.with }); setAsk('') }}>Block</button>
        <button className="w-btn sm ghost" onClick={() => setAsk('')}>Cancel</button></div></section>}
    {callEl}
    {!callEl && <><section className={'w-card' + (rev ? ' done' : '')} data-t="w-card" data-lv={card.lv} data-rev={rev ? '1' : undefined}>
      {rev && <div className="w-stamp" data-t="w-done"><Px i="tick" />Ticked off</div>}
      <p className="w-kick"><span className="w-tag" data-t="w-tag">{qL?.name} · Q{q.i || card.n + 1}</span>Table for two</p>
      <p className="w-q" data-t="w-q">{q.text}</p>
      <div className="w-rows" data-t={rev ? 'w-rev' : 'w-ans'}>
        <div className="w-row"><span className="w-who2 me">You</span>
          {rev ? <div className="w-a mine"><Px i="tick" c="#48E5C2" /><span data-t="w-rev-mine">{rev.mine}</span></div>
            : card.mine ? <div className="w-a mine" data-t="w-mine"><Px i="tick" c="#48E5C2" /><span>{card.mine}</span><span className="w-hid" data-t="w-hid"><Px i="lock" n={1.5} /> Hidden from {name}</span></div>
            : <form className="w-a input" onSubmit={onAns}><input data-t="w-ans-input" value={ans} maxLength={MAX_ANS} onChange={e => setAns(e.target.value)} placeholder="Your answer" aria-label="Your answer" enterKeyHint="send" autoComplete="off" />
              <button className="w-btn sm" data-t="w-ans-send" aria-disabled={!ans.trim() || undefined}>Answer</button></form>}</div>
        <div className="w-row"><span className="w-who2 them">{name}</span>
          {rev ? <div className="w-a"><Px i="tick" c="#48E5C2" /><span data-t="w-rev-theirs">{rev.theirs}</span></div>
            : <div className={'w-a wait' + (card.them ? ' in' : '')} data-t="w-them" data-them={card.them ? '1' : undefined}>
              {card.them ? <><Px i="tick" c="#48E5C2" />{name} has answered</> : card.mine ? <>{name} is thinking<span className="w-dots">…</span></> : 'Not answered yet'}</div>}</div></div>
      {ansErr && <p className="w-err" role="alert" data-t="w-ans-err">{ansErr}</p>}
      {rev ? <div className="w-foot two">
          <button className="w-btn" data-t="w-next" onClick={() => send({ t: 'next' })}>Next card</button>
          {canNfm && <button className="w-btn w-no" data-t="w-nfm" onClick={() => setAsk('nfm')}>Not for me</button>}</div>
        : card.mine && <div className="w-foot"><span className="w-fnote">Answers show when you’ve both replied.</span></div>}
      {ask === 'nfm' && <><div className="w-dim" data-t="w-dim" onClick={() => setAsk('')} />
        <section className="w-confirm" data-t="w-nfm-confirm" role="dialog" aria-modal="true" aria-label={`End the date with ${name}?`}><div className="w-grab" />
          <h2>End the date with <b>{name}</b>?</h2><p>You’ll both stand up. {name} won’t see why.</p>
          <div className="w-acts2"><button className="w-btn w-keep" data-t="w-nfm-no" onClick={() => setAsk('')}>Keep chatting</button>
            <button className="w-btn w-end" data-t="w-nfm-yes" onClick={() => { send({ t: 'nfm' }); setAsk('') }}>End it</button></div></section></>}
    </section>
    <section className="w-panel w-chat" data-t="w-priv">
      <h3 data-t="w-priv-label"><Px i="lock" n={2} />Just you two<span className="w-sub">Others see “…”</span></h3>
      <ol ref={privEl} role="log" aria-live="polite">{priv.length ? priv.map(l => <li key={l.k} className={l.mine ? 'mine' : undefined}><b>{l.mine ? 'You' : name}</b> <span>{l.text}</span></li>)
        : <li className="w-log-empty">Only {name} sees what you say here.</li>}</ol>
      {say}
    </section>
    <section className="w-panel w-call" data-t="w-callrow" data-call={card.call ?? (canCall ? 'open' : 'locked')}>
      {!canCall ? <><button className="w-btn wide" data-t="w-call" disabled><Px i="cam" />Start call</button>
          <p className="w-why" data-t="w-call-lock"><Px i="lock" c="#6E6596" />Video unlocks at <b>Level {card.video} · {vL?.name}</b></p></>
        : card.call === 'out' ? <><button className="w-btn wide" disabled data-t="w-call-out"><span className="w-pulse" />Waiting for {name}…</button>
          <div className="w-both"><span className="y"><Px i="tick" c="#48E5C2" />You tapped</span><span>{name} hasn’t yet</span><button className="w-link" data-t="w-call-cancel" onClick={() => send({ t: 'callno' })}>Cancel</button></div></>
        : card.call === 'in' ? <><button className="w-btn coral wide" data-t="w-call-yes" onClick={() => send({ t: 'callyes' })}><Px i="cam" />Start call</button>
          <div className="w-both" data-t="w-call-in"><span>{name} tapped</span><span className="y">The call starts when you tap too.</span><button className="w-link" data-t="w-call-no" onClick={() => send({ t: 'callno' })}>Not now</button></div></>
        : <><button className="w-btn coral wide" data-t="w-call" onClick={() => send({ t: 'call' })}><Px i="cam" />Start call</button>
          <p className="w-why">The call starts when you both tap.</p></>}
    </section></>}
    {desk && <p className="w-deskhint" data-t="w-deskhint">Seated at table {card.tb + 1} · <b>Esc</b> or <b>X</b> to stand up</p>}
  </>)
}
/** GD couple-call-390: "On call mm:ss", only-you-two line, the partner's video (pixelated on their phone) with a butter name
    tag, my self view with the mint ring, Mute / Camera / End call; then "Show our heart in the café" (on each call). */
function CallPanel({ call, name, heartOn, onHeart, desk }: { call: CafeCall; name: string; heartOn: boolean; onHeart: (v: boolean) => void; desk: boolean }) {
  const rv = useRef<HTMLVideoElement>(null), sv = useRef<HTMLVideoElement>(null), [t0] = useState(() => Date.now()), [, tick] = useState(0)
  useEffect(() => { const i = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(i) }, [])
  useEffect(() => { if (rv.current && rv.current.srcObject !== call.remote) { rv.current.srcObject = call.remote; void rv.current.play().catch(() => {}) } })
  useEffect(() => { if (sv.current && sv.current.srcObject !== call.raw) { sv.current.srcObject = call.raw; void sv.current.play().catch(() => {}) } })
  const s = Math.floor((Date.now() - t0) / 1000), mmss = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  return <>
    <section className={'w-panel w-oncall' + (desk ? ' desk' : '')} data-t="w-oncall" data-up={call.up ? '1' : undefined}>
      <div className="w-oc-hd"><span className="w-pulse" />{call.up ? <>On call <b data-t="w-oc-time">{mmss}</b></> : <>Connecting…</>}
        <span className="w-oc-sub"><Px i="lock" n={1.5} c="#A49CC2" />Only you two see and hear this</span></div>
      <div className="w-vid"><video ref={rv} data-t="w-oc-remote" autoPlay playsInline />
        <span className="w-vid-nm" data-t="w-oc-name">{name}</span>
        <div className="w-vid-self"><video ref={sv} data-t="w-oc-self" autoPlay playsInline muted hidden={call.camOff} /><span>You</span></div></div>
      <div className="w-oc-ctl">
        <button className={'w-btn ghost' + (call.muted ? ' on' : '')} data-t="w-oc-mute" aria-pressed={call.muted} onClick={() => call.setMuted(!call.muted)}><Px i="mic" c="#FFF1C1" />{call.muted ? 'Unmute' : 'Mute'}</button>
        <button className={'w-btn ghost' + (call.camOff ? ' on' : '')} data-t="w-oc-cam" aria-pressed={call.camOff} onClick={() => call.setCamOff(!call.camOff)}><Px i="cam" c="#FFF1C1" />Camera</button>
        <button className="w-btn w-oc-end" data-t="w-oc-end" onClick={() => call.end('hangup')}><Px i="hang" c="#05020F" />End call</button></div>
    </section>
    <section className="w-panel w-show" data-t="w-show">
      <span className="w-show-hi" style={{ backgroundImage: `url(${coupleHeart3x})` }} aria-hidden="true" />
      <div><b>Show our heart in the café</b><span className="s">Everyone here sees a heart over your table during the call. Either of you can turn it off.</span></div>
      <button className={'w-sw' + (heartOn ? '' : ' off')} data-t="w-show-sw" role="switch" aria-checked={heartOn} aria-label="Show our heart in the café" onClick={() => onHeart(!heartOn)} />
    </section></>
}
export function mount(el: HTMLElement) { createRoot(el).render(<World />) }
