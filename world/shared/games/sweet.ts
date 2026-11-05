/* Sweet Twenty (working name). Two players, server-authoritative, no shared hand.
   A main deck of 1–10 (four of each) is drawn one card onto the current player's board at the start of their turn.
   Each player keeps four side cards for the whole match (+1..+6, −1..−6, ±1..±6). At most one side card per turn,
   then End Turn or Stand. Over 20 when the turn ends is a bust. Nine main cards at 20 or under wins the set.
   Otherwise the closer total wins; a tie replays the set. Side cards are not refilled. First to 3 sets wins.
   An optional coin stake is locked before the match (0 is free). The winner is paid 2× their own stake.
   The turn clock ends the turn for an idle player. */
import { shuffle, type Game, type Act, type GameCtx } from './index.ts'
export const TURN_MS = 10_000, ACT_GAP_MS = 250, SETS = 3, BOARD_MAX = 9, TARGET = 20
export const ANTES = [0, 1, 5, 25, 100] as const
export type SideK = 'plus' | 'minus' | 'flip'
export interface Side { k: SideK; n: number }
export interface Cell { v: number; side: boolean }
export interface SwP { uid: string; out: boolean; away: boolean; last: number; lastA: string; seat: number
  board: Cell[]; side: Side[]; stood: boolean; bust: boolean; sets: number; bet: number; locked: boolean; played: boolean }
export interface SwS { ps: SwP[]; seq: number; winner: string | null; phase: 'bet' | 'play' | 'over'
  turn: number; turnAt: number; starter: number; setNo: number; ante: number
  main: number[]; sideDeck: Side[]; rigMain: number[] | null; rigSide: Side[] | null; rnd: (n: number) => number
  pay: { uid: string; delta: number }[]
  last: { k: 'start' | 'join' | 'bet' | 'draw' | 'side' | 'end' | 'stand' | 'auto' | 'set' | 'tie' | 'over' | 'out'; who: string; at: number } }
export interface SwSeatV { uid: string; out: boolean; away: boolean; board: Cell[]; total: number; sideN: number; stood: boolean; bust: boolean; sets: number; bet: number; locked: boolean; seat: number }
export interface SwV { g: 'sweet'; seq: number; phase: SwS['phase']; turn: string; turnLeft: number; setNo: number; setsTo: number
  board: Cell[]; total: number; side: Side[]; played: boolean; bet: number; locked: boolean; mine: string
  last: SwS['last']; winner: string | null; ps: SwSeatV[] }

