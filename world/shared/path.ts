/* A* on the café grid, 8 directions without cutting wall corners. Shared by server and client. */
import { H, W, walkable } from './map.ts'
export type P = [number, number]
export function findPath(from: P, to: P, blocked?: (x: number, y: number) => boolean): P[] | null {
  const ok = (x: number, y: number) => walkable(x, y) && !(blocked && blocked(x, y) && !(x === to[0] && y === to[1]))
  if (!walkable(to[0], to[1])) return null
  const idx = (x: number, y: number) => y * W + x, N = W * H
  const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N)
  const open: number[] = [], h = (i: number) => { const x = i % W, y = (i / W) | 0, dx = Math.abs(x - to[0]), dy = Math.abs(y - to[1]); return Math.max(dx, dy) + .41 * Math.min(dx, dy) }
  const s = idx(from[0], from[1]), t = idx(to[0], to[1]); g[s] = 0; open.push(s)
  while (open.length) {
    let bi = 0, bf = Infinity
    for (let k = 0; k < open.length; k++) { const f = g[open[k]] + h(open[k]); if (f < bf) { bf = f; bi = k } }
    const c = open.splice(bi, 1)[0]; if (c === t) break; if (closed[c]) continue; closed[c] = 1
    const cx = c % W, cy = (c / W) | 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = cx + dx, ny = cy + dy; if (!ok(nx, ny)) continue
      if (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue // no corner cutting
      const n = idx(nx, ny), ng = g[c] + (dx && dy ? 1.414 : 1)
      if (ng < g[n]) { g[n] = ng; came[n] = c; open.push(n) }
    }
  }
  if (came[t] < 0 && s !== t) return null
  const out: P[] = []; for (let c = t; c !== s; c = came[c]) out.push([c % W, (c / W) | 0])
  return out.reverse()
}
/** Nearest walkable tile to (x, y) (tap on a wall walks next to it). */
export function nearestWalkable(x: number, y: number): P | null {
  for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
    if (Math.max(Math.abs(dx), Math.abs(dy)) === r && walkable(x + dx, y + dy)) return [x + dx, y + dy]
  return null
}
