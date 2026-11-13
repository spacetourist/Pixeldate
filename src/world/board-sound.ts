/** Sound hooks for the board-games table. No-ops until the audio lands.
    Swap: play the clip for each kind here. The table calls this; it does not know about files. */
export type BoardSfx = 'move' | 'capture' | 'check' | 'mate' | 'crown'
export function boardSound(_kind: BoardSfx) { /* Audio Engineer fills this in. */ }
