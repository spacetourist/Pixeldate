/* Kit palettes (base colour of each ramp) come from the generated kit (tools/avatar-kit.py <- GD's sprites/kit.json,
   the single source of truth). Detected colours snap to the nearest entry by CIEDE2000 in CIELab (D65), as SPEC.md says. */
import { CLOTH as CLOTH_R, HAIRC, SKIN as SKIN_R } from './kit/kit.gen'
const base = (p: Record<string, readonly string[]>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v[0]])) as Record<string, string>
export const SKIN = base(SKIN_R), HAIR = base(HAIRC), CLOTH = base(CLOTH_R)
export type PaletteName = 'skin' | 'hair' | 'cloth'
const PAL = { skin: SKIN, hair: HAIR, cloth: CLOTH }
/** SPEC v0.1: only a near-grey colour (CIELab C* below this) may snap to black/charcoal, so dark blues stay navy/denim. */
export const NEUTRAL_C = 8
const DARK_NEUTRALS: Record<PaletteName, string[]> = { skin: [], hair: ['black'], cloth: ['black', 'charcoal'] }
const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
export function hexLab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16), r = lin(n >> 16), g = lin((n >> 8) & 255), b = lin(n & 255)
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047, Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b, Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883
  const f = (t: number) => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
}
/** CIEDE2000 colour difference. */
export function de2000([L1, a1, b1]: number[], [L2, a2, b2]: number[]) {
  const rad = Math.PI / 180, C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7))), a1p = a1 * (1 + G), a2p = a2 * (1 + G)
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2)
  const h = (b: number, a: number) => { if (!a && !b) return 0; const v = Math.atan2(b, a) / rad; return v < 0 ? v + 360 : v }
  const h1 = h(b1, a1p), h2 = h(b2, a2p), dL = L2 - L1, dC = C2p - C1p
  let dh = 0; if (C1p * C2p) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360 }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh / 2 * rad), Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2
  let hb = h1 + h2; if (C1p * C2p) { if (Math.abs(h1 - h2) > 180) hb += h1 + h2 < 360 ? 360 : -360; hb /= 2 }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad)
  const SL = 1 + 0.015 * (Lb - 50) ** 2 / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T
  const RT = -2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad)
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH))
}
/** Nearest palette entry (and runner-up gap, used for confidence). */
export function snap(hex: string, pal: PaletteName) {
  const L = hexLab(hex), chroma = Math.hypot(L[1], L[2]), gated = chroma >= NEUTRAL_C ? DARK_NEUTRALS[pal] : []
  const r = Object.entries(PAL[pal]).filter(([name]) => !gated.includes(name)).map(([name, h]) => ({ name, hex: h, dE: de2000(L, hexLab(h)) })).sort((a, b) => a.dE - b.dE)
  return { name: r[0].name, hex: r[0].hex, dE: Math.round(r[0].dE * 10) / 10, gap: r[1].dE - r[0].dE, chroma: Math.round(chroma * 10) / 10 }
}
