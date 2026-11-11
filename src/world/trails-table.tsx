/* Full-screen Trails. Loaded only at that cabinet.
   Heads move between server steps (step ms, 15 Hz). Swap .tr-cell for the designer's art. */
import { useEffect, useRef, useState } from 'react'
import './bj-table.css'
import './trails-table.css'
import { CHIPS_NAME } from '../../world/shared/chips.ts'
type Dir = 'up' | 'down' | 'left' | 'right'
export interface TrBike { id: number; n: number; x: number; y: number; d: Dir; alive: boolean; rounds: number; away: boolean; seat: number; bet: number; locked: boolean }
export interface TrGame { on: true; g: 'trails'; tb: number; seq: number; now: number; me: number; phase: 'bet' | 'play' | 'over'
  round: number; step: number; hz: number; grid: number[]; w: number; h: number; bet: number; locked: boolean
  winner: number | null; last: { k: string; who: number }
  bikes: TrBike[] }
const COL = ['', '#48E5C2', '#FF6F59', '#FFD84D', '#8F7BFF']
const VEC: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

export default function TrailsTable({ game, name, send, stand, desk, chips, onLeave }: { game: TrGame | null; name: (id: number) => string; send: (o: object) => void
  stand: () => void; desk: boolean; chips: number | null; onLeave?: () => void }) {
  const [ante, setAnte] = useState(0), [left, setLeft] = useState(false), [, tick] = useState(0)
  const t0 = useRef(performance.now()), seq = useRef(0)
  useEffect(() => { if (game && game.seq !== seq.current) { seq.current = game.seq; t0.current = performance.now() } }, [game])
  useEffect(() => { let f = 0; const loop = () => { tick(x => x + 1); f = requestAnimationFrame(loop) }; f = requestAnimationFrame(loop); return () => cancelAnimationFrame(f) }, [])
  const turn = (d: Dir) => send({ t: 'gact', a: 'turn', d })
  useEffect(() => {
    if (game?.phase !== 'play') return
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea')) return
      const map: Record<string, Dir> = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' }
      const dir = map[e.key.toLowerCase()]; if (!dir || e.repeat) return
      e.preventDefault(); e.stopPropagation(); turn(dir)
    }
    addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true)
  })
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const leave = () => { setLeft(true); onLeave?.(); send({ t: 'gquit' }); stand() }
  const me = game?.bikes.find(b => b.id === game.me)
  const frac = game?.phase === 'play' ? Math.min(1, (performance.now() - t0.current) / (game.step || 67)) : 1
  const status = !game ? 'Taking your seat…'
    : game.phase === 'over' ? (game.winner === game.me ? 'You win' : game.winner ? `${name(game.winner)} wins` : 'Draw')
    : game.phase === 'play' ? `Round ${game.round} · first to 3`
    : game.locked ? 'In. Waiting for them' : 'Optional coins. Two or more can ride.'
  if (left) return null
  const bet = game?.phase === 'bet' && !game.locked
  const w = game?.w ?? 28
  return <section className="bj-screen tr-screen" data-t="g-tr" data-seq={game?.seq ?? 0} data-phase={game?.phase ?? 'bet'} aria-label="Trails">
    <header className="bj-top"><h2>Trails</h2><small data-t="tr-score">{game?.bikes.map(b => b.rounds).join('–') || '2–4'}</small>
      <button className="w-btn sm ghost bj-leave" data-t="tr-leave" onClick={leave}>Leave</button></header>
    <div className="bj-felt tr-felt" data-tr-art="placeholder"
      onPointerDown={e => { swipe.current = { x: e.clientX, y: e.clientY } }}
      onPointerUp={e => { const s = swipe.current; swipe.current = null; if (!s || game?.phase !== 'play') return
        const dx = e.clientX - s.x, dy = e.clientY - s.y; if (Math.hypot(dx, dy) < 24) return
        turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')) }}>
      <p className="tr-score">{me ? `${me.rounds} round${me.rounds === 1 ? '' : 's'}` : ''}</p>
      <div className="tr-grid" data-t="tr-grid" style={{ gridTemplateColumns: `repeat(${w}, ${w > 20 && innerWidth < 900 ? 10 : 16}px)` }}>
        {(game?.grid ?? []).map((n, i) => <i key={i} className={'tr-cell' + (n ? ' on' : '')} style={n ? { ['--tr' as string]: COL[n] } : undefined} data-t="tr-cell" data-n={n || undefined} />)}
        {game?.phase === 'play' && game.bikes.filter(b => b.alive).map(b => {
          const [dx, dy] = VEC[b.d], size = innerWidth < 900 ? 10 : 16
          const x = (b.x + dx * (frac - 1)) * (size + 1), y = (b.y + dy * (frac - 1)) * (size + 1)
          return <i key={b.n} className="tr-head" data-t="tr-head" style={{ left: x, top: y, background: COL[b.n], width: size, height: size }} />
        })}
      </div>
    </div>
    <div className="bj-bar">
      <p className="bj-status" role="status" data-t="g-status">{status}</p>
      {game?.phase === 'play' && <div className="tr-arrows" data-t="tr-arrows">
        <button type="button" className="up" data-t="tr-up" onClick={() => turn('up')}>↑</button>
        <button type="button" className="left" data-t="tr-left" onClick={() => turn('left')}>←</button>
        <button type="button" className="down" data-t="tr-down" onClick={() => turn('down')}>↓</button>
        <button type="button" className="right" data-t="tr-right" onClick={() => turn('right')}>→</button>
      </div>}
      {bet && <div className="bj-antes">{[0, 1, 5, 25, 100].map(v => <button key={v} type="button" className={'fu-free' + (ante === v ? ' on' : '')} data-t={'tr-ante-' + v} disabled={v > 0 && chips !== null && chips < v} onClick={() => setAnte(v)} style={{ minWidth: 48, minHeight: 44, background: '#1E1640', color: '#FFF1C1', border: '2px solid #05020F' }}>{v ? v : 'Free'}</button>)}</div>}
      <p className="bj-note">{chips != null ? `${chips} ${CHIPS_NAME}` : CHIPS_NAME} · never cash{desk ? ' · arrows or WASD' : ' · swipe or the arrows'}</p>
      <div className="bj-btns">
        {game?.phase === 'over' ? <button className="w-btn bj-deal" data-t="tr-again" onClick={() => send({ t: 'gact', a: 'again' })} style={{ gridColumn: '1 / -1' }}>Ride again</button>
          : bet ? <button className="w-btn bj-deal" data-t="tr-play" onClick={() => send({ t: 'gact', a: 'bet', ante })} style={{ gridColumn: '1 / -1' }}>{ante ? `Ride for ${ante}` : 'Ride free'}</button> : null}
      </div>
    </div>
  </section>
}
