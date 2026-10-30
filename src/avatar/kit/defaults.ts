/* The look a character starts from before anyone customises it, by the "I am" pick. Detection still never picks by
   gender (map.ts); this is only the starting point of the hand-build, the "Got you!" preview before the two taps,
   and what the World draws for someone with no character yet. Placeholder kit until GD picks the two looks. */
import type { KitOptions } from './compose'
import { NEUTRAL } from './map'

export type Iam = 'man' | 'woman'
/** GD placeholder: long hair, a dress, flats, face b. */
export const WOMAN_START: KitOptions = { ...NEUTRAL, build: 'slim', hair: 'long', top: 'dress', bottom: 'skirt', shoes: 'flats', face: 'b', topc: 'coral', bottomc: 'coral', shoec: 'white' }
export const MAN_START: KitOptions = NEUTRAL
export const startLook = (iam?: string | null): KitOptions => iam === 'woman' ? WOMAN_START : MAN_START
/** Fills only what the user hasn't picked yet (build, hairstyle); anything chosen or detected is kept. */
export const startFill = <T extends { build: string | null; hair: string | null }>(o: T, iam?: string | null) => {
  const s = startLook(iam); return { ...o, build: o.build ?? s.build, hair: o.hair ?? s.hair }
}
/** The face isn't detected, so a photo-made character starts on the gender's face too (kept if the user changes it). */
export const startFace = (iam?: string | null) => startLook(iam).face
