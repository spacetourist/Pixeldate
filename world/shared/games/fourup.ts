/* Four Up. Two players, 7×6 grid, server-authoritative. Pieces drop to the lowest open cell.
   Four in a line wins and the winning cells are sent with the view. A full board is a draw.
   An idle turn drops in the first open column. Optional coins, same as the other tables. */
import type { Game, Act, GameCtx } from './index.ts'
export const COLS = 7, ROWS = 6, NEED = 4, TURN_MS = 10_000, ACT_GAP_MS = 250
export const ANTES = [0, 1, 5, 25, 100] as const
export type Cell = 0 | 1 | 2
export interface FuP { uid: string; out: boolean; away: boolean; seat: number; last: number; bet: number; locked: boolean; n: 1 | 2 }
export interface FuS { ps: FuP[]; seq: number; winner: string | null; phase: 'bet' | 'play' | 'over'
  board: Cell[][]; turn: number; turnAt: number; line: [number, number][] | null; lastDrop: { c: number; r: number; n: number } | null
  pay: { uid: string; delta: number }[]; last: { k: string; who: string; at: number } }
export interface FuV { g: 'fourup'; seq: number; phase: FuS['phase']; board: Cell[][]; turn: string; turnLeft: number
  line: [number, number][] | null; lastDrop: FuS['lastDrop']; piece: number; bet: number; locked: boolean; winner: string | null
  last: FuS['last']; ps: { uid: string; n: number; bet: number; locked: boolean; away: boolean; seat: number }[] }

const empty = (): Cell[][] => Array.from({ length: ROWS }, () => Array(COLS).fill(0) as Cell[])
const blank = (uid: string, seat: number, n: 1 | 2): FuP => ({ uid, out: false, away: false, seat, last: -Infinity, bet: 0, locked: false, n })
const playing = (s: FuS, who: string) => s.ps.findIndex(p => p.uid === who && !p.out)

export function dropAt(board: Cell[][], col: number): number {
  if (col < 0 || col >= COLS) return -1
  for (let r = ROWS - 1; r >= 0; r--) if (board[r][col] === 0) return r
  return -1
}
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]] as const
/** four connected cells through (r, c), or null */
export function lineAt(board: Cell[][], r: number, c: number): [number, number][] | null {
  const id = board[r][c]; if (!id) return null
  for (const [dr, dc] of DIRS) {
    const cells: [number, number][] = [[r, c]]
    for (const s of [1, -1]) for (let k = 1; k < NEED; k++) {
      const rr = r + dr * k * s, cc = c + dc * k * s
      if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS || board[rr][cc] !== id) break
      cells.push([rr, cc])
    }
    if (cells.length >= NEED) return cells.slice(0, NEED)
  }
  return null
}
const full = (board: Cell[][]) => board[0].every(c => c !== 0)
function finish(s: FuS, uid: string, now: number, k: string) {
  s.phase = 'over'; s.winner = uid; s.turn = -1
  s.seq++; s.last = { k, who: uid, at: now }
  if (!uid) { for (const p of s.ps) if (p.bet > 0) s.pay.push({ uid: p.uid, delta: p.bet }); return }
  const p = s.ps.find(x => x.uid === uid); if (p && p.bet > 0) s.pay.push({ uid, delta: p.bet * 2 })
}
function place(s: FuS, col: number, now: number, how: 'drop' | 'auto') {
  const i = s.turn, p = s.ps[i], r = dropAt(s.board, col); if (r < 0 || !p) return false
  s.board[r][col] = p.n; s.lastDrop = { c: col, r, n: p.n }
  const line = lineAt(s.board, r, col)
  if (line) { s.line = line; finish(s, p.uid, now, how); return true }
  if (full(s.board)) { finish(s, '', now, 'draw'); return true }
  s.turn = 1 - i; s.turnAt = now; s.seq++; s.last = { k: how, who: p.uid, at: now }
  return true
}

