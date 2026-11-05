/* Full-screen blackjack table. Loaded only once someone sits at a blackjack seat.
   The server deals; this draws each seat's hand and sends Hit / Stand / Double / Deal.
   Cards: GD's Direction A pack. Faces stay smooth SVGs; the back stays pixel art. */
import { useEffect, useState } from 'react'
import './bj-table.css'
import { CHIPS_NAME } from '../../world/shared/chips.ts'
export interface BjSeat { id: number; out: boolean; away: boolean; hand: number[]; total: number; soft: boolean; bet: number; st: string; res: string | null; seat: number }
export interface BjGame { on: true; g: 'blackjack'; tb: number; seq: number; now: number; me: number; phase: 'bet' | 'play'
  ante: number; hand: number[]; house: (number | null)[]; total: number; soft: boolean; houseTotal: number | null
  turn: number; turnLeft: number; round: number; res: 'win' | 'bj' | 'push' | 'lose' | 'bust' | null; waiting?: boolean; mine?: string
  last: { k: string; who: number }; winner: number | null; ps: BjSeat[] }
const SUIT = ['♠', '♥', '♦', '♣'], RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const CARDS = import.meta.env.BASE_URL + 'art/cards-a/'
const BACK = CARDS + 'back-120.png', BACK_SET = `${CARDS}back-120.png 1x, ${CARDS}back-240.png 2x, ${CARDS}back-360.png 3x`
const CHIP_ART = import.meta.glob<string>('./art/chips/*.png', { eager: true, query: '?url', import: 'default' })
const x3 = (m: Record<string, string>, stem: string) => m[stem + '@3x.png'] ? `${m[stem + '.png']} 1x, ${m[stem + '@3x.png']} 3x` : undefined
const CHIP_FILL: Record<number, string> = { 1: '#FFF1C1', 5: '#FF6F59', 25: '#FFD84D', 100: '#48E5C2' }
const Chip = ({ v, size = 28 }: { v: number; size?: number }) => <span className="g-chip" data-v={v} style={{ width: size, height: size, ['--cf' as string]: CHIP_FILL[v] ?? '#FFF1C1', fontSize: Math.max(8, Math.round(size * (v >= 100 ? .32 : .42))) }}>
  <img src={CHIP_ART[`./art/chips/${v}.png`]} srcSet={x3(CHIP_ART, `./art/chips/${v}`)} alt="" width={size} height={size} /><b aria-label={String(v)}>{v}</b></span>
const CODE = 'SHDC'
const rank = (c: number) => (c >> 2) + 1, suit = (c: number) => c & 3
function Card({ c }: { c: number }) {
  const r = RANK[rank(c)], st = SUIT[suit(c)], f = `card-${r}${CODE[suit(c)]}`
  return <img className="g-card g-face" src={`${CARDS}svg/${f}.svg`} alt={r + st} width={120} height={168} draggable={false} decoding="async"
    onError={e => { const i = e.currentTarget; if (!i.src.endsWith('.png')) i.src = `${CARDS}png/${f}.png` }} />
}
const Back = () => <img src={BACK} srcSet={BACK_SET} alt="" className="g-card g-back" width={120} height={168} />
const ST: Record<string, string> = { bet: 'betting', locked: 'in', wait: 'next round', play: 'playing', stand: 'stand', bust: 'bust', bj: 'blackjack' }
const RES = { win: 'You win this hand', bj: 'Blackjack', push: 'Push · your coins come back', lose: 'The House takes this one', bust: 'Bust · over 21' } as const

