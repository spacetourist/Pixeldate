/* Moment helpers: deterministic burst squares (same generator as the design) and a step clock for the timelines
   in motion/*.png. Everything else is CSS keyframes with the exact delays/durations. */
import { useEffect, useState } from 'react'
import { Hp, MeterHead } from './parts'

import { reducedMotion } from '../prefs'
export const RM = reducedMotion

export function Burst({ n, seed, cols, cls = '' }: { n: number; seed: number; cols: string[]; cls?: string }) {
  let r = seed; const R = () => { r = (r * 9301 + 49297) % 233280; return r / 233280 }
  const out = []
  for (let i = 0; i < n; i++) {
    const z = [6, 8, 10, 12][Math.floor(R() * 4)], L = +(R() * 100).toFixed(1), T = +(R() * 100).toFixed(1), c = cols[Math.floor(R() * cols.length)], o = (.35 + R() * .6).toFixed(2)
    out.push(<i key={i} style={{ left: L + '%', top: T + '%', ['--z' as any]: z + 'px', ['--c' as any]: c, ['--o' as any]: o, ['--dx' as any]: `${((50 - L) * .9).toFixed(1)}cqw`, ['--dy' as any]: `${((50 - T) * .9).toFixed(1)}cqh` }} />)
  }
  return <div className={`burst ${cls}`} aria-hidden="true">{out}</div>
}

/** ms since `key` changed, but only updated at the given marks (no per-frame React renders). Reduced motion: done. */
export function useMarks(marks: number[], key: unknown) {
  const [t, setT] = useState(() => RM() ? Infinity : 0)
  useEffect(() => {
    if (RM()) { setT(Infinity); return }
    setT(0); const ids = marks.map(m => setTimeout(() => setT(m), m)); return () => ids.forEach(clearTimeout)
  }, [key])
  return t
}
const six = (a: number, d: number) => [1, 2, 3, 4, 5, 6].map(i => Math.round(a + i * d / 6))

/** combo: the meter rises in 6 steps over 500–1100 ms (motion/combo.png); reduced motion jumps */
export function TickMeter({ level, from, to, k }: { level: number; from: number; to: number; k: unknown }) {
  const t = useMarks(six(500, 600), k)
  const i = t === Infinity ? 6 : Math.max(0, Math.round((t - 500) / 100))
  const p = from + (to - from) * Math.min(6, i) / 6
  return <><MeterHead level={level} pct={p} /><Hp level={level} pct={p} /></>
}

/** level-up: full meter of the old level until 1400, then the new level's meter resets in 6 steps to 2000 */
export function useLvClock(k: unknown) { return useMarks([600, 1000, 1400, ...six(1400, 600)], k) }
export function LvMeter({ from, to, t }: { from: number; to: number; t: number }) {
  if (t < 1400) return <><MeterHead level={from} pct={100} /><Hp level={from} pct={100} /></>
  const i = t === Infinity ? 6 : Math.round((t - 1400) / 100), p = 100 * (1 - Math.min(6, i) / 6)
  return <><MeterHead level={to} pct={p} /><Hp level={to} pct={p} /></>
}
