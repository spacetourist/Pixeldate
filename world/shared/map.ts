/* Pixeldate World · café tile map. Shared by the server (collisions, seats, pathfinding) and the client (art, tap-to-walk
   preview), so both always agree on what is walkable. The art is GD's (design/pixeldate/world, copied into
   src/world/art); the grid below is hand-written over it, tile by tile, from GD's scene layout (src/build.py landscape()).
   Legend: # wall / wall top · C bar counter (and the staff side behind it) · T table for two · c chair back
           s chair seat (sit here) · P plant · L standing lamp · S sofa / candle side table · K piano + bench
           p the piano bench seats: the solo seat in the middle, the duet's Bass (left) and Melody (right) either side
             (shared/piano.ts, shared/duet.ts); never walked across, only sat on
           g a Games Lounge table's extra seat (up to four at a table) · D doormat / door · . floor
           B blackjack felt (blocked) · b a seat at a blackjack table
           Y Sweet Twenty felt (blocked) · y a seat at that table (two seats)
           Q Letterbox felt (blocked) · q a seat at that desk (two seats)
           F Four Up felt (blocked) · f a seat at that table (two seats)
           R Trails cabinet (blocked) · r a seat at that cabinet (up to four)
   All blocked: # C T c P L S K B Y Q F R. Rugs are art only (walkable). */
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
  /** 40×24 Games Lounge. The painting is lounge-pixel.png (640×384): the six furniture sprites are
      already composited there, lit, at the redesign art-px positions below. Seats sit on the chairs beside each piece.
      Snap (88,104) and (208,104) · Letterbox (328,96) · Blackjack (80,188) · Four Up (300,196) ·
      Sweet Twenty (176,286) · Trails (530,136). Door back to the café stays at col 11–12. */
  games: {
    art: 'lounge-pixel.png',
    rows: [
    '########################################',
    '########################################',
    '########################################',
    '#..........DD..........................#',
    '#......................................#',
    '#......................................#',
    '#.....TTT....TTT.....QQQQQ.............#',
    '#....sTTTs..sTTTs...qQQQQQq............#',
    '#.....TTT....TTT.....QQQQQ.............#',
    '#................................RRR...#',
    '#................................RRR...#',
    '#................................RRR...#',
    '#.....BBBBBB.....................RRR...#',
    '#.....BBBBBB.......FFFF.........rrr.r..#',
    '#....bBBBBBBb.....fFFFFf...............#',
    '#.....BBBBBB.......FFFF................#',
    '#.....BBBBBB...........................#',
    '#......b.b.b...........................#',
    '#...........YYYYY......................#',
    '#.........y.YYYYY.y.......NNNN.........#',
    '#...........YYYYY........nNNNNn........#',
    '#...........YYYYY.........NNNN.........#',
    '#......................................#',
    '########################################',
    ],
    spawns: [[11, 4], [12, 4], [11, 5], [12, 5], [10, 4], [13, 4], [10, 5], [13, 5], [11, 6], [12, 6]],
    lights: [],
  },
}
/** Which map a room instance uses: games-N is the Games Lounge, everything else the café. */
export type MapId = 'cafe-landscape' | 'games'
export const mapOf = (room: string): MapId => room.startsWith('games-') ? 'games' : 'cafe-landscape'
/** The door tile(s): the café's doormat leads to the Games Lounge, the Games Lounge's door back to the café. */
export const isDoor = (x: number, y: number) => at(x, y) === 'D'
export const MAP_ID: MapId = 'cafe-landscape'
export interface Table { id: number; x: number; y: number; /** felt width in tiles (café 2, lounge snap 3, blackjack 7) */ w: number; seats: [[number, number], [number, number]]
  /** Games Lounge tables: extra seats (snap: the row above; blackjack: the rest of the rail, left to right) */ extra: [number, number][]
  /** snap: a felt table for two. blackjack: five seats. sweet: Sweet Twenty, two seats. letterbox: Letterbox, two seats. fourup: Four Up, two seats. trails: Trails, up to four. board: chess or draughts, two seats. */ kind: 'snap' | 'blackjack' | 'sweet' | 'letterbox' | 'fourup' | 'trails' | 'board' }
