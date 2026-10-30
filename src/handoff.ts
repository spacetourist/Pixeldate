/* World café → app hand-off for a video call. Since the couple heart (push 2b) the café runs its call itself, in the café
   (src/world/call.ts), so the café no longer writes this; the app still honours one, as before; it lives in this tab's sessionStorage (not the URL, so a crafted link can't start a call),
   is read once, and is ignored after 30 s. */
export interface Handoff { code: string; host: boolean; lv: number; at: number }
export const HANDOFF_KEY = 'pd.handoff', HANDOFF_MS = 30000
export function takeHandoff(): Handoff | null {
  let h: any = null
  try { h = JSON.parse(sessionStorage.getItem(HANDOFF_KEY) || 'null'); sessionStorage.removeItem(HANDOFF_KEY) } catch { return null }
  if (!h || typeof h.code !== 'string' || !/^[a-z0-9]{12}$/.test(h.code) || typeof h.host !== 'boolean' || !(h.lv >= 1 && h.lv <= 5) || !(Date.now() - h.at < HANDOFF_MS && h.at <= Date.now() + 1000)) return null
  return { code: h.code, host: h.host, lv: Math.floor(h.lv), at: h.at }
}
