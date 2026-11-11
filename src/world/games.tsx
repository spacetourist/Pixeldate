/* Games Lounge panel (lazy chunk: only loaded in the Games Lounge). The server (world/src/sim.ts + shared/games) runs
   every game; this only draws the view it sends and sends flip / snap. Touch: two big buttons. Keyboard: Space = snap,
   F = flip. Cards: GD's Direction A pack (public/art/cards-a). */
import { useEffect, useState } from 'react'
import './games.css'
import { CHIPS_NAME } from '../../world/shared/chips.ts'
export interface GameV { on: true; g: 'snap'; tb: number; seq: number; now: number; me: number; pile: number[]; size: number; turn: number; turnLeft: number; left: number
  last: { k: string; who: number; n?: number }; winner: number | null; ps: { id: number; n: number; out: boolean; away: boolean; lock: number }[]; fam?: number }
export interface GameInfo { id: string; title: string; min: number; max: number; ready: boolean }
const SUIT = ['♠', '♥', '♦', '♣'], RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
/** GD's Direction A pack (public/art/cards-a, tools/card-pack-a.mjs): served as plain files, fetched only when a card is
    on screen, so none of it is in the JS bundle. Faces 120x168 CSS: the SVG first (drawn at device resolution), the 240x336
    raster (@2x) if the SVG fails. The back is pixel art (nearest-neighbour scaled by GD) and stays pixelated. */
const CARDS = import.meta.env.BASE_URL + 'art/cards-a/'
const BACK = CARDS + 'back-120.png', BACK_SET = `${CARDS}back-120.png 1x, ${CARDS}back-240.png 2x, ${CARDS}back-360.png 3x`
const CHIP_ART = import.meta.glob<string>('./art/chips/*.png', { eager: true, query: '?url', import: 'default' })
/** GD's @3x art for high-density screens (exact 3x of the 1x pixels) */
const x3 = (m: Record<string, string>, stem: string) => m[stem + '@3x.png'] ? `${m[stem + '.png']} 1x, ${m[stem + '@3x.png']} 3x` : undefined
/** a coin: GD's pixel chip is the rim (the light pixel accent); the value is crisp vector text over a flat centre disc,
    drawn at device resolution, so the number is sharp on every screen */
const CHIP_FILL: Record<number, string> = { 1: '#FFF1C1', 5: '#FF6F59', 25: '#FFD84D', 100: '#48E5C2' }
const Chip = ({ v, size = 18 }: { v: number; size?: number }) => <span className="g-chip" data-v={v} style={{ width: size, height: size, ['--cf' as string]: CHIP_FILL[v] ?? '#FFF1C1', fontSize: Math.max(7, Math.round(size * (v >= 100 ? .32 : .42))) }}>
  <img src={CHIP_ART[`./art/chips/${v}.png`]} srcSet={x3(CHIP_ART, `./art/chips/${v}`)} alt="" width={size} height={size} /><b aria-label={String(v)}>{v}</b></span>
