/* Pixeldate World · the café sofas: GD's 3-seat sofa3 (48x32, 3x2 tiles; world/sofa/README.md), swapped in for both
   lounge loveseats. A casual hangout: up to SOFA_CAP a sofa, room chat stays public, no cards.
   Seats are GD's offsets: the down-facing sit sprite's top-left from the sofa's top-left, in art px. One sitter takes L,
   two take L + R (M stays free), the third takes M. Draw order: sofa back (in the map art), the sitters left to right,
   then the sofa front, all sorted as one object at the sofa's bottom (y + 32). */
import { at } from './map.ts'
export const SOFA_CAP = 3
export const SOFA_W = 3, SOFA_H = 2
/** the floor row in front of the sofas (where you walk to, and stand up onto) */
export const SOFA_FRONT_Y = 8
/** GD: sofa3 L / M / R sit-sprite top-left from the sofa top-left (loveseat: L (-1,-2), R (11,-2)) */
export const SOFA3_SEATS: [number, number][] = [[-1, -2], [12, -2], [26, -2]]
/** the order seats fill in: L, then R, then M */
export const SEAT_ORDER = [0, 2, 1]
export interface Sofa { id: number; x: number; y: number; front: [number, number]; slots: [number, number][] }
/** where a sitter's entity is kept (tiles): the sprite's centre column (sx + 12) on its seat, on the cushion row */
const slotPos = (x: number, y: number, [dx]: [number, number]): [number, number] => [x + (dx + 12) / 16, y + 1.25]
/** GD's café: sofa3 at (31,6) and (35,6); the candle side table is between them at col 34 */
export const SOFAS: Sofa[] = [[31, 6], [35, 6]].map(([x, y], id) => ({ id, x, y, front: [x + 1, SOFA_FRONT_Y] as [number, number],
  slots: SOFA3_SEATS.map(d => slotPos(x, y, d)) }))
/** which sofa (if any) a tile belongs to, else -1 */
export const sofaAt = (tx: number, ty: number) => SOFAS.findIndex(s => tx >= s.x && tx < s.x + SOFA_W && ty >= s.y && ty < s.y + SOFA_H && at(tx, ty) === 'S')
/** a sitter's sofa and seat (0 L, 1 M, 2 R) from their position, for the renderer */
export function seatOf(x: number, y: number): [number, number] | null {
  const i = sofaAt(Math.floor(x), Math.floor(y)); if (i < 0) return null
  let k = 0, b = Infinity; SOFAS[i].slots.forEach(([sx], j) => { const d = Math.abs(sx - x); if (d < b) { b = d; k = j } }); return [i, k]
}
/** sit sprite top-left (art px, map space) for seat k of sofa i */
export const seatPx = (i: number, k: number): [number, number] => [SOFAS[i].x * 16 + SOFA3_SEATS[k][0], SOFAS[i].y * 16 + SOFA3_SEATS[k][1]]
