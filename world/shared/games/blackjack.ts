/* Multiplayer Blackjack, server-authoritative. Each seat plays its own hand against the House.
   A fresh crypto-shuffled 52-card deck every round. Players lock their own ante (1/5/25/100 coins);
   the Room takes that ante from that player's wallet before the cards come out. Turns run in seat
   order: Hit, Stand, or Double (first two cards, one extra card, the extra stake already taken).
   The clock (TURN_MS) stands for an idle player. The House draws to 17 and stands on soft 17.
   Payouts are per hand, once, through `s.pay` (the Room drains it): win 2x stake, blackjack
   stake + 1.5x (floored), push the stake back. Nothing is bought or paid out for real.
   Someone who sits down mid-round waits for the next one. Leaving stands a live hand; that hand
   still settles with the round, exactly once. */
import { shuffle, type Game, type Act, type GameCtx } from './index.ts'
export const TURN_MS = 10_000, BET_MS = 8_000, ANTES = [1, 5, 25, 100] as const, ACT_GAP_MS = 250, SEATS = 5
export type BjRes = 'win' | 'bj' | 'push' | 'lose' | 'bust'
export type BjSt = 'bet' | 'locked' | 'wait' | 'play' | 'stand' | 'bust' | 'bj'
export interface BjP { uid: string; out: boolean; away: boolean; last: number; seat: number; cards: number[]; bet: number; st: BjSt; res: BjRes | null; doubled: boolean }
export interface BjS { ps: BjP[]; seq: number; winner: string | null
  phase: 'bet' | 'play' | 'house'; ante: number; deck: number[]; house: number[]; turn: number; turnAt: number; betAt: number; betOpen: boolean
  /** test shoe: when set, the next deal uses this deck (pop from the end) instead of shuffling */
  rig: number[] | null; rnd: (n: number) => number
  /** hands that left mid-round: paid when the House settles, then dropped */
  owed: { uid: string; cards: number[]; bet: number }[]
  round: number; res: BjRes | null; pay: { uid: string; delta: number }[]
  last: { k: 'start' | 'join' | 'bet' | 'deal' | 'hit' | 'stand' | 'double' | 'auto' | 'settle' | 'out' | 'wait'; who: string; at: number } }
export interface BjSeatV { uid: string; out: boolean; away: boolean; hand: number[]; total: number; soft: boolean; bet: number; st: BjSt; res: BjRes | null; seat: number }
export interface BjV { g: 'blackjack'; seq: number; phase: 'bet' | 'play'; ante: number; hand: number[]; house: (number | null)[]
  total: number; soft: boolean; houseTotal: number | null; turn: string; turnLeft: number; round: number; rounds: number; res: BjRes | null
  last: BjS['last']; winner: string | null; waiting: boolean; mine: BjSt; ps: BjSeatV[] }