const sum = (p: SwP) => p.board.reduce((a, c) => a + c.v, 0)
const mains = (p: SwP) => p.board.filter(c => !c.side).length
const freshMain = () => { const d: number[] = []; for (let v = 1; v <= 10; v++) for (let i = 0; i < 4; i++) d.push(v); return d }
const freshSide = (): Side[] => {
  const d: Side[] = []
  for (const k of ['plus', 'minus', 'flip'] as const) for (let n = 1; n <= 6; n++) d.push({ k, n })
  return d
}
const blank = (uid: string, seat: number): SwP => ({ uid, out: false, away: false, last: -Infinity, lastA: '', seat, board: [], side: [], stood: false, bust: false, sets: 0, bet: 0, locked: false, played: false })
function drawMain(s: SwS) {
  if (!s.main.length) s.main = s.rigMain?.length ? s.rigMain.splice(0, s.rigMain.length) : shuffle(freshMain(), s.rnd)
  return s.main.pop()!
}
function beginTurn(s: SwS, now: number) {
  const p = s.ps[s.turn]; if (!p) return
  p.played = false
  p.board.push({ v: drawMain(s), side: false })
  s.turnAt = now; s.seq++; s.last = { k: 'draw', who: p.uid, at: now }
}
function clearBoards(s: SwS) { for (const p of s.ps) { p.board = []; p.stood = false; p.bust = false; p.played = false } }
function dealSides(s: SwS) {
  s.sideDeck = s.rigSide?.length ? s.rigSide.splice(0, s.rigSide.length) : shuffle(freshSide(), s.rnd)
  for (const p of s.ps) p.side = [s.sideDeck.pop()!, s.sideDeck.pop()!, s.sideDeck.pop()!, s.sideDeck.pop()!]
}
function startMatch(s: SwS, now: number) {
  s.phase = 'play'; s.setNo = 1; s.starter = 0; s.winner = null
  for (const p of s.ps) { p.sets = 0; p.stood = false; p.bust = false }
  dealSides(s); clearBoards(s); s.turn = s.starter; beginTurn(s, now)
}
function nextSet(s: SwS, now: number) {
  clearBoards(s); s.setNo++; s.starter = 1 - s.starter; s.turn = s.starter; beginTurn(s, now)
}
function award(s: SwS, i: number, now: number) {
  const p = s.ps[i]; p.sets++
  s.seq++; s.last = { k: 'set', who: p.uid, at: now }
  if (p.sets >= SETS) {
    s.phase = 'over'; s.winner = p.uid; s.turn = -1
    if (p.bet > 0) s.pay.push({ uid: p.uid, delta: p.bet * 2 })
    s.last = { k: 'over', who: p.uid, at: now }
    return
  }
  nextSet(s, now)
}
function compare(s: SwS, now: number) {
  const [a, b] = s.ps, ta = sum(a), tb = sum(b)
  if (ta === tb) { s.seq++; s.last = { k: 'tie', who: '', at: now }; nextSet(s, now); return }
  award(s, ta > tb ? 0 : 1, now)
}
function finishTurn(s: SwS, how: 'end' | 'stand' | 'auto', now: number) {
  const i = s.turn, p = s.ps[i], o = 1 - i, t = sum(p), n = mains(p)
  if (t > TARGET) { p.bust = true; s.last = { k: how === 'auto' ? 'auto' : how, who: p.uid, at: now }; award(s, o, now); return }
  if (n >= BOARD_MAX) { s.last = { k: how === 'auto' ? 'auto' : how, who: p.uid, at: now }; award(s, i, now); return }
  if (how === 'stand') {
    p.stood = true; s.last = { k: 'stand', who: p.uid, at: now }
    if (s.ps[o].stood) compare(s, now)
    else { s.turn = o; beginTurn(s, now) }
    return
  }
  s.last = { k: how === 'auto' ? 'auto' : 'end', who: p.uid, at: now }
  if (s.ps[o].stood) beginTurn(s, now)
  else { s.turn = o; beginTurn(s, now) }
}
const playing = (s: SwS, who: string) => { const i = s.ps.findIndex(p => p.uid === who && !p.out); return i }

/** tests preload the shoes. Cards are dealt from the end (Array.pop). */
export function rig(s: SwS, main?: number[], side?: Side[]) { if (main) s.rigMain = main.slice(); if (side) s.rigSide = side.slice() }

