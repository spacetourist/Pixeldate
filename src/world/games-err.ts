/** Games Lounge error lines (tiny, in the main chunk so the lazy panel isn't needed to say why) */
const ERR: Record<string, string> = { 'not-your-turn': 'Not your turn yet.', 'slow-down': 'Easy — one at a time.', locked: 'Too many wrong snaps: wait a moment.', few: 'Snap needs two at the table.',
  many: 'Snap is for two.', sit: 'Sit at a table first.', soon: 'Coming soon.', running: 'A game is already on at this table.',
  chips: 'Not enough coins for that.', 'bad-ante': 'Pick 1, 5, 25 or 100.', waiting: "You're in on the next round.", 'no-double': 'Double is only on your first two cards.', 'in-round': 'That round has already started.', full: 'Every seat at this table is taken.' }
export const gameErr = (why: string) => ERR[why] ?? ''
