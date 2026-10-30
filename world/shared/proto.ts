/* Wire format. Client → server: JSON text (rare: join, walk, say, actions). Server → client: JSON text for events and
   ONE binary snapshot per tick: [u8 1][u8 0][u16 tick][u16 n] then n × [u16 id][u16 x·64][u16 y·64][u8 flags], LE.
   Flags carry only what THIS viewer may see; nobody's prefs, refusals or uid is ever on the wire. */
export const SNAP = 1, ENT_BYTES = 7, HEAD_BYTES = 6, FIX = 64
export const F_HEART = 1, F_BROKEN = 2, F_MOVING = 4, F_SIT = 8, F_ME = 16
/** v05: keepalive. The client pings every KA (the server tells it in 'hi'); a socket silent for STALE_MS is dropped.
    MAX_ANS: a table answer. LV_MAX: the pair level tops out where the main app's photo is clear. VIDEO_LEVEL: GD's v05
    table mocks unlock Start call at Level 3 · Crush. LV_SEG: cards both answered per level (the 5-segment meter). */
export const STALE_MS = 15000, MAX_ANS = 140, LV_MAX = 5, VIDEO_LEVEL = 3, LV_SEG = 5, PHOTO_MAX = 200000
export const MAX_SAY = 80, SAY_WINDOW_MS = 15000, SAY_MAX = 3, BUBBLE_MS = 5000, CAP = 40, TICK_MS = 100, SPEED = 0.4
export interface Ent { id: number; x: number; y: number; f: number }
export function decodeSnap(buf: ArrayBuffer): { tick: number; ents: Ent[] } | null {
  const d = new DataView(buf); if (d.byteLength < HEAD_BYTES || d.getUint8(0) !== SNAP) return null
  const tick = d.getUint16(2, true), n = d.getUint16(4, true), ents: Ent[] = []
  for (let i = 0, o = HEAD_BYTES; i < n && o + ENT_BYTES <= d.byteLength; i++, o += ENT_BYTES)
    ents.push({ id: d.getUint16(o, true), x: d.getUint16(o + 2, true) / FIX, y: d.getUint16(o + 4, true) / FIX, f: d.getUint8(o + 6) })
  return { tick, ents }
}
export const BRACKETS: [number, number][] = [[18, 24], [25, 29], [30, 34], [35, 39], [40, 49], [50, 59], [60, 999]]
export const bracketLabel = ([lo, hi]: [number, number]) => hi >= 999 ? `${lo}+` : `${lo}–${hi}`
/** What a viewer learns about another person: display name, age bracket, character JSON. Nothing else. */
export interface Pub { id: number; name: string; br: [number, number]; pav?: string }
export type ServerMsg =
  | { t: 'hi'; me: number; inst: string; n: number; ka: number; now?: number }
  | { t: 'no'; why: 'invite' | 'adult' | 'profile' | 'timeout' }
  | { t: 'full'; next: string }
  | { t: 'add'; p: Pub } | { t: 'del'; id: number }
  | { t: 'say'; id: number; text: string; priv?: 1 }
  | { t: 'murmur'; tb: number }
  | { t: 'said'; ok: true; text: string; priv?: 1 } | { t: 'said'; ok: false; why: 'slow' | 'contact' | 'language' | 'long' | 'empty'; text: string; wait?: number }
  | { t: 'ansno'; why: 'contact' | 'language' | 'long' | 'empty'; text: string }
  | { t: 'photo'; id: number; lv: number; data: string }
  | { t: 'call'; code: string; host: boolean; lv: number }
  | { t: 'note'; k: 'date-no' | 'call-declined' | 'call-cancelled' }
  | { t: 'card'; q: { id: string; text: string } | null; with?: number } & Partial<Table>
  | { t: 'ack'; what: 'heart' | 'pass' | 'block' | 'report'; id: number }
  | { t: 'mutual'; id: number }
  /** the café piano (shared/piano.ts): who is on the bench (0 = nobody), the song and the server time its first sample
      plays at; now = the server clock when sent. why: 'end' (played out) or 'stop' (the pianist stopped it). */
  | { t: 'piano'; by: number; song: string | null; at: number; now: number; why?: 'end' | 'stop' }
  /** clock sync reply: c = the client's send time echoed, s = server time */
  | { t: 'tm'; c: number; s: number }
  /** a voice emote (shared/emote.ts) from player id: the take the server picked; to the sender only, ok:false + wait when on cooldown */
  | { t: 'emote'; id: number; e: string; take: string } | { t: 'emote'; ok: false; why: 'slow'; wait: number }
export type ClientMsg =
  | { t: 'join'; invite: string; p: { name: string; br: [number, number]; min: number; max: number; iam: string; seek: string; uid: string; pav?: string; adult?: boolean } }
  | { t: 'go'; x: number; y: number } | { t: 'dir'; dx: number; dy: number }
  | { t: 'say'; text: string }
  | { t: 'heart' | 'pass' | 'block'; id: number } | { t: 'report'; id: number; why: string }
  | { t: 'next' } | { t: 'ka' }
  | { t: 'ans'; text: string } | { t: 'date'; yes: boolean } | { t: 'call' | 'callyes' | 'callno' }
  | { t: 'photo'; lv: number; data: string }
  /** the app's local level for the person you're seated with (src/pairlv.ts), once per sitting */
  | { t: 'pairlv'; lv: number; drop?: boolean }
  /** at the piano (only the one on the bench): play a manifest piece / stop it. tm: clock sync ping. */
  | { t: 'piano'; id: string } | { t: 'pstop' } | { t: 'tm'; c: number }
  | { t: 'emote'; e: string }
/** What one of the two at a table sees (sent only to them): level, the card, the answers (theirs only once both are in),
    the date opt-ins, and a pending call request ('out' = I asked, 'in' = they asked). */
export interface Table { tb: number; lv: number; seg: number; up: boolean; n: number; mine: string | null; them: boolean; rev: { mine: string; theirs: string } | null
  date: { me: boolean; them: boolean }; call: 'out' | 'in' | null; video: number
  /** v05 pair levels: the other person's tag (sha256 of their uid, never the uid) and whether the level is reconciled */
  peer?: string; rc: boolean }
