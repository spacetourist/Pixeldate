/* Speech-bubble filter, server-side only: obscenity (leet-speak / confusable aware) plus Pixeldate's own rules against
   taking people off-platform: phone numbers (digits or spelled out), emails, @handles, links and social-app names. */
import { MAX_SAY } from '../shared/proto.ts'

/** The profanity matcher is plugged in at start-up (see profanity.ts): `obscenity` in the Worker; tests may swap it. */
let profane: (s: string) => boolean = () => { throw new Error('profanity matcher not set') }
export const setProfanity = (f: (s: string) => boolean) => { profane = f }
const WORDN: Record<string, string> = { zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' }
const URL = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9][a-z0-9-]{1,62}\s*(?:\.|\(dot\)|\[dot\]|\sdot\s)\s*(?:com|net|org|io|co|uk|me|app|ly|gg|tv|xyz|info|biz|link|site|online|dev|page|to|cc)\b/i
const EMAIL = /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\sat\s)\s*[a-z0-9-]+(?:\s*(?:\.|\(dot\)|\[dot\]|\sdot\s)\s*[a-z]{2,})+/i
const HANDLE = /(?:^|[^a-z0-9])@[a-z0-9_.]{2,}/i
const APPS = /\b(?:insta(?:gram)?|ig|snap(?:chat)?|whats\s?app|wa\.me|telegram|tiktok|kik|discord|onlyfans|wechat|line\s?id|signal\s?me|hinge|tinder|bumble|my\s?number|text\s?me|call\s?me\s?on|dm\s?me)\b/i
export type Verdict = { ok: true; text: string } | { ok: false; why: 'contact' | 'language' | 'long' | 'empty' }
const digitsIn = (s: string) => {
  // digits written as words count too ("oh seven seven..."); separators between digits are ignored
  const w = s.toLowerCase().replace(/[a-z]+/g, m => WORDN[m] ?? ' ' + m + ' ')
  let best = 0; for (const run of w.match(/[0-9][0-9\s\-().+/]*[0-9]/g) || []) best = Math.max(best, run.replace(/\D/g, '').length)
  return best
}
export function check(raw: unknown): Verdict {
  if (typeof raw !== 'string') return { ok: false, why: 'empty' }
  const text = raw.normalize('NFKC').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u206f]/g, '').replace(/\s+/g, ' ').trim()
  if (!text) return { ok: false, why: 'empty' }
  if ([...text].length > MAX_SAY) return { ok: false, why: 'long' }
  if (EMAIL.test(text) || URL.test(text) || HANDLE.test(text) || APPS.test(text) || digitsIn(text) >= 7) return { ok: false, why: 'contact' }
  if (profane(text)) return { ok: false, why: 'language' }
  return { ok: true, text }
}
/** Display names go through the same rules; a name that fails shows as "Someone". */
export const cleanName = (n: string) => { const v = check(String(n).slice(0, 24)); return v.ok ? v.text : 'Someone' }
