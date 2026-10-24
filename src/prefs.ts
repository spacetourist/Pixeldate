/* R5 · everything Pixeldate keeps lives on this device: localStorage (sessionStorage per tab in ?loopback tests)
   and one IndexedDB store for your own photo. Nothing here is ever sent anywhere. Tiny on purpose: it is in the
   initial bundle so the settings apply before the first paint. */
export const LB = location.search.includes('loopback')
export const ls: Storage = LB ? sessionStorage : localStorage
const get = (k: string) => { try { return ls.getItem(k) } catch { return null } }
const set = (k: string, v: string | null) => { try { v === null ? ls.removeItem(k) : ls.setItem(k, v) } catch {} }
const json = <T>(k: string, d: T): T => { try { const v = get(k); return v ? JSON.parse(v) : d } catch { return d } }

/* ── settings ── */
export type View = 'stage' | 'compact'
export const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches
export const osMotion = () => mq('(prefers-reduced-motion: reduce)')
export const osSolid = () => mq('(prefers-reduced-transparency: reduce)') || mq('(forced-colors: active)')
export const prefs = {
  view: (): View => get('pd.view') === 'compact' ? 'compact' : 'stage',
  motion: () => get('pd.motion') === 'on', solid: () => get('pd.solid') === 'on', sounds: () => get('pd.sounds') !== 'off',
}
export function setPref(k: 'view', v: View): void
export function setPref(k: 'motion' | 'solid' | 'sounds', v: boolean): void
export function setPref(k: string, v: any) { set('pd.' + k, k === 'view' ? v : v ? 'on' : 'off'); applyPrefs() }
/** html[data-motion=reduce] / html[data-solid]: the CSS treats them exactly like the OS media queries (tools/prefs-css). */
export function applyPrefs() {
  const d = document.documentElement
  if (prefs.motion()) d.dataset.motion = 'reduce'; else delete d.dataset.motion
  if (prefs.solid()) d.dataset.solid = ''; else delete d.dataset.solid
}
/** The one reduced-motion check for JS (OS setting or the app's own). */
export const reducedMotion = () => osMotion() || document.documentElement.dataset.motion === 'reduce'

/** Level-up chime and combo blip: 8-bit square waves, generated here (no audio files), only when Sounds is on. */
let ac: AudioContext | null = null
export function sound(kind: 'chime' | 'blip') {
  if (!prefs.sounds()) return
  try {
    ac ||= new AudioContext(); const t0 = ac.currentTime + .02
    const notes = kind === 'chime' ? [523.25, 659.25, 783.99, 1046.5] : [880, 1318.5]
    notes.forEach((f, i) => { const o = ac!.createOscillator(), g = ac!.createGain(), t = t0 + i * (kind === 'chime' ? .09 : .06)
      o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(.05, t); g.gain.exponentialRampToValueAtTime(.0001, t + .16)
      o.connect(g).connect(ac!.destination); o.start(t); o.stop(t + .18) })
    ;(window as any).__pdSounds = ((window as any).__pdSounds || 0) + 1 // test hook
  } catch {}
}

/* ── blocked list ── */
export interface Blocked { uid: string; name?: string; br?: [number, number]; at?: number; av?: string }
const rawBlocked = (): Blocked[] => json<(string | Blocked)[]>('pd-blocked', []).map(b => typeof b === 'string' ? { uid: b } : b)
export const blockedList = rawBlocked
export const blockedUids = () => rawBlocked().map(b => b.uid)
export function blockUser(b: Blocked) { set('pd-blocked', JSON.stringify([...rawBlocked().filter(x => x.uid !== b.uid), { at: Date.now(), ...b }])) }
export function unblock(uid: string) { set('pd-blocked', JSON.stringify(rawBlocked().filter(x => x.uid !== uid))) }

/* ── matches history (09): the last 7 days, never anyone you blocked ── */
export type How = 'skipped' | 'moved' | 'left' | 'blocked'
export interface Hist { id: string; uid: string; name: string; br: [number, number]; lv: number; pct: number; at: number; end?: number; how?: How; av?: string }
const WEEK = 7 * 864e5
export function history(): Hist[] {
  const all = json<Hist[]>('pd.history', []), now = Date.now(), keep = all.filter(h => now - (h.end ?? h.at) < WEEK)
  if (keep.length !== all.length) set('pd.history', JSON.stringify(keep))
  const bl = new Set(blockedUids())
  return keep.filter(h => !bl.has(h.uid)).sort((a, b) => b.at - a.at)
}
export function saveHist(h: Hist) { const all = json<Hist[]>('pd.history', []).filter(x => x.id !== h.id); all.push(h); set('pd.history', JSON.stringify(all.slice(-30))) }

/* ── your profile + photo (photo in IndexedDB; it can be megabytes) ── */
const DB = () => 'pixeldate' + (LB ? '-' + (sessionStorage.getItem('pd-uid') || 'lb') : '')
const idb = (): Promise<IDBDatabase> => new Promise((ok, bad) => { const r = indexedDB.open(DB(), 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error) })
async function kv(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest) {
  const db = await idb(); return new Promise<any>((ok, bad) => { const r = f(db.transaction('kv', mode).objectStore('kv')); r.onsuccess = () => { ok(r.result); db.close() }; r.onerror = () => { bad(r.error); db.close() } })
}
export const savedProfile = <P>(): P | null => json<P | null>('pd.profile', null)
export async function saveProfile(p: object, photo?: string) { set('pd.profile', JSON.stringify(p)); if (photo) await kv('readwrite', s => s.put(photo, 'photo')).catch(() => {}) }
export const loadPhoto = (): Promise<string | undefined> => kv('readonly', s => s.get('photo')).catch(() => undefined)
const dropDb = (n: string) => new Promise<void>(ok => { const r = indexedDB.deleteDatabase(n); r.onsuccess = r.onerror = r.onblocked = () => ok() })
/** Log out: forget who you are here (profile + photo). Settings, history and your blocked list stay on this device. */
export async function logOut() { set('pd.profile', null); await dropDb(DB()) }
/** Delete profile: wipe every Pixeldate key and database on this device. */
export async function wipeAll() {
  const dbs = await (indexedDB.databases?.() ?? Promise.resolve([])).catch(() => [] as IDBDatabaseInfo[])
  await Promise.all([DB(), ...dbs.map(d => d.name!).filter(n => n?.startsWith('pixeldate'))].map(dropDb))
  for (const s of [localStorage, sessionStorage]) for (const k of Object.keys(s)) if (/^pd[-.]/.test(k)) s.removeItem(k)
}
