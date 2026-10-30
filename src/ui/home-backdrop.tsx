// The café backdrop behind the home lobby (src/backdrop.ts; README §5: home anchors the crop at ay .5).
import { useLayoutEffect, useRef } from 'react'
import { bdCrop, bdPoster, startBackdrop } from '../backdrop'
export function HomeBackdrop() {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => startBackdrop(ref.current!, { portrait: 0.5, landscape: 0.5 }), [])   // fits before the first paint
  return <div ref={ref} className="pd-bd pd-bd--home" aria-hidden="true">
    <img className="pd-bd__poster" src={bdPoster(bdCrop(innerWidth, innerHeight))} alt="" fetchPriority="high" decoding="async" /></div>
}
