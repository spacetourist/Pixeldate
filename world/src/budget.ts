/* Pixeldate World · free-plan blocks. One singleton (the Budget Durable Object in production, an in-memory copy in the
   Node dev server) keeps three counters so the café never runs past Cloudflare's free allowances:
   1. TURN, estimated: every TURN credential handed out is counted as a full relayed hour (its ttl) at EST_GB_PER_HOUR.
      New credentials stop at EST_CAP_GB estimated per calendar month (UTC). Calls then fall back to STUN only.
   2. TURN, actual: the account's real relayed bytes (egress + ingress, GraphQL callsTurnUsageAdaptiveGroups), fetched at
      most every USAGE_EVERY_MS and cached; new credentials stop at ACTUAL_CAP_GB. (Cloudflare's free TURN tier is 1,000 GB.)
   3. Requests per UTC day (worker requests + café WebSocket messages at the Durable Object 20:1 rate): new café joins
      soft-stop at DAY_SOFT ("Café's busy, try later"), 80% of the 100,000 a day free plan. People already inside stay.
   Plus a per-player and per-IP rate limit on /turn. Pure: the clock, storage and usage source are injected (tests mock them). */
export const LIMITS = {
  TTL_S: 3600, EST_GB_PER_HOUR: 2, EST_CAP_GB: 600, ACTUAL_CAP_GB: 700, USAGE_EVERY_MS: 10 * 60_000,
  DAY_FREE: 100_000, DAY_SOFT: 80_000, RATE_N: 4, RATE_IP_N: 12, RATE_MS: 10 * 60_000,
} as const
const GB = 1e9
export const monthKey = (t: number) => new Date(t).toISOString().slice(0, 7)
export const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10)
export interface KV { get<T>(k: string): Promise<T | undefined>; put(k: string, v: unknown): Promise<void> }
export const memKV = (): KV & { m: Map<string, unknown> } => { const m = new Map<string, unknown>(); return { m, get: async k => m.get(k) as any, put: async (k, v) => { m.set(k, v) } } }
/** real relayed bytes this month, or null when unknown (no token / GraphQL down): then only the estimate applies */
export type Usage = (month: string, now: number) => Promise<number | null>
export type TurnGate = { ok: true; month: string; estGB: number } | { ok: false; why: 'rate' | 'budget' | 'actual' }
export type Status = { month: string; estGB: number; actualGB: number | null; actualAt: number; day: string; requests: number }

export class Budget {
  private rate = new Map<string, number[]>(); private kv: KV; private now: () => number; private usage: Usage
  constructor(kv: KV, now: () => number = Date.now, usage: Usage = async () => null) { this.kv = kv; this.now = now; this.usage = usage }
  private limited(key: string, n: number, t: number) {
    const a = (this.rate.get(key) ?? []).filter(x => t - x < LIMITS.RATE_MS)
    if (a.length >= n) { this.rate.set(key, a); return true }
    a.push(t); this.rate.set(key, a)
    if (this.rate.size > 5000) for (const [k, v] of this.rate) if (!v.some(x => t - x < LIMITS.RATE_MS)) this.rate.delete(k)
    return false
  }
  /** the cached real usage, refreshed at most every USAGE_EVERY_MS (a failed refresh keeps the last value) */
  async actual(t = this.now()): Promise<number | null> {
    const m = monthKey(t), c = await this.kv.get<{ at: number; bytes: number | null }>('act:' + m)
    if (c && t - c.at < LIMITS.USAGE_EVERY_MS) return c.bytes
    let bytes = c?.bytes ?? null
    try { const b = await this.usage(m, t); if (b != null && Number.isFinite(b)) bytes = Math.max(bytes ?? 0, b) } catch {}
    await this.kv.put('act:' + m, { at: t, bytes }); return bytes
  }
  /** may this player get a TURN credential now? Counts it against the month's estimate when yes. */
  async turn(who: string, ip: string): Promise<TurnGate> {
    const t = this.now(), m = monthKey(t)
    if (this.limited('p:' + who, LIMITS.RATE_N, t) || this.limited('ip:' + ip, LIMITS.RATE_IP_N, t)) return { ok: false, why: 'rate' }
    const est = (await this.kv.get<number>('est:' + m)) ?? 0, per = LIMITS.EST_GB_PER_HOUR * LIMITS.TTL_S / 3600
    if (est + per > LIMITS.EST_CAP_GB) return { ok: false, why: 'budget' }
    const act = await this.actual(t)
    if (act != null && act >= LIMITS.ACTUAL_CAP_GB * GB) return { ok: false, why: 'actual' }
    await this.kv.put('est:' + m, est + per); return { ok: true, month: m, estGB: est + per }
  }
  /** add n requests to today's count (UTC); returns the new total */
  async hit(n: number): Promise<number> {
    const k = 'day:' + dayKey(this.now()), v = ((await this.kv.get<number>(k)) ?? 0) + Math.max(0, Math.round(n))
    if (n > 0) await this.kv.put(k, v); return v
  }
  /** a new café join: counts pending requests too, and says whether today is past the soft cap */
  async join(pending = 1): Promise<{ busy: boolean; requests: number }> { const v = await this.hit(pending); return { busy: v >= LIMITS.DAY_SOFT, requests: v } }
  async status(): Promise<Status> {
    const t = this.now(), m = monthKey(t), c = await this.kv.get<{ at: number; bytes: number | null }>('act:' + m)
    return { month: m, estGB: (await this.kv.get<number>('est:' + m)) ?? 0, actualGB: c?.bytes == null ? null : c.bytes / GB, actualAt: c?.at ?? 0, day: dayKey(t), requests: (await this.kv.get<number>('day:' + dayKey(t))) ?? 0 }
  }
  /** tests only (DEV): set this month's estimate / actual bytes / today's count */
  async setForTest(o: { estGB?: number; actualBytes?: number | null; requests?: number; clearRate?: boolean }) {
    const t = this.now()
    if (o.estGB != null) await this.kv.put('est:' + monthKey(t), o.estGB)
    if (o.actualBytes !== undefined) await this.kv.put('act:' + monthKey(t), { at: t, bytes: o.actualBytes })
    if (o.requests != null) await this.kv.put('day:' + dayKey(t), o.requests)
    if (o.clearRate) this.rate.clear()
  }
}

/** GraphQL: the account's TURN bytes (egress + ingress, counted both ways to stay on the safe side) for a UTC month */
export const graphqlUsage = (account: string, token: string, f: typeof fetch = fetch): Usage => async month => {
  const [y, mo] = month.split('-').map(Number), end = new Date(Date.UTC(y, mo, 1)).toISOString()
  const query = `{ viewer { accounts(filter:{accountTag:${JSON.stringify(account)}}) { callsTurnUsageAdaptiveGroups(limit:1, filter:{datetime_geq:${JSON.stringify(month + '-01T00:00:00Z')}, datetime_lt:${JSON.stringify(end)}}) { sum { egressBytes ingressBytes } } } } }`
  const r = await f('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(5000) })
  if (!r.ok) return null
  const j: any = await r.json(); if (j.errors?.length) return null
  const g = j.data?.viewer?.accounts?.[0]?.callsTurnUsageAdaptiveGroups; if (!Array.isArray(g)) return null
  return g.reduce((s: number, x: any) => s + (+x.sum?.egressBytes || 0) + (+x.sum?.ingressBytes || 0), 0)
}
