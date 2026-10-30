/* Pixeldate World · voice emotes (AE set pd_emotes_v02, /audio/emotes/). Five emotes, two takes per gender; the server picks
   the set from the profile's "I am" (default set: female, when none is set), rotates takes so the same take never plays
   twice in a row for a player, and holds a ~1.5 s cooldown per player. Clients play it from the character with the
   piano's distance falloff and pan, through the piano's mute. Sources are CC0 (credits in LICENSES.md there). */
export const EMOTES = ['giggle', 'sigh', 'groan', 'aww', 'gasp'] as const
export type Emote = typeof EMOTES[number]
export type EmoteSet = 'female' | 'male'
export const EMOTE_COOLDOWN_MS = 1500
export const DEFAULT_SET: EmoteSet = 'female'
export const setOf = (iam: unknown): EmoteSet => iam === 'man' ? 'male' : iam === 'woman' ? 'female' : DEFAULT_SET
export const TAKES: Record<EmoteSet, Record<Emote, string[]>> = {
  female: Object.fromEntries(EMOTES.map(e => [e, [e + '_f1', e + '_f2']])) as Record<Emote, string[]>,
  male: Object.fromEntries(EMOTES.map(e => [e, [e + '_m1', e + '_m2']])) as Record<Emote, string[]>,
}
export const isEmote = (e: unknown): e is Emote => typeof e === 'string' && (EMOTES as readonly string[]).includes(e)
/** a take other than the last one played (random among the rest) */
export function nextTake(set: EmoteSet, e: Emote, last: string | undefined, rnd = Math.random) {
  const all = TAKES[set][e], pool = all.length > 1 ? all.filter(t => t !== last) : all
  return pool[Math.floor(rnd() * pool.length)]
}
/** placeholder tray labels (GD art to come) */
export const EMOTE_LABEL: Record<Emote, string> = { giggle: 'Giggle', sigh: 'Sigh', groan: 'Groan', aww: 'Aww', gasp: 'Gasp' }
export const EMOTE_CREDIT = 'Voice emotes: Reitanna, DarkNightPrincess, Alivvie, WalliumVA, SnowFightStudios, garynoden, Sadiquecat, DrFortyseven (Freesound), CC0'
