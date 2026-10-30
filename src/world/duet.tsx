/* Pixeldate World · piano duets (GD world/duet/README.md, mocks A–L): the picker's Duets section, the duet panel (waiting,
   invite sent, count-in, playing, both seated), the invite sheet and card, the secret pick game (with 8 s previews), the
   reveal (In tune! + the level-up offer, the coin flip, Level up!), Play solo instead, and the listener's card + tags.
   Styles: duet.css, ported from GD's duet.css + game.css by tools/port-duet-css.py. Photos in the game are the players'
   Pixel You portraits for now (flagged: GD's mocks show their pixelated photos). */
import { lazy, Suspense, useEffect, useState } from 'react'
import { DUET, DUETS, PICK_MS, INVITE_MS, FLIP_MS, floorMmss, type Part } from '../../world/shared/duet.ts'
import type { DuetView } from '../../world/shared/proto.ts'
import { parseOptions } from '../avatar/kit/map.ts'
import { SAMPLES } from '../avatar/kit/kit.gen.ts'
import { LEVELS } from '../config.ts'
import type { PianoAudio } from './piano.tsx'
import './duet.css'
const Char = lazy(() => import('../avatar/kit/Char'))

type On = Extract<DuetView, { on: true }>
export type DuetOn = On
/** GD's pixel icons (mocks.py / game_mocks.py), drawn as crisp SVG rects */
const ICONS: Record<string, string> = {
  X: '#....#\n.#..#.\n..##..\n..##..\n.#..#.\n#....#',
  TICK: '.....#\n....##\n#..##.\n####..\n.##...',
  DUO: '.##...##.\n####.####\n####.####\n.##...##.\n.........\n###...###\n###...###',
  SEAT: '.######.\n#......#\n#......#\n########\n#......#\n.#....#.',
  PLUS: '..##..\n..##..\n######\n######\n..##..\n..##..',
  HEART: '.##.##.\n#######\n#######\n.#####.\n..###..\n...#...',
  COIN: '.####.\n##..##\n#.##.#\n#.##.#\n##..##\n.####.',
  PLAY: '#....\n###..\n####.\n#####\n####.\n###..\n#....',
  PAUSE: '##.##\n##.##\n##.##\n##.##\n##.##\n##.##\n##.##',
  'brahms-hungarian-dance-5': '....##.....\n.....#....#\n.....#...#.\n...####.#..\n..##..##...\n...#..#....\n..##..##...\n.#.####.#..\n#..####..#.\n...........',
  'faure-dolly-berceuse': '..####...#.\n.###....###\n###......#.\n###........\n###........\n###.....#..\n.#######...\n..#####....',
  'after-you': '#####...\n#...##..\n#...#.#.\n#...#.#.\n#...#.#.\n#..##.#.\n#...#.#.\n#...##..\n#####...',
  chopsticks: '#......#\n.#....#.\n..#..#..\n...##...\n...##...\n..#..#..\n.#....#.\n#......#',
}
const CORAL = '#FF6F59', BUTTER = '#FFD84D', MINT = '#48E5C2', CREAM = '#FFF1C1', EDGE = '#05020F'
export function Px({ i, c, k = 2 }: { i: string; c: string; k?: number }) {
  const rows = ICONS[i].split('\n'), w = Math.max(...rows.map(r => r.length)), h = rows.length
  return <svg className="px" width={w * k} height={h * k} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" shapeRendering="crispEdges">
    {rows.flatMap((r, y) => [...r].map((ch, x) => ch === '#' ? <rect key={x + ',' + y} x={x} y={y} width={1} height={1} fill={c} /> : null))}</svg>
}
const lookOf = (pav: string | undefined, id: number) => pav && parseOptions(pav) ? pav : JSON.stringify(SAMPLES[Math.abs(id) % SAMPLES.length])
/** a head-and-shoulders crop of someone's Pixel You in GD's .av / .ph boxes */
export function Head({ pav, id, cls = 'av', scale = 2, t }: { pav?: string; id: number; cls?: string; scale?: number; t?: string }) {
  return <div className={cls} data-t={t}><Suspense fallback={null}><Char json={lookOf(pav, id)} scale={scale} /></Suspense></div>
}
/** re-render every `ms` while mounted (timers, progress bars) */
export function useTick(ms: number, on = true) { const [, set] = useState(0); useEffect(() => { if (!on) return; const i = setInterval(() => set(x => x + 1), ms); return () => clearInterval(i) }, [ms, on]) }
const mss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const isOrig = (id: string) => DUET.get(id)?.by === 'Original'
const sub = (id: string) => { const d = DUET.get(id)!; return isOrig(id) ? 'Pixeldate original' : d.by }
const lvName = (n: number) => LEVELS[Math.max(0, Math.min(LEVELS.length, n) - 1)]?.name ?? ''
export type Who = { name: (id: number) => string; pav: (id: number) => string | undefined; me: number }

