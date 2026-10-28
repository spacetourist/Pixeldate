/* Descriptor -> kit options (SPEC v0.1). Detection fills colours and the confident garment kinds; build and hairstyle
   are the user's two taps on "Got you!" (no preselected build; hair choices filtered by detected length). Never
   picks anything by gender. The stored result is the ~200 B options JSON, never the photo or the descriptor. */
import type { Descriptor } from '../descriptor'
import { ACCS, BASE, BEARDS, BOTTOMS, BUILDS, CLOTH, HAIRC, HAIRS, SHOES, SKIN, TOPS } from './kit.gen'
import type { KitOptions } from './compose'

export type Mapped = { options: Omit<KitOptions, 'build' | 'hair'> & { build: string | null; hair: string | null }; hairChoices: string[]; bestHair: string; check: Partial<Record<Row, true>> }
export type Row = 'skin' | 'hair' | 'top' | 'bottom' | 'legs' | 'shoes' | 'extras'
export const NEUTRAL: KitOptions = { v: 1, ...(BASE as Omit<KitOptions, 'v'>), tights: null }

const BY_LENGTH: Record<string, string[]> = {
  none: ['bald', 'buzz'], short: ['buzz', 'crop', 'quiff', 'sidepart', 'curly'], chin: ['bob', 'curly', 'crop'],
  shoulder: ['long', 'wavy', 'bob', 'ponytail'], long: ['long', 'wavy', 'ponytail', 'bun'],
}
const DARK_BLUE = new Set(['navy', 'dark-denim']), BLUE = new Set(['navy', 'dark-denim', 'denim'])
const VOLUMINOUS = ['afro', 'curly', 'wavy']

/** 4 hairstyles for the detected length (high volume ranks afro/curly/wavy first); all 12 when length is unknown. */
export function hairChoices(d: Descriptor | null): string[] {
  const len = d?.hairLength.value
  if (!len) return [...HAIRS]
  let c = [...BY_LENGTH[len]]
  if ((d!.hairVolume.value ?? 0) > 0.6 && len !== 'none') c = [...VOLUMINOUS.filter(v => len !== 'short' || v !== 'wavy'), ...c.filter(x => !VOLUMINOUS.includes(x))]
  return [...new Set(c)].slice(0, 4)
}

