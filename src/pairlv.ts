/* v05 · pair levels across the whole app: one level per pair, shared by the café tables and the app chat, kept on this
   device only (localStorage 'pd.pairlv', sessionStorage per tab in ?loopback tests). Keyed by a tag of the other person's
   uid, never the uid itself, so the café can tell you who you're sat with without sending anyone a raw uid. The café's
   server (one Pair Durable Object per pair) is the authority between the two people; this store is what each phone
   remembers, so a pair that levelled up at a café table has photos just as sharp when they meet in the app chat, and
   the other way round. */
import { ls } from './prefs'

export interface PairLv { lv: number; at: number; drop?: 1 }
/** what one side says it remembers when a pair meets */
export interface Claim { lv: number; drop?: boolean }
const KEY = 'pd.pairlv', MAX = 200, LV_MAX = 5

/** sha256('pd-pair:' + uid), first 16 bytes as hex: the same tag the café server computes (world/src/sim.ts peerTag) */
export async function peerTag(uid: string) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pd-pair:' + uid)))
  return [...h.slice(0, 16)].map(x => x.toString(16).padStart(2, '0')).join('')
}
const okLv = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= LV_MAX
function read(): Record<string, PairLv> {
  try { const o = JSON.parse(ls.getItem(KEY) ?? '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {} } catch { return {} }
}
export function getPairLv(tag: string): PairLv | null { const r = read()[tag]; return r && okLv(r.lv) ? r : null }
/** remember the pair's level. drop = the level was set in the app chat (both tapped to go up, or either lowered it):
    the café takes such a level as is next time, even if it's lower than what the café last had; a level the café
    reconciled is stored without it. */
export function setPairLv(tag: string, lv: number, drop = false) {
  if (!okLv(lv)) return
  const o = read(); o[tag] = { lv, at: Date.now(), ...(drop ? { drop: 1 as const } : {}) }
  const ks = Object.keys(o); if (ks.length > MAX) ks.sort((a, b) => o[a].at - o[b].at).slice(0, ks.length - MAX).forEach(k => delete o[k])
  try { ls.setItem(KEY, JSON.stringify(o)) } catch {}
}
export const claimOf = (tag: string): Claim => { const r = getPairLv(tag); return { lv: r?.lv ?? 1, ...(r?.drop ? { drop: true } : {}) } }
/** The same rule as the café server: a drop from either side lowers; otherwise the level goes up only as far as BOTH
    remember (the lower of the two claims), so one edited phone can't unlock a sharper photo. */
export function settle(level: number, a: Claim, b: Claim) {
  const drops = [a, b].filter(c => c.drop && okLv(c.lv) && c.lv < level)
  if (drops.length) return Math.min(...drops.map(c => c.lv))
  return okLv(a.lv) && okLv(b.lv) ? Math.max(level, Math.min(a.lv, b.lv)) : level
}
