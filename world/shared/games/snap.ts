/* Snap, server-authoritative. 52 cards dealt round-robin face down. On your turn you flip your top card onto the
   middle pile (or the clock does it for you after TURN_MS). When the top two cards of the pile share a rank, the
   first player to snap takes the whole pile under their stack. A wrong snap gives your top card to the pile.
   Snap presses are rate-limited (SNAP_GAP_MS between presses; FALSE_MAX wrong snaps in FALSE_WIN_MS locks you out
   for LOCK_MS). A player with no cards when their turn comes is out; last one in wins (or most cards at GAME_MS). */
import { shuffle, type Game, type GameCtx, type Act } from './index.ts'
export const TURN_MS = 6000, SNAP_GAP_MS = 350, FALSE_WIN_MS = 10_000, FALSE_MAX = 3, LOCK_MS = 3000, GAME_MS = 240_000
/** a card: rank 1..13 * 4 + suit 0..3 */
export const rank = (c: number) => (c >> 2) + 1, suit = (c: number) => c & 3
export interface SnapP { uid: string; hand: number[]; out: boolean; lastSnap: number; falses: number[]; lockUntil: number; away: boolean }
export interface SnapS { ps: SnapP[]; pile: number[]; turn: number; turnAt: number; startAt: number; seq: number
  /** the last thing that happened, for the view: who flipped / snapped / was wrong */
  last: { k: 'flip' | 'snap' | 'false' | 'auto' | 'out' | 'start'; who: string; n?: number; at: number }
  winner: string | null }
export interface SnapV { g: 'snap'; seq: number; ps: { uid: string; n: number; out: boolean; away: boolean; lock: number }[]
  pile: number[]; size: number; turn: string; turnLeft: number; me: number; last: SnapS['last']; winner: string | null; left: number }

function nextTurn(s: SnapS, c: GameCtx) {
  const n = s.ps.length
  for (let k = 1; k <= n; k++) {
    const i = (s.turn + k) % n, p = s.ps[i]
    if (p.out) continue
    if (!p.hand.length) { p.out = true; s.last = { k: 'out', who: p.uid, at: c.now }; continue }
    s.turn = i; s.turnAt = c.now; return
  }
}
function finish(s: SnapS) {
  const live = s.ps.filter(p => !p.out)
  if (live.length <= 1) { s.winner = live[0]?.uid ?? ''; return true }
  return false
}
function flip(s: SnapS, i: number, c: GameCtx, auto: boolean) {
  const p = s.ps[i], card = p.hand.shift()!
  s.pile.push(card); s.seq++; s.last = { k: auto ? 'auto' : 'flip', who: p.uid, n: card, at: c.now }
  nextTurn(s, c)
  // everyone else out of cards: the one left wins only once the pile can't be snapped back (no pair on top)
  if (!p.hand.length && !matches(s)) { /* handled when their turn comes round */ }
  finish(s)
}
export const matches = (s: SnapS) => s.pile.length >= 2 && rank(s.pile[s.pile.length - 1]) === rank(s.pile[s.pile.length - 2])

export const Snap: Game<SnapS, SnapV> = {
  start(players, c) {
    const deck = shuffle(Array.from({ length: 52 }, (_, i) => i), c.rnd)
    const ps: SnapP[] = players.map(uid => ({ uid, hand: [], out: false, lastSnap: 0, falses: [], lockUntil: 0, away: false }))
    deck.forEach((card, i) => ps[i % ps.length].hand.push(card))
    const turn = c.rnd(ps.length)
    return { ps, pile: [], turn, turnAt: c.now, startAt: c.now, seq: 1, last: { k: 'start', who: ps[turn].uid, at: c.now }, winner: null }
  },
  act(s, who, act: Act, c) {
    if (s.winner !== null) return 'over'
    const i = s.ps.findIndex(p => p.uid === who); if (i < 0) return 'not-playing'
    const p = s.ps[i]; if (p.out) return 'out'
    if (act.a === 'flip') {
      if (s.turn !== i) return 'not-your-turn'
      if (!p.hand.length) return 'no-cards'
      flip(s, i, c, false); return ''
    }
    if (act.a === 'snap') {
      if (c.now < p.lockUntil) return 'locked'
      if (c.now - p.lastSnap < SNAP_GAP_MS) return 'slow-down'
      p.lastSnap = c.now
      if (matches(s)) {
        const n = s.pile.length; p.hand.push(...s.pile); s.pile = []; s.seq++
        s.last = { k: 'snap', who, n, at: c.now }
        // the snapper leads next
        s.turn = i; s.turnAt = c.now; finish(s); return ''
      }
      p.falses = p.falses.filter(t => c.now - t < FALSE_WIN_MS); p.falses.push(c.now)
      if (p.falses.length >= FALSE_MAX) { p.lockUntil = c.now + LOCK_MS; p.falses = [] }
      if (p.hand.length) s.pile.unshift(p.hand.shift()!)   // the penalty card goes under the pile, so it can't make a pair
      s.seq++; s.last = { k: 'false', who, at: c.now }
      if (!p.hand.length && s.turn !== i) { /* out when their turn comes */ }
      return 'false-snap'
    }
    return 'bad-action'
  },
  tick(s, c) {
    if (s.winner !== null) return false
    if (c.now - s.startAt > GAME_MS) {
      const best = [...s.ps].filter(p => !p.out).sort((a, b) => b.hand.length - a.hand.length)
      s.winner = best.length > 1 && best[0].hand.length === best[1].hand.length ? '' : best[0]?.uid ?? ''; s.seq++; return true
    }
    if (c.now - s.turnAt >= TURN_MS) {
      const p = s.ps[s.turn]
      if (!p.hand.length) { nextTurn(s, c); finish(s) } else flip(s, s.turn, c, true)
      s.seq++; return true
    }
    return false
  },
  view(s, who, c) {
    const me = s.ps.findIndex(p => p.uid === who)
    return { g: 'snap', seq: s.seq, me, pile: s.pile.slice(-3), size: s.pile.length, turn: s.ps[s.turn]?.uid ?? '',
      turnLeft: Math.max(0, TURN_MS - (c.now - s.turnAt)), last: s.last, winner: s.winner, left: Math.max(0, GAME_MS - (c.now - s.startAt)),
      ps: s.ps.map(p => ({ uid: p.uid, n: p.hand.length, out: p.out, away: p.away, lock: Math.max(0, p.lockUntil - c.now) })) }
  },
  done(s) { return s.winner === null ? null : { winner: s.winner } },
  leave(s, who, c) {
    const i = s.ps.findIndex(p => p.uid === who); if (i < 0 || s.ps[i].out) return
    const p = s.ps[i]; p.out = true; s.pile.unshift(...p.hand); p.hand = []; s.seq++; s.last = { k: 'out', who, at: c.now }
    if (s.turn === i) nextTurn(s, c)
    finish(s)
  },
}
