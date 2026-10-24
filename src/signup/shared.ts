/* Signup helpers shared with the (lazy) post-signup app. Keep this tiny: it lands in the initial chunk. */
export type Season = 'winter' | 'spring' | 'summer' | 'autumn'
export const seasonOf = (m: number): Season => m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn'
export const AGE_TOP = 70 // slider top; 70 means "70+" (no upper limit, see wants() in net.ts)
/** Range stops = bracket edges. Lower thumb picks a bracket start, upper thumb the next start (max = edge - 1). 70 = "70+". */
export const EDGES = [18, 25, 30, 35, 40, 50, 60, 70]
const snapEdge = (n: number) => EDGES.reduce((b, e) => Math.abs(e - n) < Math.abs(b - n) ? e : b, EDGES[0])
/** Migrate any min/max (old saved or non-edge) to bracket edges: min -> edge, max -> edge - 1 (or 70+). */
export const snapRange = (min: number, max: number): [number, number] => {
  let i = EDGES.indexOf(snapEdge(min)), j = max >= 70 ? 7 : EDGES.indexOf(snapEdge(max + 1)); if (i > 6) i = 6; if (j <= i) j = i + 1
  return [EDGES[i], j === 7 ? 70 : EDGES[j] - 1] }
/** Age on the 1st of the birth month. */
export const ageFrom = (by: number, bm: number, now = new Date()) => now.getFullYear() - by - (now.getMonth() + 1 < bm ? 1 : 0)
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
