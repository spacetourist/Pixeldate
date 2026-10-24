/* Player Two R1 · small presentational parts (match screen). Markup mirrors the design pack's js/parts.js. */
import { LEVELS } from '../config'
import { ICONS, type IconName } from './icons'

/** Level flavour lines (design pack parts.js LV[].d). */
export const LV_DESC = ['Shapes and colours. Say hi.', 'A smile starts to show.', "Now it's getting interesting.", 'Almost there. Keep talking.', 'Face to face, no filter.']
export const LV_COLOR = (l: number) => `var(--lv-${l})`
/** Small avatars (≤64px) sit one notch coarser than the stage (design note AVLV). 0 = full. */
export const AV_BLOCKS = [4, 6, 8, 12, 0]
const lvShort = (n: string) => n.replace('Crystal clear', 'Clear')

export function Icon({ n, s = 2, c = 'currentColor', label }: { n: IconName; s?: number; c?: string; label?: string }) {
  const [w, h, d] = ICONS[n]
  return <svg className="ico" viewBox={`0 0 ${w} ${h}`} width={w * s} height={h * s} fill={c} shapeRendering="crispEdges" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}><path d={d} /></svg>
}

/** HP meter: 5 cells of 10 ticks. Only the current level's cell fills; done levels are full. */
export function Hp({ level, pct, cls = '' }: { level: number; pct: number; cls?: string }) {
  const p = Math.floor(Math.min(100, Math.max(0, pct)))
  const now = level === 5 ? 100 : p
  return <div className={`hp ${cls} ${p >= 100 && level < 5 ? 'is-full' : ''}`} role="meter" aria-label={`${LEVELS[level - 1].name} meter`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={now} aria-valuetext={level === 5 ? 'All levels clear' : `${p}% to ${LEVELS[level].name}`}>
    {LEVELS.map((_, i) => { const st = level === 5 || i + 1 < level ? 'full' : i + 1 === level ? 'cur' : ''
      return <span key={i} className={`cell ${st}`}><i style={st === 'cur' ? { ['--p' as any]: Math.floor(p / 10) * 10 + '%' } : undefined} /></span> })}
  </div>
}

export function MeterHead({ level, pct }: { level: number; pct: number }) {
  const L = LEVELS[level - 1], nx = LEVELS[level]
  return <div className="meterhead"><span>{L.name} <span className="muted" style={{ font: 'var(--t-small)' }}>· {L.blocks ? L.blocks + ' blocks' : 'full photo'}</span></span>
    {nx ? <span className="to">{Math.floor(pct)}% to <b>{nx.name}</b></span> : <span className="to">All levels clear</span>}</div>
}

export function LevelMap({ level, pct, cls = '' }: { level: number; pct: number; cls?: string }) {
  return <div className={`map ${cls}`} aria-hidden="true">{LEVELS.map((L, i) => {
    const n = i + 1, st = n < level || level === 5 ? 'done' : n === level ? 'cur' : ''
    return [<span key={'n' + n} className={`nd ${st} ${n === 5 ? 'clear' : ''}`}><i><Icon n={st ? (n === 5 ? 'eye' : 'heart') : 'lock'} c={st ? 'var(--edge)' : 'var(--locked)'} s={3} /></i>{lvShort(L.name)}</span>,
      n < 5 && <span key={'l' + n} className={`ln ${n < level || level === 5 ? 'on' : n === level ? 'half' : ''}`} style={{ ['--p' as any]: Math.floor(pct) + '%' }} />]
  })}</div>
}

export function Av({ src, level, size = 48 }: { src?: string; level: number; size?: 32 | 40 | 48 | 64 | 96 }) {
  return <span className={`av av--${size} ${src ? '' : 'av--empty'}`} style={{ ['--lvc' as any]: LV_COLOR(level) }}>{src ? <img src={src} alt="" /> : <img alt="" />}</span>
}

export function LvBadge({ level, ...rest }: { level: number } & React.HTMLAttributes<HTMLSpanElement>) {
  const c = LV_COLOR(level)
  return <span className="lvbadge" style={{ ['--lvc' as any]: c }} {...rest}><Icon n="heart" c={c} />LV {level} · {LEVELS[level - 1].name}{rest.children}</span>
}

/** Receiver-side downsample for small avatars (only ever removes detail). */
export function coarse(img: HTMLImageElement | undefined, blocks: number): string | undefined {
  if (!img) return undefined
  if (!blocks || img.naturalWidth <= blocks) return img.src
  const c = document.createElement('canvas'); c.width = c.height = blocks
  const x = c.getContext('2d')!; x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, blocks, blocks)
  return c.toDataURL()
}
