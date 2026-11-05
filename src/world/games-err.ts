/** Games Lounge error lines (tiny, in the main chunk so the lazy panel isn't needed to say why) */
const ERR: Record<string, string> = { 'not-your-turn': 'Not your turn yet.', 'slow-down': 'Easy — one snap at a time.', locked: 'Too many wrong snaps: wait a moment.', few: 'Snap needs two at the table.',
  many: 'Snap is for two.', sit: 'Sit at a table first.', soon: 'Coming soon.', running: 'A game is already on at this table.' }
export const gameErr = (why: string) => ERR[why] ?? ''
