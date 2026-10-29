/* Wire format. Client → server: JSON text (rare: join, walk, say, actions). Server → client: JSON text for events and
   ONE binary snapshot per tick: [u8 1][u8 0][u16 tick][u16 n] then n × [u16 id][u16 x·64][u16 y·64][u8 flags], LE.
   Flags carry only what THIS viewer may see; nobody's prefs, refusals or uid is ever on the wire. */
export const SNAP = 1, ENT_BYTES = 7, HEAD_BYTES = 6, FIX = 64
export const F_HEART = 1, F_BROKEN = 2, F_MOVING = 4, F_SIT = 8, F_ME = 16
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
  | { t: 'hi'; me: number; inst: string; n: number }
  | { t: 'no'; why: 'invite' | 'adult' | 'profile' | 'timeout' }
  | { t: 'full'; next: string }
  | { t: 'add'; p: Pub } | { t: 'del'; id: number }
  | { t: 'say'; id: number; text: string }
  | { t: 'said'; ok: true; text: string } | { t: 'said'; ok: false; why: 'slow' | 'contact' | 'language' | 'long' | 'empty'; text: string; wait?: number }
  | { t: 'card'; q: { id: string; text: string } | null; with?: number }
  | { t: 'ack'; what: 'heart' | 'pass' | 'block' | 'report'; id: number }
  | { t: 'mutual'; id: number }
export type ClientMsg =
  | { t: 'join'; invite: string; p: { name: string; br: [number, number]; min: number; max: number; iam: string; seek: string; uid: string; pav?: string; adult?: boolean } }
  | { t: 'go'; x: number; y: number } | { t: 'dir'; dx: number; dy: number }
  | { t: 'say'; text: string }
  | { t: 'heart' | 'pass' | 'block'; id: number } | { t: 'report'; id: number; why: string }
  | { t: 'next' }