export const FourUp: Game<FuS, FuV> & {
  join(s: FuS, who: string, seat: number, c: { now: number }): string
  canBet(s: FuS, who: string, ante: unknown): string
  commit(s: FuS, who: string, ante: number, c: GameCtx): string
} = {
  start(players, c) {
    const s: FuS = { ps: [], seq: 1, winner: null, phase: 'bet', board: empty(), turn: 0, turnAt: c.now, line: null, lastDrop: null, pay: [], last: { k: 'start', who: '', at: c.now } }
    players.forEach((uid, i) => this.join(s, uid, i, c))
    return s
  },
  join(s, who, seat, c) {
    if (s.ps.some(p => p.uid === who)) return ''
    if (s.ps.length >= 2) return 'full'
    if (s.phase === 'play' || s.phase === 'over') return 'waiting'
    s.ps.push(blank(who, seat, (s.ps.length + 1) as 1 | 2)); s.ps.sort((a, b) => a.seat - b.seat)
    s.ps.forEach((p, i) => { p.n = (i + 1) as 1 | 2 })
    s.seq++; s.last = { k: 'join', who, at: c.now }
    return ''
  },
  canBet(s, who, ante) {
    if (s.winner !== null || s.phase === 'over') return 'over'
    const p = s.ps.find(x => x.uid === who); if (!p) return 'not-playing'
    if (s.phase !== 'bet') return 'in-round'
    if (p.locked) return 'in-round'
    if (!ANTES.includes(ante as 0)) return 'bad-ante'
    return ''
  },
  commit(s, who, ante, c) {
    const why = this.canBet(s, who, ante); if (why) return why
    const p = s.ps.find(x => x.uid === who)!
    p.bet = ante; p.locked = true
    s.seq++; s.last = { k: 'bet', who, at: c.now }
    if (s.ps.length >= 2 && s.ps.every(x => x.locked)) { s.phase = 'play'; s.turn = 0; s.turnAt = c.now; s.board = empty() }
    return ''
  },
  act(s, who, act: Act, c) {
    if (s.phase === 'over') return act.a === 'again' ? this.again(s, who, c) : 'over'
    const i = playing(s, who); if (i < 0) return 'not-playing'
    const p = s.ps[i]
    if (act.a === 'bet') return 'bad-action'
    if (act.a === 'again') return 'in-round'
    if (act.a !== 'drop') return 'bad-action'
    if (s.phase !== 'play') return 'not-in-round'
    if (s.turn !== i) return 'not-your-turn'
    if (c.now - p.last < ACT_GAP_MS) return 'slow-down'
    const col = act.i; if (typeof col !== 'number' || dropAt(s.board, col) < 0) return 'bad-col'
    p.last = c.now
    place(s, col, c.now, 'drop')
    return ''
  },
  again(s, who, c) {
    if (s.phase !== 'over') return 'in-round'
    if (playing(s, who) < 0) return 'not-playing'
    if (s.ps.length < 2) return 'need-two'
    s.winner = null; s.phase = 'bet'; s.board = empty(); s.line = null; s.lastDrop = null; s.turn = 0
    for (const p of s.ps) { p.bet = 0; p.locked = false }
    s.seq++; s.last = { k: 'start', who, at: c.now }
    return ''
  },
  tick(s, c) {
    if (s.phase !== 'play' || s.turn < 0) return false
    if (c.now - s.turnAt < TURN_MS) return false
    const col = s.board[0].findIndex((_, c0) => dropAt(s.board, c0) >= 0)
    if (col < 0) return false
    place(s, col, c.now, 'auto')
    return true
  },
  view(s, who, c) {
    const me = s.ps.find(p => p.uid === who)
    return { g: 'fourup', seq: s.seq, phase: s.phase, board: s.board, turn: s.turn >= 0 ? s.ps[s.turn]?.uid ?? '' : '',
      turnLeft: s.phase === 'play' ? Math.max(0, TURN_MS - (c.now - s.turnAt)) : 0, line: s.line, lastDrop: s.lastDrop,
      piece: me?.n ?? 0, bet: me?.bet ?? 0, locked: !!me?.locked, winner: s.winner, last: s.last,
      ps: s.ps.map(p => ({ uid: p.uid, n: p.n, bet: p.bet, locked: p.locked, away: p.away, seat: p.seat })) }
  },
  done(s) { return s.winner === null ? null : { winner: s.winner } },
  leave(s, who, c) {
    const i = s.ps.findIndex(p => p.uid === who); if (i < 0) return
    const p = s.ps[i]
    if (s.phase === 'bet' && p.locked && p.bet > 0) { s.pay.push({ uid: p.uid, delta: p.bet }); p.bet = 0 }
    s.ps.splice(i, 1)
    if (s.phase === 'play' && s.ps.length === 1) finish(s, s.ps[0].uid, c.now, 'out')
    else { if (s.turn === i) s.turn = s.ps.length ? 0 : -1; else if (i < s.turn) s.turn--; s.seq++; s.last = { k: 'out', who, at: c.now } }
    if (!s.ps.length && s.winner === null) s.winner = ''
  },
}