/** mock A: the picker's Duets section (radio rows with the Bass / Melody chips) */
export function DuetRows({ sel, setSel }: { sel: string; setSel: (id: string) => void }) {
  return <>
    <p className="sec" data-t="w-duets-h">Duets<small>Play with someone beside you</small></p>
    <ul className="songs w-songs" role="radiogroup" aria-label="Duets">{DUETS.map(d =>
      <li key={d.id} role="radio" aria-checked={d.id === sel} tabIndex={0} className={'du' + (d.id === sel ? ' sel' : '')} data-t="w-duet-song" data-id={d.id}
        onClick={() => setSel(d.id)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSel(d.id) } }}>
        <span className="rad" /><span><span className="n">{d.title}</span>{isOrig(d.id) && <span className="orig">Original</span>}<span className="c">{sub(d.id)}</span>
          <span className="parts"><span className="pt bass">Bass</span><span className="pt mel">Melody</span>2 players</span></span><span className="d">{floorMmss(d.durationSec)}</span></li>)}</ul></>
}

function SongCard({ id, part }: { id: string; part: Part | null }) {
  const d = DUET.get(id); if (!d) return null
  return <div className="songcard" data-t="w-duet-songcard" data-id={id}><span className="n">{d.title}{isOrig(id) && <span className="orig dorig">Original</span>}</span>
    <span className="d">{floorMmss(d.durationSec)}</span><span className="c">{sub(id)}{part ? ` · you play the ${part === 'bass' ? 'bass' : 'melody'} part` : ''}</span></div>
}
const LBL = { bass: 'Bass · left', melody: 'Melody · right' } as const

