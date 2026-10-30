/* Four-direction walk cycle: a line-for-line TS port of GD's tools/kit_dir.py compose_dir() (and the kit.py front
   parts it builds on), pixel-exact; world/test/walk.mjs checks all 12 samples x 4 directions x 6 poses (4 walk frames, stand, sit) against it.
   Pure (no DOM), so it runs in Node tests too. Palettes come from kit.gen.ts, same as the app's composeRGBA. */
import { BASE, CLOTH, FIXED, HAIRC, SKIN } from '../avatar/kit/kit.gen.ts'

export type Dir = 'down' | 'up' | 'left' | 'right'
export type Frame = 0 | 1 | 2 | 3 | 'stand' | 'sit' | 'piano0' | 'piano1' | 'sofaBody' | 'sofaLegs'
export const DIRS: Dir[] = ['down', 'up', 'left', 'right']
export const WALK_FRAME_MS = 160
const W = 24, H = 32, CX = 11
type G = string[][]
type O = Record<string, any>
const blank = (): G => Array.from({ length: H }, () => Array(W).fill('.'))
const put = (g: G, x: number, y: number, c: string) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c }
const rect = (g: G, x0: number, y0: number, x1: number, y1: number, c: string) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, c) }
const pts = (g: G, l: number[][], c: string) => { for (const [x, y] of l) put(g, x, y, c) }
const BUILDS: Record<string, [number, number]> = { slim: [4, 3], regular: [5, 4], broad: [6, 4] }
const armCols = (b: string) => { const sw = BUILDS[b][0]; return [[CX - sw - 3, CX - sw - 2], [CX + sw + 2, CX + sw + 3]] }
const BIG_HAIR = ['long', 'wavy', 'bob', 'afro']

