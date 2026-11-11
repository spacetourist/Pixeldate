/* Full-screen Four Up. Loaded only when someone sits at that table.
   Pieces: swap .fu-disc in fourup-table.css. The lounge table is paintFourUp(). */
import { useEffect, useState } from 'react'
import './bj-table.css'
import './fourup-table.css'
import { CHIPS_NAME } from '../../world/shared/chips.ts'
export interface FuGame { on: true; g: 'fourup'; tb: number; seq: number; now: number; me: number; phase: 'bet' | 'play' | 'over'
  board: number[][]; turn: number; turnLeft: number; line: [number, number][] | null; lastDrop: { c: number; r: number; n: number } | null
  piece: number; bet: number; locked: boolean; winner: number | null; last: { k: string; who: number }
  ps: { id: number; n: number; bet: number; locked: boolean; away: boolean; seat: number }[] }

export default function FourTable({ game, name, send, stand, desk, chips, onLeave }: { game: FuGame | null; name: (id: number) => string; send: (o: object) => void
  stand: () => void; desk: boolean; chips: number | null; onLeave?: () => void }) {
  const [ante, setAnte] = useState(0), [left, setLeft] = useState(false), [, tick] = useState(0), [t0, setT0] = useState(() => performance.now())
  useEffect(() => { setT0(performance.now()) }, [game?.seq])
  useEffect(() => { const i = setInterval(() => tick(x => x + 1), 250); return () => clearInterval(i) }, [])
  const leave = () => { setLeft(true); onLeave?.(); send({ t: 'gquit' }); stand() }
  const mine = !!game && game.phase === 'play' && game.turn === game.me
  const turnLeft = game ? Math.max(0, game.turnLeft - (game.phase === 'play' ? performance.now() - t0 : 0)) : 0
  const them = game?.ps.find(p => p.id !== game.me)
  const won = (r: number, c: number) => !!game?.line?.some(([rr, cc]) => rr === r && cc === c)
  const status = !game ? 'Taking your seat…'
    : game.phase === 'over' ? (game.winner === game.me ? 'You win' : game.winner ? `${name(game.winner)} wins` : 'Draw')
    : game.phase === 'play' ? (mine ? `Your drop · ${Math.ceil(turnLeft / 1000)}s` : `${name(game.turn)}'s drop`)
    : game.locked ? 'In. Waiting for them' : 'Optional coins for the match'
  if (left) return null
  const bet = game?.phase === 'bet' && !game.locked
  return <section className="bj-screen fu-screen" data-t="g-fu" data-seq={game?.seq ?? 0} data-phase={game?.phase ?? 'bet'} data-turn={mine ? 'me' : 'them'} aria-label="Four Up">
    <header className="bj-top"><h2>Four Up</h2><small>four in a line</small>
      <button className="w-btn sm ghost bj-leave" data-t="fu-leave" onClick={leave}>Leave</button></header>
    <div className="bj-felt fu-felt" data-fu-art="placeholder">
      <div className="fu-grid" data-t="fu-grid">{Array.from({ length: 7 }, (_, c) =>
        <button key={c} type="button" className="fu-col" data-t="fu-col" data-c={c} disabled={!mine || game!.board[0][c] !== 0} onClick={() => send({ t: 'gact', a: 'drop', i: c })}>
          {Array.from({ length: 6 }, (_, r) => {
            const n = game?.board[r]?.[c] ?? 0
            const fresh = n && game?.lastDrop?.c === c && game.lastDrop.r === r
            return <span key={r} className={'fu-cell' + (won(r, c) ? ' win' : '')} data-t="fu-cell" data-n={n || undefined} data-win={won(r, c) ? '1' : undefined}>{n ? <i className={'fu-disc p' + n + (fresh ? ' drop' : '')} /> : null}</span>
          })}
        </button>)}</div>
      <p className="fu-note">{them ? `You are ${game?.piece === 1 ? 'mint' : 'coral'} · ${name(them.id)} is ${game?.piece === 1 ? 'coral' : 'mint'}` : 'Waiting for someone to sit opposite.'}</p>
    </div>
    <div className="bj-bar">
      <p className="bj-status" role="status" data-t="g-status">{status}</p>
      {bet && <div className="bj-antes">{[0, 1, 5, 25, 100].map(v => <button key={v} type="button" className={'fu-free' + (ante === v ? ' on' : '')} data-t={'fu-ante-' + v} disabled={v > 0 && chips !== null && chips < v} onClick={() => setAnte(v)}>{v ? v : 'Free'}</button>)}</div>}
      <p className="bj-note">{chips != null ? `${chips} ${CHIPS_NAME}` : CHIPS_NAME} · never cash</p>
      <div className="bj-btns">
        {game?.phase === 'over' ? <button className="w-btn bj-deal" data-t="fu-again" onClick={() => send({ t: 'gact', a: 'again' })} style={{ gridColumn: '1 / -1' }}>Play again</button>
          : bet ? <button className="w-btn bj-deal" data-t="fu-play" disabled={chips !== null && chips < ante} onClick={() => send({ t: 'gact', a: 'bet', ante })} style={{ gridColumn: '1 / -1' }}>{ante ? `Play for ${ante}` : 'Play free'}{desk && <kbd>D</kbd>}</button> : null}
      </div>
    </div>
  </section>
}
