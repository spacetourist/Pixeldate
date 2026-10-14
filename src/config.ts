export const VERSION = 'v0.1'
export const LEVELS = [
  { n: 1, name: 'Stranger', blocks: 8 },
  { n: 2, name: 'Spark', blocks: 16 },
  { n: 3, name: 'Crush', blocks: 32 },
  { n: 4, name: 'Close', blocks: 64 },
  { n: 5, name: 'Crystal clear', blocks: 0 }, // 0 = full quality
]
/** Meter tuning: time together fills slowly; each card BOTH answer adds cardBonus %. */
export const METER = { percentPerMinute: 4, cardBonus: 20 }
export const REVEAL_MS = 600
/** Dev phase: 'Skip to next level' request (needs the other person's accept). Set false to remove. */
export const DEV_SKIP_STAGE = true
export const LOBBY_SLOTS = 3
export const FULL_PHOTO_PX = 512
