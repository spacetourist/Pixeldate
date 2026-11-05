/** AE's room sound hooks (café/lounge beds cross-faded by distance to the archway, the "Play a game?" chime, the teleport
    swoosh). Silent no-ops until AE's files land: fill SOUNDS (file stems under public/audio/rooms/) and they play. Nothing
    is fetched while SOUNDS is empty, so this costs no bytes or AudioContext today. */
export const SOUNDS: Partial<Record<'cafeBed' | 'loungeBed' | 'inviteChime' | 'teleportSwoosh', string>> = {}
/** bed mix from my distance to the door in tiles: at the door 50/50, BED_FADE tiles in, only this room's bed */
export const BED_FADE = 8
export const bedMix = (room: string, d: number) => { const t = Math.min(1, Math.max(0, d / BED_FADE)), here = 0.5 + t / 2
  return room.startsWith('games') ? { lounge: here, cafe: 1 - here } : { cafe: here, lounge: 1 - here } }
export const calls: string[] = []   // for tests: which hooks fired
let lastMix = ''
export function bed(room: string, d: number) { const m = bedMix(room, d), k = m.cafe.toFixed(2); if (k === lastMix) return; lastMix = k; calls.push('bed:' + k); if (!SOUNDS.cafeBed) return }
export function chime() { calls.push('chime'); if (!SOUNDS.inviteChime) return }
export function swoosh() { calls.push('swoosh'); if (!SOUNDS.teleportSwoosh) return }
