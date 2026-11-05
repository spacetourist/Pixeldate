/** Placeholder Sweet Twenty table, 144×48 art pixels (9×3 tiles).
    Top row is the sign, then the felt, then the two seats. The sprite's top-left is one tile above the felt
    origin in world/shared/map.ts (kind: 'sweet').
    Swap: replace paintSweetTable() with the designer's PNG of the same size and anchor. */
export const SWEET_PX = { w: 144, h: 48 }
const FONT: Record<string, string> = {
  S: '01111/10000/01110/00001/11110',
  W: '10001/10001/10101/10101/01010',
  E: '11111/10000/11110/10000/11111',
  T: '11111/00100/00100/00100/00100',
  '2': '01110/10001/00110/01000/11111',
  '0': '01110/10001/10001/10001/01110',
}
const px = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => { g.fillStyle = color; g.fillRect(x, y, w, h) }

export function paintSweetTable() {
  const c = document.createElement('canvas')
  c.width = SWEET_PX.w; c.height = SWEET_PX.h
  const g = c.getContext('2d')!
  px(g, 28, 1, 88, 14, '#3A2414')
  px(g, 30, 2, 84, 12, '#FF6F59')
  const word = 'SWEET 20', gw = 6, wordW = word.length * gw - 1
  let x = Math.floor((SWEET_PX.w - wordW) / 2)
  for (const ch of word) {
    const glyph = FONT[ch]; if (!glyph) { x += gw; continue }
    glyph.split('/').forEach((row, y) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') px(g, x + i, 5 + y, 1, 1, '#1A1208') })
    x += gw
  }
  // coral rail, cream heart in the middle. Not a blackjack felt.
  g.fillStyle = '#6B2A3A'
  g.beginPath(); g.ellipse(72, 28, 62, 18, 0, Math.PI, 0); g.fill()
  g.fillStyle = '#C43B55'
  g.beginPath(); g.ellipse(72, 28, 54, 14, 0, Math.PI, 0); g.fill()
  g.fillStyle = '#FFF1C1'
  g.beginPath(); g.moveTo(72, 34); g.bezierCurveTo(60, 22, 58, 30, 72, 40); g.bezierCurveTo(86, 30, 84, 22, 72, 34); g.fill()
  for (const sx of [4, 132]) {
    g.strokeStyle = '#FFF1C1'; g.lineWidth = 1; g.beginPath(); g.arc(sx + 8, 40, 6, 0, 7); g.stroke()
  }
  return c
}
