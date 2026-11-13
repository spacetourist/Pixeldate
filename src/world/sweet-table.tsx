/* Full-screen Sweet Twenty. Loaded only when someone sits at that table.
   Main cards: Direction A hearts (swap the suit/file in MainCard). Side cards: heart tiles (swap SideTile). */
import { useEffect, useState } from 'react'
import './bj-table.css'
import './sweet-table.css'
import youSeat from './art/lounge/you-seated.png'
import jessSeat from './art/lounge/jess-seated.png'
import { CHIPS_NAME } from '../../world/shared/chips.ts'
export interface SwCell { v: number; side: boolean }
export interface SwSide { k: 'plus' | 'minus' | 'flip'; n: number }
export interface SwSeat { id: number; board: SwCell[]; total: number; sideN: number; stood: boolean; bust: boolean; sets: number; bet: number; locked: boolean; seat: number; away: boolean }
export interface SwGame { on: true; g: 'sweet'; tb: number; seq: number; now: number; me: number; phase: 'bet' | 'play' | 'over'
  turn: number; turnLeft: number; setNo: number; setsTo: number; board: SwCell[]; total: number; side: SwSide[]; played: boolean
  bet: number; locked: boolean; last: { k: string; who: number }; winner: number | null; ps: SwSeat[] }
const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10']
const CARDS = import.meta.env.BASE_URL + 'art/cards-a/'
const CHIP_ART = import.meta.glob<string>('./art/chips/*.png', { eager: true, query: '?url', import: 'default' })
const x3 = (m: Record<string, string>, stem: string) => m[stem + '@3x.png'] ? `${m[stem + '.png']} 1x, ${m[stem + '@3x.png']} 3x` : undefined
const CHIP_FILL: Record<number, string> = { 1: '#FFF1C1', 5: '#FF6F59', 25: '#FFD84D', 100: '#48E5C2' }
const Chip = ({ v, size = 28 }: { v: number; size?: number }) => <span className="g-chip" style={{ width: size, height: size, ['--cf' as string]: CHIP_FILL[v] ?? '#FFF1C1', fontSize: Math.max(8, Math.round(size * .4)) }}>
  <img src={CHIP_ART[`./art/chips/${v}.png`]} srcSet={x3(CHIP_ART, `./art/chips/${v}`)} alt="" width={size} height={size} /><b>{v}</b></span>
/** Direction A heart face for a main-deck value. Swap the file here when GD sends a Sweet Twenty deck. */
function MainCard({ v }: { v: number }) {
  const r = RANK[v] || String(v), f = `card-${r}H`
  return <img className="g-card g-face" src={`${CARDS}svg/${f}.svg`} alt={r + '♥'} width={120} height={168} draggable={false} decoding="async"
    onError={e => { const i = e.currentTarget; if (!i.src.endsWith('.png')) i.src = `${CARDS}png/${f}.png` }} />
}
/** Heart ± tile. Swap this component for GD's side-card art; keep data-k and data-n. */
function SideTile({ card, disabled, on }: { card: SwSide; disabled?: boolean; on?: (sign: 1 | -1) => void }) {
  const [flip, setFlip] = useState<1 | -1>(1)
  const label = card.k === 'plus' ? `+${card.n}` : card.k === 'minus' ? `−${card.n}` : `±${card.n}`
  return <button type="button" className={'sw-tile ' + card.k + (card.k === 'flip' && flip < 0 ? ' on' : '')} data-t="sw-side" data-k={card.k} data-n={card.n} disabled={disabled}
    onClick={() => { if (card.k === 'flip' && !disabled) { on?.(flip); return } on?.(card.k === 'minus' ? -1 : 1) }}>
    <svg className="sw-heart" viewBox="0 0 20 18" aria-hidden="true"><path d="M10 16S2 11 2 6.2C2 3.8 3.8 2 6.1 2 7.6 2 8.9 2.8 10 4.2 11.1 2.8 12.4 2 13.9 2 16.2 2 18 3.8 18 6.2 18 11 10 16 10 16z" /></svg>
    <b>{label}</b>
    {card.k === 'flip' && !disabled && <span className="sw-flip" onClick={e => { e.stopPropagation(); setFlip(f => f > 0 ? -1 : 1) }} data-t="sw-flip">{flip > 0 ? '+' : '−'}</span>}
  </button>
}
function Mini({ v }: { v: number }) {
  const label = v > 0 ? `+${v}` : `${v}`
  return <span className="sw-tile sw-mini" data-t="sw-played" style={{ width: 34, height: 48 }}><b>{label}</b></span>
}
const Board = ({ p, name, me, turn }: { p: SwSeat; name: string; me: boolean; turn: boolean }) => <div className={'sw-board' + (me ? ' me' : '') + (turn ? ' turn' : '')} data-t={me ? 'sw-me' : 'sw-them'} data-total={p.total} data-sets={p.sets}>
  <img className="sw-sit" src={me ? youSeat : jessSeat} alt="" width={36} height={48} />
  <span className={'nm' + (me ? ' me' : '')}>{name}</span>
  <div className="sw-cards" data-t={me ? 'sw-board' : 'sw-their-board'}>{p.board.length ? p.board.map((c, i) => c.side ? <Mini key={i} v={c.v} /> : <MainCard key={i} v={c.v} />) : <span className="bj-empty">waiting for a card</span>}</div>
  <span className={'tot' + (p.total > 20 ? ' over' : '')} data-t="sw-tot">{p.board.length || p.bust || p.stood ? (p.bust ? 'bust' : p.stood ? `stood ${p.total}` : p.total) : ''}{p.away ? ' · back soon' : ''}</span>
