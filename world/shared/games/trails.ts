/* Trails. 2–4 light cycles on a grid. The server steps at 15 Hz (STEP ms), the low end of 15–20 Hz.
   Measured from this VM to the live worker's /ping (40 HTTP samples, 20 socket pings):
   HTTP p50 35.4 ms, p95 123.6 ms; socket p50 91.8 ms, p95 99.4 ms; room tick p50/p95 100 ms.
   A 15 Hz step is shorter than the socket p95, so the client interpolates across that delay.
   The room itself still ticks every 100 ms; each call catches up.
   Last bike alive wins the round. First to 3 rounds wins. Driving straight into a wall is the idle outcome. */
import type { Game, Act, GameCtx } from './index.ts'
export const HZ = 15, STEP = 1000 / HZ, ROUNDS = 3, LOBBY_MS = 8_000
export const GW = 28, GH = 18
export const ANTES = [0, 1, 5, 25, 100] as const
export type Dir = 'up' | 'down' | 'left' | 'right'
const VEC: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const OPP: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }
const STARTS: { x: number; y: number; d: Dir }[] = [
  { x: 3, y: 9, d: 'right' }, { x: 24, y: 9, d: 'left' }, { x: 14, y: 2, d: 'down' }, { x: 14, y: 15, d: 'up' },
]
export interface TrP { uid: string; out: boolean; away: boolean; seat: number; n: number; bet: number; locked: boolean
  x: number; y: number; d: Dir; q: Dir | ''; alive: boolean; rounds: number; last: number }
export interface TrS { ps: TrP[]; seq: number; winner: string | null; phase: 'bet' | 'play' | 'over'
  occ: number[][]; simAt: number; lobbyAt: number; round: number; pay: { uid: string; delta: number }[]
  last: { k: string; who: string; at: number } }
export interface TrV { g: 'trails'; seq: number; phase: TrS['phase']; round: number; step: number; hz: number
  grid: number[]; w: number; h: number; bet: number; locked: boolean; winner: string | null; last: TrS['last']
  bikes: { uid: string; n: number; x: number; y: number; d: Dir; alive: boolean; rounds: number; away: boolean; seat: number; bet: number; locked: boolean }[] }

const blankOcc = () => Array.from({ length: GH }, () => Array(GW).fill(0))
const blank = (uid: string, seat: number, n: number): TrP => ({ uid, out: false, away: false, seat, n, bet: 0, locked: false, x: 0, y: 0, d: 'right', q: '', alive: false, rounds: 0, last: -Infinity })
const playing = (s: TrS, who: string) => s.ps.findIndex(p => p.uid === who && !p.out)
function paint(s: TrS) {
  s.occ = blankOcc()
  s.ps.forEach((p, i) => {
    const st = STARTS[i]; p.x = st.x; p.y = st.y; p.d = st.d; p.q = ''; p.alive = true
    s.occ[p.y][p.x] = p.n
  })
}
function pay(s: TrS, uid: string, now: number) {
  s.phase = 'over'; s.winner = uid
  s.seq++; s.last = { k: 'over', who: uid, at: now }
  if (!uid) { for (const p of s.ps) if (p.bet > 0) s.pay.push({ uid: p.uid, delta: p.bet }); return }
  const p = s.ps.find(x => x.uid === uid); if (p && p.bet > 0) s.pay.push({ uid, delta: p.bet * 2 })
}
function award(s: TrS, p: TrP | null, now: number) {
  if (p) { p.rounds++; s.last = { k: 'round', who: p.uid, at: now }; if (p.rounds >= ROUNDS) { pay(s, p.uid, now); return } }
  else s.last = { k: 'draw', who: '', at: now }
  s.round++; paint(s); s.seq++
}
function step(s: TrS, now: number) {
  const live = s.ps.filter(p => p.alive)
  for (const p of live) if (p.q && p.q !== OPP[p.d]) p.d = p.q
  for (const p of live) p.q = ''
  const moves = live.map(p => { const [dx, dy] = VEC[p.d]; return { p, x: p.x + dx, y: p.y + dy } })
  const dead = new Set<TrP>()
  const at = new Map<string, TrP[]>()
  for (const m of moves) {
    if (m.x < 0 || m.y < 0 || m.x >= GW || m.y >= GH || s.occ[m.y][m.x]) dead.add(m.p)
    else { const k = m.x + ',' + m.y; const list = at.get(k) ?? []; list.push(m.p); at.set(k, list) }
  }
  for (const list of at.values()) if (list.length > 1) for (const p of list) dead.add(p)
  for (const m of moves) if (!dead.has(m.p)) { m.p.x = m.x; m.p.y = m.y; s.occ[m.y][m.x] = m.p.n }
  for (const p of dead) p.alive = false
  const left = s.ps.filter(p => p.alive)
  if (left.length === 1) award(s, left[0], now)
  else if (left.length === 0 && s.ps.length) award(s, null, now)
  else { s.seq++; s.last = { k: 'step', who: '', at: now } }
}