/** mocks B (waiting), G (invite sent), D (count-in), playing, both seated; the pick game and the reveal take over in pick / res */
export function DuetPanel({ v, who, A, send, onStand, onInvite }: { v: On; who: Who; A: PianoAudio; send: (o: object) => void; onStand: () => void; onInvite: () => void }) {
  useTick(250)
  const me = v.me!, other: Part = me === 'bass' ? 'melody' : 'bass', oid = v[other], now = A.serverNow()
  if (v.ph === 'pick' && v.pick) return <PickPanel v={v} who={who} A={A} send={send} />
  if (v.ph === 'res' && v.res) return <ResPanel v={v} who={who} A={A} send={send} />
  const seat = (part: Part) => {
    const id = v[part], mine = part === me
    if (!id && v.inv && part === 'melody') {   // G: the invited person, dashed butter, a countdown, Cancel
      const left = v.inv.exp - now
      return <div className="seat inv" data-t="w-duet-seat" data-part={part} data-state="invited"><span className={'lbl ' + 'mel'}>{LBL[part]}</span>
        <Head pav={who.pav(v.inv.to)} id={v.inv.to} /><span className="nm">{who.name(v.inv.to)}</span><span className="sub b" data-t="w-duet-inv-left">Invited · {mss(left)}</span>
        <span className="cd" style={{ '--p': Math.max(0, Math.min(100, left / INVITE_MS * 100)) + '%', width: '100%' } as React.CSSProperties} />
        <button className="w-btn sm ghost" data-t="w-duet-inv-cancel" onClick={() => send({ t: 'dinvx' })}>Cancel</button></div>
    }
    if (!id) return <div className="seat open" data-t="w-duet-seat" data-part={part} data-state="open"><span className={'lbl ' + (part === 'bass' ? 'bass' : 'mel')}>{LBL[part]}</span>
      <div className="av"><Px i="SEAT" c={MINT} k={3} /></div><span className="nm dim">Empty seat</span>
      {me === 'bass' && part === 'melody' && <button className="w-btn sm" data-t="w-duet-invite" onClick={onInvite}><Px i="PLUS" c={EDGE} />Invite</button>}</div>
    const ready = v.ph === 'count' || v.ph === 'play'
    return <div className="seat" data-t="w-duet-seat" data-part={part} data-state="sat"><span className={'lbl ' + (part === 'bass' ? 'bass' : 'mel')}>{LBL[part]}</span>
      <Head pav={who.pav(id)} id={id} /><span className="nm">{mine ? 'You' : who.name(id)}</span>
      <span className="sub y"><Px i="TICK" c={MINT} />{v.ph === 'play' ? 'Playing' : ready ? 'Ready' : 'Seated'}</span></div>
  }
  const du = v.song ? DUET.get(v.song) : undefined
  let status: React.ReactNode, hint: React.ReactNode = null, foot: React.ReactNode
  const standBtn = <button className="w-btn ghost" data-t="w-duet-stand" onClick={onStand}>Stand up</button>
  if (v.ph === 'count' && du) {
    const n = Math.max(1, Math.ceil((v.at - now) / 1000))
    status = <div className="status" data-t="w-duet-status" data-ph="count"><span className="pulse" />Both seated · starting in <span className="big" data-t="w-duet-n">{n}</span></div>
    foot = <div className="w-dfoot c"><button className="link" data-t="w-duet-cancel" onClick={() => send({ t: 'dcancel' })}>Cancel</button></div>
  } else if (v.ph === 'play' && du) {
    const pos = (now - v.at) / 1000, p = Math.max(0, Math.min(1, pos / du.durationSec))
    status = <div className="bar" data-t="w-duet-bar"><span>{floorMmss(Math.max(0, pos))}</span><i style={{ '--p': p * 100 + '%' } as React.CSSProperties} /><span>{floorMmss(du.durationSec)}</span></div>
    foot = <div className="w-dfoot">{standBtn}</div>
  } else if (v.ph === 'both') {
    status = <div className="status" data-t="w-duet-status" data-ph="both"><span className="pulse" />Both seated</div>
    foot = <div className="w-dfoot"><button className="w-btn" style={{ flex: 1 }} data-t="w-duet-again" onClick={() => send({ t: 'dagain' })}><Px i="DUO" c={EDGE} />Play a duet</button>{standBtn}</div>
  } else {
    const inv = v.inv
    status = inv ? <div className="status b" data-t="w-duet-status" data-ph="sent"><span className="pulse bp" /><span>Invite sent to <b>{who.name(inv.to)}</b> <span className="t">· {mss(inv.exp - now)}</span></span></div>
      : <div className="status" data-t="w-duet-status" data-ph="wait"><span className="pulse" />Waiting for a partner…</div>
    hint = inv ? <p className="hint">One invite at a time. Anyone nearby can still <b>sit beside you</b>.</p>
      : me === 'bass' ? <p className="hint"><b>Invite</b> a match, or anyone nearby can tap the piano to <b>sit beside you</b>.</p>
      : <p className="hint">Anyone nearby can tap the piano to <b>sit beside you</b>.</p>
    foot = <div className="w-dfoot"><button className="w-btn ghost" style={{ flex: 1 }} data-t="w-duet-solo" onClick={() => send({ t: 'dsolo' })}>Play solo instead</button>{standBtn}</div>
  }
  return <section className="w-panel w-pick w-duet" data-t="w-duet" data-ph={v.ph} aria-label="Duet">
    <h2>Duet<button className="w-x" data-t="w-duet-x" aria-label="Stand up" onClick={onStand}>×</button></h2>
    {v.song && <SongCard id={v.song} part={me} />}
    {v.ph !== 'play' && status}
    <div className="seats">{seat('bass')}{seat('melody')}</div>
    {v.ph === 'play' && status}
    {hint}{foot}
    {oid === 0 && null}
  </section>
}

/** mock I: the secret pick. 2x2 cards pop in; mine gets the butter border + mint tick (changeable until both have picked);
    ▶ previews 8 s on this phone only (never picks; picking never stops it); the timer drains over 30 s */
