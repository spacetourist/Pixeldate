/* Co-op Blackjack, server-authoritative. The two at the table share ONE hand against the House (a warm NPC dealer).
   Rounds: in 'bet' either player taps Deal with an ante (coins, 1/5/25/100; both put the same in, the Room takes it
   from each wallet through WalletStore.move before the cards come out). In 'play' the pair take turns deciding for the
   shared hand: Hit or Stand, TURN_MS each (the clock stands for you). After a Hit the turn passes to the other player.
   Then the House draws to 17 (stands on soft 17) and the round settles: both win or lose together.
   Payouts go back through the wallet as `s.pay` (the Room drains it): win 2x ante, blackjack ante + 1.5x ante (floored),
   push ante back. Nothing is ever bought or paid out for real. A fresh crypto-shuffled 52-card deck every round.
   The game ends (a co-op finish, winner '') after ROUNDS rounds, or when a player leaves (a live round is stood for them). */
import { shuffle, type Game, type Act } from './index.ts'
export const TURN_MS = 10_000, ROUNDS = 5, ANTES = [1, 5, 25, 100] as const, ACT_GAP_MS = 250
export interface BjP { uid: string; out: boolean; away: boolean; last: number }
export type BjRes = 'win' | 'bj' | 'push' | 'lose' | 'bust'
export interface BjS { ps: BjP[]; seq: number; winner: string | null
  phase: 'bet' | 'play' | 'house'; ante: number; deck: number[]; hand: number[]; house: number[]; turn: number; turnAt: number
  round: number; res: BjRes | null; pay: { uid: string; delta: number }[]
  last: { k: 'start' | 'deal' | 'hit' | 'stand' | 'auto' | 'settle' | 'out'; who: string; at: number } }
export interface BjV { g: 'blackjack'; seq: number; phase: BjS['phase']; ante: number; hand: number[]; house: (number | null)[]
  total: number; soft: boolean; houseTotal: number | null; turn: string; turnLeft: number; round: number; rounds: number; res: BjRes | null
  last: BjS['last']; winner: string | null; ps: { uid: string; out: boolean; away: boolean }[] }

const val = (c: number) => Math.min(10, (c >> 2) + 1)
/** best total, and whether an ace still counts 11 */
export function total(h: number[]) {
  let t = 0, aces = 0
  for (const c of h) { const v = val(c); t += v; if (v === 1) aces++ }
  const soft = aces > 0 && t + 10 <= 21
  return { t: soft ? t + 10 : t, soft }
}
const natural = (h: number[]) => h.length === 2 && total(h).t === 21
function settle(s: BjS, now: number) {
  const me = total(s.hand).t, ho = total(s.house).t
  s.res = me > 21 ? 'bust' : natural(s.hand) && !natural(s.house) ? 'bj' : natural(s.house) && !natural(s.hand) ? 'lose'
    : ho > 21 || me > ho ? 'win' : me === ho ? 'push' : 'lose'
  const back = s.res === 'win' ? 2 * s.ante : s.res === 'bj' ? s.ante + Math.floor(1.5 * s.ante) : s.res === 'push' ? s.ante : 0
  if (back) for (const p of s.ps) s.pay.push({ uid: p.uid, delta: back })
  s.phase = 'bet'; s.round++; s.seq++; s.last = { k: 'settle', who: '', at: now }
  if (s.round >= ROUNDS || s.ps.some(p => p.out)) s.winner = ''
}
function houseDraws(s: BjS, now: number) {
  s.phase = 'house'
  if (total(s.hand).t <= 21) while (total(s.house).t < 17) s.house.push(s.deck.pop()!)
  settle(s, now)
}
function pass(s: BjS, now: number) { const n = s.ps.length; for (let k = 1; k <= n; k++) { const i = (s.turn + k) % n; if (!s.ps[i].out) { s.turn = i; break } } s.turnAt = now }

