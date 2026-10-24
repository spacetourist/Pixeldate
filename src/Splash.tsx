import { useEffect, useRef, useState } from 'react'
const B = import.meta.env.BASE_URL
/** Boot splash: heart resolves through logo-1..5 (200 ms steps), holds to 1200 ms, steps out by 1400 ms. */
export function Splash({ ready }: { ready: boolean }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const [t, setT] = useState(reduce ? 4 : 0); const [out, setOut] = useState(false); const [gone, setGone] = useState(false)
  const r = useRef(ready); r.current = ready
  useEffect(() => {
    if (reduce) { const a = setTimeout(() => setOut(true), 600), b = setTimeout(() => setGone(true), 800); return () => { clearTimeout(a); clearTimeout(b) } }
    const t0 = performance.now(); let id = 0
    const tick = () => { const e = performance.now() - t0; setT(Math.floor(e / 200)); if (e >= 1200 && r.current) { setOut(true); setTimeout(() => setGone(true), 200); return } id = window.setTimeout(tick, 50) }
    tick(); return () => clearTimeout(id)
  }, [])
  if (gone) return null
  const f = Math.min(t, 4), lit = t <= 4 ? t + 1 : (t % 5) + 1 // after 1200 ms while not ready: loop the loader
  return <div className={`splash dither ${out ? 'out' : ''}`} data-t="splash" data-frame={f + 1}>
    {[1, 2, 3, 4, 5].map(n => <img key={n} src={`${B}px/logo/logo-${n}.svg`} width={244} height={36} style={{ display: n === f + 1 ? 'block' : 'none' }} alt={n === 5 ? 'pixeldate' : ''} />)}
    <p className="px-label mauve">GET CLOSER TO SEE CLEARER</p>
    <div className="load">{[1, 2, 3, 4, 5].map(n => <i key={n} className={n <= lit ? 'on' : ''} />)}</div>
  </div>
}
