/* Games Lounge panel (lazy chunk: only loaded in the Games Lounge). The server (world/src/sim.ts + shared/games) runs
   every game; this only draws the view it sends and sends flip / snap. Touch: two big buttons. Keyboard: Space = snap,
   F = flip. Placeholder card faces in the café palette; GD's card art drops in through CARD_ART (one PNG per card). */
import { useEffect, useState } from 'react'
import './games.css'
import { CHIPS_NAME } from '../../world/shared/chips.ts'
export interface BjV { on: true; g: 'blackjack'; tb: number; seq: number; now: number; me: number; phase: 'bet' | 'play' | 'house'; ante: number; hand: number[]
  house: (number | null)[]; total: number; soft: boolean; houseTotal: number | null; turn: number; turnLeft: number; round: number; rounds: number
  res: 'win' | 'bj' | 'push' | 'lose' | 'bust' | null; last: { k: string; who: number }; winner: number | null; ps: { id: number; out: boolean; away: boolean }[]; fam?: number }
export interface GameV { on: true; g: 'snap'; tb: number; seq: number; now: number; me: number; pile: number[]; size: number; turn: number; turnLeft: number; left: number
  last: { k: string; who: number; n?: number }; winner: number | null; ps: { id: number; n: number; out: boolean; away: boolean; lock: number }[]; fam?: number }
export interface GameInfo { id: string; title: string; min: number; max: number; ready: boolean }
const SUIT = ['♠', '♥', '♦', '♣'], RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
/** GD's card art (games-lounge pack via tools/games-lounge-art.py): cards/<rank><suit>.png, 20x28, shown at 3x */
const CARD_ART = import.meta.glob<string>('./art/cards/back*.png', { eager: true, query: '?url', import: 'default' })
const CHIP_ART = import.meta.glob<string>('./art/chips/*.png', { eager: true, query: '?url', import: 'default' })
const BACK = CARD_ART['./art/cards/back.png']
/** GD's @3x art for high-density screens (exact 3x of the 1x pixels) */
const x3 = (m: Record<string, string>, stem: string) => m[stem + '@3x.png'] ? `${m[stem + '.png']} 1x, ${m[stem + '@3x.png']} 3x` : undefined
const Back = () => <img src={BACK} srcSet={x3(CARD_ART, './art/cards/back')} alt="" className="g-card" width={60} height={84} />
/** a coin: GD's pixel chip is the rim (the light pixel accent); the value is crisp vector text over a flat centre disc,
    drawn at device resolution, so the number is sharp on every screen */
const CHIP_FILL: Record<number, string> = { 1: '#FFF1C1', 5: '#FF6F59', 25: '#FFD84D', 100: '#48E5C2' }
const Chip = ({ v, size = 18 }: { v: number; size?: number }) => <span className="g-chip" data-v={v} style={{ width: size, height: size, ['--cf' as string]: CHIP_FILL[v] ?? '#FFF1C1', fontSize: Math.max(7, Math.round(size * (v >= 100 ? .32 : .42))) }}>
  <img src={CHIP_ART[`./art/chips/${v}.png`]} srcSet={x3(CHIP_ART, `./art/chips/${v}`)} alt="" width={size} height={size} /><b aria-label={String(v)}>{v}</b></span>
const rank = (c: number) => (c >> 2) + 1, suit = (c: number) => c & 3
/** a card face: GD's vector card (art/cards-svg, from the games-lounge sharp pack; tools/card-svgs.mjs), drawn by the
    browser at device resolution so ranks and suits stay sharp, at the same 60x84 CSS size as before. The back keeps its pixels. */