// ═══ kit.py front parts ═══
function body(build: string) {
  const [sw, ww] = BUILDS[build], g = blank()
  rect(g, 7, 4, 15, 11, 'S'); rect(g, 8, 12, 14, 12, 'S')
  put(g, 6, 7, 's'); put(g, 6, 8, 's'); put(g, 16, 7, 's'); put(g, 16, 8, 's')
  put(g, 7, 11, 's'); put(g, 15, 11, 's'); rect(g, 9, 12, 13, 12, 'S'); rect(g, 10, 13, 12, 13, 's')
  for (let y = 14; y < 23; y++) { const hw = y < 19 ? sw : ww + (y < 20 ? 1 : 0); rect(g, CX - hw, y, CX + hw, y, 'S') }
  for (const side of [-1, 1]) {
    const ax = CX + side * (sw + 2), [x0, x1] = side < 0 ? [ax - 1, ax] : [ax, ax + 1]
    rect(g, x0, 15, x1, 21, 'S'); rect(g, x0, 22, x1, 23, 'S'); put(g, side < 0 ? x0 : x1, 23, 's')
  }
  rect(g, CX - ww, 23, CX + ww, 23, 'S')
  rect(g, 8, 24, 10, 29, 'J'); rect(g, 12, 24, 14, 29, 'J'); put(g, 10, 29, 'j'); put(g, 12, 29, 'j')
  return g
}
function top(kind: string, build: string) {
  const [sw, ww] = BUILDS[build], g = blank(), [[l0, l1], [r0, r1]] = armCols(build)
  const torso = (c = 'T', y1 = 22) => { for (let y = 14; y <= y1; y++) { const hw = y < 19 ? sw : ww + (y < 20 ? 1 : 0); rect(g, CX - hw, y, CX + hw, y, c); put(g, CX + hw, y, 't') } }
  const sleeves = (n: number, c = 'T') => { if (n) { rect(g, l0, 15, l1, 14 + n, c); rect(g, r0, 15, r1, 14 + n, c); rect(g, r1, 15, r1, 14 + n, 't'); put(g, l0 + 1, 14, c); put(g, r0, 14, c) } }
  if (kind === 'tee') { torso(); sleeves(3); rect(g, 10, 14, 12, 14, 'S'); put(g, CX, 15, 'S') }
  else if (kind === 'longsleeve') { torso(); sleeves(8); rect(g, 10, 14, 12, 14, 'S') }
  else if (kind === 'tank') { torso(); rect(g, CX - sw, 14, CX - sw + 1, 15, 'S'); rect(g, CX + sw - 1, 14, CX + sw, 15, 'S'); rect(g, 9, 14, 13, 15, 'S') }
  else if (kind === 'hoodie') { torso('T', 23); sleeves(8); rect(g, 9, 14, 13, 14, 't'); pts(g, [[10, 15], [12, 15], [10, 16], [12, 16]], 'W'); rect(g, 9, 20, 13, 21, 't') }
  else if (kind === 'shirt') { torso(); sleeves(8); rect(g, 10, 14, 12, 14, 'W'); put(g, CX, 14, 'S') }
  else if (kind === 'jacket') { torso(); sleeves(8); rect(g, 9, 14, 13, 22, 'W'); rect(g, 13, 15, 13, 22, 'w'); put(g, 8, 15, 'n'); put(g, 14, 15, 'n'); rect(g, 10, 14, 12, 14, 'S') }
  else if (kind === 'dress') {
    torso('T', 23)
    for (let y = 23; y < 27; y++) { const hw = ww + 1 + Math.floor((y - 23) / 2); rect(g, CX - hw, y, CX + hw, y, 'T'); put(g, CX + hw, y, 't') }
    rect(g, 10, 14, 12, 14, 'S'); put(g, CX, 15, 'S'); rect(g, CX - ww, 20, CX + ww, 20, 't')
  } else if (kind === 'jumper') { torso(); sleeves(8); rect(g, 10, 14, 12, 14, 't'); rect(g, CX - sw, 22, CX + sw, 22, 't'); put(g, l0, 22, 't'); put(g, r1, 22, 't') }
  return g
}
function bottom(kind: string) {
  const g = blank()
  if (kind === 'trousers' || kind === 'jeans') {
    rect(g, 7, 23, 15, 23, 'B'); rect(g, 8, 24, 10, 29, 'B'); rect(g, 12, 24, 14, 29, 'B')
    rect(g, 10, 25, 10, 29, 'b'); rect(g, 14, 24, 14, 29, 'b'); rect(g, 11, 23, 11, 23, 'b')
    if (kind === 'jeans') { put(g, 9, 24, 'b'); put(g, 13, 24, 'b'); pts(g, [[8, 29], [9, 29], [12, 29], [13, 29]], 'W') }
  } else if (kind === 'shorts') { rect(g, 7, 23, 15, 23, 'B'); rect(g, 8, 24, 10, 25, 'B'); rect(g, 12, 24, 14, 25, 'B'); rect(g, 14, 24, 14, 25, 'b') }
  else if (kind === 'skirt') { rect(g, 8, 23, 14, 23, 'B'); rect(g, 7, 24, 15, 25, 'B'); rect(g, 6, 26, 16, 26, 'B'); rect(g, 15, 24, 15, 26, 'b'); put(g, 16, 26, 'b') }
  return g
}
function shoes(kind: string) {
  const g = blank()
  if (kind === 'trainers') { rect(g, 7, 30, 10, 30, 'F'); rect(g, 12, 30, 15, 30, 'F'); rect(g, 7, 31, 10, 31, 'f'); rect(g, 12, 31, 15, 31, 'f') }
  else if (kind === 'boots') { rect(g, 8, 28, 10, 30, 'F'); rect(g, 12, 28, 14, 30, 'F'); rect(g, 7, 30, 7, 30, 'F'); rect(g, 15, 30, 15, 30, 'F'); rect(g, 7, 31, 10, 31, 'f'); rect(g, 12, 31, 15, 31, 'f') }
  else if (kind === 'heels') { rect(g, 8, 30, 10, 30, 'F'); rect(g, 12, 30, 14, 30, 'F'); put(g, 8, 31, 'f'); put(g, 14, 31, 'f'); put(g, 10, 31, 'F'); put(g, 12, 31, 'F') }
  else if (kind === 'flats') { rect(g, 7, 30, 10, 30, 'F'); rect(g, 12, 30, 15, 30, 'F'); rect(g, 8, 31, 10, 31, 'f'); rect(g, 12, 31, 14, 31, 'f') }
  return g
}
function face(kind: string) {
  const g = blank()
  pts(g, [[9, 7], [13, 7], [9, 8], [13, 8]], 'E'); rect(g, 8, 6, 10, 6, 'h'); rect(g, 12, 6, 14, 6, 'h')
  if (kind === 'a') { rect(g, 10, 10, 11, 10, 'L'); put(g, 12, 9, 'L') }
  else { put(g, 8, 7, 'E'); put(g, 14, 7, 'E'); rect(g, 10, 10, 12, 10, 'q'); put(g, 8, 9, 'r'); put(g, 14, 9, 'r') }
  return g
}
function hair(kind: string): [G, G] {
  const b = blank(), f = blank(), cap = () => { rect(f, 7, 3, 15, 4, 'H'); rect(f, 8, 2, 14, 2, 'H') }
  if (kind === 'buzz') { rect(f, 7, 3, 15, 3, 'h'); rect(f, 8, 2, 14, 2, 'h'); put(f, 7, 4, 'h'); put(f, 15, 4, 'h') }
  else if (kind === 'crop') { cap(); put(f, 7, 5, 'H'); put(f, 15, 5, 'H'); rect(f, 9, 2, 11, 2, 'g') }
  else if (kind === 'quiff') { cap(); rect(f, 8, 1, 13, 1, 'H'); rect(f, 9, 1, 11, 1, 'g'); rect(f, 9, 0, 12, 0, 'H'); put(f, 10, 2, 'g'); put(f, 7, 5, 'h'); put(f, 15, 5, 'h'); rect(f, 12, 4, 14, 4, 'h') }
  else if (kind === 'sidepart') { cap(); rect(f, 7, 5, 9, 5, 'H'); put(f, 15, 5, 'H'); put(f, 10, 3, 'h'); rect(f, 11, 2, 13, 2, 'g') }
  else if (kind === 'curly') {
    cap(); rect(f, 7, 1, 15, 1, 'H'); rect(f, 6, 2, 16, 5, 'H')
    pts(f, [[7, 1], [10, 1], [13, 1], [6, 3], [16, 4], [9, 2], [12, 3], [15, 2]], 'g'); pts(f, [[8, 4], [11, 4], [14, 4], [6, 5], [16, 5]], 'h')
    rect(f, 7, 5, 15, 5, '.'); put(f, 7, 5, 'H'); put(f, 15, 5, 'H')
  } else if (kind === 'afro') {
    rect(f, 5, 1, 17, 5, 'H'); rect(f, 7, 0, 15, 0, 'H'); rect(f, 4, 3, 18, 9, 'H'); rect(b, 4, 3, 18, 10, 'H')
    rect(f, 7, 5, 15, 9, '.'); rect(f, 6, 6, 16, 9, '.')
    pts(f, [[8, 1], [12, 0], [15, 2], [5, 4], [17, 6], [10, 2], [6, 8]], 'g'); pts(f, [[4, 8], [18, 8], [5, 9], [17, 9], [16, 4]], 'h')
  } else if (kind === 'bob') {
    cap(); rect(f, 7, 1, 15, 1, '.'); rect(f, 8, 1, 14, 1, 'H'); rect(f, 6, 3, 7, 11, 'H'); rect(f, 15, 3, 16, 11, 'H')
    rect(f, 8, 4, 11, 5, 'H'); rect(f, 9, 2, 12, 2, 'g'); rect(f, 16, 4, 16, 11, 'h'); rect(f, 7, 11, 7, 11, 'h')
  } else if (kind === 'long') {
    cap(); rect(f, 8, 1, 14, 1, 'H'); rect(f, 6, 3, 7, 13, 'H'); rect(f, 15, 3, 16, 13, 'H'); rect(f, 12, 4, 14, 5, 'H')
    rect(b, 5, 6, 17, 20, 'H'); rect(b, 6, 21, 16, 21, 'H'); rect(b, 5, 14, 5, 20, 'h'); rect(b, 17, 14, 17, 20, 'h')
    rect(f, 9, 2, 12, 2, 'g'); rect(f, 6, 11, 6, 13, 'h')
  } else if (kind === 'wavy') {
    cap(); rect(f, 8, 1, 14, 1, 'H'); rect(f, 6, 3, 7, 14, 'H'); rect(f, 15, 3, 16, 14, 'H'); rect(f, 8, 4, 10, 5, 'H')
    rect(b, 4, 6, 18, 19, 'H')
    for (let y = 6; y < 20; y += 3) { put(b, 4, y, '.'); put(b, 18, y + 1, '.'); put(f, 6, y + 1, 'h'); put(f, 16, y, 'h') }
    rect(b, 5, 20, 8, 20, 'H'); rect(b, 14, 20, 17, 20, 'H'); rect(f, 10, 2, 13, 2, 'g')
  } else if (kind === 'ponytail') {
    cap(); rect(f, 8, 1, 14, 1, 'H'); put(f, 7, 5, 'H'); put(f, 15, 5, 'H'); rect(f, 9, 2, 12, 2, 'g')
    rect(b, 16, 3, 17, 4, 'h'); rect(b, 17, 5, 19, 12, 'H'); rect(b, 18, 13, 19, 15, 'H'); put(b, 19, 16, 'h'); rect(b, 19, 6, 19, 12, 'h')
  } else if (kind === 'bun') {
    cap(); rect(f, 8, 1, 14, 1, 'H'); put(f, 7, 5, 'H'); put(f, 15, 5, 'H'); rect(b, 9, 0, 13, 1, 'H'); rect(f, 10, 0, 12, 0, 'H'); put(f, 11, 0, 'g'); rect(f, 10, 2, 12, 2, 'g')
    put(f, 7, 6, 'H'); put(f, 15, 6, 'H')
  }
  return [b, f]
}
function beard(kind: string) {
  const g = blank()
  if (kind === 'stubble') pts(g, [[8, 10], [14, 10], [8, 11], [10, 11], [12, 11], [14, 11], [9, 12], [11, 12], [13, 12]], 's')
  else if (kind === 'beard') {
    rect(g, 7, 9, 7, 11, 'H'); rect(g, 15, 9, 15, 11, 'H'); rect(g, 8, 11, 14, 12, 'H'); rect(g, 9, 13, 13, 13, 'H'); rect(g, 9, 10, 9, 10, 'H'); rect(g, 13, 10, 13, 10, 'H')
    put(g, 9, 9, 'h'); put(g, 13, 9, 'h'); rect(g, 10, 11, 12, 11, 'L')
  }
  return g
}
function acc(kind: string) {
  const g = blank()
  if (kind === 'glasses') {
    for (const x0 of [8, 12]) { rect(g, x0, 6, x0 + 2, 6, 'A'); rect(g, x0, 9, x0 + 2, 9, 'a'); pts(g, [[x0, 7], [x0 + 2, 7], [x0, 8], [x0 + 2, 8]], 'S') }
    pts(g, [[11, 7], [7, 7], [15, 7]], 'A')
  } else if (kind === 'shades') { rect(g, 7, 7, 15, 7, 'K'); rect(g, 8, 8, 10, 8, 'K'); rect(g, 12, 8, 14, 8, 'K'); put(g, 8, 7, 'w'); put(g, 12, 7, 'w') }
  else if (kind === 'earrings') { put(g, 6, 9, 'Y'); put(g, 16, 9, 'Y') }
  else if (kind === 'beanie') { rect(g, 9, 0, 13, 0, 'A'); rect(g, 8, 1, 14, 1, 'A'); rect(g, 7, 2, 15, 3, 'A'); put(g, 9, 1, 'O'); put(g, 8, 2, 'O'); rect(g, 7, 4, 15, 5, 'a'); put(g, 15, 2, 'a'); put(g, 15, 3, 'a') }
  else if (kind === 'cap') { rect(g, 8, 1, 14, 1, 'A'); rect(g, 7, 2, 15, 4, 'A'); put(g, 11, 1, 'a'); rect(g, 7, 4, 15, 4, 'a'); rect(g, 13, 5, 18, 5, 'a'); put(g, 9, 2, 'O') }
  return g
}