const BLOCK = new Set(['#', 'C', 'T', 'c', 'P', 'L', 'S', 'K', 'B', 'Y', 'Q', 'F', 'R', 'N'])
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
        tables.push({ id: tables.length, x: x + 1, y, w, seats: [[x, y], [x + w + 1, y]], extra, kind: 'snap' }) }
    /** One house-rail blackjack table (art px 80,188). Five seats: left wing, three along the bottom rail, right wing. */
    if (id === 'games') {
      const rail: [number, number][] = [[5, 14], [7, 17], [9, 17], [11, 17], [12, 14]]
      tables.push({ id: tables.length, x: 6, y: 12, w: 6, seats: [rail[0], rail[1]], extra: rail.slice(2), kind: 'blackjack' })
    }
    /** Sweet Twenty coral heart (art px 176,286). Seats on the left and right lobes. */
    if (id === 'games') {
      tables.push({ id: tables.length, x: 12, y: 18, w: 5, seats: [[10, 19], [18, 19]], extra: [], kind: 'sweet' })
    }
    /** Letterbox desk (art px 328,96). A seat at each end of the blotter. */
    if (id === 'games') {
      tables.push({ id: tables.length, x: 21, y: 6, w: 5, seats: [[20, 7], [26, 7]], extra: [], kind: 'letterbox' })
    }
    /** Four Up square table (art px 300,196). Seats on either side of the grid. */
    if (id === 'games') {
      tables.push({ id: tables.length, x: 19, y: 13, w: 4, seats: [[18, 14], [23, 14]], extra: [], kind: 'fourup' })
    }
    /** One Trails cabinet in the east alcove (art px 530,136). Up to four seats along the front. */
    if (id === 'games') {
      tables.push({ id: tables.length, x: 33, y: 9, w: 3, seats: [[32, 13], [33, 13]], extra: [[34, 13], [36, 13]], kind: 'trails' })
    }
    /** Board games (chess or draughts) on the open brick south-east of the heart, clear of the six painted pieces.
        Placeholder sprite is paintBoard() — swap that for the designer's table. */
    if (id === 'games') {
      tables.push({ id: tables.length, x: 26, y: 19, w: 4, seats: [[25, 20], [30, 20]], extra: [], kind: 'board' })
    }
    b = { tables }; built.set(id, b) }
  TABLES = b.tables
}
for (const id of Object.keys(MAPS) as MapId[]) useMap(id)   // checks every map's size once
useMap(MAP_ID)
export const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H) ? '#' : ROWS[y][x]
/** Can a foot stand on tile (x, y)? The doormat counts, so people can walk in. */
export const walkable = (x: number, y: number) => !BLOCK.has(at(x, y))
/** a chair: the café's s, or a Games Lounge table's extra g */
export const isSeat = (x: number, y: number) => { const c = at(x, y); return c === 's' || c === 'g' || c === 'b' || c === 'y' || c === 'q' || c === 'f' || c === 'r' || c === 'n' }
/** a blackjack seat (b). Sitting here opens the fullscreen table; it is not a snap table. */
export const isBjSeat = (x: number, y: number) => at(x, y) === 'b'
/** a Sweet Twenty seat (y). Same fullscreen shell as blackjack, its own rules. */
export const isSweetSeat = (x: number, y: number) => at(x, y) === 'y'
/** a Letterbox seat (q). Same fullscreen shell, its own rules. */
export const isLetterSeat = (x: number, y: number) => at(x, y) === 'q'
/** a Four Up seat (f). Same fullscreen shell, its own rules. */
export const isFourSeat = (x: number, y: number) => at(x, y) === 'f'
/** a Trails seat (r). Same fullscreen shell, its own rules. */
export const isTrailSeat = (x: number, y: number) => at(x, y) === 'r'
/** a board-games seat (n). Chess or draughts, same fullscreen shell. */
export const isBoardSeat = (x: number, y: number) => at(x, y) === 'n'
export const isPianoSeat = (x: number, y: number) => at(x, y) === 'p'
/** every seat of table t (the pair's two first) */
export const seatsOf = (t: Table): [number, number][] => [...t.seats, ...t.extra]
