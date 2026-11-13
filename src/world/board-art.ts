/** Placeholder board-games table, 64×48 art px (4×3 tiles).
    Top-left is the table origin in world/shared/map.ts (kind: 'board', tile 26,19).
    Swap: replace paintBoard() with the designer's PNG of the same size and anchor. */
export const BOARD_PX = { w: 64, h: 48 }
const px = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => { g.fillStyle = color; g.fillRect(x, y, w, h) }

export function paintBoard() {
  const c = document.createElement('canvas')
  c.width = BOARD_PX.w; c.height = BOARD_PX.h
  const g = c.getContext('2d')!
  px(g, 2, 4, 60, 40, '#6B3A1E')
  px(g, 6, 8, 52, 32, '#C4A574')
  for (let r = 0; r < 4; r++) for (let c0 = 0; c0 < 4; c0++) px(g, 8 + c0 * 12, 10 + r * 7, 11, 6, (r + c0) % 2 ? '#8B5A2B' : '#E8D2A8')
  px(g, 0, 18, 6, 10, '#3A2416'); px(g, 58, 18, 6, 10, '#3A2416')
  return c
}