export const Sweet: Game<SwS, SwV> & {
  join(s: SwS, who: string, seat: number, c: { now: number }): string
  canBet(s: SwS, who: string, ante: unknown): string
  commit(s: SwS, who: string, ante: number, c: GameCtx): string
} = {
  start(players, c) {
    const s: SwS = { ps: [], seq: 1, winner: null, phase: 'bet', turn: -1, turnAt: c.now, starter: 0, setNo: 0, ante: 0,
      main: [], sideDeck: [], rigMain: null, rigSide: null, rnd: c.rnd, pay: [], last: { k: 'start', who: '', at: c.now } }
    players.forEach((uid, i) => this.join(s, uid, i, c))
    return s
  },
  join(s, who, seat, c) {
    if (s.ps.some(p => p.uid === who)) return ''
    if (s.ps.length >= 2) return 'full'
    if (s.phase === 'play') return 'waiting'
    const p = blank(who, seat)
    let i = s.ps.findIndex(x => x.seat > seat); if (i < 0) i = s.ps.length
    s.ps.splice(i, 0, p)
    s.seq++; s.last = { k: 'join', who, at: c.now }
    return ''
  },
  canBet(s, who, ante) {
    if (s.winner !== null || s.phase === 'over') return 'over'
    const p = s.ps.find(x => x.uid === who && !x.out); if (!p) return 'not-playing'
    if (s.phase !== 'bet') return 'in-round'
    if (p.locked) return 'in-round'
    if (!ANTES.includes(ante as 0)) return 'bad-ante'
    return ''
  },
  /** the stake (0 is free) is already out of the wallet when it is more than 0 */
  commit(s, who, ante, c) {
    const why = this.canBet(s, who, ante); if (why) return why
    const p = s.ps.find(x => x.uid === who)!
    s.rnd = c.rnd
    p.bet = ante; p.locked = true; p.last = c.now; s.ante = ante
    s.seq++; s.last = { k: 'bet', who, at: c.now }
    if (s.ps.length >= 2 && s.ps.every(x => x.locked)) startMatch(s, c.now)
    return ''
  },
  act(s, who, act: Act, c) {
    if (s.winner !== null || s.phase === 'over') return s.phase === 'over' && act.a === 'again' ? this.again(s, who, c) : 'over'
    const i = playing(s, who); if (i < 0) return 'not-playing'
    const p = s.ps[i]
    if (act.a === 'bet') return 'bad-action'
    if (act.a !== 'side' && act.a !== 'end' && act.a !== 'stand' && act.a !== 'again') return 'bad-action'
    if (s.phase !== 'play') return 'not-in-round'
    if (s.turn !== i) return 'not-your-turn'
    if (act.a === 'side' && p.played) return 'one-side'
    if (act.a === p.lastA && c.now - p.last < ACT_GAP_MS) return 'slow-down'
    p.last = c.now; p.lastA = act.a; s.rnd = c.rnd
    if (act.a === 'again') return 'in-round'
    if (act.a === 'side') {
      const ix = act.i; if (typeof ix !== 'number' || !p.side[ix]) return 'bad-card'
      const card = p.side[ix]
      let delta = 0
      if (card.k === 'plus') delta = card.n
      else if (card.k === 'minus') delta = -card.n
      else { if (act.sign !== 1 && act.sign !== -1) return 'bad-sign'; delta = (act.sign as number) * card.n }
      p.side.splice(ix, 1); p.board.push({ v: delta, side: true }); p.played = true
      s.seq++; s.last = { k: 'side', who, at: c.now }
      return ''
    }
    finishTurn(s, act.a === 'stand' ? 'stand' : 'end', c.now)
    return ''
  },
  again(s, who, c) {
    if (s.phase !== 'over') return 'in-round'
    if (playing(s, who) < 0) return 'not-playing'
    if (s.ps.length < 2) return 'need-two'
    s.rnd = c.rnd; s.winner = null; s.phase = 'bet'
    for (const p of s.ps) { p.locked = false; p.bet = 0; p.sets = 0; p.side = []; p.board = []; p.stood = false; p.bust = false }
    s.setNo = 0; s.seq++; s.last = { k: 'start', who, at: c.now }
    return ''
  },
  tick(s, c) {
    if (s.phase !== 'play' || s.turn < 0) return false
    s.rnd = c.rnd
    if (c.now - s.turnAt >= TURN_MS) { finishTurn(s, 'auto', c.now); return true }
    return false
  },
  view(s, who, c) {
    const me = s.ps.find(p => p.uid === who), live = s.phase === 'play'
    const seat = (p: SwP): SwSeatV => ({ uid: p.uid, out: p.out, away: p.away, board: p.board, total: sum(p), sideN: p.side.length, stood: p.stood, bust: p.bust, sets: p.sets, bet: p.bet, locked: p.locked, seat: p.seat })
    return { g: 'sweet', seq: s.seq, phase: s.phase, turn: s.turn >= 0 ? s.ps[s.turn]?.uid ?? '' : '',
      turnLeft: live ? Math.max(0, TURN_MS - (c.now - s.turnAt)) : 0, setNo: s.setNo, setsTo: SETS,
      board: me?.board ?? [], total: me ? sum(me) : 0, side: me?.side ?? [], played: !!me?.played, bet: me?.bet ?? 0, locked: !!me?.locked,
      mine: me?.locked ? (live ? 'play' : 'bet') : 'bet', last: s.last, winner: s.winner, ps: s.ps.map(seat) }
  },
  done(s) { return s.winner === null ? null : { winner: s.winner } },
  leave(s, who, c) {
    const i = s.ps.findIndex(p => p.uid === who); if (i < 0) return
    const p = s.ps[i]
    if (s.phase === 'bet' && p.locked && p.bet > 0) { s.pay.push({ uid: p.uid, delta: p.bet }); p.bet = 0 }
    s.ps.splice(i, 1)
    if (s.phase === 'play' && s.ps.length === 1) {
      const o = s.ps[0]; o.sets = SETS; s.phase = 'over'; s.winner = o.uid; s.turn = -1
      if (o.bet > 0) s.pay.push({ uid: o.uid, delta: o.bet * 2 })
    }
    if (s.turn === i) s.turn = s.ps.length ? 0 : -1
    else if (i < s.turn) s.turn--
    s.seq++; s.last = { k: 'out', who, at: c.now }
    if (!s.ps.length) s.winner = ''
  },
}
