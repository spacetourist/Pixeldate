import { reducedMotion } from '../prefs'
import { useSyncExternalStore, type ReactNode } from 'react'
import { Icon } from './parts'
import type { IconName } from './icons'

/** One toast/notice system (spec §5 overlays, 08b/08c): 3px role bar, auto-dismiss after 6 s, errors stay until
    dismissed; in over --dur-base (8px rise), out over --dur-fast (both 0 under reduced motion). */
export type Role = 'success' | 'warn' | 'error' | 'turn' | 'info'
export type Where = 'page' | 'match' | 'call' // page = lobby/finding/signup (in flow), match = match overlay, call = in-call
export interface ToastItem {
  id: string; role: Role; icon: IconName; title: string; body?: ReactNode; t?: string
  where?: Where; sticky?: boolean; ms?: number; onClick?(): void; acts?: ReactNode; out?: boolean
}
const ICON_C: Record<Role, string> = { success: 'var(--c-mint)', warn: 'var(--cta)', error: 'var(--error)', turn: 'var(--cta)', info: 'var(--cta)' }
const OUT_MS = 140 // --dur-fast
let list: ToastItem[] = []
const subs = new Set<() => void>(), timers = new Map<string, number>()
const emit = () => { list = [...list]; subs.forEach(f => f()) }
const fast = () => reducedMotion() ? 0 : OUT_MS

export function toast(t: Omit<ToastItem, 'id' | 'role'> & { id?: string; role?: Role }): string {
  const it: ToastItem = { role: 'info', where: 'page', ...t, id: t.id || Math.random().toString(36).slice(2) }
  clearTimeout(timers.get(it.id)); list = list.filter(x => x.id !== it.id); list.push(it); emit()
  if (!it.sticky && it.role !== 'error') timers.set(it.id, window.setTimeout(() => dismiss(it.id), it.ms ?? 6000))
  return it.id
}
export function dismiss(id: string) {
  const x = list.find(t => t.id === id); if (!x || x.out) return
  clearTimeout(timers.get(id)); x.out = true; emit()
  timers.set(id, window.setTimeout(() => { list = list.filter(t => t !== x); timers.delete(id); emit() }, fast()))
}
/** Drop every toast for one place (e.g. lobby notices once a match starts). */
export const clearToasts = (where?: Where) => list.filter(t => !where || t.where === where).forEach(t => dismiss(t.id))
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const useToasts = (where: Where) => useSyncExternalStore(sub, () => list).filter(t => t.where === where)
if (import.meta.env.DEV || (window as any).__pdMock !== undefined) (window as any).__pdToast = toast

/** One toast. Also used for state-bound toasts (in call, your turn) so every toast shares markup and motion. */
export function Toast({ it, onDismiss }: { it: ToastItem; onDismiss?(): void }) {
  const close = onDismiss ?? (() => dismiss(it.id))
  const err = it.role === 'error', role = it.role === 'info' ? '' : ` toast--${it.role}`
  const body = <><span className="ic-wrap"><Icon n={it.icon} c={ICON_C[it.role]} s={3} /></span><span className="tx"><b>{it.title}</b>{it.body}</span></>
  return <div className={`toast fx${role}${it.out ? ' is-out' : ''}`} role={err ? 'alert' : 'status'} data-t={it.t ?? 'toast'} data-role={it.role}>
    {it.onClick ? <button className="tmain" onClick={it.onClick}>{body}</button> : <span className="tmain">{body}</span>}
    {it.acts && <span className="acts">{it.acts}</span>}
    {(err || it.sticky) && !it.acts && <button className="tx-x" aria-label={`Dismiss: ${it.title}`} data-t="toast-x" onClick={close}><Icon n="x" s={2} /></button>}
  </div>
}
export function Toasts({ where, extra, cls = '' }: { where: Where; extra?: ReactNode; cls?: string }) {
  const ts = useToasts(where)
  if (!ts.length && !extra) return null
  return <div className={`toasts toasts--${where} ${cls}`} aria-live="polite">{extra}{ts.map(t => <Toast key={t.id} it={t} />)}</div>
}
