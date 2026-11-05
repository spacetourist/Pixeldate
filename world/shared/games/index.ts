/* Games Lounge: the table games. The Room (Durable Object) is the only authority: it owns each game's state, shuffles
   with crypto, runs the turn clock and sends every player their own view. A game is a pure module behind this
   interface, so Blackjack (house dealer, free chips) and Pong slot in as new entries without touching the Room.
   Play money only, nothing is ever bought or paid out. */
export type GameId = 'snap' | 'blackjack'
export interface GameInfo { id: GameId; title: string; min: number; max: number; ready: boolean; blurb: string }
export const GAMES: Record<GameId, GameInfo> = {
  snap: { id: 'snap', title: 'Snap', min: 2, max: 2, ready: true, blurb: 'Flip in turn. Two of a rank in a row: first to snap takes the pile.' },
  // Each player sits at a blackjack table and plays their own hand against the House, for coins.
  // No arcade games in v1. The table opens when you sit down (there is no separate Start).
  blackjack: { id: 'blackjack', title: 'Blackjack', min: 1, max: 5, ready: true, blurb: 'Your own hand against the House, for coins.' },
}
/** What a game module gives the Room. `now` is passed in (tests use a fake clock); `rnd(n)` is a uniform 0..n-1 from crypto. */
export interface GameCtx { now: number; rnd: (n: number) => number }
export type Act = { a: string; [k: string]: unknown }
export interface Game<S, V> {
  start(players: string[], c: GameCtx): S
  /** a player's action; returns an error code for the sender, or '' when it was applied */
  act(s: S, who: string, act: Act, c: GameCtx): string
  /** the clock: timeouts. Returns true when something changed. */
  tick(s: S, c: GameCtx): boolean
  view(s: S, who: string, c: GameCtx): V
  /** set once the game is over: the winner's uid, or '' for a draw */
  done(s: S): { winner: string } | null
  /** a player left for good (stood up, timed out of a reconnect) */
  leave(s: S, who: string, c: GameCtx): void
}
/** uniform integer 0..n-1 from crypto.getRandomValues, rejection-sampled so there's no modulo bias */
export function cryptoRnd(n: number) {
  const lim = Math.floor(0x100000000 / n) * n, b = new Uint32Array(1)
  for (;;) { crypto.getRandomValues(b); if (b[0] < lim) return b[0] % n }
}
/** Fisher-Yates in place */
export function shuffle<T>(a: T[], rnd: (n: number) => number) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]] } return a }
