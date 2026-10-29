/* Same matching rule as src/net.ts (copied, because net.ts touches `location`): each side's gender wish and age
   range must include the other. Runs on the server only; prefs never reach another client. */
import { BRACKETS } from './proto.ts'
export type Gender = 'man' | 'woman'; export type Seek = 'men' | 'women' | 'everyone'
export interface Prefs { br: [number, number]; min: number; max: number; iam: Gender; seek: Seek }
const G: Record<Seek, Gender[]> = { men: ['man'], women: ['woman'], everyone: ['man', 'woman'] }
const EDGES = [18, 25, 30, 35, 40, 50, 60, 70]
const near = (n: number) => EDGES.reduce((b, e) => Math.abs(e - n) < Math.abs(b - n) ? e : b, 18)
const norm = (min: number, max: number): [number, number] => { const lo = Math.min(near(min), 60); let hi = max >= 70 ? 70 : near(max + 1); if (hi <= lo) hi = EDGES[EDGES.indexOf(lo) + 1]; return [lo, hi >= 70 ? 999 : hi - 1] }
const inRange = (br: [number, number], min: number, max: number) => { const [lo, hi] = norm(min, max); return br[0] >= lo && br[1] <= hi }
const wants = (a: Prefs, b: Prefs) => G[a.seek].includes(b.iam) && inRange(b.br, a.min, a.max)
export const compatible = (a: Prefs, b: Prefs) => wants(a, b) && wants(b, a)
export const okBracket = (br: unknown): br is [number, number] => Array.isArray(br) && BRACKETS.some(([l, h]) => l === br[0] && h === br[1])
