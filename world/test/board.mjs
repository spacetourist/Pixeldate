// Board games: chess (mate, illegal, castling, promotion) and English draughts (forced capture, multi-jump, crown).
import assert from 'node:assert/strict'
process.env.WORLD_STALE_MS ??= '3000'; process.env.WORLD_PORT = '18781'; process.env.WORLD_URL = 'ws://127.0.0.1:18781'
const dev = await import('../dev/server.ts'); await new Promise(r => setTimeout(r, 300))
const { Bot, profile, sleep } = await import('./lib.mjs')
const B = await import('../shared/games/board.ts')
const M = await import('../shared/map.ts')
let failed = 0, n = 0
async function test(name, fn) { const t0 = Date.now(); try { await fn(); n++; console.log(`ok   ${name} (${Date.now() - t0} ms)`) } catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack}`) } await done() }
const all = []
const done = async () => { for (const b of all.splice(0)) b.close(); await sleep(150) }
const J = async (o = {}) => { const b = new Bot(profile(o), { room: 'games-1' }); const r = await b.connect(); assert.equal(r.t, 'hi'); all.push(b); return b }
const lastGame = b => b.last('game')
const goSit = async (b, [x, y]) => { b.send({ t: 'go', x, y }); assert.ok(await b.wait(() => { const s = b.self(); return s && Math.floor(s.x) === x && Math.floor(s.y) === y && (s.f & 8) }, 20000), `sat at ${x},${y}`) }
const c0 = (now = 1000) => ({ now, rnd: () => 0 })

await test('chess: scholar mate, illegal move, castling, promotion', () => {
  let now = 1000; const c = () => c0(now)
  const s = B.Board.start(['white', 'black'], c())
  B.Board.act(s, 'white', { a: 'pick', g: 'chess', c: 'off' }, c())
  B.Board.act(s, 'black', { a: 'pick', g: 'chess', c: 'off' }, c())
  assert.equal(s.phase, 'play'); assert.equal(s.ps.find(p => p.uid === 'white').color, 'w')
  assert.equal(B.Board.act(s, 'white', { a: 'move', from: 'e2', to: 'e5' }, c()), 'illegal')
  const line = [['e2', 'e4'], ['e7', 'e5'], ['d1', 'h5'], ['b8', 'c6'], ['f1', 'c4'], ['g8', 'f6'], ['h5', 'f7']]
  for (const [from, to] of line) { now += 500; assert.equal(B.Board.act(s, s.turn === 'w' ? 'white' : 'black', { a: 'move', from, to }, c()), '', from + to) }
  assert.equal(s.phase, 'over'); assert.equal(s.winner, 'white'); assert.equal(s.last.k, 'mate')
  // castling
  const k = B.Board.start(['white', 'black'], c())
  B.Board.act(k, 'white', { a: 'pick', g: 'chess', c: '5' }, c()); B.Board.act(k, 'black', { a: 'pick', g: 'chess', c: '5' }, c())
  for (const [from, to] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'c4'], ['f8', 'c5'], ['e1', 'g1']]) {
    now += 200; assert.equal(B.Board.act(k, k.turn === 'w' ? 'white' : 'black', { a: 'move', from, to }, c()), '')
  }
  assert.ok(k.chess.fen().includes('R'), 'the rook came along')
  assert.equal(k.chess.get('g1').type, 'k')
  // promotion needs a chosen piece, then queens
  const p = B.Board.start(['white', 'black'], c())
  p.ps[0].color = 'w'; p.ps[1].color = 'b'
  B.Board.fen(p, '4k3/P7/8/8/8/8/8/4K3 w - - 0 1')
  assert.equal(B.Board.act(p, 'white', { a: 'move', from: 'a7', to: 'a8' }, c()), 'promo')
  now += 200; assert.equal(B.Board.act(p, 'white', { a: 'move', from: 'a7', to: 'a8', p: 'q' }, c()), '')
  assert.equal(p.chess.get('a8').type, 'q')
})

await test('draughts: forced capture, multi-jump, crown', () => {
  let now = 1000; const c = () => c0(now)
  const s = B.Board.start(['white', 'black'], c())
  B.Board.act(s, 'white', { a: 'pick', g: 'draughts', c: 'off' }, c())
  B.Board.act(s, 'black', { a: 'pick', g: 'draughts', c: 'off' }, c())
  const b = s.board.map(row => row.map(() => 0))
  b[5][2] = 1; b[4][3] = -1; b[6][1] = 1
  B.Board.rig(s, b, 'w')
  assert.equal(B.Board.act(s, 'white', { a: 'move', from: 'b3', to: 'a4' }, c()), 'must-take')
  now += 200; assert.equal(B.Board.act(s, 'white', { a: 'move', from: 'c3', to: 'e5' }, c()), '')
  assert.equal(s.board[4][3], 0, 'the taken man is gone')
  // two jumps in one turn: c3 captures d4 then f6
  const m = B.Board.start(['white', 'black'], c())
  m.ps[0].color = 'w'; m.ps[1].color = 'b'
  const chain = m.board.map(row => row.map(() => 0))
  chain[5][2] = 1; chain[4][3] = -1; chain[2][5] = -1
  B.Board.rig(m, chain, 'w')
  now += 200; assert.equal(B.Board.act(m, 'white', { a: 'move', from: 'c3', to: 'e5' }, c()), '')
  assert.equal(m.turn, 'w', 'the jump is not finished')
  assert.equal(m.chain, 'e5')
  now += 200; assert.equal(B.Board.act(m, 'white', { a: 'move', from: 'e5', to: 'g7' }, c()), '')
  assert.equal(m.turn, 'b'); assert.equal(m.board[2][5], 0); assert.equal(m.board[1][6], 1)
  // a man that reaches the far rank is crowned and stops
  const k = B.Board.start(['white', 'black'], c())
  k.ps[0].color = 'w'; k.ps[1].color = 'b'
  const crown = k.board.map(row => row.map(() => 0))
  crown[1][0] = 1; crown[7][0] = -1
  B.Board.rig(k, crown, 'w')
  now += 200; assert.equal(B.Board.act(k, 'white', { a: 'move', from: 'a7', to: 'b8' }, c()), '')
  assert.equal(k.board[0][1], 2, 'crowned'); assert.equal(k.last.k, 'crown'); assert.equal(k.turn, 'b')
})

await test('room: two clients pick chess, move, resign, no coins', async () => {
  M.useMap('games'); const t = M.TABLES.find(x => x.kind === 'board'); const seats = [...t.seats, ...t.extra]; M.useMap('cafe-landscape')
  const A = await J({ name: 'Ann' }), B = await J({ name: 'Bo' })
  await goSit(A, seats[0]); await goSit(B, seats[1])
  const g0 = await A.wait(() => lastGame(A)?.g === 'board' && lastGame(A)); assert.equal(g0.phase, 'pick')
  A.send({ t: 'gact', a: 'pick', g: 'chess', c: 'off' }); B.send({ t: 'gact', a: 'pick', g: 'chess', c: 'off' })
  const play = await A.wait(() => lastGame(A)?.phase === 'play' && lastGame(A), 4000); assert.ok(play)
  const white = play.color === 'w' ? A : B, black = white === A ? B : A
  white.send({ t: 'gact', a: 'move', from: 'e2', to: 'e4' })
  assert.ok(await white.wait(() => lastGame(white)?.fen?.includes('4P3'), 3000))
  black.send({ t: 'gact', a: 'move', from: 'e7', to: 'e5' })
  assert.ok(await black.wait(() => lastGame(black)?.fen?.includes('4p3'), 3000))
  white.send({ t: 'gact', a: 'resign' })
  const over = await black.wait(() => lastGame(black)?.phase === 'over' && lastGame(black), 3000)
  assert.equal(over.winner, black.me)
  assert.ok(!A.text.join().includes('bot-'))
})

console.log(`\n${n} passed, ${failed} failed`)
dev.default?.close?.()
process.exit(failed ? 1 : 0)
