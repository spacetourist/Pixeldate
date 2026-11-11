/* Letterbox (working name). Two players, server-authoritative, one quiet table.
   Race: one hidden answer, six guesses each, first correct guess wins. The other player sees colours only.
   Pick: each player sets a word for the other; fewer guesses wins. A tie, or both failing, is a draw.
   Guesses are checked against the allowed list. An idle player loses a guess when their clock runs out. */
import { ANSWER_TEXT, ALLOWED_TEXT } from '../words/words.ts'
import type { Game, Act, GameCtx } from './index.ts'
export const GUESS_MS = 30_000, ACT_GAP_MS = 400, GUESSES = 6, WORD = 5
export const ANTES = [0, 1, 5, 25, 100] as const
export type Mode = 'race' | 'pick'
export type Mark = 'correct' | 'present' | 'absent'
export interface Guess { w: string; marks: Mark[]; auto?: boolean }
export interface LbP { uid: string; out: boolean; away: boolean; seat: number; last: number; since: number
  choice: Mode | ''; chose: boolean; bet: number; locked: boolean; lastA: string
  set: string; target: string; guesses: Guess[]; solved: number; done: boolean }
export interface LbS { ps: LbP[]; seq: number; winner: string | null; phase: 'mode' | 'bet' | 'set' | 'play' | 'over'
  mode: Mode | ''; rig: string | null; rnd: (n: number) => number; pay: { uid: string; delta: number }[]
  last: { k: string; who: string; at: number } }
export interface LbV { g: 'letterbox'; seq: number; phase: LbS['phase']; mode: Mode | ''; choice: Mode | ''
  guesses: Guess[]; opp: { marks: Mark[]; w: string }[]; left: number; bet: number; locked: boolean; held: boolean
  reveal: string; set: string; solved: number; done: boolean; winner: string | null
  last: LbS['last']; ps: { uid: string; choice: Mode | ''; chose: boolean; locked: boolean; bet: number; n: number; solved: number; done: boolean; away: boolean; seat: number }[] }

const ANSWERS = ANSWER_TEXT.trim().split('\n')
const ALLOWED = new Set(ALLOWED_TEXT.trim().split('\n'))
const answers = new Set(ANSWERS)
export const wordCount = { answers: ANSWERS.length, allowed: ALLOWED.size }

const blank = (uid: string, seat: number): LbP => ({ uid, out: false, away: false, seat, last: -Infinity, since: 0,
  choice: '', chose: false, bet: 0, locked: false, lastA: '', set: '', target: '', guesses: [], solved: 0, done: false })
const clean = (w: unknown) => typeof w === 'string' ? w.trim().toLowerCase() : ''
/** green / yellow / grey, with duplicate letters only marked as many times as they occur in the answer */
export function mark(guess: string, answer: string): Mark[] {
  const res: Mark[] = Array(WORD).fill('absent')
  const left = answer.split('')
  for (let i = 0; i < WORD; i++) if (guess[i] === answer[i]) { res[i] = 'correct'; left[i] = '' }
  for (let i = 0; i < WORD; i++) if (res[i] !== 'correct') {
    const j = left.indexOf(guess[i]); if (j >= 0) { res[i] = 'present'; left[j] = '' }
  }
  return res
}
const playing = (s: LbS, who: string) => s.ps.findIndex(p => p.uid === who && !p.out)
function payWin(s: LbS, uid: string) {
  s.phase = 'over'; s.winner = uid
  if (!uid) { for (const p of s.ps) if (p.bet > 0) s.pay.push({ uid: p.uid, delta: p.bet }); return }
  const p = s.ps.find(x => x.uid === uid); if (p && p.bet > 0) s.pay.push({ uid, delta: p.bet * 2 })
}
function settle(s: LbS, whoJust: string) {
  if (s.phase !== 'play') return
  if (s.mode === 'race') {
    if (whoJust) { const p = s.ps.find(x => x.uid === whoJust); if (p?.solved) { payWin(s, p.uid); return } }
    if (s.ps.every(p => p.done)) payWin(s, '')
    return
  }
  if (!s.ps.every(p => p.done)) return
  const score = (p: LbP) => p.solved || GUESSES + 1
  const [a, b] = s.ps, sa = score(a), sb = score(b)
  payWin(s, sa < sb ? a.uid : sb < sa ? b.uid : '')
}
function begin(s: LbS, now: number) {
  if (s.mode === 'race') {
    const word = s.rig && answers.has(s.rig) ? s.rig : ANSWERS[s.rnd(ANSWERS.length)]
    for (const p of s.ps) { p.target = word; p.guesses = []; p.solved = 0; p.done = false; p.since = now }
    s.phase = 'play'
  } else {
    for (const p of s.ps) { p.set = ''; p.target = ''; p.guesses = []; p.solved = 0; p.done = false; p.since = now }
    s.phase = 'set'
  }
  s.seq++; s.last = { k: 'deal', who: '', at: now }
}
function openPlay(s: LbS, now: number) {
  const [a, b] = s.ps
  a.target = b.set; b.target = a.set
  for (const p of s.ps) { p.since = now; p.guesses = []; p.solved = 0; p.done = false }
  s.phase = 'play'; s.seq++; s.last = { k: 'deal', who: '', at: now }
}