// ═══ kit_dir.py back view (up) ═══
const bodyUp = (build: string) => { const g = body(build); rect(g, 9, 12, 13, 12, 's'); return g }
const beardUp = (kind: string) => { const g = blank(); if (kind === 'beard') { rect(g, 7, 10, 7, 11, 'H'); rect(g, 15, 10, 15, 11, 'H') } return g }
function hairUp(kind: string): [G, G] {
  const b = blank(), f = blank(), cap = (y1: number, c = 'H') => { rect(f, 8, 2, 14, 2, c); rect(f, 7, 3, 15, y1, c) }
  if (kind === 'buzz') { cap(8, 'h'); rect(f, 8, 9, 14, 9, 'h') }
  else if (kind === 'crop' || kind === 'quiff' || kind === 'sidepart') {
    cap(9); rect(f, 8, 10, 14, 10, 'h'); rect(f, 15, 5, 15, 9, 'h'); rect(f, 9, 2, 11, 2, 'g')
    if (kind === 'quiff') { rect(f, 8, 1, 13, 1, 'H'); rect(f, 9, 0, 12, 0, 'H'); rect(f, 9, 1, 11, 1, 'g'); put(f, 10, 2, 'H') }
    if (kind === 'sidepart') { put(f, 12, 2, 'h'); put(f, 12, 3, 'h') }
  } else if (kind === 'curly') {
    rect(f, 7, 1, 15, 1, 'H'); rect(f, 6, 2, 16, 9, 'H'); rect(f, 7, 10, 15, 10, 'H')
    pts(f, [[7, 1], [10, 1], [13, 1], [6, 3], [9, 2], [12, 3], [15, 2], [8, 5], [14, 6], [11, 7], [7, 8]], 'g')
    pts(f, [[9, 4], [12, 5], [16, 4], [10, 8], [13, 9], [16, 8], [7, 10], [11, 10], [15, 10], [6, 6]], 'h')
  } else if (kind === 'afro') {
    rect(f, 7, 0, 15, 0, 'H'); rect(f, 5, 1, 17, 2, 'H'); rect(f, 4, 3, 18, 10, 'H')
    pts(f, [[8, 1], [12, 0], [15, 2], [5, 4], [10, 2], [7, 5], [13, 4], [10, 7], [15, 7]], 'g')
    pts(f, [[4, 8], [18, 8], [5, 10], [17, 10], [16, 4], [12, 9], [8, 9], [18, 5], [11, 5]], 'h')
    rect(f, 6, 10, 16, 10, 'h')
  } else if (kind === 'bob') {
    rect(f, 8, 1, 14, 1, 'H'); rect(f, 7, 2, 15, 2, 'H'); rect(f, 6, 3, 16, 11, 'H')
    rect(f, 16, 4, 16, 11, 'h'); rect(f, 7, 11, 15, 11, 'h'); rect(f, 9, 2, 12, 2, 'g')
  } else if (kind === 'long' || kind === 'wavy') {
    rect(f, 8, 1, 14, 1, 'H'); rect(f, 7, 2, 15, 2, 'H'); rect(f, 6, 3, 16, 5, 'H'); rect(f, 9, 2, 12, 2, 'g')
    if (kind === 'long') {
      rect(f, 5, 6, 17, 13, 'H'); rect(f, 7, 14, 15, 20, 'H'); rect(f, 8, 21, 14, 21, 'H')
      rect(f, 5, 10, 5, 13, 'h'); rect(f, 17, 8, 17, 13, 'h'); rect(f, 15, 14, 15, 20, 'h'); rect(f, 11, 9, 11, 20, 'h')
    } else {
      rect(f, 5, 6, 17, 13, 'H'); rect(f, 7, 14, 15, 19, 'H'); rect(f, 8, 20, 10, 20, 'H'); rect(f, 12, 20, 14, 20, 'H')
      for (let y = 7; y < 20; y += 3) { put(f, 9, y, 'h'); put(f, 13, y + 1, 'h'); put(f, 11, y + 2, 'h') }
      for (const y of [7, 13]) { put(f, 5, y, '.'); put(f, 17, y + 1, '.') }
      put(f, 7, 16, 'h'); put(f, 15, 18, 'h'); put(f, 11, 20, 'h'); rect(f, 17, 9, 17, 13, 'h'); rect(f, 15, 14, 15, 17, 'h')
    }
  } else if (kind === 'ponytail') {
    cap(8); rect(f, 15, 5, 15, 8, 'h'); rect(f, 9, 2, 12, 2, 'g'); rect(f, 10, 9, 12, 9, 'h')
    rect(f, 10, 10, 12, 15, 'H'); rect(f, 12, 10, 12, 15, 'h'); put(f, 11, 16, 'H'); put(f, 11, 17, 'h'); put(f, 11, 12, 'g')
  } else if (kind === 'bun') {
    cap(9); rect(f, 8, 10, 14, 10, 'h'); rect(f, 15, 5, 15, 9, 'h')
    rect(f, 10, 0, 12, 0, 'H'); rect(f, 9, 1, 13, 1, 'H'); put(f, 10, 0, 'g'); put(f, 9, 1, 'g'); rect(f, 10, 2, 12, 2, 'h')
  }
  return [b, f]
}
function topUp(kind: string, build: string) {
  const [sw, ww] = BUILDS[build], g = blank(), [[l0, l1], [r0, r1]] = armCols(build)
  const torso = (y1 = 22) => { for (let y = 14; y <= y1; y++) { const hw = y < 19 ? sw : ww + (y < 20 ? 1 : 0); rect(g, CX - hw, y, CX + hw, y, 'T'); put(g, CX + hw, y, 't') } }
  const sleeves = (n: number) => { if (n) { rect(g, l0, 15, l1, 14 + n, 'T'); rect(g, r0, 15, r1, 14 + n, 'T'); rect(g, r1, 15, r1, 14 + n, 't'); put(g, l0 + 1, 14, 'T'); put(g, r0, 14, 'T') } }
  if (kind === 'tee') { torso(); sleeves(3); rect(g, 10, 14, 12, 14, 't') }
  else if (kind === 'longsleeve') { torso(); sleeves(8); rect(g, 10, 14, 12, 14, 't') }
  else if (kind === 'tank') { torso(); rect(g, CX - sw, 14, CX - sw + 1, 15, 'S'); rect(g, CX + sw - 1, 14, CX + sw, 15, 'S'); rect(g, 10, 14, 12, 15, 'S') }
  else if (kind === 'hoodie') {
    torso(23); sleeves(8)
    rect(g, 9, 14, 13, 16, 'T'); rect(g, 8, 14, 8, 16, 't'); rect(g, 14, 14, 14, 16, 't'); rect(g, 9, 17, 13, 17, 't'); put(g, 10, 15, 'n')
    rect(g, CX - ww, 23, CX + ww, 23, 't')
  } else if (kind === 'shirt') { torso(); sleeves(8); rect(g, 9, 14, 13, 14, 'W'); rect(g, CX - sw + 1, 16, CX + sw - 1, 16, 't') }
  else if (kind === 'jacket') { torso(); sleeves(8); rect(g, 9, 14, 13, 14, 'n'); rect(g, 11, 20, 11, 22, 't') }
  else if (kind === 'dress') {
    torso(23)
    for (let y = 23; y < 27; y++) { const hw = ww + 1 + Math.floor((y - 23) / 2); rect(g, CX - hw, y, CX + hw, y, 'T'); put(g, CX + hw, y, 't') }
    rect(g, 10, 14, 12, 14, 'S'); rect(g, CX - ww, 20, CX + ww, 20, 't'); pts(g, [[10, 20], [12, 20], [10, 21], [12, 21]], 'n')
  } else if (kind === 'jumper') { torso(); sleeves(8); rect(g, 10, 14, 12, 14, 't'); rect(g, CX - sw, 22, CX + sw, 22, 't'); put(g, l0, 22, 't'); put(g, r1, 22, 't') }
  return g
}
function bottomUp(kind: string) {
  const g = bottom(kind)
  if (kind === 'jeans') { put(g, 9, 24, 'B'); put(g, 13, 24, 'B'); rect(g, 8, 24, 9, 24, 'b'); rect(g, 12, 24, 13, 24, 'b') }
  return g
}
function shoesUp(kind: string) {
  if (kind !== 'heels') return shoes(kind)
  const g = blank(); rect(g, 8, 30, 10, 30, 'F'); rect(g, 12, 30, 14, 30, 'F'); put(g, 9, 31, 'f'); put(g, 13, 31, 'f'); return g
}
function accUp(kind: string) {
  let g = blank()
  if (kind === 'glasses') { put(g, 7, 7, 'A'); put(g, 15, 7, 'A') }
  else if (kind === 'shades') { put(g, 7, 7, 'K'); put(g, 15, 7, 'K') }
  else if (kind === 'earrings') { put(g, 6, 9, 'Y'); put(g, 16, 9, 'Y') }
  else if (kind === 'beanie') g = acc('beanie')
  else if (kind === 'cap') { rect(g, 8, 1, 14, 1, 'A'); rect(g, 7, 2, 15, 4, 'A'); put(g, 11, 1, 'a'); rect(g, 11, 2, 11, 3, 'a'); rect(g, 7, 4, 15, 4, 'a'); put(g, 9, 2, 'O'); rect(g, 4, 5, 6, 5, 'a') }
  return g
}

