/** Placeholder blackjack table, painted in art pixels (nearest-neighbour, same as the lounge).
    Size is one table: 9 tiles wide, 4 tall. The top tile is the BLACKJACK sign; the felt origin
    on the map is the tile below that (see world/shared/map.ts).
    To drop in the designer's art, load a PNG of BJ_PX width × height and use it in place of paintBjTable(). */
export const BJ_PX = { w: 144, h: 64 }

const FONT: Record<string, string> = {
  A: '01110/10001/10001/11111/10001/10001/10001',
  B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01111/10000/10000/10000/10000/10000/01111',
  J: '00111/00001/00001/00001/10001/10001/01110',
  K: '10001/10010/10100/11000/10100/10010/10001',
  L: '10000/10000/10000/10000/10000/10000/11111',
  I: '11111/00100/00100/00100/00100/00100/11111',
}
const px = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => { g.fillStyle = color; g.fillRect(x, y, w, h) }

export function paintBjTable() {
  const c = document.createElement('canvas')
  c.width = BJ_PX.w; c.height = BJ_PX.h
  const g = c.getContext('2d')!
  // sign rail
  px(g, 28, 1, 88, 14, '#3A2414')
  px(g, 30, 2, 84, 12, '#F4C27A')
  const word = 'BLACKJACK', gw = 6, wordW = word.length * gw - 1
  let x = Math.floor((BJ_PX.w - wordW) / 2)
  for (const ch of word) {
    FONT[ch].split('/').forEach((row, y) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') px(g, x + i, 4 + y, 1, 1, '#1A1208') })
    x += gw
  }
  // wood rim and green felt, a wide semicircle opening toward the seats
  g.fillStyle = '#6B3A1E'
  g.beginPath(); g.ellipse(72, 22, 66, 40, 0, 0, Math.PI); g.fill()
  g.fillStyle = '#1E7A45'
  g.beginPath(); g.ellipse(72, 22, 58, 34, 0, 0, Math.PI); g.fill()
  g.fillStyle = '#17693B'
  g.beginPath(); g.ellipse(72, 24, 40, 18, 0, 0, Math.PI); g.fill()
  // dealer shoe + a few coins
  px(g, 58, 18, 16, 10, '#24160C')
  for (const [cx, col] of [[40, '#FFF1C1'], [48, '#FF6F59'], [96, '#FFD84D'], [104, '#48E5C2']] as const) {
    g.fillStyle = col; g.beginPath(); g.arc(cx, 30, 3, 0, 7); g.fill()
  }
  // five seat spots along the rail (local px of the b tiles)
  for (const [sx, sy] of [[4, 36], [36, 52], [68, 52], [100, 52], [132, 36]]) {
    g.strokeStyle = '#F4C27A'; g.lineWidth = 1; g.beginPath(); g.arc(sx + 8, sy + 8, 6, 0, 7); g.stroke()
  }
  return c
}