const val = (c: number) => Math.min(10, (c >> 2) + 1)
/** best total, and whether an ace still counts 11 */
export function total(h: number[]) {
  let t = 0, aces = 0
  for (const c of h) { const v = val(c); t += v; if (v === 1) aces++ }
  const soft = aces > 0 && t + 10 <= 21
  return { t: soft ? t + 10 : t, soft }
}
const natural = (h: number[]) => h.length === 2 && total(h).t === 21
const blank = (uid: string, seat: number): BjP => ({ uid, out: false, away: false, last: -Infinity, seat, cards: [], bet: 0, st: 'bet', res: null, doubled: false })
function draw(s: BjS) {
  if (!s.deck.length) s.deck = shuffle(Array.from({ length: 52 }, (_, i) => i), s.rnd)
  return s.deck.pop()!
}
function payout(cards: number[], stake: number, house: number[]) {
  const me = total(cards).t, ht = total(house).t, nat = natural(cards), houseNat = natural(house)
  if (me > 21) return 0
  if (nat && houseNat) return stake
  if (nat) return stake + Math.floor(1.5 * stake)
  if (houseNat) return 0
  if (ht > 21 || me > ht) return 2 * stake
  if (me === ht) return stake
  return 0
}
function resultOf(cards: number[], stake: number, back: number, house: number[]): BjRes {
  if (total(cards).t > 21) return 'bust'
  if (natural(cards) && !natural(house)) return 'bj'
  if (back === stake) return 'push'
  return back > stake ? 'win' : 'lose'
}
/** the round is over: House draws if anyone can still beat it, then each hand is paid once */
function finish(s: BjS, now: number) {
  if (s.phase !== 'play') return
  s.phase = 'house'
  const houseNat = natural(s.house)
  const live = s.ps.some(p => p.bet > 0 && p.cards.length && total(p.cards).t <= 21 && !(houseNat && !natural(p.cards)))
  if (live && !houseNat) while (total(s.house).t < 17) s.house.push(draw(s))
  for (const h of s.ps) {
    if (!h.cards.length || h.bet <= 0 || h.st === 'wait') continue
    const back = payout(h.cards, h.bet, s.house)
    h.res = resultOf(h.cards, h.bet, back, s.house)
    if (back) s.pay.push({ uid: h.uid, delta: back })
  }
  for (const o of s.owed) { const back = payout(o.cards, o.bet, s.house); if (back) s.pay.push({ uid: o.uid, delta: back }) }
  s.owed = []
  s.ps = s.ps.filter(p => !p.out)
  s.phase = 'bet'; s.round++; s.turn = -1; s.betOpen = false; s.betAt = now
  s.res = null
  for (const p of s.ps) { p.st = 'bet'; p.doubled = false }
  s.seq++; s.last = { k: 'settle', who: '', at: now }
  if (!s.ps.length) s.winner = ''
}
function nextPlay(s: BjS, from: number) {
  for (let i = from; i < s.ps.length; i++) if (s.ps[i].st === 'play') return i
  return -1
}
function advance(s: BjS, now: number) {
  const n = nextPlay(s, s.turn + 1)
  if (n < 0) finish(s, now)
  else { s.turn = n; s.turnAt = now; s.seq++ }
}
function dealRound(s: BjS, now: number) {
  const inPlay = s.ps.filter(p => p.st === 'locked')
  if (!inPlay.length) { s.betOpen = false; return }
  s.deck = s.rig?.length ? s.rig.slice() : shuffle(Array.from({ length: 52 }, (_, i) => i), s.rnd)
  s.rig = null
  for (const p of s.ps) {
    p.res = null; p.cards = []
    if (p.st !== 'locked') { p.bet = 0; if (!p.out) p.st = 'wait' }
  }
  for (let i = 0; i < 2; i++) for (const p of inPlay) p.cards.push(draw(s))
  s.house = [draw(s), draw(s)]
  s.phase = 'play'; s.res = null; s.betOpen = false
  for (const p of inPlay) p.st = natural(p.cards) ? 'bj' : 'play'
  s.seq++; s.last = { k: 'deal', who: inPlay[0].uid, at: now }
  if (natural(s.house) || !s.ps.some(p => p.st === 'play')) { s.turn = -1; finish(s, now); return }
  s.turn = nextPlay(s, 0); s.turnAt = now
}
const playing = (s: BjS, who: string) => s.ps.find(p => p.uid === who && !p.out)

/** tests preload the shoe. Cards are dealt from the end (Array.pop): the last entry is the first card out. */
export function rig(s: BjS, deck: number[]) { s.rig = deck.slice() }