// ═══ kit_dir.py side view (left; right = mirrored) ═══
type P = { bob: number; near_leg: string; far_leg: string; near_arm: string; far_arm: string }
type Gs = Record<string, G>
const gg = (gs: Gs, k: string) => (gs[k] ??= blank())
const SIDE_TORSO: Record<string, [number, number]> = { slim: [9, 13], regular: [9, 14], broad: [8, 14] }
const LEG: Record<string, number[]> = { straight: [10, 10, 10, 10, 10, 10], fwd: [10, 9, 9, 8, 8, 7], back: [10, 11, 11, 12, 12, 13], lift: [10, 10, 11, 12, 12] }
const ARM: Record<string, number[]> = { neutral: Array(9).fill(11), fwd: [11, 11, 10, 10, 9, 9, 8, 8], back: [12, 12, 13, 13, 14, 14, 15, 15] }
const GROUPS = ['far_leg', 'far_arm', 'main', 'near_leg', 'skirt', 'near_arm'], BOBBED = ['far_arm', 'main', 'skirt', 'near_arm']
function* limbs(p: P): Generator<[string, 'arm' | 'leg', number[][]]> {
  for (const d of ['far', 'near'] as const) {
    yield [d + '_arm', 'arm', ARM[p[`${d}_arm`]].map((x0, i) => [x0, 15 + i])]
    yield [d + '_leg', 'leg', LEG[p[`${d}_leg`]].map((x0, i) => [x0, 24 + i])]
  }
}
function bodyLeft(build: string, p: P) {
  const gs: Gs = {}, m = gg(gs, 'main'), [f, b] = SIDE_TORSO[build]
  rect(m, 8, 4, 15, 11, 'S'); put(m, 15, 11, '.'); put(m, 14, 11, 's'); put(m, 8, 11, 's')
  put(m, 7, 8, 'S'); rect(m, 9, 12, 10, 12, 'S'); rect(m, 11, 12, 13, 13, 's'); rect(m, 12, 7, 12, 8, 's')
  rect(m, f, 14, b, 22, 'S'); rect(m, 9, 23, 13, 23, 'S')
  for (const [grp, kind, ps] of limbs(p)) {
    const g = gg(gs, grp), near = grp.startsWith('near')
    ps.forEach(([x0, y], i) => {
      if (kind === 'arm') { const c = near ? 'S' : 's'; put(g, x0, y, c); put(g, x0 + 1, y, near && i < ps.length - 1 ? c : 's') }
      else rect(g, x0, y, x0 + 2, y, near ? 'J' : 'j')
    })
  }
  return gs
}
function faceLeft(kind: string) {
  const gs: Gs = {}, m = gg(gs, 'main'); rect(m, 9, 7, 9, 8, 'E'); rect(m, 8, 6, 10, 6, 'h')
  if (kind === 'a') { put(m, 8, 10, 'L'); put(m, 9, 10, 'L') } else { put(m, 10, 7, 'E'); put(m, 8, 10, 'q'); put(m, 9, 10, 'q'); put(m, 10, 9, 'r') }
  return gs
}
function beardLeft(kind: string) {
  const gs: Gs = {}, m = gg(gs, 'main')
  if (kind === 'stubble') pts(m, [[11, 10], [8, 11], [10, 11], [12, 11], [9, 12]], 's')
  else if (kind === 'beard') {
    rect(m, 11, 8, 11, 10, 'H'); rect(m, 9, 10, 12, 10, 'H'); rect(m, 8, 11, 12, 12, 'H'); rect(m, 8, 13, 10, 13, 'H')
    put(m, 8, 9, 'H'); put(m, 11, 8, 'h'); put(m, 12, 11, 'h'); put(m, 8, 10, 'L'); put(m, 9, 10, 'L')
  }
  return gs
}
function hairLeft(kind: string): [Gs, Gs] {
  const B: Gs = {}, F: Gs = {}, b = gg(B, 'main'), f = gg(F, 'main')
  const cap = (c = 'H') => { rect(f, 9, 2, 14, 2, c); rect(f, 8, 3, 15, 4, c); rect(f, 11, 5, 15, 6, c); rect(f, 13, 7, 15, 9, c); rect(f, 14, 10, 15, 10, 'h') }
  if (kind === 'buzz') { rect(f, 9, 2, 14, 2, 'h'); rect(f, 8, 3, 15, 3, 'h'); rect(f, 11, 4, 15, 5, 'h'); rect(f, 13, 6, 15, 8, 'h'); put(f, 8, 4, 'h') }
  else if (['crop', 'quiff', 'sidepart', 'ponytail', 'bun'].includes(kind)) {
    cap(); put(f, 8, 5, 'H'); rect(f, 10, 2, 12, 2, 'g'); rect(f, 15, 5, 15, 9, 'h')
    if (kind === 'quiff') { rect(f, 7, 1, 13, 1, 'H'); rect(f, 7, 0, 11, 0, 'H'); rect(f, 8, 1, 10, 1, 'g'); put(f, 7, 2, 'H'); put(f, 8, 5, 'h') }
    if (kind === 'sidepart') { rect(f, 8, 5, 9, 5, 'H'); put(f, 8, 6, 'H'); put(f, 9, 3, 'h') }
    if (kind === 'ponytail') { put(f, 16, 5, 'h'); put(f, 16, 4, 'h'); rect(b, 16, 6, 17, 12, 'H'); rect(b, 17, 13, 17, 15, 'H'); put(b, 17, 16, 'h'); rect(b, 17, 7, 17, 12, 'h'); put(b, 16, 8, 'g') }
    if (kind === 'bun') { rect(f, 11, 0, 13, 0, 'H'); rect(f, 10, 1, 14, 1, 'H'); put(f, 11, 0, 'g'); put(f, 10, 1, 'g'); rect(f, 11, 2, 13, 2, 'h') }
  } else if (kind === 'curly') {
    rect(f, 8, 1, 15, 1, 'H'); rect(f, 7, 2, 16, 4, 'H'); put(f, 8, 5, 'H'); rect(f, 11, 5, 16, 5, 'H'); rect(f, 13, 6, 16, 9, 'H'); rect(f, 14, 10, 15, 10, 'H')
    pts(f, [[8, 1], [11, 1], [14, 1], [7, 3], [10, 2], [13, 3], [16, 2], [14, 6]], 'g'); pts(f, [[9, 4], [12, 4], [16, 4], [15, 7], [13, 9], [16, 9], [15, 10]], 'h')
  } else if (kind === 'afro') {
    rect(f, 9, 0, 15, 0, 'H'); rect(f, 8, 1, 17, 1, 'H'); rect(f, 7, 2, 18, 4, 'H'); put(f, 8, 5, 'H'); rect(f, 11, 5, 18, 9, 'H'); rect(f, 13, 10, 17, 10, 'H')
    pts(f, [[9, 1], [13, 0], [16, 2], [7, 3], [11, 2], [14, 5], [17, 7]], 'g'); pts(f, [[18, 8], [17, 10], [13, 10], [12, 4], [15, 8], [18, 4], [9, 4]], 'h')
  } else if (kind === 'bob') {
    cap(); rect(f, 8, 1, 14, 1, 'H'); put(f, 8, 1, '.'); rect(f, 8, 4, 10, 5, 'H'); rect(f, 11, 5, 16, 11, 'H')
    rect(f, 16, 4, 16, 11, 'h'); rect(f, 12, 11, 15, 11, 'h'); rect(f, 10, 2, 12, 2, 'g'); put(f, 11, 5, '.'); put(f, 11, 11, '.'); rect(f, 11, 6, 11, 10, '.')
  } else if (kind === 'long' || kind === 'wavy') {
    cap(); rect(f, 9, 1, 14, 1, 'H'); put(f, 8, 5, 'H'); rect(f, 12, 5, 16, 13, 'H'); rect(f, 10, 2, 12, 2, 'g'); rect(f, 16, 7, 16, 13, 'h'); rect(f, 14, 10, 14, 13, 'h')
    if (kind === 'long') { rect(b, 14, 14, 16, 20, 'H'); rect(b, 14, 21, 15, 21, 'H'); rect(b, 16, 14, 16, 20, 'h') }
    else {
      rect(f, 17, 6, 17, 13, 'H'); rect(b, 14, 14, 17, 19, 'H'); rect(b, 14, 20, 16, 20, 'H')
      for (const y of [8, 11, 14, 17]) { const t = y < 14 ? f : b; put(t, 17, y, '.'); put(t, 15, y + 1, 'h') }
      rect(b, 17, 15, 17, 16, 'h')
    }
  }
  return [B, F]
}
function topLeft(kind: string, build: string, p: P) {
  const gs: Gs = {}, m = gg(gs, 'main'), [f, b] = SIDE_TORSO[build]
  const torso = (y1 = 22) => { rect(m, f, 14, b, y1, 'T'); rect(m, b, 14, b, y1, 't') }
  const sleeves = (n: number, cuff = false) => {
    for (const [grp, k, ps] of limbs(p)) {
      if (k !== 'arm') continue
      const near = grp.startsWith('near'), L = Math.min(n, ps.length - 1)
      ps.slice(0, L).forEach(([x0, y], i) => { const c = near ? (cuff && i === L - 1 ? 't' : 'T') : 't'; put(gg(gs, grp), x0, y, c); put(gg(gs, grp), x0 + 1, y, c) })
    }
  }
  if (kind === 'tee') { torso(); sleeves(3); rect(m, 10, 14, 11, 14, 'S') }
  else if (kind === 'longsleeve') { torso(); sleeves(8); rect(m, 10, 14, 11, 14, 'S') }
  else if (kind === 'tank') { torso(); rect(m, f, 14, 10, 15, 'S') }
  else if (kind === 'hoodie') {
    torso(23); sleeves(8)
    rect(m, 13, 12, 15, 15, 'T'); rect(m, 15, 12, 15, 15, 't'); rect(m, 13, 12, 14, 12, 't'); put(m, 15, 16, 't')
    rect(m, 10, 14, 10, 16, 'W'); put(m, 11, 14, 't'); rect(m, f, 20, f + 3, 21, 't')
  } else if (kind === 'shirt') { torso(); sleeves(8); rect(m, 11, 14, 12, 14, 'W'); put(m, 10, 14, 'S'); rect(m, f, 15, f, 22, 'n') }
  else if (kind === 'jacket') { torso(); sleeves(8); rect(m, f, 14, f, 22, 'W'); put(m, f + 1, 15, 'n'); put(m, f + 1, 14, 'n'); put(m, f + 1, 16, 'n'); rect(m, f + 1, 14, f + 1, 14, 'S') }
  else if (kind === 'dress') {
    torso(23); rect(m, 10, 14, 11, 14, 'S'); rect(m, f, 20, b, 20, 't'); put(gg(gs, 'skirt'), b + 1, 20, 'n'); put(gg(gs, 'skirt'), b + 1, 21, 'n')
    const s = gg(gs, 'skirt')
    for (let y = 23; y < 27; y++) { const e = Math.floor((y - 23 + 1) / 2), x1 = 13 + e + (y > 23 ? 1 : 0); rect(s, 9 - e, y, x1, y, 'T'); put(s, x1, y, 't') }
  } else if (kind === 'jumper') { torso(); sleeves(8, true); rect(m, 10, 14, 12, 14, 't'); rect(m, f, 22, b, 22, 't') }
  return gs
}
function bottomLeft(kind: string, p: P) {
  const gs: Gs = {}, m = gg(gs, 'main')
  if (kind === 'trousers' || kind === 'jeans' || kind === 'shorts') {
    rect(m, 9, 23, 13, 23, 'B'); put(m, 13, 23, 'b')
    const n = kind !== 'shorts' ? 6 : 2
    for (const [grp, k, ps] of limbs(p)) {
      if (k !== 'leg') continue
      const near = grp.startsWith('near'), g = gg(gs, grp)
      for (const [x0, y] of ps.slice(0, n)) { rect(g, x0, y, x0 + 2, y, near ? 'B' : 'b'); if (near) put(g, x0 + 2, y, 'b') }
      if (kind === 'jeans' && ps.length === 6) { const [x0, y] = ps[ps.length - 1]; rect(g, x0, y, x0 + 2, y, near ? 'W' : 'w') }
      if (kind === 'jeans' && near) put(g, ps[0][0] + 1, 24, 'b')
    }
  } else if (kind === 'skirt') {
    const s = gg(gs, 'skirt'); rect(s, 9, 23, 13, 23, 'B'); rect(s, 8, 24, 14, 25, 'B'); rect(s, 7, 26, 15, 26, 'B'); rect(s, 14, 24, 14, 25, 'b'); put(s, 15, 26, 'b')
  }
  return gs
}
function shoeLeft(g: G, kind: string, x0: number, y: number) {
  // one side-view shoe under a 3px leg whose last row is (x0..x0+2, y); toe points left
  const u = y + 1, s = y + 2
  if (kind === 'trainers') { rect(g, x0 - 1, u, x0 + 2, u, 'F'); rect(g, x0 - 1, s, x0 + 2, s, 'f') }
  else if (kind === 'boots') { rect(g, x0, u - 2, x0 + 2, u, 'F'); put(g, x0 - 1, u, 'F'); rect(g, x0 - 1, s, x0 + 2, s, 'f') }
  else if (kind === 'flats') { rect(g, x0 - 1, u, x0 + 2, u, 'F'); rect(g, x0 - 1, s, x0 + 1, s, 'f'); put(g, x0 + 2, s, 'F') }
  else if (kind === 'heels') { rect(g, x0, u, x0 + 2, u, 'F'); put(g, x0 - 1, s, 'F'); put(g, x0 + 2, s, 'f') }
}
function shoesLeft(kind: string, p: P) {
  const gs: Gs = {}
  for (const [grp, k, ps] of limbs(p)) {
    if (k !== 'leg') continue
    const [x0, y] = ps[ps.length - 1]; shoeLeft(gg(gs, grp), kind, x0, y)
  }
  return gs
}
function accLeft(kind: string) {
  const gs: Gs = {}, g = gg(gs, 'main')
  if (kind === 'glasses') { rect(g, 8, 7, 8, 8, 'A'); rect(g, 9, 6, 12, 6, 'A'); rect(g, 9, 9, 10, 9, 'a'); put(g, 10, 7, 'S'); put(g, 10, 8, 'S') }
  else if (kind === 'shades') { rect(g, 8, 7, 10, 8, 'K'); rect(g, 11, 7, 12, 7, 'K'); put(g, 9, 7, 'w') }
  else if (kind === 'earrings') put(g, 12, 9, 'Y')
  else if (kind === 'beanie') { rect(g, 10, 0, 14, 0, 'A'); rect(g, 9, 1, 15, 1, 'A'); rect(g, 8, 2, 15, 3, 'A'); put(g, 10, 1, 'O'); put(g, 9, 2, 'O'); rect(g, 8, 4, 15, 5, 'a'); put(g, 15, 2, 'a'); put(g, 15, 3, 'a') }
  else if (kind === 'cap') { rect(g, 9, 1, 14, 1, 'A'); rect(g, 8, 2, 15, 4, 'A'); put(g, 12, 1, 'a'); rect(g, 8, 4, 15, 4, 'a'); rect(g, 4, 5, 9, 5, 'a'); put(g, 10, 2, 'O') }
  return gs
}