function PickPanel({ v, who, A, send }: { v: On; who: Who; A: PianoAudio; send: (o: object) => void }) {
  const pk = v.pick!, me = v.me!, oid = v[me === 'bass' ? 'melody' : 'bass'], [, set] = useState(0)
  useEffect(() => { A.pvChange = () => set(x => x + 1); return () => { A.pvChange = null; A.previewStop() } }, [A])   // previews stop when the pick screen closes
  const left = Math.max(0, Math.ceil((pk.end - A.serverNow()) / 1000)), pv = A.pv
  const st = (done: boolean, t: string) => done ? <span className="s y" data-t={t} data-done="1">Picked <Px i="TICK" c={MINT} k={1} /></span> : <span className="s" data-t={t}>Picking…</span>
  return <section className="w-panel w-pick w-duet g" data-t="w-duet-pick" aria-label="Secret pick">
    <h2>Secret pick<button className="w-x" data-t="w-duet-x" aria-label="Cancel" onClick={() => send({ t: 'dcancel' })}>×</button></h2>
    <p className="gq">Pick a duet. If you both pick the same one, <b>you level up!</b></p>
    <div className="tmr" data-t="w-duet-timer" data-left={left}><span className="cd" style={{ '--p': left / (PICK_MS / 1000) * 100 + '%' } as React.CSSProperties} /><span>{left}s<span className="tot"> / {PICK_MS / 1000}s</span></span></div>
    <div className="pair"><div className="pp"><Head pav={who.pav(who.me)} id={who.me} cls="ph" /><div className="t"><span className="nm">You</span>{st(!!pk.mine, 'w-pick-me')}</div></div>
      <div className="pp"><Head pav={who.pav(oid)} id={oid} cls="ph" /><div className="t"><span className="nm">{who.name(oid)}</span>{st(pk.them, 'w-pick-them')}</div></div></div>
    <div className="grid4">{DUETS.map(d => { const mine = pk.mine === d.id, on = pv?.id === d.id
      return <div key={d.id} className={'dc' + (mine ? ' me' : '')} role="button" tabIndex={0} aria-pressed={mine} data-t="w-pick-card" data-id={d.id}
        onClick={() => send({ t: 'dpick', id: d.id })} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); send({ t: 'dpick', id: d.id }) } }}>
        <span className="ic"><Px i={d.id} c={mine ? BUTTER : CREAM} k={3} /></span>
        <span className="tx"><span className="n">{d.title}</span>{on ? <span className="c pvl" data-t="w-pv-label"><i /><i /><i />Previewing</span> : <span className="c">{d.by} · {floorMmss(d.durationSec)}</span>}</span>
        <button className={'pv' + (on ? ' on' : '')} data-t="w-pv" data-id={d.id} style={on ? { '--r': Math.round(A.pvFrac() * 100) + '%' } as React.CSSProperties : undefined}
          aria-label={on ? 'Stop preview' : 'Preview ' + d.title} onClick={e => { e.stopPropagation(); A.preview(d.id) }} onKeyDown={e => e.stopPropagation()}>
          <Px i={on ? 'PAUSE' : 'PLAY'} c={MINT} /></button>
        {mine && <span className="tk"><Px i="TICK" c={EDGE} /></span>}</div> })}</div>
    <p className="small">Tap ▶ to hear 8 s first. {who.name(oid)} can't see your pick or previews. Cards flip as soon as you've both picked.</p>
  </section>
}

const HB = [[22, 4, 2, 1], [64, 34, 3, 1], [100, -2, 2, .8], [262, 2, 3, 1], [300, 30, 2, .85], [330, 0, 2, .6], [40, 50, 2, .6], [240, 52, 2, .7]] as const
const Hearts = () => <>{HB.map(([x, y, k, o], i) => <span key={i} className="h" style={{ left: x, top: y, opacity: o }}><Px i="HEART" c={CORAL} k={k} /></span>)}</>
function Card({ id, cls = '', extra }: { id: string; cls?: string; extra?: React.ReactNode }) {
  const d = DUET.get(id)!, hi = cls.includes('me') || cls.includes('coin')
  return <div className={'dc ' + cls} data-t="w-res-card" data-id={id}><span className="ic"><Px i={id} c={hi ? BUTTER : CREAM} k={3} /></span>
    <span className="tx"><span className="n">{d.title}</span><span className="c">{d.by} · {floorMmss(d.durationSec)}</span></span>{extra}</div>
}
const SP1 = [[-14, 10, CORAL], [-8, 64, BUTTER], [118, 4, MINT], [122, 80, CORAL], [40, -12, BUTTER], [104, 104, MINT]] as const
const SP2 = [[-12, 24, MINT], [-16, 90, CORAL], [120, 14, BUTTER], [116, 70, MINT], [70, -12, CORAL], [8, 106, BUTTER]] as const

