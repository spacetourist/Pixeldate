/* Pixeldate World · the café piano (shared by the server and the client, so both agree on the seat, the songs and how
   long each one lasts). The audio is the Audio Engineer's pd_piano_v01 set in /audio/piano/ (manifest.json there is the
   source of truth; world/test/run.mjs checks this table against it). GD's placement: world/src/scene.py piano_corner(34,17)
   → piano at (544,272) px, solo bench 32x16 at (552,320); kit_piano.py sprite at bench + (4,-21); notes over the lid. */
export interface Piece { id: string; title: string; composer: string; durationSec: number; bpm: number; beatUnit: 'quarter' | 'eighth' | 'dotted quarter'; timeSignature: string
  /** seconds of count-in before the downbeat in a duet (not in the manifest yet: COUNT_IN_SEC until it is) */ countInSec?: number }
export const PIECES: Piece[] = [
  { id: 'gymnopedie-1', title: 'Gymnopédie No. 1 (abridged)', composer: 'Erik Satie', durationSec: 78.167625, bpm: 65, beatUnit: 'quarter', timeSignature: '3/4' },
  { id: 'clair-de-lune', title: 'Clair de lune (abridged)', composer: 'Claude Debussy', durationSec: 90.986104, bpm: 48, beatUnit: 'dotted quarter', timeSignature: '9/8' },
  { id: 'nocturne-op9-2', title: 'Nocturne in E-flat, Op. 9 No. 2 (abridged)', composer: 'Frédéric Chopin', durationSec: 76.652417, bpm: 94, beatUnit: 'eighth', timeSignature: '12/8' },
  { id: 'steam-on-the-window', title: 'Steam on the Window', composer: 'Original', durationSec: 75.416854, bpm: 70, beatUnit: 'quarter', timeSignature: '4/4' },
  { id: 'sugar-cube-bossa', title: 'Sugar Cube Bossa', composer: 'Original', durationSec: 85.489958, bpm: 112, beatUnit: 'quarter', timeSignature: '4/4' },
  { id: 'moon-in-the-teacup', title: 'Moon in the Teacup', composer: 'Original', durationSec: 74.50325, bpm: 108, beatUnit: 'quarter', timeSignature: '3/4' },
]
export const PIECE = new Map(PIECES.map(p => [p.id, p]))
export const isOriginal = (p: Piece) => p.composer === 'Original'
/** the title without the "(abridged)" note, for the Play button and the Now playing chip */
export const shortTitle = (p: Piece) => p.title.replace(/\s*\(abridged\)$/, '')
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** The one solo seat: the bench in front of the keys (map 'p'), reached from the floor tile below it. */
export const PIANO_SEAT: [number, number] = [35, 20]
/** GD's px placement (map space): piano top-left, solo bench, the pianist sprite, the notes' bottom-centre anchor */
export const PIANO_PX = { piano: [544, 272], bench: [552, 320], sprite: [556, 299], notes: [568, 282] } as const
/** where the sound comes from (tiles): the middle of the instrument */
export const PIANO_AT: [number, number] = [35.5, 18.5]
/** The server starts a song this long after the tap, so everyone's audio can be scheduled from the first note. */
export const LEAD_MS = 400
/** The pianist's early-stop fade (Audio Engineer: 300–500 ms). */
export const STOP_FADE_S = 0.4

/** Distance volume: full within NEAR tiles of the piano, then a smooth fall to silence at HEAR_R tiles. */
export const NEAR = 2.5, HEAR_R = 14
export function gainAt(dTiles: number) {
  if (dTiles <= NEAR) return 1
  if (dTiles >= HEAR_R) return 0
  const u = 1 - (dTiles - NEAR) / (HEAR_R - NEAR); return u * u
}
/** Stereo position from the mono source: listener to the left of the piano hears it on the right, and so on. */
export const panAt = (dxTiles: number) => Math.max(-0.8, Math.min(0.8, dxTiles / 8))
export const hears = (x: number, y: number) => Math.hypot(x - PIANO_AT[0], y - PIANO_AT[1]) < HEAR_R

/** Floating notes over the lid: GD's rule is one note every 2 beats (one a bar in a slow 3/4); the Audio Engineer's
    overrides: Clair de lune (9/8, counted in dotted quarters) one a bar, the Nocturne (12/8, counted in eighths) one per
    half bar. Returns ms between notes. */
export function noteEveryMs(p: Piece) {
  const beat = 60000 / p.bpm, [num] = p.timeSignature.split('/').map(Number)
  if (p.id === 'clair-de-lune') return beat * 3            // 9/8 = 3 dotted quarters a bar
  if (p.id === 'nocturne-op9-2') return beat * 6           // 12/8 in eighths: half a bar
  if (num === 3 && p.bpm < 80) return beat * 3             // slow 3/4: one a bar
  return beat * 2
}
/** GD's notes strip motion (markers_extra.notes_strip): a note lives 6 frames of 120 ms, rises 4 px a frame, sways and
    fades; the three glyphs take turns at x 4 / 12 / 8 in the 24 px cell. */
export const NOTE = { frameMs: 120, life: 6, rise: 4, sway: [0, 1, 1, 0, -1, -1], alpha: [255, 255, 255, 200, 140, 80], x: [4, 12, 8] } as const

/* Duets (not built yet, room left for them; GD world/duet/README.md): the two-seat bench (atlas rect [12,8,3,1] = 48x16)
   goes at piano + (0,+48); Bass sits left, Melody right, and the person invited takes Melody. The count-in starts
   countInSec before the downbeat. */
export type Role = 'solo' | 'bass' | 'melody'
export const DUET = { benchAtlas: [12, 8, 3, 1], benchAt: [0, 48], seats: { bass: [34, 20], melody: [36, 20] }, sprite: { bass: [2, -21], melody: [24, -21] }, countInAt: [24, -8] } as const
export const COUNT_IN_SEC = 2
export const countIn = (p: Piece) => p.countInSec ?? COUNT_IN_SEC
