/* Full-screen chess or draughts. Loaded only when someone sits at the board-games table.
   Placeholder wood and plain pieces. Swap .bd-sq and .bd-pc in board-table.css.
   The server sends the legal moves; this only draws them and sends the tap. */
import { useEffect, useState } from 'react'
import './bj-table.css'
import './board-table.css'
import { boardSound, type BoardSfx } from './board-sound.ts'

export interface BdMove { from: string; to: string; promo?: boolean }
export interface BdGame {
  on: true; g: 'board'; tb: number; seq: number; now: number; me: number
  phase: 'pick' | 'play' | 'over'; kind: '' | 'chess' | 'draughts'; clock: '' | 'off' | '5' | '10'
  turn: number; turnLeft: number; wMs: number; bMs: number; color: '' | 'w' | 'b'
  board: number[][]; fen: string; legal: BdMove[]; lastFrom: string; lastTo: string; chain: string
  offer: number; mine: '' | 'chess' | 'draughts'; myClock: '' | 'off' | '5' | '10'
  winner: number | null; last: { k: string; who: number; at: number }
  ps: { id: number; color: '' | 'w' | 'b'; pick: '' | 'chess' | 'draughts'; clock: '' | 'off' | '5' | '10'; away: boolean; seat: number }[]
}
const FILES = 'abcdefgh'
const sqOf = (r: number, c: number) => FILES[c] + String(8 - r)
const glyph = (fen: string, r: number, c: number) => {
  const ranks = fen.split(' ')[0]?.split('/') ?? []
  let col = 0
  for (const ch of ranks[r] || '') {
    if (/[1-8]/.test(ch)) { if (col + Number(ch) > c) return ''; col += Number(ch); continue }
    if (col === c) return ch
    col++
  }
  return ''
}
const GLYPH: Record<string, string> = { K: 'K', Q: 'Q', R: 'R', B: 'B', N: 'N', P: 'P', k: 'k', q: 'q', r: 'r', b: 'b', n: 'n', p: 'p' }
const fmt = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const SFX = new Set<BoardSfx>(['move', 'capture', 'check', 'mate', 'crown'])

