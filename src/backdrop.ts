/* The café backdrop (GD design world/landing README §5): a static-camera 12 s pixel loop behind the landing hero and the
   home lobby. Poster <img> first (it is in the markup, preloaded, the LCP image); the <video> is created only after the
   page has loaded (idle), fades in once it actually plays, and never exists under reduced motion or data saver. It
   pauses while the tab is hidden or the box is scrolled out of view. Integer scale only (s >= 3 at 1x art), so the
   pixels stay square; the 2x art is upscaled with image-rendering: pixelated. No dependencies: the landing loads it as
   a tiny module and the app imports it from the lobby. */
export type Crop = 'landscape' | 'portrait'
export const BD_CROPS: Record<Crop, [number, number]> = { landscape: [480, 304], portrait: [160, 320] } // 1x art px
const BASE = import.meta.env.BASE_URL + 'art/bd/'
export const bdPoster = (c: Crop) => `${BASE}poster-${c}.png`
export const bdVideo = (c: Crop) => `${BASE}backdrop-${c}.mp4`
export const bdCrop = (w: number, h: number): Crop => (h > 0 && w / h < 0.7 ? 'portrait' : 'landscape')
/** ay: vertical anchor per crop (landing: portrait .25, landscape 1; home .5). */
export type Anchor = Record<Crop, number>
export function bdFit(root: HTMLElement, ay: Anchor) {
  const W = root.clientWidth, H = root.clientHeight, crop = bdCrop(W, H), [cw, ch] = BD_CROPS[crop]
  const s = Math.max(3, Math.ceil(Math.max(W / cw, H / ch))), w = cw * s, h = ch * s
  const box = { width: w + 'px', height: h + 'px', left: Math.round((W - w) / 2) + 'px', top: Math.round((H - h) * ay[crop]) + 'px' }
  root.dataset.crop = crop; root.dataset.scale = String(s)
  for (const el of root.querySelectorAll<HTMLElement>('img,video')) Object.assign(el.style, box)
  return crop
}
const MQ = '(prefers-reduced-motion: reduce)'
// the OS setting, or the app's own Reduce motion (prefs.ts sets <html data-motion="reduce">)
const still = () => matchMedia(MQ).matches || document.documentElement.dataset.motion === 'reduce'
const saveData = () => !!(navigator as any).connection?.saveData
/** Fit now, keep fitting, and add the video after load. Returns a cleanup. */
export function startBackdrop(root: HTMLElement, ay: Anchor): () => void {
  const img = root.querySelector<HTMLImageElement>('img')!
  let crop = bdFit(root, ay), video: HTMLVideoElement | null = null, ready = false, visible = true, dead = false, idle = 0
  // the markup may pick the first poster with a <picture> media query; the box aspect has the last word
  const setPoster = () => { const src = bdPoster(crop); if (!(img.currentSrc || img.src).endsWith(src)) { img.parentElement?.querySelectorAll('source').forEach(x => x.remove()); img.src = src } }
  setPoster()
  const want = () => !document.hidden && visible
  const sync = () => {
    const v = video; if (!v || !ready) return
    if (want()) v.play().then(() => v.classList.add('is-on'), () => { root.dataset.video = 'blocked' }) // rejected: the poster stays
    else v.pause()
  }
  const drop = () => { if (!video) return; video.pause(); video.removeAttribute('src'); video.load(); video.remove(); video = null; ready = false; root.dataset.video = 'off' }
  const add = () => {
    if (dead || video || still() || saveData()) return
    const v = video = document.createElement('video')
    v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = true; v.preload = 'auto'
    for (const a of ['muted', 'playsinline', 'loop', 'disablepictureinpicture']) v.setAttribute(a, '')
    v.setAttribute('aria-hidden', 'true'); v.tabIndex = -1
    v.addEventListener('canplaythrough', () => { if (video === v) { ready = true; root.dataset.video = 'ready'; sync() } }, { once: true })
    v.addEventListener('playing', () => { if (video === v) root.dataset.video = 'playing' })
    v.src = bdVideo(crop); root.append(v); bdFit(root, ay); root.dataset.video = 'loading'
  }
  const later = () => { const ric = (window as any).requestIdleCallback; idle = ric ? ric(add, { timeout: 2000 }) : window.setTimeout(add, 200) }
  if (document.readyState === 'complete') later(); else addEventListener('load', later, { once: true })
  const onResize = () => { const c = bdFit(root, ay); if (c !== crop) { crop = c; setPoster(); if (video) { drop(); add() } } }
  const ro = new ResizeObserver(onResize); ro.observe(root)
  const io = new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; sync() }); io.observe(root)
  const onVis = () => sync(); document.addEventListener('visibilitychange', onVis)
  const mq = matchMedia(MQ), onMq = () => { if (still()) drop(); else add() }; mq.addEventListener('change', onMq)
  const mo = new MutationObserver(onMq); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] })
  return () => { dead = true; ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); mq.removeEventListener('change', onMq); mo.disconnect()
    removeEventListener('load', later); const cic = (window as any).cancelIdleCallback; if (cic) cic(idle); clearTimeout(idle); drop() }
}
