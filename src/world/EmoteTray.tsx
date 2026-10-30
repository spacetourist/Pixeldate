// GD's voice emote tray (world/emotes/README.md + src/emotes.css): open = a strip of five 52x56 buttons (icon + label) and a
// fold ×; folded = one 36x36 smiley. Remembered per device (localStorage). After any send all five sit out a 3 s cooldown
// (the server enforces it too and drops early sends): dimmed, untappable, a mint sweep round each edge, the sent one keeps
// a dim ring. Phone: right of the ♪ sound button. Desktop: bottom-left of the map, over the help chips while open.
import { useEffect, useRef, useState } from 'react'
import { EMOTES, EMOTE_LABEL, type Emote } from '../../world/shared/emote.ts'

const IC = import.meta.glob<string>('./art/emotes/icons/*.png', { eager: true, query: '?url', import: 'default' })
const ic = (id: string, s = '') => IC[`./art/emotes/icons/${id}${s}.png`]
const X = ['##....##', '###..###', '.######.', '..####..', '..####..', '.######.', '###..###', '##....##']
const FoldX = () => <svg width="12" height="12" viewBox="0 0 8 8" fill="#FFF1C1" shapeRendering="crispEdges" aria-hidden="true">
  {X.flatMap((r, y) => [...r].map((c, x) => c === '#' ? <rect key={x + ',' + y} x={x} y={y} width="1" height="1" /> : null))}</svg>
const KEY = 'pd.emoTray'
/** README: tray icons at 32 CSS px from @2x on DPR 1, @3x on DPR 2–3; the folded smiley at 16 CSS px (1x / @2x / @3x) */
const dpr = () => window.devicePixelRatio || 1
const big = () => dpr() >= 1.5 ? '@3x' : '@2x', small = () => dpr() >= 2.5 ? '@3x' : dpr() >= 1.5 ? '@2x' : ''
export type EmoteCd = { e: string; at: number; until: number } | null

export function EmoteTray({ layout, cd, onSend, stop }: { layout: 'phone' | 'desk'; cd: EmoteCd; onSend: (e: Emote) => void; stop: (ev: React.PointerEvent) => void }) {
  const [open, setOpenV] = useState(() => { const v = localStorage.getItem(KEY); return v ? v === 'open' : layout === 'desk' })
  const setOpen = (v: boolean) => { setOpenV(v); localStorage.setItem(KEY, v ? 'open' : 'fold') }
  const [down, setDown] = useState(''), [, tick] = useState(0), strip = useRef<HTMLDivElement>(null)
  // the sweep: --p = elapsed 0..1, written straight onto the strip each frame (no re-render); one re-render when it ends
  useEffect(() => { if (!cd) return; let raf = 0
    const f = () => { const now = performance.now(), p = Math.min(1, (now - cd.at) / Math.max(1, cd.until - cd.at))
      strip.current?.style.setProperty('--p', p.toFixed(3)); if (now < cd.until) raf = requestAnimationFrame(f); else tick(t => t + 1) }
    f(); const end = setTimeout(() => tick(t => t + 1), Math.max(0, cd.until - performance.now()) + 20)
    return () => { cancelAnimationFrame(raf); clearTimeout(end) } }, [cd])
  const cool = !!cd && performance.now() < cd.until
  const cls = 'w-et ' + layout
  if (!open) return <button className={cls + ' w-et-one'} data-t="w-emote-toggle" aria-expanded="false" aria-label="Voice emotes"
    onPointerDown={stop} onClick={() => setOpen(true)}><img src={ic('smiley', small())} data-art={'smiley' + small()} alt="" width={16} height={16} /></button>
  return <div ref={strip} className={cls + ' w-et-tray'} data-t="w-emotes" data-cd={cool ? '1' : undefined} role="group" aria-label="Voice emotes">
    {EMOTES.map(e => <button key={e} className={'eb' + (cool ? ' cd' : '') + (cool && cd!.e === e ? ' on' : '') + (down === e ? ' on down' : '')}
      data-t="w-emote" data-e={e} aria-label={EMOTE_LABEL[e]} aria-disabled={cool || undefined}
      onPointerDown={ev => { stop(ev); if (!cool) setDown(e) }} onPointerUp={() => setDown('')} onPointerLeave={() => setDown('')}
      onClick={() => { setDown(''); if (!cool) onSend(e) }}>
      <img src={ic(e, big())} data-art={e + big()} alt="" width={32} height={32} /><span>{EMOTE_LABEL[e]}</span></button>)}
    <button className="fold" data-t="w-emote-toggle" aria-expanded="true" aria-label="Fold voice emotes" onPointerDown={stop} onClick={() => setOpen(false)}><FoldX /></button></div>
}
