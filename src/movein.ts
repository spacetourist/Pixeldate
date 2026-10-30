/* The one-site move (GitHub Pages → this worker). The old github.io site sends what it kept on that device here once,
   in the URL fragment (#pdmove=<base64url JSON {v:1, ls:{key:value}, photo?}>; fragments never reach a server).
   Runs before anything reads storage. Rules: it only fills keys missing here (never overwrites what this site already
   has); the blocked list is merged as a union (a block made on either site keeps holding); your photo comes with your
   profile only when the profile itself was missing here (so a profile and someone else's photo never get mixed).
   Then the fragment is cleared (history.replaceState) and a small "Your profile moved here" toast shows. */
export const MOVE = 'pdmove'
type Payload = { v: 1; ls?: Record<string, string>; photo?: string }
type B = { uid: string; [k: string]: unknown }
const asB = (x: unknown): B | null => typeof x === 'string' ? { uid: x } : x && typeof x === 'object' && typeof (x as B).uid === 'string' ? x as B : null
/** union by uid; an entry already here wins (keeps its own name/time) */
export function mergeBlocked(here: string | null, there: string): string {
  const p = (s: string | null) => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v.map(asB).filter(Boolean) as B[] : [] } catch { return [] } }
  const a = p(here), seen = new Set(a.map(b => b.uid))
  for (const b of p(there)) if (!seen.has(b.uid)) { a.push(b); seen.add(b.uid) }
  return JSON.stringify(a)
}
export function decode(frag: string): Payload | null {
  try { const b = atob(frag.replace(/-/g, '+').replace(/_/g, '/')), u = Uint8Array.from(b, c => c.charCodeAt(0))
    const v = JSON.parse(new TextDecoder().decode(u)); return v && v.v === 1 ? v : null } catch { return null }
}
const putPhoto = (photo: string) => new Promise<void>(ok => {
  try { const r = indexedDB.open('pixeldate', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onsuccess = () => { const db = r.result; try {
      const s = db.transaction('kv', 'readwrite').objectStore('kv'), g = s.get('photo')
      g.onsuccess = () => { if (g.result) { db.close(); return ok() } const w = s.put(photo, 'photo'); w.onsuccess = w.onerror = () => { db.close(); ok() } }
      g.onerror = () => { db.close(); ok() } } catch { db.close(); ok() } }
    r.onerror = () => ok() } catch { ok() }
})
function toast() {
  const show = () => { const t = document.createElement('div'); t.dataset.t = 'moved-toast'; t.setAttribute('role', 'status')
    t.textContent = 'Your profile moved here'
    t.style.cssText = 'position:fixed;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483647;padding:10px 16px;background:#1B1240;color:#FFF3E6;border:2px solid #FF8FA3;font:600 14px/1.2 system-ui,sans-serif;box-shadow:0 4px 0 #08041A;pointer-events:none;white-space:nowrap'
    document.body.append(t); setTimeout(() => t.remove(), 6000) }
  if (document.body) show(); else addEventListener('DOMContentLoaded', show, { once: true })
}
/** resolves once anything moved in has been written (the photo is in IndexedDB, so it's async) */
export const movedIn: Promise<boolean> = (() => {
  const h = location.hash, k = '#' + MOVE + '='
  if (!h.startsWith(k)) return Promise.resolve(false)
  history.replaceState(history.state, '', location.pathname + location.search)
  const p = decode(h.slice(k.length)); if (!p) return Promise.resolve(false)
  let hadProfile = true, ls: Storage
  try { ls = localStorage; hadProfile = ls.getItem('pd.profile') !== null } catch { return Promise.resolve(false) }
  for (const [key, v] of Object.entries(p.ls ?? {})) {
    if (!/^pd[-.]/.test(key) || typeof v !== 'string' || key === 'pd.moved') continue
    try { if (key === 'pd-blocked') ls.setItem(key, mergeBlocked(ls.getItem(key), v)); else if (ls.getItem(key) === null) ls.setItem(key, v) } catch {}
  }
  toast()
  return !hadProfile && typeof p.photo === 'string' && p.photo.startsWith('data:image/') ? putPhoto(p.photo).then(() => true) : Promise.resolve(true)
})()