export function rig(s: LbS, word: string) { s.rig = word }

export const Letterbox: Game<LbS, LbV> & {
  join(s: LbS, who: string, seat: number, c: { now: number }): string
  canBet(s: LbS, who: string, ante: unknown): string
  commit(s: LbS, who: string, ante: number, c: GameCtx): string
} = {
  start(players, c) {
    const s: LbS = { ps: [], seq: 1, winner: null, phase: 'mode', mode: '', rig: null, rnd: c.rnd, pay: [], last: { k: 'start', who: '', at: c.now } }
    players.forEach((uid, i) => this.join(s, uid, i, c))
    return s
  },
  join(s, who, seat, c) {
    if (s.ps.some(p => p.uid === who)) return ''
    if (s.ps.length >= 2) return 'full'
    if (s.phase === 'play' || s.phase === 'set' || s.phase === 'over') return 'waiting'
    s.ps.push(blank(who, seat)); s.ps.sort((a, b) => a.seat - b.seat)
    s.seq++; s.last = { k: 'join', who, at: c.now }
    return ''
  },
  canBet(s, who, ante) {
    if (s.winner !== null || s.phase === 'over') return 'over'
    const p = s.ps.find(x => x.uid === who); if (!p) return 'not-playing'
    if (s.phase !== 'bet') return s.phase === 'mode' ? 'mode' : 'in-round'
    if (p.locked) return 'in-round'
    if (!ANTES.includes(ante as 0)) return 'bad-ante'
    return ''
  },
  commit(s, who, ante, c) {
    const why = this.canBet(s, who, ante); if (why) return why
    const p = s.ps.find(x => x.uid === who)!
    p.bet = ante; p.locked = true; p.last = c.now
    s.seq++; s.last = { k: 'bet', who, at: c.now }
    if (s.ps.length >= 2 && s.ps.every(x => x.locked)) begin(s, c.now)
    return ''
  },
  act(s, who, act: Act, c) {
    if (s.phase === 'over') return act.a === 'again' ? this.again(s, who, c) : 'over'
    const i = playing(s, who); if (i < 0) return 'not-playing'
    const p = s.ps[i]
    if (act.a === 'bet') return 'bad-action'
    if (act.a !== 'mode' && act.a === p.lastA && c.now - p.last < ACT_GAP_MS) return 'slow-down'
    s.rnd = c.rnd
    if (act.a === 'mode') {
      if (s.phase !== 'mode') return 'in-round'
      if (act.w !== 'race' && act.w !== 'pick') return 'bad-mode'
      p.choice = act.w; p.chose = true; p.last = c.now; p.lastA = 'mode'
      s.seq++; s.last = { k: 'mode', who, at: c.now }
      if (s.ps.length >= 2 && s.ps.every(x => x.chose)) {
        if (s.ps[0].choice === s.ps[1].choice) { s.mode = s.ps[0].choice; s.phase = 'bet' }
        else { for (const x of s.ps) { x.choice = ''; x.chose = false } s.last = { k: 'differ', who, at: c.now } }
      }
      return ''
    }
    if (act.a === 'set') {
      if (s.phase !== 'set') return 'not-in-round'
      if (p.set) return 'in-round'
      const w = clean(act.w)
      if (w.length !== WORD) return 'short'
      if (!ALLOWED.has(w)) return 'bad-word'
      p.set = w; p.last = c.now; p.lastA = 'set'; s.seq++; s.last = { k: 'set', who, at: c.now }
      if (s.ps.every(x => x.set)) openPlay(s, c.now)
      return ''
    }
    if (act.a === 'guess') {
      if (s.phase !== 'play') return 'not-in-round'
      if (p.done) return 'over'
      const w = clean(act.w)
      if (w.length !== WORD) return 'short'
      if (!ALLOWED.has(w)) return 'bad-word'
      const marks = mark(w, p.target)
      p.guesses.push({ w, marks }); p.since = c.now; p.last = c.now; p.lastA = 'guess'
      if (marks.every(m => m === 'correct')) { p.solved = p.guesses.length; p.done = true }
      else if (p.guesses.length >= GUESSES) p.done = true
      s.seq++; s.last = { k: 'guess', who, at: c.now }
      settle(s, p.solved ? p.uid : '')
      return ''
    }
    if (act.a === 'again') return 'in-round'
    return 'bad-action'
  },
  again(s, who, c) {
    if (s.phase !== 'over') return 'in-round'
    if (playing(s, who) < 0) return 'not-playing'
    if (s.ps.length < 2) return 'need-two'
    s.winner = null; s.phase = 'mode'; s.mode = ''; s.rig = null
    for (const p of s.ps) Object.assign(p, { choice: '', chose: false, bet: 0, locked: false, lastA: '', set: '', target: '', guesses: [], solved: 0, done: false, since: 0 })
    s.seq++; s.last = { k: 'start', who, at: c.now }
    return ''
  },
  tick(s, c) {
    if (s.phase !== 'play') return false
    let changed = false
    for (const p of s.ps) {
      if (p.done || c.now - p.since < GUESS_MS) continue
      p.guesses.push({ w: '', marks: Array(WORD).fill('absent') as Mark[], auto: true })
      p.since = c.now
      if (p.guesses.length >= GUESSES) p.done = true
      changed = true
    }
    if (!changed) return false
    s.seq++; s.last = { k: 'auto', who: '', at: c.now }
    settle(s, '')
    return true
  },
  view(s, who, c) {
    const me = s.ps.find(p => p.uid === who), opp = s.ps.find(p => p.uid !== who)
    const hide = s.mode === 'race' && s.phase !== 'over'
    const row = (g: Guess, secret: boolean) => ({ marks: g.marks, w: secret ? '' : g.w })
    return { g: 'letterbox', seq: s.seq, phase: s.phase, mode: s.mode, choice: me?.choice ?? '',
      guesses: me?.guesses ?? [], opp: (opp?.guesses ?? []).map(g => row(g, hide)),
      left: s.phase === 'play' && me && !me.done ? Math.max(0, GUESS_MS - (c.now - me.since)) : 0,
      bet: me?.bet ?? 0, locked: !!me?.locked, held: !!me?.set && s.phase === 'set', reveal: s.phase === 'over' ? (me?.target ?? '') : '',
      set: s.phase === 'over' ? (me?.set ?? '') : '', solved: me?.solved ?? 0, done: !!me?.done,
      winner: s.winner, last: s.last,
      ps: s.ps.map(p => ({ uid: p.uid, choice: p.choice, chose: p.chose, locked: p.locked, bet: p.bet, n: p.guesses.length, solved: p.solved, done: p.done, away: p.away, seat: p.seat })) }
  },
  done(s) { return s.winner === null ? null : { winner: s.winner } },
  leave(s, who, c) {
    const i = s.ps.findIndex(p => p.uid === who); if (i < 0) return
    const p = s.ps[i]
    if (s.phase !== 'play' && p.locked && p.bet > 0) { s.pay.push({ uid: p.uid, delta: p.bet }); p.bet = 0 }
    s.ps.splice(i, 1)
    if (s.phase === 'play' && s.ps.length === 1) payWin(s, s.ps[0].uid)
    s.seq++; s.last = { k: 'out', who, at: c.now }
    if (!s.ps.length) s.winner = s.winner ?? ''
  },
}
