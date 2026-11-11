/** Placeholder Letterbox desk, 112×32 art pixels (7×2 tiles).
    The sprite's top-left is the felt origin in world/shared/map.ts (kind: 'letterbox').
    Swap: replace paintLetterbox() with the designer's PNG of the same size and anchor. */
export const LETTER_PX = { w: 112, h: 32 }
const FONT: Record<string, string> = {
  L: '10000/10000/10000/10000/11111',
  E: '11111/10000/11110/10000/11111',
  T: '11111/00100/00100/00100/00100',
  R: '11110/10001/11110/10100/10010',
  S: '01111/10000/01110/00001/11110',
}
const px = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => { g.fillStyle = color; g.fillRect(x, y, w, h) }

export function paintLetterbox() {
  const c = document.createElement('canvas')
  c.width = LETTER_PX.w; c.height = LETTER_PX.h
  const g = c.getContext('2d')!
  px(g, 8, 0, 96, 12, '#3A2414')
  px(g, 10, 1, 92, 10, '#C4B48A')
  const word = 'LETTERS', gw = 6, wordW = word.length * gw - 1
  let x = Math.floor((LETTER_PX.w - wordW) / 2)
  for (const ch of word) {
    const glyph = FONT[ch]; if (!glyph) { x += gw; continue }
    glyph.split('/').forEach((row, y) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') px(g, x + i, 3 + y, 1, 1, '#1A1208') })
    x += gw
  }
  px(g, 6, 14, 100, 16, '#6B4A2A')
  px(g, 10, 16, 92, 10, '#8C6239')
  for (const sx of [2, 102]) { px(g, sx, 22, 8, 8, '#FFF1C1'); px(g, sx + 2, 24, 4, 4, '#3A2414') }
  return c
}
