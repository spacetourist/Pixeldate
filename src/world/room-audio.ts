/** room sound hooks, per AE's lounge v02 AUDIO.md: the café piano and loungeBed cross-faded equal-power over ~3 tiles of
    the archway (loungeBed 0.35 fully inside the lounge), the "Play a game?" chime / accept / decline and the teleport
    stinger. The sounds themselves live in lounge-audio.ts, imported lazily (LOUNGE_AUDIO) so the initial bundle is unchanged. */
import { LOUNGE_AUDIO } from './flags.ts'
/** tiles of blend each side of the arch */
export const BED_FADE = 3
/** v: 0 = fully café side, 1 = fully lounge side (0.5 under the arch); equal-power gains */
export const bedMix = (room: string, d: number) => {
  const t = Math.min(1, Math.max(0, d / BED_FADE)) / 2, v = room.startsWith('games') ? 0.5 + t : 0.5 - t
  return { cafe: Math.cos(v * Math.PI / 2), lounge: Math.sin(v * Math.PI / 2) }
}
export const calls: string[] = []   // for tests: which hooks fired
let lastMix = '', cafeSink: ((g: number) => void) | null = null
/** the café bed (piano) volume multiplier */
export const onCafe = (f: (g: number) => void) => { cafeSink = f }
const LA = () => LOUNGE_AUDIO ? import('./lounge-audio.ts') : Promise.resolve(null)
export function bed(room: string, d: number) {
  const m = bedMix(room, d), k = m.cafe.toFixed(2); if (k === lastMix) return; lastMix = k; calls.push('bed:' + k)
  cafeSink?.(m.cafe); LA().then(A => A?.bedLevel(m.lounge))
}
const sfx = (id: string, tag: string) => { calls.push(tag); LA().then(A => A?.play(id)) }
export const chime = () => sfx('inviteChime', 'chime')
export const accept = () => sfx('inviteAccept', 'accept')
export const decline = () => sfx('inviteDecline', 'decline')
export const swoosh = () => sfx('teleport', 'swoosh')
