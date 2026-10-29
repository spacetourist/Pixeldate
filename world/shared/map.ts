/* Pixeldate World · café tile map (placeholder layout until GD's art lands). Shared by the server (collisions, seats,
   pathfinding) and the client (drawing, tap-to-walk preview), so both always agree on what is walkable.
   Legend: # wall top · W wall face (windows) · C counter · b bar stool · T table for two · s its seat · P plant
           L standing lamp · r rug · D door (spawn) · . floor */
export const TILE = 16
export const ROWS = [
  '##########################',
  '#WWWWWWWWWWWWWWWWWWWWWWWW#',
  '#CCCCCCCCC..............P#',
  '#bbbbbbbbb...............#',
  '#........................#',
  '#..sTs.....sTs.....sTs...#',
  '#........................#',
  '#P.......................#',
  '#........rrrrrr..........#',
  '#..sTs...rrrrrr....sTs...#',
  '#........rrrrrr..........#',
  '#........................#',
  '#L......................L#',
  '#..sTs.....sTs.....sTs...#',
  '#........................#',
  '#P......................P#',
  '#........................#',
  '##########DD##############',
]
export const W = ROWS[0].length, H = ROWS.length
for (const r of ROWS) if (r.length !== W) throw new Error('map row width')
export const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H) ? '#' : ROWS[y][x]
const BLOCK = new Set(['#', 'W', 'C', 'T', 'P', 'L'])
/** Can a foot stand on tile (x, y)? Doors count, so people can walk in. */
export const walkable = (x: number, y: number) => !BLOCK.has(at(x, y))
export const isSeat = (x: number, y: number) => at(x, y) === 's'
export interface Table { id: number; x: number; y: number; seats: [[number, number], [number, number]] }
/** Every table for two: a T with a seat either side. */
export const TABLES: Table[] = []
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
  if (at(x, y) === 'T' && at(x - 1, y) === 's' && at(x + 1, y) === 's') TABLES.push({ id: TABLES.length, x, y, seats: [[x - 1, y], [x + 1, y]] })
export const SPAWNS: [number, number][] = [[10, 16], [11, 16], [9, 16], [12, 16], [10, 15], [11, 15], [8, 16], [13, 16], [9, 15], [12, 15]]
