/** Placeholder Trails cabinet, 112×32 art pixels (7×2 tiles).
    Top-left is one tile above the seat row: the cabinet origin in world/shared/map.ts (kind: 'trails').
    Swap: replace paintTrails() with the designer's PNG of the same size and anchor. */
export const TRAIL_PX = { w: 112, h: 32 }
const px = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h) }

export function paintTrails() {
  const c = document.createElement('canvas')
  c.width = TRAIL_PX.w; c.height = TRAIL_PX.h
  const g = c.getContext('2d')!
  px(g, 4, 0, 104, 14, '#14081E')
  px(g, 8, 2, 96, 10, '#8F7BFF')
  g.fillStyle = '#FFF1C1'; g.font = '7px sans-serif'; g.textAlign = 'center'
  g.fillText('TRAILS', 56, 10)
  px(g, 8, 16, 96, 12, '#1E1640')
  px(g, 14, 20, 28, 3, '#48E5C2')
  px(g, 46, 20, 22, 3, '#FF6F59')
  px(g, 72, 20, 24, 3, '#FFD84D')
  return c
}