const rank = (c: number) => (c >> 2) + 1, suit = (c: number) => c & 3
/** a card face: GD's Direction A SVG at 120x168 CSS, the 240x336 PNG as its fallback */
const CODE = 'SHDC'
function Card({ c, k }: { c: number; k?: string }) {
  const r = RANK[rank(c)], st = SUIT[suit(c)], f = `card-${r}${CODE[suit(c)]}`
  return <img className="g-card g-face" src={`${CARDS}svg/${f}.svg`} alt={r + st} data-t={k} data-rank={rank(c)} width={120} height={168} draggable={false} decoding="async"
    onError={e => { const i = e.currentTarget; if (!i.src.endsWith('.png')) i.src = `${CARDS}png/${f}.png` }} style={{ color: suit(c) === 1 || suit(c) === 2 ? '#D32F2F' : '#1A1A1A' }} />
}
const Deck = ({ n, k }: { n: number; k: string }) => <div className="g-deck" data-t={k}>{n > 0 && <img src={BACK} srcSet={BACK_SET} alt="" />}{n > 1 && <img src={BACK} srcSet={BACK_SET} alt="" style={{ left: 2, top: -2 }} />}<span>{n}</span></div>
export const Chips = ({ bal }: { bal: number }) => <span className="g-chips" data-t="g-chips">{[1, 5, 25, 100].map(v => <Chip key={v} v={v} />)} {bal} {CHIPS_NAME}</span>
export default function GamesPanel({ game, games, name, send, stand, desk, chips }: { game: GameV | null; games: GameInfo[]; name: (id: number) => string; chips: number | null
  send: (o: object) => void; stand: () => void; desk: boolean }) {
  const [, tick] = useState(0), [t0, setT0] = useState(() => performance.now())
  useEffect(() => { setT0(performance.now()) }, [game?.seq])
  useEffect(() => { const i = setInterval(() => tick(x => x + 1), 250); return () => clearInterval(i) }, [])
  const live = game && game.winner === null, snapLive = live && game.g === 'snap'
  useEffect(() => {
    if (!snapLive) return
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea')) return
      if (e.key === ' ') { e.preventDefault(); if (!e.repeat) send({ t: 'gact', a: 'snap' }) }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); if (!e.repeat) send({ t: 'gact', a: 'flip' }) }
    }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [snapLive, send])
  if (!game) return <section className="w-panel g-panel" data-t="g-panel" aria-label="Games Lounge table">
    <h2 className="g-h">Games Lounge · coins only</h2>
    <ul className="g-list">{games.filter(g => g.id === 'snap').map(g => <li key={g.id}><div><b>{g.title}</b><small>{g.ready ? 'For two at this table' : 'Coming soon'}</small></div>
      <button className="w-btn sm" data-t={'g-start-' + g.id} disabled={!g.ready} onClick={() => send({ t: 'gstart', g: g.id })}>{g.ready ? 'Start' : 'Soon'}</button></li>)}</ul>
    <p className="g-sub">Blackjack is at the green tables · your own hand vs the House. Sweet Twenty is the heart table for two. Trails is the cabinet for two to four.</p>
    {chips !== null && <Chips bal={chips} />}
    <button className="w-btn sm ghost" data-t="g-stand" onClick={stand}>Stand up</button></section>
  if (game.g !== 'snap') return null
  const el = performance.now() - t0, turnLeft = Math.max(0, game.turnLeft - el), mine = game.turn === game.me && live
  const me = game.ps.find(p => p.id === game.me), lock = me && me.lock - el > 0
  const top = game.pile, pair = top.length >= 2 && rank(top[top.length - 1]) === rank(top[top.length - 2])
  const lastTxt = game.last.k === 'snap' ? `${name(game.last.who)} snapped ${game.last.n} cards!` : game.last.k === 'false' ? `${name(game.last.who)} snapped too soon` : game.last.k === 'auto' ? `Time: flipped for ${name(game.last.who)}`
    : game.last.k === 'out' ? `${name(game.last.who)} is out` : game.last.k === 'start' ? 'Shuffled and dealt' : ''
  return <section className={'w-panel g-panel g-snap' + (pair && live ? ' g-pair' : '')} data-t="g-snap" data-seq={game.seq} data-turn={mine ? 'me' : 'them'} data-over={game.winner !== null ? '1' : undefined} aria-label="Snap">
    <h2 className="g-h">Snap <small>coins only</small></h2>
    <ol className="g-players">{game.ps.map(p => <li key={p.id} className={(p.id === game.turn && live ? 'turn ' : '') + (p.id === game.me ? 'me ' : '') + (p.out ? 'out' : '')} data-t="g-player" data-n={p.n}>
      <b>{name(p.id)}</b><span data-t={p.id === game.me ? 'g-mine' : 'g-theirs'}>{p.n} cards</span>{p.away && <em>reconnecting…</em>}</li>)}</ol>
    <div className="g-felt"><Deck n={me?.n ?? 0} k="g-mydeck" />
      <div className="g-pile" data-t="g-pile" data-size={game.size}>{top.length ? top.map((c, i) => <Card key={game.size - top.length + i + ':' + c} c={c} k={i === top.length - 1 ? 'g-top' : undefined} />) : <span className="g-empty" data-t="g-empty">{game.last.k === 'start' ? 'flip to start the pile' : game.last.k === 'snap' ? `${name(game.last.who)} took the pile · flip to start a new one` : 'the pile is empty · flip'}</span>}</div>
      <Deck n={game.ps.find(p => p.id !== game.me)?.n ?? 0} k="g-theirdeck" /></div>
    <p className="g-status" role="status" data-t="g-status">{game.winner !== null ? (game.winner === game.me ? 'You win!' : game.winner ? `${name(game.winner)} wins` : 'A draw')
      : <span className={'g-pill' + (mine ? ' me' : '')}>{mine ? 'Your turn' : `${name(game.turn)}'s turn`} · {Math.ceil(turnLeft / 1000)}s</span>}{lastTxt && live ? <small> · {lastTxt}</small> : null}</p>
    {game.fam && game.winner !== null && <p className="g-fam" data-t="g-fam">You two got to know each other a little better.</p>}
    {live ? <div className="g-btns">
      <button className="w-btn g-flip" data-t="g-flip" disabled={!mine} onClick={() => send({ t: 'gact', a: 'flip' })}>Flip{desk && <kbd>F</kbd>}</button>
      <button className="w-btn g-snapbtn" data-t="g-snap-btn" disabled={!!lock} onClick={() => send({ t: 'gact', a: 'snap' })}>Snap!{desk && <kbd>Space</kbd>}</button></div>
      : <div className="g-btns"><button className="w-btn" data-t="g-again" onClick={() => send({ t: 'gstart', g: 'snap' })}>Play again</button>
        <button className="w-btn ghost" data-t="g-done" onClick={() => send({ t: 'gquit' })}>Done</button></div>}
    <button className="w-btn sm ghost" data-t="g-stand" onClick={stand}>{live ? 'Leave game' : 'Stand up'}</button>
  </section>
}