// ═══ composition ═══
const LAYERS = ['hair_back', 'body', 'bottom', 'top', 'shoes', 'face', 'beard', 'hair_front', 'acc']
type FB = { bob: number; fwd: string | null; lift: string | null }
const FB_FRAMES: Record<string, FB> = { stand: { bob: 0, fwd: null, lift: null }, 0: { bob: 1, fwd: 'R', lift: null }, 1: { bob: 0, fwd: null, lift: 'R' }, 2: { bob: 1, fwd: 'L', lift: null }, 3: { bob: 0, fwd: null, lift: 'L' } }
const SIDE_FRAMES: Record<string, P> = {
  stand: { bob: 0, near_leg: 'straight', far_leg: 'straight', near_arm: 'neutral', far_arm: 'neutral' },
  0: { bob: 1, near_leg: 'fwd', far_leg: 'back', near_arm: 'back', far_arm: 'fwd' },
  1: { bob: 0, near_leg: 'straight', far_leg: 'lift', near_arm: 'neutral', far_arm: 'neutral' },
  2: { bob: 1, near_leg: 'back', far_leg: 'fwd', near_arm: 'fwd', far_arm: 'back' },
  3: { bob: 0, near_leg: 'lift', far_leg: 'straight', near_arm: 'neutral', far_arm: 'neutral' },
}
const hideHair = (o: O) => (o.acc === 'beanie' || o.acc === 'cap') && !BIG_HAIR.includes(o.hair)
const clipTop = (g: G, y0 = 5) => g.map((r, y) => (y < y0 ? Array(W).fill('.') : r.slice()))

