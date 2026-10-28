/* v0.4: draw a Pixel You character from its options JSON (yours from the profile, or a match's from PeerJS). Lazy chunk
   (compose + kit + the ~2 KB atlas). The JSON is validated against the kit first; anything unknown renders nothing. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { drawAvatar, loadAtlas, type Atlas } from './compose'
import { parseOptions } from './map'

export default function Char({ json, scale = 3, label, t }: { json?: string | null; scale?: number; label?: string; t?: string }) {
  const o = useMemo(() => parseOptions(json), [json]), c = useRef<HTMLCanvasElement>(null), [atlas, setAtlas] = useState<Atlas | null>(null)
  useEffect(() => { if (o) void loadAtlas().then(a => setAtlas(() => a)) }, [o])
  // CSS size is exactly 24*scale x 32*scale; the bitmap is that times the (integer-rounded) device pixel ratio, so every
  // sprite pixel is a whole number of device pixels on 2x/3x phones and stays crisp (image-rendering: pixelated)
  const dpr = Math.max(1, Math.round(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1))
  useEffect(() => { if (atlas && o && c.current) { drawAvatar(c.current, atlas, o, scale * dpr); c.current.dataset.drawn = '1' } }, [atlas, o, scale, dpr])
  if (!o) return null
  return <canvas ref={c} className="pchar" width={24 * scale * dpr} height={32 * scale * dpr} data-t={t} data-scale={scale} data-av={json!} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    style={{ width: 24 * scale, height: 32 * scale, imageRendering: 'pixelated' }} />
}