export default function BoardTable({ game, name, send, stand, desk, onLeave }: { game: BdGame | null; name: (id: number) => string; send: (o: object) => void
  stand: () => void; desk: boolean; chips?: number | null; onLeave?: () => void }) {
  const [pick, setPick] = useState<'' | 'chess' | 'draughts'>(''), [clock, setClock] = useState<'' | 'off' | '5' | '10'>('')
  const [sel, setSel] = useState(''), [promo, setPromo] = useState<{ from: string; to: string } | null>(null)
  const [gone, setGone] = useState(false), [, beat] = useState(0), [t0, setT0] = useState(() => performance.now()), [heard, setHeard] = useState(0)
  useEffect(() => { const i = setInterval(() => beat(n => n + 1), 250); return () => clearInterval(i) }, [])
  useEffect(() => { setSel(''); setPromo(null); setT0(performance.now()) }, [game?.seq])
  useEffect(() => {
    const k = game?.last.k
    if (!game || !SFX.has(k as BoardSfx) || game.seq === heard) return
    setHeard(game.seq); boardSound(k as BoardSfx)
  }, [game, heard])
  const leave = () => { setGone(true); onLeave?.(); send({ t: 'gquit' }); stand() }
  if (gone) return null
  const mine = !!game && game.turn === game.me && game.phase === 'play'
  const flip = game?.color === 'b'
  const rows = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
  const live = game ? Math.max(0, game.turnLeft - (performance.now() - t0)) : 0
  const who = (side: 'w' | 'b') => name(game?.ps.find(p => p.color === side)?.id ?? 0)
  const show = (side: 'w' | 'b') => {
    if (!game || game.phase !== 'play') return ''
    if (!game.clock || game.clock === 'off') return game.color === side && mine ? fmt(live) : ''
    if (game.color === side && mine) return fmt(live)
    return fmt(side === 'w' ? game.wMs : game.bMs)
  }
  const tap = (r: number, c: number) => {
    if (!game || !mine) return
    const id = sqOf(r, c)
    const mv = game.legal.find(m => m.from === sel && m.to === id)
    if (mv) {
      if (mv.promo) { setPromo({ from: sel, to: id }); return }
      send({ t: 'gact', a: 'move', from: sel, to: id }); return
    }
    setSel(game.legal.some(m => m.from === id) ? id : '')
  }
  const status = !game ? 'Taking your seat…'
    : game.phase === 'pick' ? (game.ps.length < 2 ? 'Waiting for someone to sit opposite' : 'Pick the same game and clock')
    : game.phase === 'over' ? (game.winner === game.me ? 'You win' : game.winner ? `${name(game.winner)} wins` : 'Draw')
    : mine ? 'Your move' : `${name(game.turn)} to move`
  return <section className="bj-screen bd-screen" data-t="g-bd" data-seq={game?.seq ?? 0} data-phase={game?.phase ?? 'pick'} data-kind={game?.kind || undefined} data-turn={mine ? 'me' : 'them'} aria-label="Board games">
    <header className="bj-top"><h2>{game?.kind === 'draughts' ? 'Draughts' : game?.kind === 'chess' ? 'Chess' : 'Board games'}</h2>
      <button className="w-btn sm ghost bj-leave" data-t="bd-leave" onClick={leave}>Leave</button></header>
    <div className="bj-felt bd-felt" data-bd-art="placeholder">
      {(!game || game.phase === 'pick') && <div className="bd-pick">
        <h3>What shall we play?</h3>
        <div className="bd-row" role="radiogroup" aria-label="Game">{(['chess', 'draughts'] as const).map(g =>
          <button key={g} type="button" className={'w-btn' + (pick === g ? ' on' : '')} data-t={'bd-game-' + g} onClick={() => setPick(g)}>{g === 'chess' ? 'Chess' : 'Draughts'}</button>)}</div>
        <div className="bd-row" role="radiogroup" aria-label="Clock">{(['off', '5', '10'] as const).map(c =>
          <button key={c} type="button" className={'w-btn ghost' + (clock === c ? ' on' : '')} data-t={'bd-clock-' + c} onClick={() => setClock(c)}>{c === 'off' ? 'Off' : `${c}+0`}</button>)}</div>
        <button className="w-btn" data-t="bd-ready" disabled={!pick || !clock} onClick={() => send({ t: 'gact', a: 'pick', g: pick, c: clock })}>Ready</button>
        {!!game?.mine && <p className="bj-note">You chose {game.mine}{game.myClock ? ` · ${game.myClock === 'off' ? 'no clock' : game.myClock + '+0'}` : ''}</p>}
      </div>}
      {game && game.phase !== 'pick' && <>
        <div className="bd-clocks" data-t="bd-times"><span data-t="bd-time-b">{who('b')} {show('b')}</span><span data-t="bd-time-w">{show('w')} {who('w')}</span></div>
        <div className="bd-board" data-t="bd-board" data-flip={flip ? '1' : '0'}>
          {rows.flatMap(r => [0, 1, 2, 3, 4, 5, 6, 7].map(c0 => {
            const c = flip ? 7 - c0 : c0
            const id = sqOf(r, c)
            const ch = game.kind === 'chess' ? glyph(game.fen, r, c) : ''
            const d = game.kind === 'draughts' ? game.board[r]?.[c] ?? 0 : 0
            const dot = !!sel && game.legal.some(m => m.from === sel && m.to === id)
            return <button key={id} type="button" className={'bd-sq' + ((r + c) % 2 ? ' dark' : '') + (sel === id ? ' sel' : '') + (id === game.lastFrom || id === game.lastTo ? ' last' : '')}
              data-t="bd-sq" data-sq={id} onClick={() => tap(r, c)}>
              {ch && <span className={'bd-pc chess ' + (ch === ch.toUpperCase() ? 'w' : 'b')}>{GLYPH[ch]}</span>}
              {!!d && <span className={'bd-pc ' + (d > 0 ? 'w' : 'b') + (Math.abs(d) === 2 ? ' king' : '')} data-t="bd-man">{Math.abs(d) === 2 ? 'K' : ''}</span>}
              {dot && <i className="dot" data-t="bd-dot" />}
            </button>
          }))}
        </div>
        {promo && <div className="bd-promo" data-t="bd-promo">{(['q', 'r', 'b', 'n'] as const).map(p =>
          <button key={p} type="button" className="w-btn sm" data-t={'bd-promo-' + p} onClick={() => { send({ t: 'gact', a: 'move', from: promo.from, to: promo.to, p }); setPromo(null) }}>{p.toUpperCase()}</button>)}</div>}
      </>}
    </div>
    <div className="bj-bar">
      <p className="bj-status" role="status" data-t="g-status">{status}{game?.last.k === 'check' ? ' · check' : ''}</p>
      {game?.phase === 'play' && <div className="bd-acts">
        {game.offer === game.me ? <span className="bj-note">Draw offered</span>
          : game.offer ? <><button className="w-btn sm" data-t="bd-accept" onClick={() => send({ t: 'gact', a: 'draw', yes: true })}>Accept draw</button>
            <button className="w-btn sm ghost" data-t="bd-decline" onClick={() => send({ t: 'gact', a: 'draw', yes: false })}>Decline</button></>
            : mine && <button className="w-btn sm ghost" data-t="bd-draw" onClick={() => send({ t: 'gact', a: 'draw' })}>Offer draw</button>}
        {mine && <button className="w-btn sm ghost" data-t="bd-resign" onClick={() => send({ t: 'gact', a: 'resign' })}>Resign</button>}
      </div>}
      {desk && <p className="bj-note">Tap a piece, then where it goes. Black's board is turned round.</p>}
    </div>
  </section>
}
