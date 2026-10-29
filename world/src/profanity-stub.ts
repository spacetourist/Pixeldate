/* DEV/TEST FALLBACK ONLY, used by the Node dev server when the `obscenity` package is not installed (npm was blocked
   on the box). It is a small list with leet-speak folding, nowhere near obscenity's coverage; the Worker never uses it. */
import { setProfanity } from './filter.ts'
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b' }
const ROOTS = ['fuck', 'fuk', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'twat', 'wank', 'nigg', 'fagg', 'faggot', 'retard', 'pussy', 'cock', 'dick', 'asshole', 'arsehole', 'bastard', 'motherf', 'rape']
const fold = (s: string) => s.toLowerCase().replace(/[0-9!@$+]/g, c => LEET[c] ?? c).replace(/(.)\1+/g, '$1')
setProfanity(s => {
  const f = fold(s), words = f.split(/[^a-z]+/), joined = f.replace(/[^a-z*]/g, '')
  // masked forms (f*ck, sh*t) and spaced-out f u c k; no 'cunt' here so Scunthorpe survives
  return words.some(w => ROOTS.some(r => w.startsWith(r.replace(/(.)\1+/g, '$1')))) || /f[u*]+c?k|fuk|sh\*+t|c\*+nt|motherf/.test(joined)
})
export const STUB = true
