/* Pixeldate World · café tile map. Shared by the server (collisions, seats, pathfinding) and the client (art, tap-to-walk
   preview), so both always agree on what is walkable. The art is GD's (design/pixeldate/world, copied into
   src/world/art); the grid below is hand-written over it, tile by tile, from GD's scene layout (src/build.py landscape()).
   Legend: # wall / wall top · C bar counter (and the staff side behind it) · T table for two · c chair back
           s chair seat (sit here) · P plant · L standing lamp · S sofa / candle side table · K piano + bench
           D doormat (spawn) · . floor
   All blocked: # C T c P L S K. Rugs are art only (walkable). */
export const TILE = 16
export type Light = { kind: 'table' | 'pendant' | 'floor'; x: number; y: number }
export interface MapDef { art: string; rows: string[]; spawns: [number, number][]; lights: Light[] }
const T = TILE
const tableAt: [number, number][] = [[2, 8], [2, 13], [12, 8], [18, 8], [24, 8], [12, 14], [18, 14], [24, 14], [32, 10], [4, 19], [12, 20], [20, 20]]
export const MAPS: Record<string, MapDef> = {
  /** 40x24 landscape café: the ONE shared world for phone and desktop. (GD's portrait cafe-map.png is not used.) */
  'cafe-landscape': {
    art: 'cafe-map-landscape.png',
    rows: [
    '########################################',
    '########################################',
    '########################################',
    '#CCCCCCCCC..............PDD.P....P....P#',
    '#CCCCCCCCCP.................P..........#',
    '#CCCCCCCCCP...................L........#',
    '#.............................LSS.SSS..#',
    '#.............................LSS.SSS..#',
    '#.cTTc......cTTc..cTTc..cTTc...........#',
    '#.sTTs......sTTs..sTTs..sTTs...........#',
    '#...............................cTTc...#',
    '#...............................sTTs...#',
    '#......................................#',
    '#.cTTc................................P#',
    '#.sTTs......cTTc..cTTc..cTTc..........P#',
    '#...........sTTs..sTTs..sTTs...L.......#',
    '#..............................L.......#',
    '#..............................L..KKK..#',
    '#P................................KKK..#',
    '#P..cTTc..........................KKK..#',
    '#...sTTs....cTTc....cTTc..........KKK..#',
    '#P.......P..sTTs....sTTs...P...........#',
    '#P.........................P...........#',
    '########################################',
    ],
    spawns: [[25, 4], [26, 4], [25, 5], [26, 5], [24, 4], [27, 4], [24, 5], [27, 5], [25, 6], [26, 6]],
    // light points from GD's scene: table lamps (x+T+16, y+13), bar pendants, floor lamps (col*T+8, row*T+22), candles
    lights: [
      ...tableAt.map(([c, r]) => ({ kind: 'table' as const, x: c * T + T + 16, y: r * T + 13 })),
      { kind: 'pendant', x: 43.5, y: 54 }, { kind: 'pendant', x: 107.5, y: 54 },
      { kind: 'floor', x: 30 * T + 8, y: 5 * T + 22 }, { kind: 'floor', x: 31 * T + 8, y: 15 * T + 22 },
      { kind: 'table', x: 34 * T + 8, y: 6 * T + 14 },
    ],
  },
}
/** The map choice: ONE config value. */
export const MAP_ID = 'cafe-landscape'
export const MAP = MAPS[MAP_ID]
export const ROWS = MAP.rows
export const W = ROWS[0].length, H = ROWS.length
for (const r of ROWS) if (r.length !== W) throw new Error('map row width')
export const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H) ? '#' : ROWS[y][x]
const BLOCK = new Set(['#', 'C', 'T', 'c', 'P', 'L', 'S', 'K'])
/** Can a foot stand on tile (x, y)? The doormat counts, so people can walk in. */
export const walkable = (x: number, y: number) => !BLOCK.has(at(x, y))
export const isSeat = (x: number, y: number) => at(x, y) === 's'
export interface Table { id: number; x: number; y: number; seats: [[number, number], [number, number]] }
/** Every table for two: a 2x2 table with a seat either side on its lower row, exactly where GD drew the chairs. */
export const TABLES: Table[] = []
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
  if (at(x, y) === 's' && at(x + 1, y) === 'T' && at(x + 2, y) === 'T' && at(x + 3, y) === 's')
    TABLES.push({ id: TABLES.length, x: x + 1, y, seats: [[x, y], [x + 3, y]] })
export const SPAWNS = MAP.spawns
