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
export const LOBBY_SLOTS = 2
export const FULL_PHOTO_PX = 512
