/* Board games: chess (chess.js, MIT) and English draughts, one table, chosen when you sit.
   The server checks every move. No coins. A clock (off, 5+0, 10+0) is chosen with the game.
   Swap: the client draws the board (src/world/board-table.tsx). This module is rules only. */
import { Chess, type Move } from 'chess.js'
import type { Game, Act, GameCtx } from './index.ts'

export const AFK_MS = 60_000
export const CLOCKS = { off: 0, '5': 5 * 60_000, '10': 10 * 60_000 } as const
export type Kind = 'chess' | 'draughts'
export type ClockId = keyof typeof CLOCKS
type Side = 'w' | 'b'
/** draughts: 1 white man, 2 white king, -1 black man, -2 black king */
type Cell = 0 | 1 | 2 | -1 | -2

export interface BdP { uid: string; out: boolean; away: boolean; seat: number; color: Side | ''; pick: Kind | ''; clock: ClockId | '' }
export interface BdS {
  ps: BdP[]; seq: number; winner: string | null; phase: 'pick' | 'play' | 'over'
  kind: Kind | ''; clock: ClockId | ''; turn: Side; turnAt: number; wMs: number; bMs: number
  board: Cell[][]; chain: string; lastFrom: string; lastTo: string
  offer: string; chess: Chess | null
  last: { k: string; who: string; at: number }
}
export interface BdMove { from: string; to: string; promo?: boolean }
export interface BdV {
  g: 'board'; seq: number; phase: BdS['phase']; kind: Kind | ''; clock: ClockId | ''; turn: string
  turnLeft: number; wMs: number; bMs: number; color: Side | ''; board: Cell[][]; fen: string
  legal: BdMove[]; lastFrom: string; lastTo: string; chain: string; offer: string
  mine: Kind | ''; myClock: ClockId | ''; winner: string | null
  last: BdS['last']; ps: { uid: string; color: Side | ''; pick: Kind | ''; clock: ClockId | ''; away: boolean; seat: number }[]
}

const FILES = 'abcdefgh'
const sq = (r: number, c: number) => FILES[c] + String(8 - r)
const rc = (s: string): [number, number] | null => {
  if (s.length !== 2) return null
  const c = FILES.indexOf(s[0]), rank = Number(s[1])
  if (c < 0 || rank < 1 || rank > 8) return null
  return [8 - rank, c]
}
const dark = (r: number, c: number) => (r + c) % 2 === 1
const sideOf = (v: Cell): 1 | -1 | 0 => v > 0 ? 1 : v < 0 ? -1 : 0
const king = (v: Cell) => v === 2 || v === -2
const emptyBoard = (): Cell[][] => Array.from({ length: 8 }, () => Array(8).fill(0) as Cell[])

function startDraughts(): Cell[][] {
  const b = emptyBoard()
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (dark(r, c)) {
    if (r <= 2) b[r][c] = -1
    else if (r >= 5) b[r][c] = 1
  }
  return b
}

interface Hop { r: number; c: number; cr: number; cc: number }
function hops(b: Cell[][], r: number, c: number): Hop[] {
  const v = b[r][c]; if (!v) return []
  const dirs = king(v) ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : (v > 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]])
  const out: Hop[] = []
  for (const [dr, dc] of dirs) {
    const mr = r + dr, mc = c + dc, tr = r + dr * 2, tc = c + dc * 2
    if (tr < 0 || tc < 0 || tr > 7 || tc > 7) continue
    const mid = b[mr][mc]
    if (mid && sideOf(mid) === -sideOf(v) && b[tr][tc] === 0) out.push({ r: tr, c: tc, cr: mr, cc: mc })
  }
  return out
}
function steps(b: Cell[][], r: number, c: number): [number, number][] {
  const v = b[r][c]; if (!v || king(v) === false && hops(b, r, c).length) return []
  if (hops(b, r, c).length) return []
  const dirs = king(v) ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : (v > 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]])
  const out: [number, number][] = []
  for (const [dr, dc] of dirs) {
    const tr = r + dr, tc = c + dc
    if (tr < 0 || tc < 0 || tr > 7 || tc > 7) continue
    if (b[tr][tc] === 0) out.push([tr, tc])
  }
  return out
}
function anyHop(b: Cell[][], side: 1 | -1) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (sideOf(b[r][c]) === side && hops(b, r, c).length) return true
  return false
}
function draughtsMoves(s: BdS, side: 1 | -1): BdMove[] {
  const out: BdMove[] = []
  const must = s.chain ? rc(s.chain) : null
  const forced = !!s.chain || anyHop(s.board, side)
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (sideOf(s.board[r][c]) !== side) continue
    if (must && (must[0] !== r || must[1] !== c)) continue
    if (forced) for (const h of hops(s.board, r, c)) out.push({ from: sq(r, c), to: sq(h.r, h.c) })
    else if (!s.chain) for (const [tr, tc] of steps(s.board, r, c)) out.push({ from: sq(r, c), to: sq(tr, tc) })
  }
  return out
}