export const Trails: Game<TrS, TrV> & {
  join(s: TrS, who: string, seat: number, c: { now: number }): string
  canBet(s: TrS, who: string, ante: unknown): string
  commit(s: TrS, who: string, ante: number, c: GameCtx): string
} = {
  start(players, c) {
    const s: TrS = { ps: [], seq: 1, winner: null, phase: 'bet', occ: blankOcc(), simAt: c.now, lobbyAt: c.now, round: 1, pay: [], last: { k: 'start', who: '', at: c.now } }
    players.forEach((uid, i) => this.join(s, uid, i, c))
    return s
  },
  join(s, who, seat, c) {
    if (s.ps.some(p => p.uid === who)) return ''
    if (s.ps.length >= 4) return 'full'
    if (s.phase !== 'bet') return 'waiting'
    s.ps.push(blank(who, seat, s.ps.length + 1)); s.ps.sort((a, b) => a.seat - b.seat)
    s.ps.forEach((p, i) => { p.n = i + 1 })
    if (s.ps.length === 2) s.lobbyAt = c.now
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
    if (s.ps.length >= 2 && s.ps.every(x => x.locked)) { s.phase = 'play'; s.round = 1; s.simAt = c.now; paint(s) }
    return ''
  },
  act(s, who, act: Act, c) {
    if (s.phase === 'over') return act.a === 'again' ? this.again(s, who, c) : 'over'
    const i = playing(s, who); if (i < 0) return 'not-playing'
    if (act.a === 'bet') return 'bad-action'
    if (act.a === 'again') return 'in-round'
    if (act.a !== 'turn') return 'bad-action'
    if (s.phase !== 'play') return 'not-in-round'
    const d = act.d; if (d !== 'up' && d !== 'down' && d !== 'left' && d !== 'right') return 'bad-turn'
    const p = s.ps[i]; if (!p.alive) return 'over'
    if (d === OPP[p.d]) return ''
    p.q = d; p.last = c.now
    return ''
  },
  again(s, who, c) {
    if (s.phase !== 'over') return 'in-round'
    if (playing(s, who) < 0) return 'not-playing'
    if (s.ps.length < 2) return 'need-two'
    s.winner = null; s.phase = 'bet'; s.round = 1; s.occ = blankOcc()
    for (const p of s.ps) { p.bet = 0; p.locked = false; p.rounds = 0; p.alive = false; p.q = '' }
    s.seq++; s.last = { k: 'start', who, at: c.now }
    return ''
  },
  tick(s, c) {
    if (s.phase === 'bet') {
      if (s.ps.length < 2 || c.now - s.lobbyAt < LOBBY_MS) return false
      let changed = false
      for (const p of s.ps) if (!p.locked) { p.locked = true; p.bet = 0; changed = true }
      if (s.ps.every(p => p.locked)) { s.phase = 'play'; s.round = 1; s.simAt = c.now; paint(s); s.seq++; s.last = { k: 'auto', who: '', at: c.now }; return true }
      return changed
    }
    if (s.phase !== 'play') return false
    let moved = false
    let guard = 0
    while (c.now - s.simAt >= STEP && s.phase === 'play' && guard++ < 4) { s.simAt += STEP; step(s, c.now); moved = true }
    if (c.now - s.simAt > STEP * 4) s.simAt = c.now
    return moved
  },
  view(s, who) {
    const me = s.ps.find(p => p.uid === who)
    return { g: 'trails', seq: s.seq, phase: s.phase, round: s.round, step: STEP, hz: HZ,
      grid: s.occ.flat(), w: GW, h: GH, bet: me?.bet ?? 0, locked: !!me?.locked, winner: s.winner, last: s.last,
      bikes: s.ps.map(p => ({ uid: p.uid, n: p.n, x: p.x, y: p.y, d: p.d, alive: p.alive, rounds: p.rounds, away: p.away, seat: p.seat, bet: p.bet, locked: p.locked })) }
  },
  done(s) { return s.winner === null ? null : { winner: s.winner } },
  leave(s, who, c) {
    const i = s.ps.findIndex(p => p.uid === who); if (i < 0) return
    const p = s.ps[i]
    if (s.phase !== 'play' && p.locked && p.bet > 0) { s.pay.push({ uid: p.uid, delta: p.bet }); p.bet = 0 }
    if (p.alive && p.y >= 0 && s.occ[p.y]) s.occ[p.y][p.x] = p.n
    s.ps.splice(i, 1)
    const left = s.ps.filter(x => x.alive)
    if (s.phase === 'play' && left.length <= 1) pay(s, left[0]?.uid ?? '', c.now)
    else { s.seq++; s.last = { k: 'out', who, at: c.now } }
    if (!s.ps.length && s.winner === null) s.winner = ''
  },
}
