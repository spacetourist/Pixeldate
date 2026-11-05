/* Pixeldate World · café tile map. Shared by the server (collisions, seats, pathfinding) and the client (art, tap-to-walk
   preview), so both always agree on what is walkable. The art is GD's (design/pixeldate/world, copied into
   src/world/art); the grid below is hand-written over it, tile by tile, from GD's scene layout (src/build.py landscape()).
   Legend: # wall / wall top · C bar counter (and the staff side behind it) · T table for two · c chair back
           s chair seat (sit here) · P plant · L standing lamp · S sofa / candle side table · K piano + bench
           p the piano bench seats: the solo seat in the middle, the duet's Bass (left) and Melody (right) either side
             (shared/piano.ts, shared/duet.ts); never walked across, only sat on
           g a Games Lounge table's extra seat (up to four at a table) · D doormat / door · . floor
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
  /** 40x24 Games Lounge (placeholder velvet + warm lamps until GD's art lands: src/world/art/games-map.png, same grid).
      v1: tables for two, exactly the café's (s T T s), so the pair logic is the café's. The map format still allows g
      (extra seats on the row above) for bigger tables later. D: the door back to the café. */
  /** 40x24 Games Lounge: GD's games-lounge pack (src/world/art/games-map.png from tools/games-lounge-art.py). Six felt
      tables for two (c s|TTT|s c: chair backs over the seats, a 3-wide felt table), the door back to the café at col 11-12
      (D), lamps/plants/loveseat/arcade cabinets solid (P). The arcade alcove's cabinets are dim LATER props (no Pong in v1). */
  games: {
    art: 'games-map.png',
    rows: [
    '########################################',
    '########################################',
    '########################################',
    '#........P.DD.P......................P.#',
    '#P.......P...........................P.#',
    '#P.....................................#',
    '#...P.....................P............#',
    '#...P.....................P............#',
    '#......cTTTc..cTTTc..cTTTc.....PP.PP.P.#',
    '#......sTTTs..sTTTs..sTTTs.....PP.PP...#',
    '#..............................PP.PP...#',
    '#......................................#',
    '#..............................PP.PP...#',
    '#..............................PP.PP...#',
    '#P.............................PP.PP.P.#',
    '#P........cTTTc..cTTTc..cTTTc..........#',
    '#.........sTTTs..sTTTs..sTTTs..........#',
    '#......................................#',
    '#......................................#',
    '#...P..................................#',
    '#P.PP.P..............................P.#',
    '#P.PP.P..............................P.#',
    '#......................................#',
    '########################################',
    ],
    spawns: [[11, 4], [12, 4], [11, 5], [12, 5], [10, 4], [13, 4], [10, 5], [13, 5], [11, 6], [12, 6]],
    // warm lamps from GD's scene: each table's lamp (col*T+32, row*T+16), floor lamps (col*T+8, row*T+22)
    lights: [
      ...([[7, 8], [14, 8], [21, 8], [10, 15], [17, 15], [24, 15]] as const).map(([c, r]) => ({ kind: 'table' as const, x: c * T + 32, y: r * T + 16 })),
      ...([[4, 5], [26, 5], [4, 18]] as const).map(([c, r]) => ({ kind: 'floor' as const, x: c * T + 8, y: r * T + 22 })),
    ],
  },
}
/** Which map a room instance uses: games-N is the Games Lounge, everything else the café. */
export type MapId = 'cafe-landscape' | 'games'
export const mapOf = (room: string): MapId => room.startsWith('games-') ? 'games' : 'cafe-landscape'
/** The door tile(s): the café's doormat leads to the Games Lounge, the Games Lounge's door back to the café. */
export const isDoor = (x: number, y: number) => at(x, y) === 'D'
export const MAP_ID: MapId = 'cafe-landscape'
export interface Table { id: number; x: number; y: number; /** felt width in tiles (café 2, lounge 3) */ w: number; seats: [[number, number], [number, number]]
  /** Games Lounge tables: the two extra seats on the upper row (2-4 players) */ extra: [number, number][] }
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
      if (ROWS[y][x] === 's' && ROWS[y][x + 1] === 'T' && ROWS[y][x + 2] === 'T') {
        // the café's 2-wide sTTs, or the Games Lounge's 3-wide felt sTTTs
        const w = ROWS[y][x + 3] === 's' ? 2 : ROWS[y][x + 3] === 'T' && ROWS[y][x + 4] === 's' ? 3 : 0; if (!w) continue
        const extra: [number, number][] = y > 0 && ROWS[y - 1][x] === 'g' && ROWS[y - 1][x + w + 1] === 'g' ? [[x, y - 1], [x + w + 1, y - 1]] : []
        tables.push({ id: tables.length, x: x + 1, y, w, seats: [[x, y], [x + w + 1, y]], extra }) }
    b = { tables }; built.set(id, b) }
  TABLES = b.tables
}
for (const id of Object.keys(MAPS) as MapId[]) useMap(id)   // checks every map's size once
useMap(MAP_ID)
export const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H) ? '#' : ROWS[y][x]
/** Can a foot stand on tile (x, y)? The doormat counts, so people can walk in. */
export const walkable = (x: number, y: number) => !BLOCK.has(at(x, y))
/** a chair: the café's s, or a Games Lounge table's extra g */
export const isSeat = (x: number, y: number) => { const c = at(x, y); return c === 's' || c === 'g' }
export const isPianoSeat = (x: number, y: number) => at(x, y) === 'p'
/** every seat of table t (the pair's two first) */
export const seatsOf = (t: Table): [number, number][] => [...t.seats, ...t.extra]