export default function BjTable({ game, name, send, stand, desk, chips, onLeave }: { game: BjGame | null; name: (id: number) => string; send: (o: object) => void
  stand: () => void; desk: boolean; chips: number | null; onLeave?: () => void }) {
  const [ante, setAnte] = useState(5), [left, setLeft] = useState(false), [, tick] = useState(0), [t0, setT0] = useState(() => performance.now())
  useEffect(() => { setT0(performance.now()) }, [game?.seq])
  useEffect(() => { const i = setInterval(() => tick(x => x + 1), 250); return () => clearInterval(i) }, [])
  const play = game?.phase === 'play' && game.winner == null
  const bet = !!game && game.phase === 'bet' && game.winner == null && !game.waiting && game.mine !== 'locked'
  const mine = !!play && game!.turn === game!.me
  const leave = () => { setLeft(true); onLeave?.(); send({ t: 'gquit' }); stand() }
  const deal = () => send({ t: 'gact', a: 'deal', ante }), hit = () => send({ t: 'gact', a: 'hit' }), standH = () => send({ t: 'gact', a: 'stand' }), double = () => send({ t: 'gact', a: 'double' })
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea') || e.repeat) return
      const c = e.key.toLowerCase()
      if (c === 'h') hit(); else if (c === 's') standH(); else if (c === 'd') deal(); else if (c === 'b') double(); else return
      e.preventDefault()
    }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  })
  const turnLeft = game ? Math.max(0, game.turnLeft - (performance.now() - t0)) : 0
  const seats = [0, 1, 2, 3, 4].map(i => game?.ps.find(p => p.seat === i) ?? null)
  const canDouble = mine && (game?.hand.length ?? 0) === 2 && (chips === null || chips >= (game?.ante ?? 0))
  const status = !game ? 'Taking your seat…' : game.waiting || game.mine === 'wait' ? "Next round — you'll play the one after this"
    : play ? (mine ? `Your turn · ${Math.ceil(turnLeft / 1000)}s` : `${name(game.turn)}'s turn`)
    : game.res ? RES[game.res] : game.mine === 'locked' ? 'In. Waiting for the table' : 'Pick your coins and Deal'
  if (left) return null
  return <section className="bj-screen" data-t="g-bj" data-seq={game?.seq ?? 0} data-phase={game?.phase ?? 'bet'} data-turn={mine ? 'me' : 'them'} data-res={game?.res ?? undefined} aria-label="Blackjack table">
    <header className="bj-top"><h2>Blackjack</h2><small>your hand vs the House</small>
      <button className="w-btn sm ghost bj-leave" data-t="bj-leave" onClick={leave}>Leave</button></header>
    <div className="bj-felt" data-bj-art="placeholder">
      <div className="bj-dealer"><b>Dealer</b>
        <div className="bj-hand g-hand" data-t="bj-house">{game?.house.length ? game.house.map((c, i) => c === null ? <Back key={i} /> : <Card key={i} c={c} />) : <span className="bj-empty">House</span>}</div>
        <small data-t="bj-house-total">{game?.houseTotal != null ? game.houseTotal : game?.house.length ? '?' : ''}</small></div>
      <div className="bj-seats">{seats.map((p, i) => ({ p, i })).sort((a, b) => (a.p ? 0 : 1) - (b.p ? 0 : 1)).map(({ p, i }) => <div key={i} className={'bj-seat' + (p && p.id === game?.me ? ' me' : '') + (p && play && p.id === game?.turn ? ' turn' : '') + (p?.st === 'wait' ? ' wait' : '')} data-t="bj-seat" data-seat={i} data-st={p?.st ?? 'empty'} data-me={p && p.id === game?.me ? '1' : undefined}>
        <span className={'nm' + (p && p.id === game?.me ? ' me' : '')}>{p ? name(p.id) : 'Open seat'}</span>
        <div className="bj-hand" data-t={p && p.id === game?.me ? 'bj-hand' : undefined}>{p?.hand.length ? p.hand.map((c, k) => <Card key={k} c={c} />) : <span className="bj-empty">{p ? 'no cards yet' : 'seat'}</span>}</div>
        <small>{p ? <>{p.hand.length ? (p.soft && p.total < 21 ? 'soft ' : '') + p.total : ''}{p.bet ? ` · ${p.bet}` : ''} · {ST[p.st] ?? p.st}{p.away ? ' · back soon' : ''}</> : ' '}</small>
      </div>)}</div>
    </div>
    <div className="bj-bar">
      <p className="bj-status" role="status" data-t="g-status">{status}
        {game?.hand.length ? <small data-t="bj-total"> {game.soft && game.total < 21 ? 'soft ' : ''}{game.total}</small> : null}</p>
      {bet && <div className="bj-antes" role="radiogroup" aria-label="Coins">{[1, 5, 25, 100].map(v => <button key={v} className={'bj-ante' + (ante === v ? ' on' : '')} role="radio" aria-checked={ante === v} data-t={'bj-ante-' + v} disabled={chips !== null && chips < v} onClick={() => setAnte(v)}><Chip v={v} size={32} /></button>)}</div>}
      <p className="bj-note">{chips != null ? `${chips} ${CHIPS_NAME}` : CHIPS_NAME} · never cash</p>
      <div className="bj-btns">
        <button className="w-btn bj-hit" data-t="bj-hit" disabled={!mine} onClick={hit}>Hit{desk && <kbd>H</kbd>}</button>
        <button className="w-btn bj-stand" data-t="bj-stand" disabled={!mine} onClick={standH}>Stand{desk && <kbd>S</kbd>}</button>
        <button className="w-btn bj-double" data-t="bj-double" disabled={!canDouble} onClick={double}>Double{desk && <kbd>B</kbd>}</button>
        <button className="w-btn bj-deal" data-t="bj-deal" disabled={!bet || (chips !== null && chips < ante)} onClick={deal}>Deal{desk && <kbd>D</kbd>}</button>
      </div>
    </div>
  </section>
}
