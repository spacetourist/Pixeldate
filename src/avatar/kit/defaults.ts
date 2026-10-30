/* The look a character starts from before anyone customises it, by the "I am" pick. Detection still never picks by
   gender (map.ts); this is only the starting point of the hand-build, the "Got you!" preview before the two taps,
   and what the World draws for someone with no character yet. Editable starting looks only. */
import type { KitOptions } from './compose'
import { NEUTRAL } from './map'

export type Iam = 'man' | 'woman'
/** GD's "Defaults by profile gender" (design pixel-avatar/SPEC.md, tools/defaults.py). The dress skips the bottom layer,
    so bottom/bottomc keep the base values. */
export const WOMAN_START: KitOptions = { ...NEUTRAL, build: 'regular', hair: 'wavy', hairc: 'brown', face: 'b', beard: 'none', acc: 'none', top: 'dress', topc: 'violet', shoes: 'flats', shoec: 'tan', skin: 'fair' }
export const MAN_START: KitOptions = { ...NEUTRAL, build: 'regular', hair: 'crop', hairc: 'dark-brown', face: 'a', beard: 'none', acc: 'none', top: 'tee', topc: 'mint', bottom: 'trousers', bottomc: 'navy', shoes: 'trainers', shoec: 'white', skin: 'fair' }
/** Woman / man get GD's starting look; any other choice (or none) gets the base look. */
export const startLook = (iam?: string | null): KitOptions => iam === 'woman' ? WOMAN_START : iam === 'man' ? MAN_START : NEUTRAL
/** Fills only what the user hasn't picked yet (build, hairstyle); anything chosen or detected is kept. */
export const startFill = <T extends { build: string | null; hair: string | null }>(o: T, iam?: string | null) => {
  const s = startLook(iam); return { ...o, build: o.build ?? s.build, hair: o.hair ?? s.hair }
}
/** The face isn't detected, so a photo-made character starts on the gender's face too (kept if the user changes it). */
export const startFace = (iam?: string | null) => startLook(iam).face