function fbLayers(o: O, d: Dir): [string, G][] {
  let hb: G, hf: G; const L: Record<string, G> = {}
  if (d === 'down') {
    [hb, hf] = hair(o.hair)
    Object.assign(L, { body: body(o.build), bottom: bottom(o.bottom ?? 'none'), top: top(o.top, o.build), shoes: shoes(o.shoes), face: face(o.face ?? 'a'), beard: beard(o.beard ?? 'none'), acc: acc(o.acc ?? 'none') })
    if (hideHair(o)) { hf = blank(); if (o.hair !== 'bald') { rect(hf, 7, 5, 7, 6, 'H'); rect(hf, 15, 5, 15, 6, 'H') } }
  } else {
    [hb, hf] = hairUp(o.hair)
    Object.assign(L, { body: bodyUp(o.build), bottom: bottomUp(o.bottom ?? 'none'), top: topUp(o.top, o.build), shoes: shoesUp(o.shoes), face: blank(), beard: beardUp(o.beard ?? 'none'), acc: accUp(o.acc ?? 'none') })
    if (hideHair(o)) { hb = clipTop(hb); hf = clipTop(hf) }
  }
  L.hair_back = hb; L.hair_front = hf
  if (o.top === 'dress') L.bottom = blank()
  return LAYERS.map(n => [n, L[n]])
}
function fbSegment(layer: string, x: number, y: number, o: O) {
  const [[l0, l1], [r0, r1]] = armCols(o.build)
  if ((layer === 'body' || layer === 'top') && y >= 14 && y <= 23) { if (x >= l0 && x <= l1) return 'armL'; if (x >= r0 && x <= r1) return 'armR' }
  if ((layer === 'body' || layer === 'bottom' || layer === 'shoes') && y >= 24 && !(layer === 'bottom' && o.bottom === 'skirt')) { if (x <= 10) return 'legL'; if (x >= 12) return 'legR' }
  return 'upper'
}
function composeFb(o: O, d: Dir, frame: Frame) {
  const sp = FB_FRAMES[String(frame)], g = blank()
  for (const [name, L] of fbLayers(o, d)) {
    const items: [number, number, number, number, string][] = []
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = L[y][x]; if (c === '.') continue
      const seg = fbSegment(name, x, y, o), side = seg[seg.length - 1]; let ny = y, extra = 0, rank: number
      if (seg.startsWith('leg')) { rank = 0; if (sp.lift === side && y >= 27) { ny -= 1; extra = 1 } }
      else { rank = seg.startsWith('arm') ? 2 : 1; ny += sp.bob; if (rank === 2 && sp.fwd === side && y >= 19) { ny -= 1; extra = 1 } }
      items.push([rank, extra, x, ny, c])
    }
    items.sort((a, b) => a[0] - b[0] || a[1] - b[1])   // stable, like Python's sorted
    for (const [, , x, ny, c] of items) put(g, x, ny, c)
  }
  return g
}
function sideLayers(o: O, p: P): [string, Gs][] {
  const [hb, hf] = hairLeft(o.hair)
  if (hideHair(o)) for (const gs of [hb, hf]) for (const k of Object.keys(gs)) gs[k] = gs[k].map((r, y) => r.map((c, x) => (y >= 6 && x >= 13 ? c : '.')))
  const L: Record<string, Gs> = { hair_back: hb, body: bodyLeft(o.build, p), bottom: o.top !== 'dress' ? bottomLeft(o.bottom ?? 'none', p) : {},
    top: topLeft(o.top, o.build, p), shoes: shoesLeft(o.shoes, p), face: faceLeft(o.face ?? 'a'), beard: beardLeft(o.beard ?? 'none'), hair_front: hf, acc: accLeft(o.acc ?? 'none') }
  return LAYERS.map(n => [n, L[n]])
}
function composeSide(o: O, frame: Frame) {
  const p = SIDE_FRAMES[String(frame)], g = blank(), own: (string | null)[][] = Array.from({ length: H }, () => Array(W).fill(null)), layers = sideLayers(o, p)
  for (const grp of GROUPS) {
    const dy = BOBBED.includes(grp) ? p.bob : 0
    for (const [, gs] of layers) {
      const src = gs[grp]; if (!src) continue
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = src[y][x]; if (c !== '.' && y + dy >= 0 && y + dy < H) { g[y + dy][x] = c; own[y + dy][x] = grp } }
    }
  }
  const seam: number[][] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (own[y][x] === 'near_arm' && y >= 17 + p.bob)
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && X < W && Y >= 0 && Y < H && (own[Y][X] === 'main' || own[Y][X] === 'skirt') && g[Y][X] !== '.') seam.push([X, Y]) }
    if (own[y][x] === 'far_leg' && y >= 25 && [-1, 1].some(dx => x + dx >= 0 && x + dx < W && own[y][x + dx] === 'near_leg')) seam.push([x, y])
  }
  for (const [x, y] of seam) g[y][x] = 'K'
  return g
}
// ═══ SIT POSE ('sit'): kit_dir.py compose_side_sit / compose_fb_sit ═══
// Head, torso and arms drop SIT_D px; the feet stay on rows 30-31 as standing (same bottom-centre anchor).
export const SIT_D = 3
/** sprite top-left from the chair tile's top-left (kit_dir.py SIT_CHAIR_DX/DY): chair-left-seat → 'right' sitter, chair-right-seat → 'left' */
export const SIT_CHAIR = { leftSeat: [-2, -10], rightSeat: [-6, -10] } as const
const SIT_SIDE = { thigh: [24, 26, 6, 13], shin: [5, 27, 29], upperArm: [[11, 18], [11, 19], [10, 20]], forearm: [21, 22, 4, 11], hand: [2, 3] }
const SLEEVE: Record<string, number> = { tee: 3, longsleeve: 99, shirt: 99, hoodie: 99, jacket: 99, jumper: 99, tank: 0, dress: 0 }
type LegCodes = { thigh: string; thigh_s: string; cover: number; shin: string; shin_s: string; hem: string | null; k: string }
function sitLegCodes(o: O): LegCodes {
  const k = o.top === 'dress' ? 'dress' : (o.bottom ?? 'none')
  if (k === 'trousers' || k === 'jeans') return { thigh: 'B', thigh_s: 'b', cover: 13 - 7, shin: 'B', shin_s: 'b', hem: k === 'jeans' ? 'W' : null, k }
  if (k === 'shorts') return { thigh: 'B', thigh_s: 'b', cover: 4, shin: 'J', shin_s: 'j', hem: null, k }
  if (k === 'skirt') return { thigh: 'B', thigh_s: 'b', cover: 6, shin: 'J', shin_s: 'j', hem: null, k }
  if (k === 'dress') return { thigh: 'T', thigh_s: 't', cover: 6, shin: 'J', shin_s: 'j', hem: null, k }
  return { thigh: 'J', thigh_s: 'j', cover: 0, shin: 'J', shin_s: 'j', hem: null, k }
}
/** far_leg, far_arm, near_leg, lap, near_arm of the side sit pose (facing left) */
function sitSideLimbs(o: O): Gs {
  const gs: Gs = {}, C = sitLegCodes(o)
  const [y0, y1, x0, x1] = SIT_SIDE.thigh, [sx, s0, s1] = SIT_SIDE.shin
  for (const [grp, dx, dy] of [['far_leg', 2, -1], ['near_leg', 0, 0]] as const) {
    const g = gg(gs, grp), near = grp === 'near_leg'
    const [th, ths] = near ? [C.thigh, C.thigh_s] : [C.thigh_s, C.thigh_s]
    const [sh, shs] = near ? [C.shin, C.shin_s] : [C.shin_s, C.shin_s]
    // thigh: skin/tights from the knee, cloth from `cover` px behind the knee back to the hip
    for (let x = x0 + dx; x <= x1; x++) {
      let cloth = C.cover < x1 - x0 + 1 ? x >= x1 - C.cover + 1 : true
      if (C.k === 'trousers' || C.k === 'jeans') cloth = true
      for (let y = y0 + dy; y <= y1 + dy; y++) put(g, x, y, cloth ? (y < y1 + dy ? th : ths) : (y < y1 + dy ? sh : shs))
    }
    // shin straight down from the knee
    for (let y = near ? s0 : s0 + dy; y <= s1; y++) { rect(g, sx + dx, y, sx + dx + 2, y, sh); put(g, sx + dx + 2, y, shs) }
    if (C.hem && near) rect(g, sx, s1, sx + 2, s1, C.hem)
    else if (C.hem) rect(g, sx + dx, s1, sx + dx + 2, s1, 'w')
    shoeLeft(g, o.shoes, sx + dx, s1)
  }
  // skirt / dress drape over the lap, hanging 1px past the seat line
  if (C.k === 'skirt') { const lap = gg(gs, 'lap'); rect(lap, 7, 23, 13, 26, 'B'); rect(lap, 8, 27, 13, 27, 'b'); put(lap, 7, 26, 'b') }
  else if (C.k === 'dress') { const lap = gg(gs, 'lap'); rect(lap, 7, 24, 13, 26, 'T'); rect(lap, 8, 27, 13, 27, 't'); put(lap, 7, 26, 't') }
  // arms: upper arm down, forearm forward at table height, hand resting at the front
  const UA = SIT_SIDE.upperArm, [f0, f1, fx0, fx1] = SIT_SIDE.forearm, [hx0, hx1] = SIT_SIDE.hand
  const n = SLEEVE[o.top] ?? 0, cuff = o.top === 'jumper'
  for (const [grp, dx, dy] of [['far_arm', 1, -1], ['near_arm', 0, 0]] as const) {
    const g = gg(gs, grp), near = grp === 'near_arm'
    const units: number[][][] = UA.map(([x, y]) => [[x + dx, y + dy], [x + 1 + dx, y + dy]])   // upper arm angles forward to the elbow
    for (let x = fx1 + dx; x > fx0 - 1; x--) units.push([[x, f0 + dy], [x, f1 + dy]])
    const L = Math.min(n, units.length)
    units.forEach((u, i) => {
      const sleeve = i < L, c = sleeve ? (near ? (cuff && i === L - 1 ? 't' : 'T') : 't') : (near ? 'S' : 's')
      u.forEach(([x, y], j) => { const under = i >= UA.length && j === 1; put(g, x, y, under && near ? (sleeve ? 't' : 's') : c) })
    })
    rect(g, hx0 + dx - (near ? 0 : 1), f0 + dy, hx1 + dx, f1 + dy, near ? 'S' : 's')
    if (near) put(g, hx0, f1, 's')
  }
  return gs
}
function composeSideSit(o: O) {
  const layers = sideLayers(o, SIDE_FRAMES.stand), L = sitSideLimbs(o), g = blank(), own: (string | null)[][] = Array.from({ length: H }, () => Array(W).fill(null))
  const paint = (grid: G | undefined, grp: string, dy = 0) => { if (!grid) return
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = grid[y][x]; if (c !== '.' && y + dy >= 0 && y + dy < H) { g[y + dy][x] = c; own[y + dy][x] = grp } } }
  paint(L.far_leg, 'far_leg'); paint(L.far_arm, 'far_arm')
  for (const [, gs] of layers) if (gs.main) paint(gs.main, 'main', SIT_D)
  paint(L.near_leg, 'near_leg'); paint(L.lap, 'skirt'); paint(L.near_arm, 'near_arm')
  const seam: number[][] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (own[y][x] === 'near_arm')
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1]]) { const X = x + dx, Y = y + dy
        if (X >= 0 && X < W && Y >= 0 && Y < H && (own[Y][X] === 'main' || own[Y][X] === 'skirt') && g[Y][X] !== '.' && Y >= 18 + SIT_D) seam.push([X, Y]) }
    if (own[y][x] === 'far_leg' && y >= 27 && [-1, 1].some(dx => x + dx >= 0 && x + dx < W && own[y][x + dx] === 'near_leg')) seam.push([x, y])
  }
  for (const [x, y] of seam) g[y][x] = 'K'
  return g
}
/** front/back sit: rows above the hips drop SIT_D, legs keep only their lower rows (shins), feet stay put */
function composeFbSit(o: O, d: Dir) {
  const g = blank(), [[l0, l1], [r0, r1]] = armCols(o.build), keep = d === 'down' ? 19 : 20
  const items: [number, number, number, string][] = []
  for (const [name, Lr] of fbLayers(o, d)) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = Lr[y][x]; if (c === '.') continue
    const seg = fbSegment(name, x, y, o)
    if (seg.startsWith('leg')) { if (y < 24 + SIT_D) continue; items.push([0, x, y, c]) }
    else if (seg.startsWith('arm')) { if (y > keep) continue; items.push([2, x, y + SIT_D, c]) }
    else items.push([1, x, y + SIT_D, c])
  }
  items.sort((a, b) => a[0] - b[0])   // stable, like Python's sorted
  for (const [, x, y, c] of items) put(g, x, y, c)
  // knees: the top shin row widens 1px each side, the row under it is the knee shadow, so the legs read as bent
  const ky = 24 + SIT_D, C = sitLegCodes(o)
  if (C.k !== 'skirt' && C.k !== 'dress') {
    const [kc, ks] = C.k === 'trousers' || C.k === 'jeans' ? ['B', 'b'] : ['J', 'j']
    rect(g, 7, ky, 10, ky, kc); rect(g, 12, ky, 15, ky, kc); put(g, 10, ky, ks); put(g, 15, ky, ks)
    for (const x of [8, 9, 10, 12, 13, 14]) if ([kc, ks, 'W'].includes(g[ky + 1][x])) g[ky + 1][x] = ks
  }
  if (d === 'down') {   // forearms come forward: hands rest in front of the lap
    const n = SLEEVE[o.top] ?? 0, yb = keep + SIT_D
    for (const [side, [a0, a1]] of [[-1, [l0, l1]], [1, [r0, r1]]] as const) {
      const inner = side < 0 ? a1 : a0, step = -side, c1 = n >= 8 ? 'T' : 'S'
      put(g, inner, yb + 1, c1); put(g, inner + step, yb + 1, c1 === 'S' ? c1 : 't')
      put(g, inner + 2 * step, yb + 1, c1 === 'T' ? 't' : 'S')
      put(g, inner + 2 * step, yb + 2, 'S'); put(g, inner + 3 * step, yb + 2, 'S')
      put(g, inner + 2 * step, yb + 3, 's'); put(g, inner + 3 * step, yb + 3, 's')
      put(g, inner + step, yb + 2, 'K')
      for (const x of [a0, a1]) if (x !== inner) put(g, x, yb + 1, '.')
    }
  } else for (const x of [l0, r1]) put(g, x, keep + SIT_D, '.')   // from behind the forearms are hidden
  return g
}
// ═══ SOFA SIT ('sofa', down only): kit_dir.py compose_sofa → (body, legs) ═══
// body = the down 'sit' pose cut at SOFA_CUT (drawn between the sofa back and front); legs = lap, knees, shins, shoes and
// hands (drawn over the sofa front). Same 24x32 cell and anchor as stand/sit.
export const SOFA_CUT = 23
function sofaBodyG(o: O) { const gs = composeFbSit(o, 'down'), g = blank(); for (let y = 0; y < SOFA_CUT; y++) g[y] = gs[y].slice(); return g }
function sofaLegsG(o: O) {
  const g = blank(), C = sitLegCodes(o), k = C.k, th = C.thigh, ths = C.thigh_s
  const [shin, shs] = k === 'trousers' || k === 'jeans' ? ['B', 'b'] : ['J', 'j']
  let top: number
  if (k === 'skirt' || k === 'dress') {
    rect(g, 6, 21, 16, 24, th); rect(g, 6, 24, 16, 24, ths); put(g, 16, 22, ths); put(g, 16, 23, ths); put(g, 11, 23, ths)
    top = 25
  } else {
    rect(g, 6, 21, 16, 22, th); put(g, 11, 22, ths); put(g, 16, 21, ths); put(g, 16, 22, ths)
    const [kc, kcs] = k === 'trousers' || k === 'jeans' ? [th, ths] : [shin, shs]
    rect(g, 6, 23, 10, 23, kc); rect(g, 12, 23, 16, 23, kc); put(g, 10, 23, kcs); put(g, 16, 23, kcs)
    if (k === 'shorts') { rect(g, 6, 22, 10, 22, ths); rect(g, 12, 22, 16, 22, ths) }
    top = 24
  }
  for (const x0 of [7, 13]) {
    rect(g, x0, top, x0 + 2, 29, shin); rect(g, x0 + 2, top, x0 + 2, 29, shs)
    if (top === 24) rect(g, x0, 24, x0 + 2, 24, shs)
  }
  if (k === 'jeans') { rect(g, 7, 29, 8, 29, 'W'); rect(g, 13, 29, 14, 29, 'W') }
  const sh = shoes(o.shoes)
  for (let y = 28; y < H; y++) for (let x = 0; x < W; x++) if (sh[y][x] !== '.') put(g, x, y, sh[y][x])
  for (const hx of [6, 15]) { rect(g, hx, 21, hx + 1, 21, 'S'); rect(g, hx, 22, hx + 1, 22, 's') }
  return g
}
/** GD's kit_piano.py compose_piano(o, frame): the back-view sit with the forearms forward on the keys (hidden), the
    elbows angled out; on each frame one arm presses (0 = left, 1 = right): its elbow drops 1 px and swings 1 px out. */