/** mocks J / J′ (match + the offer), K (the coin flip), L (Level up!); a match with no offer: In tune! then the count-in */
function ResPanel({ v, who, A, send }: { v: On; who: Who; A: PianoAudio; send: (o: object) => void }) {
  const r = v.res!, me = v.me!, oid = v[me === 'bass' ? 'melody' : 'bass'], oname = who.name(oid), now = A.serverNow()
  useTick(100)
  const starting = <div className="status" data-t="w-res-starting"><span className="pulse" /><span>Starting <b>{DUET.get(r.coin)!.title}</b>…</span></div>
  if (r.up) return <section className="w-panel w-pick w-duet g" data-t="w-duet-res" data-k="levelup" aria-label="Level up">
    <div className="burst" style={{ padding: '14px 0 6px' }}><Hearts /><span className="bigchip" style={{ fontSize: 30 }}>Level up!</span></div>
    <div className="pair" style={{ justifyItems: 'center', padding: '8px 0 2px' }}>
      {[[who.me, 'You', SP1], [oid, oname, SP2]].map(([id, nm, sp]) => <div key={id as number} className="rev">
        {(sp as typeof SP1).map(([x, y, c], i) => <span key={i} className="sp" style={{ left: x, top: y, background: c }} />)}
        <Head pav={who.pav(id as number)} id={id as number} cls="ph" scale={5} /><span className="nm">{nm as string}</span></div>)}</div>
    <div className="lvrow" data-t="w-res-lv" data-lv={r.up}><span>Level {r.up - 1} {lvName(r.up - 1)}</span><div className="meter">{[0, 1, 2, 3].map(i => <i key={i} className="on" />)}<i className="new" /></div><span>→</span><b className="nw">Level {r.up} {lvName(r.up)}</b></div>
    <p className="small" style={{ color: 'var(--cream)' }}>You both said yes. Photos sharpen everywhere.</p>{starting}</section>
  if (r.match) {
    const pins = <span className="pins"><Head pav={who.pav(who.me)} id={who.me} cls="ph" /><Head pav={who.pav(oid)} id={oid} cls="ph" /></span>
    const left = Math.max(0, Math.ceil((r.end - now) / 1000))
    return <section className="w-duet g w-dres" data-t="w-duet-res" data-k={r.offer ? (r.no ? 'maybe' : r.yes ? 'yes' : 'offer') : 'match'} aria-label="In tune">
      <div className="burst"><Hearts /><span className="bigchip"><Px i="HEART" c={CORAL} k={3} />In tune!<Px i="HEART" c={CORAL} k={3} /></span></div>
      <Card id={r.coin} cls="me wide" extra={pins} />
      {r.offer ? <section className="offer" data-t="w-offer"><h2>Take it up a level?</h2>
        <p className="sub"><b>Level {r.lv} {lvName(r.lv)} → Level {r.lv + 1} {lvName(r.lv + 1)}</b> · photos sharpen everywhere</p>
        <div className="pair"><div className="pp"><Head pav={who.pav(who.me)} id={who.me} cls="ph" /><div className="t"><span className="nm">You</span><span className={'s' + (r.yes ? ' y' : '')} data-t="w-offer-me">{r.yes ? 'Yes' : r.no ? 'Not yet' : 'Deciding'}</span></div></div>
          <div className="pp"><Head pav={who.pav(oid)} id={oid} cls="ph" /><div className="t"><span className="nm">{oname}</span><span className={'s' + (r.them ? ' y' : '')} data-t="w-offer-them">{r.them ? 'Yes' : 'Deciding'}</span></div></div></div>
        {r.no ? <div className="st" data-t="w-offer-maybe">Maybe next time</div>
          : r.yes ? <><div className="st" data-t="w-offer-wait"><span className="pulse" />Waiting for {oname}…</div>
            <div className="bt"><button className="w-btn done" disabled data-t="w-offer-yes"><Px i="TICK" c={MINT} />You said yes</button><button className="w-btn lo" data-t="w-offer-no" onClick={() => send({ t: 'doffer', yes: false })}>Not yet</button></div></>
          : <div className="bt"><button className="w-btn" data-t="w-offer-yes" onClick={() => send({ t: 'doffer', yes: true })}>Yes, level up</button><button className="w-btn lo" data-t="w-offer-no" onClick={() => send({ t: 'doffer', yes: false })}>Not yet</button></div>}
        <p className="small">One level-up like this per day{!r.no && !r.yes ? ` · ${left}s` : ''}</p></section> : starting}
    </section>
  }
  // K: the coin flicks between the two picks ~6 times over FLIP_MS, lands on the coin; the other card dims
  const t = now - r.t0, flipping = t < FLIP_MS, k = Math.floor(t / (FLIP_MS / 6)), coinMine = r.coin === r.mine
  const hiMine = flipping ? (k % 2 === 0) === coinMine ? false : true : coinMine
  const tag = <span className="ctag"><Px i="COIN" c={EDGE} k={1} />Coin flip</span>
  const col = (id: number, nm: string, song: string, hi: boolean, rnd: boolean) => <div className="col"><div className="who"><Head pav={who.pav(id)} id={id} cls="ph" /><span className="nm" style={{ font: '700 15px/1 var(--ui)' }}>{nm}</span></div>
    <Card id={song} cls={hi ? 'coin' : flipping ? '' : 'dim'} extra={hi ? tag : undefined} />{rnd && <span className="small">Time ran out · picked at random</span>}</div>
  return <section className="w-panel w-pick w-duet g" data-t="w-duet-res" data-k="miss" data-flip={flipping ? '1' : '0'} aria-label="So close">
    <p className="close">So close! <span>The piano picks…</span></p>
    <div className="pair" style={{ gap: 10, marginTop: 4 }}>{col(who.me, 'You', r.mine, hiMine, r.rnd)}{col(oid, oname, r.theirs, !hiMine, r.rndThem)}</div>
    {flipping ? <div className="status" style={{ visibility: 'hidden' }}>·</div> : starting}
    <p className="small">Try again on your next duet</p></section>
}