function chessMoves(ch: Chess): BdMove[] {
  const seen = new Map<string, BdMove>()
  for (const m of ch.moves({ verbose: true }) as Move[]) {
    const k = m.from + m.to
    const prev = seen.get(k)
    seen.set(k, { from: m.from, to: m.to, promo: prev?.promo || m.flags.includes('p') })
  }
  return [...seen.values()]
}

const blank = (uid: string, seat: number): BdP => ({ uid, out: false, away: false, seat, color: '', pick: '', clock: '' })
const clockMs = (id: ClockId) => CLOCKS[id]

function lose(s: BdS, who: string, now: number, k: string) {
  const opp = s.ps.find(p => p.uid !== who && !p.out)
  s.phase = 'over'; s.winner = opp?.uid ?? ''; s.turnAt = now
  s.seq++; s.last = { k, who, at: now }
}
function draw(s: BdS, now: number, k: string) {
  s.phase = 'over'; s.winner = ''; s.seq++; s.last = { k, who: '', at: now }
}
function begin(s: BdS, now: number) {
  const [a, b] = [...s.ps].sort((x, y) => x.seat - y.seat)
  a.color = 'w'; b.color = 'b'
  s.kind = a.pick as Kind; s.clock = a.clock as ClockId
  s.phase = 'play'; s.turn = 'w'; s.turnAt = now; s.chain = ''; s.offer = ''
  s.wMs = clockMs(s.clock); s.bMs = s.wMs
  if (s.kind === 'chess') s.chess = new Chess()
  else { s.board = startDraughts(); s.chess = null }
  s.seq++; s.last = { k: 'start', who: '', at: now }
}
function spend(s: BdS, now: number) {
  if (s.clock === 'off' || s.clock === '') return
  const used = Math.max(0, now - s.turnAt)
  if (s.turn === 'w') s.wMs = Math.max(0, s.wMs - used)
  else s.bMs = Math.max(0, s.bMs - used)
}
function left(s: BdS, now: number) {
  if (s.phase !== 'play') return 0
  if (s.clock === 'off' || s.clock === '') return Math.max(0, AFK_MS - (now - s.turnAt))
  const bank = s.turn === 'w' ? s.wMs : s.bMs
  return Math.max(0, bank - (now - s.turnAt))
}

function playChess(s: BdS, from: string, to: string, promo: string, now: number): string {
  const ch = s.chess; if (!ch) return 'bad'
  const choices = (ch.moves({ verbose: true }) as Move[]).filter(m => m.from === from && m.to === to)
  if (!choices.length) return 'illegal'
  const promoting = choices.some(m => m.promotion)
  if (promoting && (promo !== 'q' && promo !== 'r' && promo !== 'b' && promo !== 'n')) return 'promo'
  let m: Move
  try { m = promoting ? ch.move({ from, to, promotion: promo as 'q' }) : ch.move({ from, to }) } catch { return 'illegal' }
  s.lastFrom = from; s.lastTo = to
  const mate = ch.isCheckmate(), check = ch.isCheck(), drawG = ch.isDraw()
  const k = mate ? 'mate' : check ? 'check' : m.captured ? 'capture' : 'move'
  if (mate) { const who = s.ps.find(p => p.color === s.turn)!.uid; s.phase = 'over'; s.winner = who; s.seq++; s.last = { k, who, at: now }; return '' }
  if (drawG) { draw(s, now, ch.isStalemate() ? 'stalemate' : 'draw'); return '' }
  s.turn = ch.turn() === 'w' ? 'w' : 'b'; s.turnAt = now; s.seq++; s.last = { k, who: s.ps.find(p => p.color !== s.turn)!.uid, at: now }
  return ''
}