function composePianoG(o: O, frame: 0 | 1) {
  const g = blank(), press = frame === 0 ? 'L' : 'R', items: [number, number, number, string][] = []
  for (const [name, Lr] of fbLayers(o, 'up')) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = Lr[y][x]; if (c === '.') continue
    const seg = fbSegment(name, x, y, o)
    if (seg.startsWith('leg')) { if (y < 24 + SIT_D) continue; items.push([0, x, y, c]) }
    else if (seg.startsWith('arm')) {
      if (y > 19) continue
      const side = seg[seg.length - 1]; let ny = y + SIT_D, nx = x
      if (y >= 17 && side === press) { ny += 1; nx += side === 'L' ? -1 : 1 }
      items.push([2, nx, ny, c])
      if (y === 19 && side === press) items.push([2, x, y + SIT_D, c])
    } else items.push([1, x, y + SIT_D, c])
  }
  items.sort((a, b) => a[0] - b[0])   // stable, like Python's sorted
  for (const [, x, y, c] of items) put(g, x, y, c)
  return g
}
/** Piano pose placement on GD's solo bench (32x16 at bx,by): sprite top-left = (bx + 4, by - 21); 220 ms a frame. */
export const PIANO_DX = 4, PIANO_DY = -21, PIANO_FRAME_MS = 220
function outline(g: G) {
  const out = g.map(r => r.slice()), solid = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H && g[y][x] !== '.' && g[y][x] !== 'K'
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === '.' && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) out[y][x] = 'K'
  return out
}
function fillHoles(g: G) {
  const out = g.map(r => r.slice())
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] === '.' && g[y][x + 1] !== '.' && g[y][x - 1] !== '.' && g[y + 1][x] !== '.' && g[y - 1][x] !== '.') out[y][x] = 'K'
  return out
}
/** kit_dir.py palette(): slot → hex. Unknown colour names fall back to the first entry (same as the app's slotColours). */
export function palette(o: O): Record<string, string> {
  const pick = (p: Record<string, readonly string[]>, k?: string | null) => (k && p[k]) || Object.values(p)[0]
  const sk = pick(SKIN, o.skin), hc = pick(HAIRC, o.hairc), tc = pick(CLOTH, o.topc), bc = pick(CLOTH, o.bottomc), fc = pick(CLOTH, o.shoec)
  const ac = pick(CLOTH, o.accc ?? (o.acc === 'glasses' ? 'black' : 'butter')), tg = o.tights ? CLOTH[o.tights] : null
  return { ...FIXED, S: sk[0], s: sk[1], r: sk[2], L: sk[3], q: sk[3], H: hc[0], h: hc[1], g: hc[2], T: tc[0], t: tc[1], n: tc[2],
    B: bc[0], b: bc[1], J: tg ? tg[0] : sk[0], j: tg ? tg[1] : sk[1], F: fc[0], f: fc[1], A: ac[0], a: ac[1], O: ac[2] }
}
/** compose_dir(config, direction, frame) → RGBA bytes (frame 0..3, 'stand' or 'sit'), 24x32, row-major. */
export function composeDir(cfg: O, d: Dir, frame: Frame = 'stand'): Uint8ClampedArray<ArrayBuffer> {
  const o: O = { ...BASE }
  for (const [k, v] of Object.entries(cfg)) if (v !== undefined) o[k] = v   // Python's dict(BASE, **o)
  const fb = d === 'down' || d === 'up'
  let g = frame === 'sofaBody' ? sofaBodyG(o) : frame === 'sofaLegs' ? sofaLegsG(o) : frame === 'piano0' || frame === 'piano1' ? composePianoG(o, frame === 'piano0' ? 0 : 1)
    : frame === 'sit' ? (fb ? composeFbSit(o, d) : composeSideSit(o)) : fb ? composeFb(o, d, frame) : composeSide(o, frame)
  g = outline(g); if (d === 'left' || d === 'right') g = fillHoles(g)
  const pal = palette(o), px = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = g[y][x]; if (c === '.') continue
    const h = pal[c] ?? '#ff00ff', X = d === 'right' ? W - 1 - x : x, i = (y * W + X) * 4
    px[i] = parseInt(h.slice(1, 3), 16); px[i + 1] = parseInt(h.slice(3, 5), 16); px[i + 2] = parseInt(h.slice(5, 7), 16); px[i + 3] = 255
  }
  return px
}
/** Feet anchor (x of the centre of the lowest opaque row in the stand pose) per direction: the mirrored right view sits
    1 px off the other three, so every frame of a direction is drawn with this column on the character's ground point. */
export function footX(px: Uint8ClampedArray): number {
  for (let y = H - 1; y >= 0; y--) { let a = -1, b = -1; for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3]) { if (a < 0) a = x; b = x } if (a >= 0) return (a + b + 1) / 2 }
  return W / 2
}
export const WALK_W = W, WALK_H = H
