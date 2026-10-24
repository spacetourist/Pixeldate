/* 2b: the photo ladder. Hero canvas loops 8 → full; five figures fill in as each level lands; tap one for full screen. */
import { useEffect, useRef, useState } from 'react'
import { LEVELS } from '../config'
import { loadImage, pixelatePhoto } from '../pixel'
import { Icon, LV_COLOR } from '../ui/parts'
import { mountLadder, type LadderState } from './ladder'
import { reduceMotion } from './shared'

/** Thumbnail captions use the short level name (GD R2 fix 1); the viewer and chip keep the full one. */
const SHORT = (n: string) => n === 'Crystal clear' ? 'Clear' : n
const blocksLabel = (i: number) => LEVELS[i].blocks ? LEVELS[i].blocks + ' blocks' : 'Full photo'

export function Ladder({ src, name, intro, onCtas }: { src: string; name: string; intro: boolean; onCtas: (on: boolean) => void }) {
  const cv = useRef<HTMLCanvasElement>(null), ctl = useRef<ReturnType<typeof mountLadder> | null>(null)
  const reduce = useRef(reduceMotion()).current
  const [urls, setUrls] = useState<string[]>([])
  const [st, setSt] = useState<LadderState>({ cur: intro ? -1 : 0, landed: intro ? 0 : 5, ctas: !intro })
  const [playing, setPlaying] = useState(!reduce)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => { onCtas(st.ctas) }, [st.ctas])
  useEffect(() => {
    let live = true
    loadImage(src).then(im => {
      if (!live || !cv.current) return
      setUrls(LEVELS.map((_, i) => pixelatePhoto(im, i + 1)))
      const q = new URLSearchParams(location.search).get('revealt')
      ctl.current = mountLadder(cv.current, im, { intro, reduce, frozen: q === null ? null : +q, onState: s => live && setSt(s) })
    })
    return () => { live = false; ctl.current?.destroy(); ctl.current = null }
  }, [src])
  // pause the loop while the full-screen viewer is open
  useEffect(() => { if (open !== null) ctl.current?.pause(); else if (playing) ctl.current?.play() }, [open, playing])
  const cur = st.cur, n = name.trim() || 'You'
  return <div className="ladder-wrap">
    <div className="hero-photo">
      <canvas ref={cv} width={512} height={512} role="img" aria-label={cur < 0 ? 'Your photo, as only you see it' : `Your photo at ${LEVELS[cur].name}, ${blocksLabel(cur)}`} />
      <span className="chip chip--edge" data-t="ladder-chip">{cur < 0
        ? <><Icon n="lock" c="var(--text-muted)" /><span className="ct">Your photo · only on this device</span></>
        : <><Icon n="heart" c={LV_COLOR(cur + 1)} /><span className="ct">LV {cur + 1} · <span className="nm">{n}</span> · {blocksLabel(cur)}</span></>}</span>
      <div className="cap2">
        <span className="chip chip--edge">{reduce ? 'Tap a level to preview it' : 'Plays 8 → full, then loops'}</span>
        {!st.ctas ? <button type="button" className="chip chip--edge cbtn" data-t="reveal-skip" onClick={() => ctl.current?.skip()}>Skip</button>
          : !reduce && <button type="button" className="chip chip--edge cbtn" data-t="ladder-play" aria-pressed={!playing} aria-label={playing ? 'Pause the preview' : 'Play the preview'}
            onClick={() => setPlaying(p => !p)}>{playing ? <i className="pz" aria-hidden="true" /> : <i className="pl" aria-hidden="true" />}{playing ? 'Pause' : 'Play'}</button>}
      </div>
    </div>
    <p className="vh" aria-live="polite">{cur >= 0 && st.landed > 0 ? `Level ${cur + 1}, ${LEVELS[cur].name}` : ''}</p>
    <div className="ladder" data-t="minis">{LEVELS.map((L, i) => {
      const ready = i < st.landed && urls[i]
      return <figure key={i} className={(cur === i ? 'on' : '') + (ready ? '' : ' wait')}>
        <button type="button" className="lf" data-t={'mini-' + (i + 1)} aria-label={`Preview at ${L.name}`} disabled={!ready}
          onClick={() => { if (reduce) ctl.current?.show(i); setOpen(i) }}>
          <span>{ready ? <img src={urls[i]} alt="" /> : null}</span></button>
        <figcaption><b style={{ color: LV_COLOR(i + 1) }}>LV {i + 1} · {SHORT(L.name)}</b><span>{blocksLabel(i)}</span></figcaption>
      </figure>
    })}</div>
    {open !== null && urls[open] && <Viewer urls={urls} at={open} set={setOpen} />}
  </div>
}

/** Full-screen level viewer: back button / Esc / arrows / swipe. */
function Viewer({ urls, at, set }: { urls: string[]; at: number; set: (f: number | null | ((o: number | null) => number | null)) => void }) {
  const close = () => { if (history.state?.pdViewer) history.back(); else set(null) }
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') set(o => Math.min(4, (o ?? 0) + 1)); if (e.key === 'ArrowLeft') set(o => Math.max(0, (o ?? 0) - 1)) }
    history.pushState({ pdViewer: 1 }, ''); const pop = () => set(null)
    const prev = document.activeElement as HTMLElement | null; box.current?.querySelector<HTMLElement>('[data-t=viewer-close]')?.focus()
    addEventListener('keydown', k); addEventListener('popstate', pop)
    return () => { removeEventListener('keydown', k); removeEventListener('popstate', pop); prev?.focus?.() }
  }, [])
  let x0 = 0
  const L = LEVELS[at]
  return <div className="viewer" data-t="viewer" role="dialog" aria-modal="true" aria-label={`Photo at ${L.name}`} ref={box} onClick={close}
    onTouchStart={e => { x0 = e.touches[0].clientX }} onTouchEnd={e => { const d = e.changedTouches[0].clientX - x0; if (Math.abs(d) > 50) { e.preventDefault(); set(o => Math.max(0, Math.min(4, (o ?? 0) + (d < 0 ? 1 : -1)))) } }}>
    <button className="btn fx btn--ghost btn--icon vx" aria-label="Close" data-t="viewer-close" onClick={e => { e.stopPropagation(); close() }}><Icon n="x" /></button>
    <div className="vimg" onClick={e => e.stopPropagation()} style={{ ['--lvc' as any]: LV_COLOR(at + 1) }}><img src={urls[at]} alt="" className={at < 4 ? 'pix' : ''} /></div>
    <div className="vnav" onClick={e => e.stopPropagation()}>
      <button className="btn fx btn--secondary btn--icon" disabled={at === 0} aria-label="Previous level" onClick={() => set(at - 1)}><Icon n="back" /></button>
      <span className="chip chip--edge" data-t="viewer-name"><Icon n="heart" c={LV_COLOR(at + 1)} /><span>LV {at + 1} · {L.name} · {blocksLabel(at)}</span></span>
      <button className="btn fx btn--secondary btn--icon" disabled={at === 4} aria-label="Next level" onClick={() => set(at + 1)}><Icon n="next" /></button>
    </div>
  </div>
}
