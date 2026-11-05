/* Pixeldate World · café tile map. Shared by the server (collisions, seats, pathfinding) and the client (art, tap-to-walk
   preview), so both always agree on what is walkable. The art is GD's (design/pixeldate/world, copied into
   src/world/art); the grid below is hand-written over it, tile by tile, from GD's scene layout (src/build.py landscape()).
   Legend: # wall / wall top · C bar counter (and the staff side behind it) · T table for two · c chair back
           s chair seat (sit here) · P plant · L standing lamp · S sofa / candle side table · K piano + bench
           p the piano bench seats: the solo seat in the middle, the duet's Bass (left) and Melody (right) either side
             (shared/piano.ts, shared/duet.ts); never walked across, only sat on
           g a Games Room table's extra seat (up to four at a table) · D doormat / door · . floor
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
    '#.............................LSSSSSSS.#',
    '#.............................LSSSSSSS.#',
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
    '#...sTTs....cTTc....cTTc..........ppp..#',
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
  /** 40x24 Games Room (placeholder art until GD's lands: src/world/art/games-map.png, same grid). Tables are for up to four:
      the 2x2 table with the pair's two seats either side of its lower row (s, the café's table for two) and two more on
      its upper row (g). D: the door back to the café. */
  games: {
    art: 'games-map.png',
    rows: [
    '########################################',
    '########################################',
    '########################################',
    '#P..................DD................P#',
    '#......................................#',
    '#......................................#',
    '#...gTTg.....gTTg.....gTTg.....gTTg....#',
    '#...sTTs.....sTTs.....sTTs.....sTTs....#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#P.....................................#',
    '#...gTTg.....gTTg.....gTTg.....gTTg....#',
    '#...sTTs.....sTTs.....sTTs.....sTTs....#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#P....................................P#',
    '#...gTTg.....gTTg.....gTTg.....gTTg....#',
    '#...sTTs.....sTTs.....sTTs.....sTTs....#',
    '#......................................#',
    '#......................................#',
    '#P....................................P#',
    '########################################',
    ],
    spawns: [[20, 4], [21, 4], [19, 4], [22, 4], [20, 5], [21, 5], [19, 5], [22, 5], [18, 4], [23, 4]],
    lights: [],
  },
}
/** Which map a room instance uses: games-N is the Games Room, everything else the café. */
export type MapId = 'cafe-landscape' | 'games'
export const mapOf = (room: string): MapId => room.startsWith('games-') ? 'games' : 'cafe-landscape'
/** The door tile(s): the café's doormat leads to the Games Room, the Games Room's door back to the café. */
export const isDoor = (x: number, y: number) => at(x, y) === 'D'
export const MAP_ID: MapId = 'cafe-landscape'
export interface Table { id: number; x: number; y: number; seats: [[number, number], [number, number]]
  /** Games Room tables: the two extra seats on the upper row (2-4 players) */ extra: [number, number][] }
const BLOCK = new Set(['#', 'C', 'T', 'c', 'P', 'L', 'S', 'K'])
/* The current map. Every Room (server) and the client switch with useMap() before touching the grid; the exports are
   live bindings, so importers always see the current one. JS is single-threaded and a Room calls useMap() at the top
   of each entry point, so two rooms in one isolate never see each other's map. All maps are the same size. */
export let MAP: MapDef, ROWS: string[], W = 40, H = 24, TABLES: Table[] = [], SPAWNS: [number, number][] = [], CUR: MapId = MAP_ID
const built = new Map<MapId, { tables: Table[] }>()
export function useMap(id: MapId) {
  if (id === CUR && ROWS) return
  const m = MAPS[id]; MAP = m; ROWS = m.rows; CUR = id; SPAWNS = m.spawns
  if (ROWS[0].length !== W || ROWS.length !== H) throw new Error('map size')
  for (const r of ROWS) if (r.length !== W) throw new Error('map row width')
  let b = built.get(id)
  if (!b) { const tables: Table[] = []
    /** Every table: a 2x2 table with a seat either side on its lower row, exactly where GD drew the chairs (+ g seats above). */
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (ROWS[y][x] === 's' && ROWS[y][x + 1] === 'T' && ROWS[y][x + 2] === 'T' && ROWS[y][x + 3] === 's') {
        const extra: [number, number][] = y > 0 && ROWS[y - 1][x] === 'g' && ROWS[y - 1][x + 3] === 'g' ? [[x, y - 1], [x + 3, y - 1]] : []
        tables.push({ id: tables.length, x: x + 1, y, seats: [[x, y], [x + 3, y]], extra }) }
    b = { tables }; built.set(id, b) }
  TABLES = b.tables
}
for (const id of Object.keys(MAPS) as MapId[]) useMap(id)   // checks every map's size once
useMap(MAP_ID)
export const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H) ? '#' : ROWS[y][x]
/** Can a foot stand on tile (x, y)? The doormat counts, so people can walk in. */
export const walkable = (x: number, y: number) => !BLOCK.has(at(x, y))
/** a chair: the café's s, or a Games Room table's extra g */
export const isSeat = (x: number, y: number) => { const c = at(x, y); return c === 's' || c === 'g' }
export const isPianoSeat = (x: number, y: number) => at(x, y) === 'p'
/** every seat of table t (the pair's two first) */
export const seatsOf = (t: Table): [number, number][] => [...t.seats, ...t.extra]