export const Blackjack: Game<BjS, BjV> & { deal(s: BjS, ante: number, who: string, c: { now: number; rnd: (n: number) => number }): string; canDeal(s: BjS, who: string, ante: unknown): string } = {
  start(players, c) {
    return { ps: players.map(uid => ({ uid, out: false, away: false, last: -Infinity })), seq: 1, winner: null, phase: 'bet', ante: 0, deck: [], hand: [], house: [],
      turn: c.rnd(players.length), turnAt: c.now, round: 0, res: null, pay: [], last: { k: 'start', who: '', at: c.now } }
  },
  /** checked by the Room before it takes the ante from the wallets */
  canDeal(s, who, ante) {
    if (s.winner !== null) return 'over'
    if (!s.ps.some(p => p.uid === who && !p.out)) return 'not-playing'
    if (s.phase !== 'bet') return 'in-round'
    if (!ANTES.includes(ante as 1)) return 'bad-ante'
    return ''
  },
  /** the antes are in: deal two each, House shows one */
  deal(s, ante, who, c) {
    const why = this.canDeal(s, who, ante); if (why) return why
    s.ante = ante; s.deck = shuffle(Array.from({ length: 52 }, (_, i) => i), c.rnd); s.res = null
    s.hand = [s.deck.pop()!, s.deck.pop()!]; s.house = [s.deck.pop()!, s.deck.pop()!]
    s.phase = 'play'; s.turnAt = c.now; s.seq++; s.last = { k: 'deal', who, at: c.now }
    if (natural(s.hand) || natural(s.house)) settle(s, c.now)
    return ''
  },
  act(s, who, act: Act, c) {
    if (s.winner !== null) return 'over'
    const i = s.ps.findIndex(p => p.uid === who); if (i < 0 || s.ps[i].out) return 'not-playing'
    const p = s.ps[i]
    if (act.a === 'deal') return 'bad-action'   // the Room deals (it takes the antes first)
    if (act.a !== 'hit' && act.a !== 'stand') return 'bad-action'
    if (s.phase !== 'play') return 'not-in-round'
    if (s.turn !== i) return 'not-your-turn'
    if (c.now - p.last < ACT_GAP_MS) return 'slow-down'
    p.last = c.now
    if (act.a === 'hit') {
      s.hand.push(s.deck.pop()!); s.seq++; s.last = { k: 'hit', who, at: c.now }
      const t = total(s.hand).t
      if (t > 21) settle(s, c.now); else if (t === 21) houseDraws(s, c.now); else pass(s, c.now)
      return ''
    }
    s.last = { k: 'stand', who, at: c.now }; houseDraws(s, c.now); return ''
  },
  tick(s, c) {
    if (s.winner !== null || s.phase !== 'play') return false
    if (c.now - s.turnAt >= TURN_MS) { s.last = { k: 'auto', who: s.ps[s.turn].uid, at: c.now }; houseDraws(s, c.now); return true }
    return false
  },
  view(s, _who, c) {
    const live = s.phase === 'play', ht = total(s.house), t = total(s.hand)
    return { g: 'blackjack', seq: s.seq, phase: s.phase, ante: s.ante, hand: s.hand, house: live ? [s.house[0], null] : s.house,
      total: t.t, soft: t.soft, houseTotal: live ? null : s.house.length ? ht.t : null, turn: s.ps[s.turn]?.uid ?? '',
      turnLeft: live ? Math.max(0, TURN_MS - (c.now - s.turnAt)) : 0, round: s.round, rounds: ROUNDS, res: s.res, last: s.last, winner: s.winner,
      ps: s.ps.map(p => ({ uid: p.uid, out: p.out, away: p.away })) }
  },
  done(s) { return s.winner === null ? null : { winner: s.winner } },
  leave(s, who, c) {
    const p = s.ps.find(x => x.uid === who); if (!p || p.out) return
    p.out = true; s.seq++; s.last = { k: 'out', who, at: c.now }
    // a live round is stood for the table so both antes settle; otherwise the game simply ends
    if (s.phase === 'play') houseDraws(s, c.now); else s.winner = ''
  },
}