</div>

export default function SweetTable({ game, name, send, stand, desk, chips, onLeave }: { game: SwGame | null; name: (id: number) => string; send: (o: object) => void
  stand: () => void; desk: boolean; chips: number | null; onLeave?: () => void }) {
  const [ante, setAnte] = useState(0), [left, setLeft] = useState(false), [, tick] = useState(0), [t0, setT0] = useState(() => performance.now())
  useEffect(() => { setT0(performance.now()) }, [game?.seq])
  useEffect(() => { const i = setInterval(() => tick(x => x + 1), 250); return () => clearInterval(i) }, [])
  const play = game?.phase === 'play' && game.winner == null
  const bet = !!game && game.phase === 'bet' && !game.locked
  const mine = !!play && game!.turn === game!.me
  const leave = () => { setLeft(true); onLeave?.(); send({ t: 'gquit' }); stand() }
  const end = () => send({ t: 'gact', a: 'end' }), standT = () => send({ t: 'gact', a: 'stand' }), lock = () => send({ t: 'gact', a: 'bet', ante })
  const playSide = (i: number, sign: 1 | -1) => send({ t: 'gact', a: 'side', i, sign })
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea') || e.repeat) return
      const c = e.key.toLowerCase()
      if (c === 'e') end(); else if (c === 's') standT(); else if (c === 'd') lock(); else return
      e.preventDefault()
    }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  })
  const turnLeft = game ? Math.max(0, game.turnLeft - (performance.now() - t0)) : 0
  const me = game?.ps.find(p => p.id === game.me), them = game?.ps.find(p => p.id !== game.me)
  const sets = `${me?.sets ?? 0}–${them?.sets ?? 0}`
  const status = !game ? 'Taking your seat…'
    : game.phase === 'over' ? (game.winner === game.me ? 'You win the match' : game.winner ? `${name(game.winner)} wins the match` : 'Match over')
    : play ? (mine ? `Your turn · ${Math.ceil(turnLeft / 1000)}s` : `${name(game.turn)}'s turn`)
    : game.locked ? 'In. Waiting for them' : 'Optional coins for the match'
  if (left) return null
  return <section className="bj-screen sw-screen" data-t="g-sw" data-seq={game?.seq ?? 0} data-phase={game?.phase ?? 'bet'} data-turn={mine ? 'me' : 'them'} data-over={game?.phase === 'over' ? '1' : undefined} aria-label="Sweet Twenty">
    <header className="bj-top"><h2>Sweet Twenty</h2><small data-t="sw-sets">Sets {sets}</small>
      <button className="w-btn sm ghost bj-leave" data-t="sw-leave" onClick={leave}>Leave</button></header>
    <div className="bj-felt sw-felt" data-sw-art="heart">
      {them ? <Board p={them} name={name(them.id)} me={false} turn={!!play && game!.turn === them.id} /> : <p className="bj-empty">Waiting for someone to sit opposite.</p>}
      <div className="sw-lower">
        {me && <Board p={me} name="You" me turn={!!mine} />}
        {!!game?.side.length && <div className="sw-side" data-t="sw-hand">{game.side.map((c, i) => <SideTile key={i + c.k + c.n} card={c} disabled={!mine || game.played} on={sign => playSide(i, sign)} />)}</div>}
      </div>
    </div>
    <div className="bj-bar">
      <p className="bj-status" role="status" data-t="g-status">{status}{mine ? <small data-t="sw-total"> · {game!.total}</small> : null}</p>
      {bet && <div className="bj-antes" role="radiogroup" aria-label="Optional coins">{[0, 1, 5, 25, 100].map(v => v === 0
        ? <button key={0} type="button" className={'sw-free' + (ante === 0 ? ' on' : '')} data-t="sw-ante-0" onClick={() => setAnte(0)}>Free</button>
        : <button key={v} type="button" className={'bj-ante' + (ante === v ? ' on' : '')} data-t={'sw-ante-' + v} disabled={chips !== null && chips < v} onClick={() => setAnte(v)}><Chip v={v} /></button>)}</div>}
      <p className="bj-note">{chips != null ? `${chips} ${CHIPS_NAME}` : CHIPS_NAME} · never cash</p>
      <div className="bj-btns">
        {game?.phase === 'over' ? <button className="w-btn bj-deal" data-t="sw-again" onClick={() => send({ t: 'gact', a: 'again' })}>Play again</button>
          : <>
            <button className="w-btn bj-hit" data-t="sw-end" disabled={!mine} onClick={end}>End turn{desk && <kbd>E</kbd>}</button>
            <button className="w-btn bj-stand" data-t="sw-stand" disabled={!mine} onClick={standT}>Stand{desk && <kbd>S</kbd>}</button>
            {bet && <button className="w-btn bj-deal" data-t="sw-play" disabled={chips !== null && chips < ante} onClick={lock} style={{ gridColumn: '1 / -1' }}>{ante ? `Play for ${ante}` : 'Play free'}{desk && <kbd>D</kbd>}</button>}
          </>}
      </div>
    </div>
  </section>
}
