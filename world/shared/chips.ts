/** Games Lounge play chips: one server-side wallet per player (by uid) for the whole lounge, every table and instance.
    Play money only: chips are never bought and never cashed out. Everyone starts with CHIPS_START; once a day, a wallet
    under CHIPS_LOW is topped back up to CHIPS_START for free. Separate from the pair familiarity level (that's PairRec);
    nothing here reads or writes it. `items` is room for a later shop of fun in-game items (not built). */
export const CHIPS_START = 1000, CHIPS_LOW = 100, CHIPS_MAX = 1_000_000
export interface Wallet { bal: number; top: string; items?: string[] }
export const newWallet = (): Wallet => ({ bal: CHIPS_START, top: '' })
const day = (now: number) => new Date(now).toISOString().slice(0, 10)
/** the daily top-up, applied whenever the wallet is read; returns whether it topped up */
export function topUp(w: Wallet, now: number): boolean {
  if (w.bal >= CHIPS_LOW || w.top === day(now)) return false
  w.bal = CHIPS_START; w.top = day(now); return true
}
/** a play-chip move (a bet or a payout from a game): never below 0; false = not enough chips */
export function move(w: Wallet, delta: number): boolean {
  if (!Number.isInteger(delta)) return false
  if (w.bal + delta < 0) return false
  w.bal = Math.min(CHIPS_MAX, w.bal + delta); return true
}
/** what the UI calls the currency: one place, because the name isn't settled (play chips, Tokens or Sparks). The chip
    art (digits 1 5 25 100, cream / coral / butter / mint) stays whatever it's called. */
export const CHIPS_NAME = 'coins'