function playDraughts(s: BdS, from: string, to: string, now: number): string {
  const side: 1 | -1 = s.turn === 'w' ? 1 : -1
  const legal = draughtsMoves(s, side)
  if (!legal.some(m => m.from === from && m.to === to)) return anyHop(s.board, side) || s.chain ? 'must-take' : 'illegal'
  const a = rc(from), b = rc(to); if (!a || !b) return 'illegal'
  const [r, c] = a, [tr, tc] = b
  const v = s.board[r][c]
  const hop = hops(s.board, r, c).find(h => h.r === tr && h.c === tc)
  s.board[r][c] = 0
  let crowned = false
  let piece = v
  if (!king(v) && ((v > 0 && tr === 0) || (v < 0 && tr === 7))) { piece = (v > 0 ? 2 : -2) as Cell; crowned = true }
  s.board[tr][tc] = piece
  let captured = false
  if (hop) { s.board[hop.cr][hop.cc] = 0; captured = true }
  s.lastFrom = from; s.lastTo = to
  const more = captured && !crowned && hops(s.board, tr, tc).length > 0
  const who = s.ps.find(p => p.color === s.turn)!.uid
  if (more) {
    s.chain = sq(tr, tc); s.turnAt = now; s.seq++; s.last = { k: 'capture', who, at: now }
    return ''
  }
  s.chain = ''
  const opp: 1 | -1 = (side === 1 ? -1 : 1)
  const oppGone = !s.board.some(row => row.some(x => sideOf(x) === opp))
  s.turn = s.turn === 'w' ? 'b' : 'w'
  const oppMoves = draughtsMoves({ ...s, chain: '', turn: s.turn }, opp)
  if (oppGone || !oppMoves.length) { s.phase = 'over'; s.winner = who; s.seq++; s.last = { k: crowned ? 'crown' : captured ? 'capture' : 'move', who, at: now }; return '' }
  s.turnAt = now; s.seq++; s.last = { k: crowned ? 'crown' : captured ? 'capture' : 'move', who, at: now }
  return ''
}

