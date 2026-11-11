/** Placeholder Four Up table, 112×32 art pixels (7×2 tiles).
    Top-left is the felt origin in world/shared/map.ts (kind: 'fourup').
    Swap: replace paintFourUp() with the designer's PNG of the same size and anchor. */
export const FOUR_PX = { w: 112, h: 32 }
const px = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => { g.fillStyle = color; g.fillRect(x, y, w, h) }

export function paintFourUp() {
  const c = document.createElement('canvas')
  c.width = FOUR_PX.w; c.height = FOUR_PX.h
  const g = c.getContext('2d')!
  px(g, 4, 0, 104, 10, '#1A3A6A')
  px(g, 8, 1, 96, 8, '#48E5C2')
  g.fillStyle = '#05020F'; g.font = '7px sans-serif'; g.textAlign = 'center'
  g.fillText('FOUR UP', 56, 8)
  px(g, 8, 12, 96, 16, '#12305A')
  for (let i = 0; i < 7; i++) px(g, 14 + i * 12, 16, 8, 8, i % 2 ? '#FF6F59' : '#FFF1C1')
  px(g, 2, 26, 8, 6, '#FFF1C1'); px(g, 102, 26, 8, 6, '#FFF1C1')
  return c
}