const FACE = import.meta.glob<string>('./art/cards-svg/*.svg', { eager: true, query: '?url', import: 'default' }), CODE = 'SHDC'
function Card({ c, k }: { c: number; k?: string }) {
  const r = RANK[rank(c)], st = SUIT[suit(c)]
  return <img className="g-card g-face" src={FACE[`./art/cards-svg/card-${r}${CODE[suit(c)]}.svg`]} alt={r + st} data-t={k} data-rank={rank(c)} width={60} height={84} draggable={false} />
}
const Deck = ({ n, k }: { n: number; k: string }) => <div className="g-deck" data-t={k}>{n > 0 && <img src={BACK} srcSet={x3(CARD_ART, './art/cards/back')} alt="" />}{n > 1 && <img src={BACK} srcSet={x3(CARD_ART, './art/cards/back')} alt="" style={{ left: 2, top: -2 }} />}<span>{n}</span></div>
export const Chips = ({ bal }: { bal: number }) => <span className="g-chips" data-t="g-chips">{[1, 5, 25, 100].map(v => <Chip key={v} v={v} />)} {bal} {CHIPS_NAME}</span>
export default function GamesPanel({ game, games, name, send, stand, desk, chips }: { game: GameV | BjV | null; games: GameInfo[]; name: (id: number) => string; chips: number | null
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
    <ul className="g-list">{games.map(g => <li key={g.id}><div><b>{g.title}</b>{g.id === 'blackjack' && <span className="g-tag">Co-op</span>}<small>{g.id === 'blackjack' ? `You two share one hand vs the House · ${CHIPS_NAME}, never cash` : g.ready ? 'For two at this table' : g.id === 'blackjack' ? `Coming soon · you two vs the house · ${CHIPS_NAME}, never cash` : 'Coming soon'}</small></div>
      <button className="w-btn sm" data-t={'g-start-' + g.id} disabled={!g.ready} onClick={() => send({ t: 'gstart', g: g.id })}>{g.ready ? 'Start' : 'Soon'}</button></li>)}</ul>
    {chips !== null && <Chips bal={chips} />}
    <button className="w-btn sm ghost" data-t="g-stand" onClick={stand}>Stand up</button></section>
  if (game.g === 'blackjack') return <BjPanel game={game} name={name} send={send} stand={stand} desk={desk} chips={chips} t0={t0} />
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

const RES = { win: 'You two win the round!', bj: 'Blackjack! You two win big', push: 'Push · your coins come back', lose: 'The House takes this one', bust: 'Bust · over 21' } as const
function BjPanel({ game, name, send, stand, desk, chips, t0 }: { game: BjV; name: (id: number) => string; send: (o: object) => void; stand: () => void; desk: boolean; chips: number | null; t0: number }) {
  const [ante, setAnte] = useState(25)
  const live = game.winner === null, play = live && game.phase === 'play', mine = play && game.turn === game.me, bet = live && game.phase === 'bet'
  const turnLeft = Math.max(0, game.turnLeft - (performance.now() - t0))
  const deal = () => send({ t: 'gact', a: 'deal', ante }), hit = () => send({ t: 'gact', a: 'hit' }), standH = () => send({ t: 'gact', a: 'stand' })
  useEffect(() => {
    if (!live || !desk) return
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea') || e.repeat) return
      const c = e.key.toLowerCase()
      if (c === 'h') hit(); else if (c === 's') standH(); else if (c === 'd') deal(); else return
      e.preventDefault()
    }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  })
  const stack = game.ante ? [100, 25, 5, 1].flatMap(v => Array(Math.floor((game.ante % (v * 10)) / v)).fill(v)).slice(0, 6) : []
  return <section className="w-panel g-panel g-bj" data-t="g-bj" data-seq={game.seq} data-phase={game.phase} data-turn={mine ? 'me' : 'them'} data-over={game.winner !== null ? '1' : undefined} data-res={game.res ?? undefined} aria-label="Blackjack">
    <h2 className="g-h">Blackjack <span className="g-tag">Co-op</span><small>round {Math.min(game.round + (bet ? 1 : play ? 1 : 0), game.rounds)} of {game.rounds}</small></h2>
    <p className="g-sub">Shared hand vs the House · {CHIPS_NAME} only</p>
    <div className="g-felt g-bjfelt">
      <div className="g-row"><b className="g-house">House</b><small data-t="bj-house-total">{game.houseTotal !== null ? game.houseTotal : game.house.length ? '?' : ''}</small></div>
      <div className="g-hand" data-t="bj-house">{game.house.map((c, i) => c === null ? <Back key={i} /> : <Card key={i} c={c} />)}</div>
      <div className="g-row"><b className="g-ours">Your shared hand</b><small data-t="bj-total">{game.hand.length ? (game.soft && game.total < 21 ? 'soft ' : '') + game.total : ''}</small></div>
      <div className="g-hand" data-t="bj-hand">{game.hand.length ? game.hand.map((c, i) => <Card key={i} c={c} />) : <span className="g-empty">pick your coins and Deal</span>}</div>
      <div className="g-stack" data-t="bj-stack">{stack.map((v, i) => <Chip key={i} v={v} size={27} />)}<small>{game.ante ? `${game.ante} each · ` : ''}{CHIPS_NAME} · never cash</small></div>
    </div>
    <p className="g-status" role="status" data-t="g-status">{game.winner !== null ? 'Game over · thanks for playing together'
      : play ? <span className={'g-pill' + (mine ? ' me' : '')}>{mine ? 'Your call' : `${name(game.turn)}'s call`} · {Math.ceil(turnLeft / 1000)}s</span>
      : game.res ? <span data-t="bj-res">{RES[game.res]}</span> : 'Either of you can Deal'}</p>
    {game.fam && game.winner !== null && <p className="g-fam" data-t="g-fam">You two got to know each other a little better.</p>}
    {bet && <div className="g-antes" role="radiogroup" aria-label={`Coins each`}>{[1, 5, 25, 100].map(v => <button key={v} className={'g-ante' + (ante === v ? ' on' : '')} role="radio" aria-checked={ante === v} data-t={'bj-ante-' + v} disabled={chips !== null && chips < v} onClick={() => setAnte(v)}><Chip v={v} size={27} /></button>)}</div>}
    {live ? <div className="g-btns g-bjbtns">
      <button className="w-btn g-hit" data-t="bj-hit" disabled={!mine} onClick={hit}>Hit{desk && <kbd>H</kbd>}</button>
      <button className="w-btn g-flip" data-t="bj-stand" disabled={!mine} onClick={standH}>Stand{desk && <kbd>S</kbd>}</button>
      <button className="w-btn g-deal" data-t="bj-deal" disabled={!bet || (chips !== null && chips < ante)} onClick={deal}>Deal{desk && <kbd>D</kbd>}</button></div>
      : <div className="g-btns"><button className="w-btn" data-t="g-again" onClick={() => send({ t: 'gstart', g: 'blackjack' })}>Play again</button>
        <button className="w-btn ghost" data-t="g-done" onClick={() => send({ t: 'gquit' })}>Done</button></div>}
    {chips !== null && <Chips bal={chips} />}
    <button className="w-btn sm ghost" data-t="g-stand" onClick={stand}>{live ? 'Leave game' : 'Stand up'}</button>
  </section>
}
