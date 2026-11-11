// Four Up: drops, four in a line, draw, clock, coins, two clients.
import assert from 'node:assert/strict'
process.env.WORLD_STALE_MS ??= '3000'; process.env.WORLD_PORT = '18792'; process.env.WORLD_URL = 'ws://127.0.0.1:18792'
const dev = await import('../dev/server.ts'); await new Promise(r => setTimeout(r, 300))
const { Bot, profile, sleep } = await import('./lib.mjs')
const FU = await import('../shared/games/fourup.ts')
const M = await import('../shared/map.ts')
let failed = 0, n = 0
async function test(name, fn) { const t0 = Date.now(); try { await fn(); n++; console.log(`ok   ${name} (${Date.now() - t0} ms)`) } catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack}`) } await done() }
const all = []
const done = async () => { for (const b of all.splice(0)) b.close(); await sleep(150) }
const J = async (o = {}) => { const b = new Bot(profile(o), { room: 'games-1' }); const r = await b.connect(); assert.equal(r.t, 'hi'); all.push(b); return b }
const lastGame = b => b.last('game')
const goSit = async (b, [x, y]) => { b.send({ t: 'go', x, y }); assert.ok(await b.wait(() => { const s = b.self(); return s && Math.floor(s.x) === x && Math.floor(s.y) === y && (s.f & 8) }, 8000), `sat at ${x},${y}`) }

await test('rules: stack, horizontal and vertical lines, full board draws, clock drops, coins', () => {
  let now = 1000; const c = () => ({ now, rnd: () => 0 })
  const s = FU.FourUp.start(['a', 'b'], c())
  FU.FourUp.act(s, 'a', { a: 'mode' }, c())
  assert.equal(FU.FourUp.canBet(s, 'a', 7), 'bad-ante')
  assert.equal(FU.FourUp.commit(s, 'a', 5, c()), ''); assert.equal(s.phase, 'bet')
  now += 300; assert.equal(FU.FourUp.commit(s, 'b', 0, c()), '')
  assert.equal(s.phase, 'play'); assert.equal(s.turn, 0)
  assert.equal(FU.FourUp.act(s, 'b', { a: 'drop', i: 0 }, c()), 'not-your-turn')
  now += 300; assert.equal(FU.FourUp.act(s, 'a', { a: 'drop', i: 0 }, c()), '')
  assert.equal(s.board[5][0], 1, 'the piece sits on the bottom row')
  now += 300; FU.FourUp.act(s, 'b', { a: 'drop', i: 0 }, c())
  assert.equal(s.board[4][0], 2, 'the next piece stacks on it')
  // a takes the bottom of columns 1, 2 and 3, with b answering in column 6
  for (const col of [1, 2, 3]) { now += 300; FU.FourUp.act(s, 'a', { a: 'drop', i: col }, c()); now += 300; FU.FourUp.act(s, 'b', { a: 'drop', i: 6 }, c()) }
  assert.equal(s.phase, 'over'); assert.equal(s.winner, 'a'); assert.ok(s.line && s.line.length === 4)
  assert.deepEqual(s.pay, [{ uid: 'a', delta: 10 }])
  // vertical
  const v = FU.FourUp.start(['a', 'b'], c())
  FU.FourUp.commit(v, 'a', 0, c()); FU.FourUp.commit(v, 'b', 0, c())
  for (let i = 0; i < 3; i++) { now += 300; FU.FourUp.act(v, 'a', { a: 'drop', i: 0 }, c()); now += 300; FU.FourUp.act(v, 'b', { a: 'drop', i: 1 }, c()) }
  now += 300; FU.FourUp.act(v, 'a', { a: 'drop', i: 0 }, c())
  assert.equal(v.winner, 'a'); assert.ok(v.line.every(([r]) => v.board[r][0] === 1))
  // a full board with no line is a draw: fill everything except one cell, then drop it without connecting four
  const d = FU.FourUp.start(['a', 'b'], c())
  FU.FourUp.commit(d, 'a', 1, c()); FU.FourUp.commit(d, 'b', 1, c())
  for (let r = 0; r < 6; r++) for (let c0 = 0; c0 < 7; c0++) d.board[r][c0] = ((r + c0) % 2 ? 1 : 2)
  d.board[0][0] = 0; d.turn = 0; d.turnAt = now
  now += 300; assert.equal(FU.FourUp.act(d, 'a', { a: 'drop', i: 0 }, c()), '')
  assert.equal(d.phase, 'over'); assert.equal(d.winner, '')
  assert.ok(d.pay.some(x => x.uid === 'a' && x.delta === 1) && d.pay.some(x => x.uid === 'b' && x.delta === 1))
  // clock
  const t = FU.FourUp.start(['a', 'b'], c())
  FU.FourUp.commit(t, 'a', 0, c()); FU.FourUp.commit(t, 'b', 0, c())
  now += FU.TURN_MS; assert.ok(FU.FourUp.tick(t, c())); assert.equal(t.board[5][0], 1); assert.equal(t.last.k, 'auto')
  const l = FU.FourUp.start(['a', 'b'], c())
  FU.FourUp.commit(l, 'a', 1, c()); FU.FourUp.commit(l, 'b', 5, c())
  FU.FourUp.leave(l, 'a', c()); assert.equal(l.winner, 'b'); assert.ok(l.pay.some(x => x.uid === 'b' && x.delta === 10))
})

await test('room: two clients, own turns, a drop, stake, chat', async () => {
  M.useMap('games'); const t = M.TABLES.find(x => x.kind === 'fourup'); const seats = M.seatsOf(t); M.useMap('cafe-landscape')
  const A = await J({ name: 'Ann' }), B = await J({ name: 'Bo' })
  await goSit(A, seats[0]); await goSit(B, seats[1])
  assert.equal((await A.wait(() => lastGame(A)?.g === 'fourup' && lastGame(A))).phase, 'bet')
  A.send({ t: 'gstart', g: 'fourup' }); assert.equal((await A.wait(() => A.last('gerr'))).why, 'bad')
  const a0 = A.last('chips').bal
  A.send({ t: 'gact', a: 'bet', ante: 5 }); B.send({ t: 'gact', a: 'bet', ante: 0 })
  const play = await A.wait(() => lastGame(A)?.phase === 'play' && lastGame(A), 4000); assert.ok(play)
  assert.equal((await A.wait(() => A.last('chips')?.bal === a0 - 5 && A.last('chips'), 3000)).bal, a0 - 5)
  const me = play.turn === A.me ? A : B, other = me === A ? B : A
  other.send({ t: 'gact', a: 'drop', i: 3 }); assert.equal((await other.wait(() => other.last('gerr'))).why, 'not-your-turn')
  const seq = lastGame(me).seq
  me.send({ t: 'gact', a: 'drop', i: 3 })
  const next = await me.wait(() => lastGame(me)?.seq !== seq && lastGame(me), 3000)
  assert.ok(next.board.some(row => row[3] === next.piece || row[3] > 0))
  A.send({ t: 'say', text: 'four up' })
  assert.equal((await B.wait(() => B.last('say') || B.last('said'))).text, 'four up')
  assert.ok(!A.text.join().includes('bot-'))
})
dev.default?.close?.()
console.log(`\n${n} passed, ${failed} failed`); process.exit(failed ? 1 : 0)