export const Board: Game<BdS, BdV> & {
  join(s: BdS, who: string, seat: number, c: { now: number }): string
  /** tests: replace the draughts board and whose turn it is */
  rig(s: BdS, board: Cell[][], turn?: Side): void
  /** tests: load a chess position (white to move unless the fen says otherwise) */
  fen(s: BdS, fen: string): void
} = {
  start(players, c) {
    const s: BdS = {
      ps: [], seq: 1, winner: null, phase: 'pick', kind: '', clock: '', turn: 'w', turnAt: c.now,
      wMs: 0, bMs: 0, board: emptyBoard(), chain: '', lastFrom: '', lastTo: '', offer: '', chess: null,
      last: { k: 'start', who: '', at: c.now },
    }
    players.forEach((uid, i) => this.join(s, uid, i, c))
    return s
  },
  join(s, who, seat, c) {
    if (s.ps.some(p => p.uid === who)) return ''
    if (s.ps.length >= 2) return 'full'
    if (s.phase === 'play') return 'waiting'
    if (s.phase === 'over') return 'over'
    s.ps.push(blank(who, seat)); s.seq++; s.last = { k: 'join', who, at: c.now }
    return ''
  },
  rig(s, board, turn = 'w') { s.kind = 'draughts'; s.phase = 'play'; s.board = board; s.turn = turn; s.chain = ''; s.chess = null },
  fen(s, fen) { s.kind = 'chess'; s.phase = 'play'; s.chess = new Chess(fen); s.turn = s.chess.turn() === 'w' ? 'w' : 'b'; s.chain = '' },
  act(s, who, act, c) {
    if (s.winner !== null && s.phase === 'over') return 'over'
    const p = s.ps.find(x => x.uid === who); if (!p || p.out) return 'not-playing'
    const now = c.now
    if (act.a === 'pick') {
      if (s.phase !== 'pick') return 'in-round'
      const g = act.g, cl = act.c
      if (g !== 'chess' && g !== 'draughts') return 'bad-mode'
      if (cl !== 'off' && cl !== '5' && cl !== '10') return 'bad-clock'
      p.pick = g; p.clock = cl
      const other = s.ps.find(x => x.uid !== who)
      if (other?.pick && (other.pick !== p.pick || other.clock !== p.clock)) {
        p.pick = ''; p.clock = ''; other.pick = ''; other.clock = ''
        s.seq++; s.last = { k: 'differ', who, at: now }; return ''
      }
      s.seq++; s.last = { k: 'pick', who, at: now }
      if (s.ps.length === 2 && s.ps.every(x => x.pick && x.clock)) begin(s, now)
      return ''
    }
    if (s.phase !== 'play') return 'mode'
    if (p.color !== s.turn) return 'not-your-turn'
    if (act.a === 'resign') { lose(s, who, now, 'resign'); return '' }
    if (act.a === 'draw') {
      if (act.yes === true) {
        if (s.offer && s.offer !== who) { draw(s, now, 'draw'); return '' }
        return 'bad'
      }
      if (act.yes === false) { s.offer = ''; s.seq++; s.last = { k: 'decline', who, at: now }; return '' }
      s.offer = who; s.seq++; s.last = { k: 'offer', who, at: now }; return ''
    }
    if (act.a !== 'move') return 'bad'
    const from = typeof act.from === 'string' ? act.from : '', to = typeof act.to === 'string' ? act.to : ''
    const promo = typeof act.p === 'string' ? act.p : ''
    spend(s, now)
    const remain = s.clock === 'off' || s.clock === '' ? AFK_MS - (now - s.turnAt) : (s.turn === 'w' ? s.wMs : s.bMs)
    if (remain <= 0) { lose(s, who, now, 'time'); return '' }
    s.offer = ''
    const why = s.kind === 'chess' ? playChess(s, from, to, promo, now) : playDraughts(s, from, to, now)
    return why
  },
  tick(s, c) {
    if (s.phase !== 'play' || s.winner !== null) return false
    if (left(s, c.now) > 0) return false
    const who = s.ps.find(p => p.color === s.turn)?.uid ?? ''
    lose(s, who, c.now, 'time')
    return true
  },
  view(s, who, c) {
    const me = s.ps.find(p => p.uid === who)
    const side: 1 | -1 = s.turn === 'w' ? 1 : -1
    const legal = s.phase === 'play' && me?.color === s.turn
      ? (s.kind === 'chess' && s.chess ? chessMoves(s.chess) : s.kind === 'draughts' ? draughtsMoves(s, side) : [])
      : []
    return {
      g: 'board', seq: s.seq, phase: s.phase, kind: s.kind, clock: s.clock, turn: s.ps.find(p => p.color === s.turn)?.uid ?? '',
      turnLeft: left(s, c.now), wMs: s.wMs, bMs: s.bMs, color: me?.color ?? '', board: s.board, fen: s.chess?.fen() ?? '',
      legal, lastFrom: s.lastFrom, lastTo: s.lastTo, chain: s.chain, offer: s.offer,
      mine: me?.pick ?? '', myClock: me?.clock ?? '', winner: s.winner, last: s.last,
      ps: s.ps.map(p => ({ uid: p.uid, color: p.color, pick: p.pick, clock: p.clock, away: p.away, seat: p.seat })),
    }
  },
  done(s) { return s.phase === 'over' && s.winner !== null ? { winner: s.winner } : null },
  leave(s, who, c) {
    const p = s.ps.find(x => x.uid === who); if (!p) return
    p.out = true
    if (s.phase === 'play') lose(s, who, c.now, 'resign')
    else if (s.phase === 'pick') { s.ps = s.ps.filter(x => x.uid !== who); s.seq++; s.last = { k: 'leave', who, at: c.now } }
    else { s.seq++; s.last = { k: 'leave', who, at: c.now } }
  },
}
