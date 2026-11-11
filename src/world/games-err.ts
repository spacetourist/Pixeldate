/** Games Lounge error lines (tiny, in the main chunk so the lazy panel isn't needed to say why) */
const ERR: Record<string, string> = { 'not-your-turn': 'Not your turn yet.', 'slow-down': 'Easy — one at a time.', locked: 'Too many wrong snaps: wait a moment.', few: 'Snap needs two at the table.',
  many: 'Snap is for two.', sit: 'Sit at a table first.', soon: 'Coming soon.', running: 'A game is already on at this table.',
  chips: 'Not enough coins for that.', 'bad-ante': 'Pick a coin amount, or play free.', waiting: "You're in on the next round.", 'no-double': 'Double is only on your first two cards.', 'in-round': 'That round has already started.', full: 'Every seat at this table is taken.',
  'one-side': 'Only one side card each turn.', 'bad-card': 'That side card is gone.', 'bad-sign': 'Choose plus or minus for that card.', over: 'That match is over.', 'need-two': 'Sweet Twenty needs two at the table.',
  'bad-word': 'That is not in the word list.', short: 'Five letters.', 'bad-mode': 'Pick Race or Pick for me.', mode: 'Pick a mode first.', differ: 'Pick the same mode.' }
export const gameErr = (why: string) => ERR[why] ?? ''
