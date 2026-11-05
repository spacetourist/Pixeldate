/* Games Lounge panel (lazy chunk: only loaded in the Games Lounge). The server (world/src/sim.ts + shared/games) runs
   every game; this only draws the view it sends and sends flip / snap. Touch: two big buttons. Keyboard: Space = snap,
   F = flip. Placeholder card faces in the café palette; GD's card art drops in through CARD_ART (one PNG per card). */
import { useEffect, useState } from 'react'
import './games.css'
export interface GameV { on: true; g: 'snap'; tb: number; seq: number; now: number; me: number; pile: number[]; size: number; turn: number; turnLeft: number; left: number
  last: { k: string; who: number; n?: number }; winner: number | null; ps: { id: number; n: number; out: boolean; away: boolean; lock: number }[]; fam?: number }
export interface GameInfo { id: string; title: string; min: number; max: number; ready: boolean }
const SUIT = ['♠', '♥', '♦', '♣'], RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
/** GD's card art, when it lands: src/world/art/cards/<rank><suit>.png (e.g. 12h.png). Empty = the drawn placeholder. */
const CARD_ART = import.meta.glob<string>('./art/cards/*.png', { eager: true, query: '?url', import: 'default' })
const rank = (c: number) => (c >> 2) + 1, suit = (c: number) => c & 3
function Card({ c, k }: { c: number; k?: string }) {
  const art = CARD_ART[`./art/cards/${rank(c)}${'shdc'[suit(c)]}.png`]
  if (art) return <img className="g-card" src={art} alt={RANK[rank(c)] + SUIT[suit(c)]} data-t={k} />
  return <span className={'g-card' + (suit(c) === 1 || suit(c) === 2 ? ' red' : '')} data-t={k} data-rank={rank(c)}><b>{RANK[rank(c)]}</b><i>{SUIT[suit(c)]}</i></span>
}
export default function GamesPanel({ game, games, name, send, stand, desk }: { game: GameV | null; games: GameInfo[]; name: (id: number) => string
  send: (o: object) => void; stand: () => void; desk: boolean }) {
  const [, tick] = useState(0), [t0, setT0] = useState(() => performance.now())
  useEffect(() => { setT0(performance.now()) }, [game?.seq])
  useEffect(() => { const i = setInterval(() => tick(x => x + 1), 250); return () => clearInterval(i) }, [])
  const live = game && game.winner === null
  useEffect(() => {
    if (!live) return
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea')) return
      if (e.key === ' ') { e.preventDefault(); if (!e.repeat) send({ t: 'gact', a: 'snap' }) }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); if (!e.repeat) send({ t: 'gact', a: 'flip' }) }
    }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [live, send])
  if (!game) return <section className="w-panel g-panel" data-t="g-panel" aria-label="Games Lounge table">
    <h2 className="g-h">Games Lounge · play money only</h2>
    <ul className="g-list">{games.map(g => <li key={g.id}><div><b>{g.title}</b><small>{g.ready ? 'For two at this table' : g.id === 'blackjack' ? 'Coming soon · you two vs the house, play chips' : 'Coming soon'}</small></div>
      <button className="w-btn sm" data-t={'g-start-' + g.id} disabled={!g.ready} onClick={() => send({ t: 'gstart', g: g.id })}>{g.ready ? 'Start' : 'Soon'}</button></li>)}</ul>
    <button className="w-btn sm ghost" data-t="g-stand" onClick={stand}>Stand up</button></section>
  const el = performance.now() - t0, turnLeft = Math.max(0, game.turnLeft - el), mine = game.turn === game.me && live
  const me = game.ps.find(p => p.id === game.me), lock = me && me.lock - el > 0
  const top = game.pile, pair = top.length >= 2 && rank(top[top.length - 1]) === rank(top[top.length - 2])
  const lastTxt = game.last.k === 'snap' ? `${name(game.last.who)} snapped ${game.last.n} cards!` : game.last.k === 'false' ? `${name(game.last.who)} snapped too soon` : game.last.k === 'auto' ? `Time: flipped for ${name(game.last.who)}`
    : game.last.k === 'out' ? `${name(game.last.who)} is out` : game.last.k === 'start' ? 'Shuffled and dealt' : ''
  return <section className={'w-panel g-panel g-snap' + (pair && live ? ' g-pair' : '')} data-t="g-snap" data-seq={game.seq} data-turn={mine ? 'me' : 'them'} data-over={game.winner !== null ? '1' : undefined} aria-label="Snap">
    <h2 className="g-h">Snap <small>play money only</small></h2>
    <ol className="g-players">{game.ps.map(p => <li key={p.id} className={(p.id === game.turn && live ? 'turn ' : '') + (p.out ? 'out' : '')} data-t="g-player" data-n={p.n}>
      <b>{name(p.id)}</b><span data-t={p.id === game.me ? 'g-mine' : 'g-theirs'}>{p.n} cards</span>{p.away && <em>reconnecting…</em>}</li>)}</ol>
    <div className="g-pile" data-t="g-pile" data-size={game.size}>{top.length ? top.map((c, i) => <Card key={game.size - top.length + i + ':' + c} c={c} k={i === top.length - 1 ? 'g-top' : undefined} />) : <span className="g-empty">pile</span>}
      <span className="g-size">{game.size}</span></div>
    <p className="g-status" role="status" data-t="g-status">{game.winner !== null ? (game.winner === game.me ? 'You win!' : game.winner ? `${name(game.winner)} wins` : 'A draw')
      : mine ? `Your turn · ${Math.ceil(turnLeft / 1000)}s` : `${name(game.turn)}'s turn · ${Math.ceil(turnLeft / 1000)}s`}{lastTxt && live ? <small> · {lastTxt}</small> : null}</p>
    {game.fam && game.winner !== null && <p className="g-fam" data-t="g-fam">You two got to know each other a little better.</p>}
    {live ? <div className="g-btns">
      <button className="w-btn g-flip" data-t="g-flip" disabled={!mine} onClick={() => send({ t: 'gact', a: 'flip' })}>Flip{desk && <kbd>F</kbd>}</button>
      <button className="w-btn g-snapbtn" data-t="g-snap-btn" disabled={!!lock} onClick={() => send({ t: 'gact', a: 'snap' })}>SNAP!{desk && <kbd>Space</kbd>}</button></div>
      : <div className="g-btns"><button className="w-btn" data-t="g-again" onClick={() => send({ t: 'gstart', g: 'snap' })}>Play again</button>
        <button className="w-btn ghost" data-t="g-done" onClick={() => send({ t: 'gquit' })}>Done</button></div>}
    <button className="w-btn sm ghost" data-t="g-stand" onClick={stand}>{live ? 'Leave game' : 'Stand up'}</button>
  </section>
}