export function mapDescriptor(d: Descriptor): Mapped {
  const C = d.colours, name = (k: keyof Descriptor['colours'], dflt: string) => C[k].value?.name ?? dflt
  const lower = d.lowerBody.value, dress = lower === 'dress'
  // v0.4 (GD sign-off): an open front (a much lighter layer showing down the centre, metrics.openFront > 0.5) is the
  // kit's jacket top, which already draws the white tee down the middle; it takes the detected top colour.
  const openFront = (d.metrics?.openFront ?? -1) > 0.5
  const top = dress ? 'dress' : openFront ? 'jacket' : d.sleeve.value === 'none' ? 'tank' : d.sleeve.value === 'short' ? 'tee' : d.sleeve.value === 'long' ? 'longsleeve' : 'tee'
  const bottomc = name('bottom', NEUTRAL.bottomc)
  // v0.3 jeans vs trousers is an outfit call, not a colour-name call. Navy and dark-denim are one dark-blue family.
  // A suit = long-sleeve top + bottom both in that family + a closed front (no much-lighter layer showing down the
  // centre of the lower torso, metrics.openFront <= 0.5) -> trousers. Any other blue bottom (navy, dark-denim, denim)
  // -> jeans; everything else -> trousers. The open-front check is what separates a navy suit from a denim jacket
  // worn open over a tee with jeans, which also snap navy/navy.
  const topc0 = name('top', NEUTRAL.topc), open = openFront
  const suit = (top === 'longsleeve' || top === 'jacket') && DARK_BLUE.has(topc0) && DARK_BLUE.has(bottomc) && !open
  const bottom = lower === 'shorts' ? 'shorts' : lower === 'skirt' ? 'skirt' : BLUE.has(bottomc) && !suit ? 'jeans' : 'trousers'
  // bare-legged garments: a legs colour that snapped to cloth (not skin) means tights/leggings
  const legs = C.legs.value, tights = (dress || lower === 'skirt' || lower === 'shorts') && legs?.palette === 'cloth' ? legs.name : null
  const hat = d.metrics.hatAbove === 1
  const acc = d.glasses.value ? ((d.metrics.eyeDark ?? 0) > 0.6 ? 'shades' : 'glasses') : hat ? 'cap' : 'none'   // v0.2: a detected hat defaults to cap; Extras offers cap + beanie
  const choices = hairChoices(d), best = d.hairLength.value === 'none' && !hat ? 'bald' : choices[0]
  const check: Mapped['check'] = {}
  const low = (c: number) => c < 0.5
  if (low(C.skin.confidence)) check.skin = true
  if (low(C.hair.confidence) || low(d.hairLength.confidence)) check.hair = true
  if (low(C.top.confidence) || low(d.sleeve.confidence)) check.top = true
  if (low(C.bottom.confidence) || low(d.lowerBody.confidence)) check.bottom = true
  if (tights && low(C.legs.confidence)) check.legs = true
  if (low(C.shoes.confidence)) check.shoes = true
  if (d.glasses.value === null || low(d.glasses.confidence)) check.extras = true
  return {
    options: { v: 1, build: null, hair: null, top, bottom, shoes: 'trainers', beard: 'none', acc, face: 'a',
      skin: name('skin', NEUTRAL.skin), hairc: name('hair', NEUTRAL.hairc), topc: name('top', NEUTRAL.topc), bottomc: dress ? name('top', NEUTRAL.topc) : bottomc,
      shoec: name('shoes', NEUTRAL.shoec), tights,
      ...(acc === 'cap' && C.hat?.value ? { accc: C.hat.value.name } : {}) },
    hairChoices: choices, bestHair: best, check,
  }
}

/** Preview needs a full set: until the user picks, build shows 'regular' and hair the best match (never saved like that). */
/** Before the two taps the preview shows a regular build with the short crop (in the detected hair colour); the BEST
    MATCH label stays on the best-match tile. */
export const preview = (o: Mapped['options']): KitOptions => ({ ...o, build: o.build ?? 'regular', hair: o.hair ?? 'crop' })

const KEY = 'pd.avatar'
export function save(o: KitOptions) { const s = JSON.stringify({ ...o, v: 1 }); localStorage.setItem(KEY, s); return s }
export function loadSaved(): KitOptions | null { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null } catch { return null } }

/** v0.4: the only way options JSON from storage or a peer reaches compose. Every field must be a known kit value;
    anything else (unknown keys, odd types, oversize strings) is dropped, and a bad payload renders nothing. */
const ONE: Record<string, readonly string[]> = { build: BUILDS, hair: HAIRS, top: TOPS, bottom: BOTTOMS, shoes: SHOES, beard: BEARDS, acc: ACCS, face: ['a', 'b'],
  skin: Object.keys(SKIN), hairc: Object.keys(HAIRC), topc: Object.keys(CLOTH), bottomc: Object.keys(CLOTH), shoec: Object.keys(CLOTH), accc: [...Object.keys(CLOTH), ...Object.keys(HAIRC)] }
export const MAX_JSON = 512
export function parseOptions(s: unknown): KitOptions | null {
  if (typeof s !== 'string' || s.length > MAX_JSON) return null
  let j: any; try { j = JSON.parse(s) } catch { return null }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null
  const o: any = { v: 1 }
  for (const [k, ok] of Object.entries(ONE)) {
    const x = j[k]
    if (x === undefined) { if (['build', 'hair', 'top', 'bottom', 'shoes', 'skin', 'hairc', 'topc', 'bottomc', 'shoec'].includes(k)) return null; continue }
    if (typeof x !== 'string' || !ok.includes(x)) return null
    o[k] = x
  }
  const t = j.tights; if (t != null && (typeof t !== 'string' || !(t in CLOTH))) return null
  o.tights = t ?? null
  return o as KitOptions
}