export const Blackjack: Game<BjS, BjV> & {
  join(s: BjS, who: string, seat: number, c: { now: number }): string
  canDeal(s: BjS, who: string, ante: unknown): string
  commit(s: BjS, who: string, ante: number, c: GameCtx): string
  canDouble(s: BjS, who: string, c: { now: number }): string
  double(s: BjS, who: string, c: GameCtx): string
} = {
  start(players, c) {
    const s: BjS = { ps: [], seq: 1, winner: null, phase: 'bet', ante: 0, deck: [], house: [], turn: -1, turnAt: c.now, betAt: c.now, betOpen: false, rig: null, rnd: c.rnd, owed: [],
      round: 0, res: null, pay: [], last: { k: 'start', who: '', at: c.now } }
    players.forEach((uid, i) => this.join(s, uid, i, c))
    return s
  },
  /** sit down. Mid-round: wait for the next deal. `seat` is the table's left-to-right index. */
  join(s, who, seat, c) {
    if (s.winner !== null) return 'over'
    if (s.ps.some(p => p.uid === who)) return ''
    if (s.ps.filter(p => !p.out).length >= SEATS) return 'full'
    if (s.ps.some(p => p.seat === seat && !p.out)) return 'full'
    const st: BjSt = s.phase === 'bet' ? 'bet' : 'wait'
    const p = blank(who, seat); p.st = st
    let i = s.ps.findIndex(x => x.seat > seat); if (i < 0) i = s.ps.length
    s.ps.splice(i, 0, p)
    if (s.phase === 'play' && s.turn >= i) s.turn++
    s.seq++; s.last = { k: st === 'wait' ? 'wait' : 'join', who, at: c.now }
    return ''
  },
  canDeal(s, who, ante) {
    if (s.winner !== null) return 'over'
    const p = playing(s, who); if (!p) return 'not-playing'
    if (p.st === 'wait') return 'waiting'
    if (s.phase !== 'bet' || p.st === 'locked') return 'in-round'
    if (!ANTES.includes(ante as 1)) return 'bad-ante'
    return ''
  },
  /** the ante is already out of this player's wallet */
  commit(s, who, ante, c) {
    const why = this.canDeal(s, who, ante); if (why) return why
    const p = playing(s, who)!
    s.rnd = c.rnd
    p.bet = ante; p.st = 'locked'; p.res = null; p.last = c.now; s.ante = ante
    if (!s.betOpen) { s.betOpen = true; s.betAt = c.now }
    s.seq++; s.last = { k: 'bet', who, at: c.now }
    const open = s.ps.filter(x => !x.out && x.st !== 'wait')
    if (open.length && open.every(x => x.st === 'locked')) dealRound(s, c.now)
    return ''
  },
  canDouble(s, who, c) {
    if (s.winner !== null) return 'over'
    if (s.phase !== 'play') return 'not-in-round'
    const i = s.ps.findIndex(p => p.uid === who && !p.out); if (i < 0) return 'not-playing'
    if (s.turn !== i || s.ps[i].st !== 'play') return 'not-your-turn'
    const p = s.ps[i]
    if (c.now - p.last < ACT_GAP_MS) return 'slow-down'
    if (p.cards.length !== 2 || p.doubled || p.bet <= 0) return 'no-double'
    return ''
  },
  /** the extra stake (equal to the bet) is already out of the wallet. One card, then that hand stands. */
  double(s, who, c) {
    const why = this.canDouble(s, who, c); if (why) return why
    const p = playing(s, who)!
    s.rnd = c.rnd
    p.bet *= 2; p.doubled = true; p.last = c.now; p.cards.push(draw(s))
    p.st = total(p.cards).t > 21 ? 'bust' : 'stand'
    s.last = { k: 'double', who, at: c.now }
    advance(s, c.now)
    return ''
  },
  act(s, who, act: Act, c) {
    if (s.winner !== null) return 'over'
    const i = s.ps.findIndex(p => p.uid === who && !p.out); if (i < 0) return 'not-playing'
    const p = s.ps[i]
    if (act.a === 'deal' || act.a === 'double') return 'bad-action'
    if (act.a !== 'hit' && act.a !== 'stand') return 'bad-action'
    if (p.st === 'wait') return 'waiting'
    if (s.phase !== 'play' || p.st !== 'play') return 'not-in-round'
    if (s.turn !== i) return 'not-your-turn'
    if (c.now - p.last < ACT_GAP_MS) return 'slow-down'
    p.last = c.now; s.rnd = c.rnd
    if (act.a === 'hit') {
      p.cards.push(draw(s)); s.last = { k: 'hit', who, at: c.now }
      const t = total(p.cards).t
      if (t > 21) { p.st = 'bust'; advance(s, c.now) }
      else if (t === 21) { p.st = 'stand'; advance(s, c.now) }
      else { s.turnAt = c.now; s.seq++ }
      return ''
    }
    p.st = 'stand'; s.last = { k: 'stand', who, at: c.now }; advance(s, c.now); return ''
  },
  tick(s, c) {
    if (s.winner !== null) return false
    s.rnd = c.rnd
    if (s.phase === 'bet' && s.betOpen && c.now - s.betAt >= BET_MS) {
      let held = false
      for (const p of s.ps) if (p.st === 'bet') p.st = 'wait'; else if (p.st === 'locked') held = true
      s.betOpen = false
      if (held) dealRound(s, c.now); else s.seq++
      return true
    }
    if (s.phase !== 'play' || s.turn < 0) return false
    if (c.now - s.turnAt >= TURN_MS) {
      const p = s.ps[s.turn]; if (!p || p.st !== 'play') return false
      p.st = 'stand'; s.last = { k: 'auto', who: p.uid, at: c.now }; advance(s, c.now); return true
    }
    return false
  },
  view(s, who, c) {
    const live = s.phase === 'play', me = s.ps.find(p => p.uid === who)
    const ht = s.house.length ? total(s.house) : null, mt = me?.cards.length ? total(me.cards) : null
    const seat = (p: BjP): BjSeatV => {
      const t = p.cards.length ? total(p.cards) : { t: 0, soft: false }
      return { uid: p.uid, out: p.out, away: p.away, hand: p.cards, total: t.t, soft: t.soft, bet: p.bet, st: p.st, res: p.res, seat: p.seat }
    }
    return { g: 'blackjack', seq: s.seq, phase: live ? 'play' : 'bet', ante: me?.bet ?? 0, hand: me?.cards ?? [],
      house: live && s.house.length ? [s.house[0], null] : s.house, total: mt?.t ?? 0, soft: !!mt?.soft,
      houseTotal: !live && ht ? ht.t : null, turn: s.turn >= 0 ? s.ps[s.turn]?.uid ?? '' : '',
      turnLeft: live ? Math.max(0, TURN_MS - (c.now - s.turnAt)) : 0, round: s.round, rounds: 0, res: me?.res ?? null,
      last: s.last, winner: s.winner, waiting: me?.st === 'wait', mine: me?.st ?? 'bet', ps: s.ps.map(seat) }
  },
  done(s) { return s.winner === null ? null : { winner: s.winner } },
  leave(s, who, c) {
    const i = s.ps.findIndex(p => p.uid === who); if (i < 0 || s.ps[i].out) return
    const p = s.ps[i]
    s.rnd = c.rnd
    if (s.phase === 'play' && p.cards.length && p.bet > 0 && p.st !== 'wait') {
      const was = s.turn === i && p.st === 'play'
      s.owed.push({ uid: p.uid, cards: p.cards.slice(), bet: p.bet })
      s.ps.splice(i, 1)
      s.last = { k: 'out', who, at: c.now }
      if (was) {
        const n = nextPlay(s, i)
        if (n < 0) finish(s, c.now)
        else { s.turn = n; s.turnAt = c.now; s.seq++ }
      } else {
        if (i < s.turn) s.turn--
        s.seq++
      }
      return
    }
    if (s.phase === 'bet' && p.st === 'locked' && p.bet > 0) { s.pay.push({ uid: p.uid, delta: p.bet }); p.bet = 0 }
    s.ps.splice(i, 1)
    s.seq++; s.last = { k: 'out', who, at: c.now }
    if (!s.ps.length) s.winner = ''
  },
}
