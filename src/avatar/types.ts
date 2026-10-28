import type { AvatarError, Descriptor, Lm, Mask } from './descriptor'
/** lite = selfie + hair segmenters + skin colour (default, ~21 MB); full = multiclass selfie model (fallback, ~37 MB) */
export type Mode = 'lite' | 'full'
export type Progress = { loaded: number; total: number; file: string }
export type LoadInfo = { mode?: Mode; ms: Record<string, number>; bytes: Record<string, number>; blocked?: string[] }
type Common = { size: { w: number; h: number }; ms: Record<string, number>; load: LoadInfo; where?: string; blocked?: string[]; mode?: Mode }
export type Result =
  | ({ ok: true; descriptor: Descriptor; landmarks: Lm[]; masks: Mask[] } & Common)
  | ({ ok: false; error: AvatarError; landmarks: Lm[] | null; poses: number } & Common)