/** mock E: the invite sheet over a scrim. Only people with a heart for you; "Sat with you" first; one invite at a time */
export function InviteSheet({ people, who, song, pending, onInvite, onClose }: { people: { id: number; sat: boolean }[] | null; who: Who; song: string | null; pending: boolean
  onInvite: (id: number) => void; onClose: () => void }) {
  const sat = (people ?? []).filter(p => p.sat), cafe = (people ?? []).filter(p => !p.sat), d = song ? DUET.get(song) : undefined
  const row = (p: { id: number; sat: boolean }) => <li key={p.id} data-t="w-inv-row" data-id={p.id}><Head pav={who.pav(p.id)} id={p.id} />
    <div className="t"><span className="nm">{who.name(p.id)}<Px i="HEART" c={CORAL} /></span><span className="s">{p.sat ? 'Sat at a table with you' : 'In the café'}</span></div>
    <button className={'w-btn sm' + (pending ? ' dis' : '')} disabled={pending} data-t="w-inv-btn" onClick={() => onInvite(p.id)}>Invite</button></li>
  return <div className="w-duet w-wrap-duet">
    <div className="scrim" data-t="w-inv-scrim" onClick={onClose} />
    <section className="w-panel w-pick w-duet w-dsheet" data-t="w-inv-sheet" aria-label="Invite to duet"><div className="grab" />
      <h2>Invite to duet<button className="w-x" data-t="w-inv-x" aria-label="Close" onClick={onClose}>×</button></h2>
      {d && <p className="lead"><b>{d.title}</b> · they'd play Melody beside you</p>}
      {people === null ? <p className="note">Looking…</p> : !people.length ? <p className="note" data-t="w-inv-empty">Nobody here has a heart for you yet.</p> : <>
        {!!sat.length && <><p className="grp y"><Px i="HEART" c={CORAL} k={1} />Sat with you</p><ul className="people">{sat.map(row)}</ul></>}
        {!!cafe.length && <><p className="grp">In the café</p><ul className="people">{cafe.map(row)}</ul></>}</>}
      <p className="note">Only people with a heart for you show here. One invite at a time · it expires after 30 s.</p></section></div>
}

/** mock F: an invite to me. 28 pt up, 16 pt in, butter border; a mint countdown; Join / No thanks */
export function InviteCard({ from, song, until, who, A, send }: { from: number; song: string; until: number; who: Who; A: PianoAudio; send: (o: object) => void }) {
  useTick(250); const left = until - performance.now(), d = DUET.get(song)
  return <div className="w-duet w-wrap-duet"><div className="icard" data-t="w-inv-card" role="dialog" aria-label="Duet invite" style={{ bottom: 28 }} onPointerDown={e => e.stopPropagation()}>
    <div className="hd"><Head pav={who.pav(from)} id={from} /><div><div className="ti"><b>{who.name(from)}</b> invites you to a duet</div>
      {d && <div className="so"><b>{d.title}</b> · you'd play Melody</div>}</div></div>
    <div className="cdrow"><span className="cd" style={{ '--p': Math.max(0, Math.min(100, left / INVITE_MS * 100)) + '%', flex: 1 } as React.CSSProperties} /><span data-t="w-inv-left">{mss(left)}</span></div>
    <div className="bt"><button className="w-btn" data-t="w-inv-join" onClick={() => { A.unlock(); send({ t: 'dinvans', yes: true }) }}>Join</button>
      <button className="w-btn dark" data-t="w-inv-no" onClick={() => send({ t: 'dinvans', yes: false })}>No thanks</button></div></div></div>
}

/** mock H: Play solo instead (the mix, both parts) */
export function SoloDuetPanel({ id, at, near, A, portrait, onStop, onStand }: { id: string; at: number; near: number; A: PianoAudio; portrait: React.ReactNode; onStop: () => void; onStand: () => void }) {
  useTick(250); const d = DUET.get(id)!, pos = Math.max(0, (A.serverNow() - at) / 1000)
  return <section className="w-panel w-pick w-duet" data-t="w-duet-solo-panel" aria-label="Piano">
    <h2>Piano<button className="w-x" data-t="w-piano-x" aria-label="Stand up" onClick={onStand}>×</button></h2>
    <div className="w-player"><span className="w-av">{portrait}</span><span className="w-pt"><b>You</b><span data-t="w-hear">{d.title} · {near} listening</span></span>
      <span className="w-live"><span className="w-pulsed" />Playing</span></div>
    <div className="w-drow"><span className="both" data-t="w-both"><Px i="DUO" c={MINT} k={1} />Playing both parts</span><span className="note" style={{ margin: 0, textAlign: 'left' }}>Bass + Melody, just you</span></div>
    <div className="bar"><span>{floorMmss(Math.min(pos, d.durationSec))}</span><i style={{ '--p': Math.min(1, pos / d.durationSec) * 100 + '%' } as React.CSSProperties} /><span>{floorMmss(d.durationSec)}</span></div>
    <div className="w-dfoot"><button className="w-btn ghost" style={{ flex: 1 }} data-t="w-piano-stop" onClick={onStop}>Stop</button><button className="w-btn ghost" data-t="w-piano-stand" onClick={onStand}>Stand up</button></div></section>
}

/** mock C: what a listener sees while a duet plays: the two players and the progress */
export function DuetCard({ v, who, A }: { v: On; who: Who; A: PianoAudio }) {
  useTick(500); const d = DUET.get(v.song!)!, pos = Math.max(0, (A.serverNow() - v.at) / 1000)
  const duo = (part: Part) => { const id = v[part]; return <div className={'duo ' + (part === 'bass' ? 'bass' : 'mel')} data-t="w-duo" data-part={part}><Head pav={who.pav(id)} id={id} />
    <div className="t"><span className="k">{LBL[part]}</span><b className="nm">{id ? who.name(id) : '—'}</b></div></div> }
  return <div className="w-duet w-wrap-duet"><section className="npcard" data-t="w-duet-card" aria-label="Duet" onPointerDown={e => e.stopPropagation()}>
    <div className="hd"><h2>Duet</h2><span className="c">{d.title} · {sub(d.id)}</span><span className="live"><span className="pulse" />Live</span></div>
    <div className="duos">{duo('bass')}{duo('melody')}</div>
    <div className="bar"><span>{floorMmss(Math.min(pos, d.durationSec))}</span><i style={{ '--p': Math.min(1, pos / d.durationSec) * 100 + '%' } as React.CSSProperties} /><span>{floorMmss(d.durationSec)}</span></div></section></div>
}
