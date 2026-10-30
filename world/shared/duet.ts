/* Pixeldate World · piano duets + the secret-pick game (shared by the server and the client). Audio: the Audio
   Engineer's pd_duets_v01 set in /audio/piano/duets/ (manifest.json there is the source of truth; world/test/run.mjs checks
   this table against it). GD's world/duet/README.md: the duet bench, seats, count-in, pick game mocks A–L. */
export interface Duet { id: string; title: string; by: string; durationSec: number; beatSec: number; countInBeats: number; countInSec: number; downbeatOffsetSec: number }
/** pick-card order (GD mock I): Chopsticks last */
export const DUETS: Duet[] = [
  { id: 'brahms-hungarian-dance-5', title: 'Hungarian Dance No. 5', by: 'Brahms', durationSec: 73.646812, beatSec: 0.5555555555555556, countInBeats: 3, countInSec: 1.6666666666666667, downbeatOffsetSec: 0.1 },
  { id: 'faure-dolly-berceuse', title: 'Dolly Berceuse', by: 'Fauré', durationSec: 62.232687, beatSec: 1.0, countInBeats: 3, countInSec: 3.0, downbeatOffsetSec: 0.1 },
  { id: 'after-you', title: 'After You', by: 'Original', durationSec: 84.979125, beatSec: 0.6, countInBeats: 3, countInSec: 1.7999999999999998, downbeatOffsetSec: 0.1 },
  { id: 'chopsticks', title: 'Chopsticks', by: 'Traditional', durationSec: 55.783062, beatSec: 0.42857142857142855, countInBeats: 3, countInSec: 1.2857142857142856, downbeatOffsetSec: 0.1 },
]
export const DUET = new Map(DUETS.map(d => [d.id, d]))
/** card length: durationSec floored to m:ss (GD mock I) */
export const floorMmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
/** CoS (10:40): one server constant. Reveal early as soon as both have picked. */
export const PICK_MS = 30000
/** the level-up offer: ignoring it this long counts as Not yet */
export const OFFER_MS = 10000
/** an invite expires after this */
export const INVITE_MS = 30000
/** the miss coin flip runs this long on screen before "Starting …" */
export const FLIP_MS = 2400
/** lead between the server fixing the downbeat and the count-in starting (so every client can schedule it) */
export const DUET_LEAD_MS = 600
/** leave-fade for a stem whose player stood up (Audio Engineer: ~1.5 s, never stop the stem) */
export const LEAVE_FADE_S = 1.5
/** preview snippets: local only, 8 s with the fade baked in */
export const PREVIEW_SEC = 8
/** GD placement relative to the piano top-left (544,272): duet bench 48x16 at +(0,48); bass sprite bench +(2,-21), melody
    +(24,-21); count-in cell centre piano +(24,-8) (40x40 frames, 6 a beat); seat-open marker bench +(24,-21) */
export const DUET_PX = { bench: [544, 320], bass: [546, 299], melody: [568, 299], countIn: [568, 264], seatOpen: [568, 299] } as const
/** the duet seats either side of the solo seat (35,20): Bass on the left (coral), Melody on the right (butter) */
export type Part = 'bass' | 'melody'
export const BASS_SEAT = [34, 20] as const, MELODY_SEAT = [36, 20] as const
export const partAt = (x: number): Part | null => x === BASS_SEAT[0] ? 'bass' : x === MELODY_SEAT[0] ? 'melody' : null
/** "In tune!" / "Not yet" / "Level up!" holds before the count-in (ms) */
export const MATCH_HOLD_MS = 1800, MAYBE_MS = 1400, LEVELUP_MS = 2800, MISS_HOLD_MS = 1600
/** phases: wait (one seated) · pick · res (the reveal: match / offer / level up, or the coin flip) · count · play · both (sat, idle) */
export type DuetPhase = 'wait' | 'pick' | 'res' | 'count' | 'play' | 'both'
