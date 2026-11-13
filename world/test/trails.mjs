// Trails: 15 Hz steps, crashes, a round, first to 3, lobby clock, two clients.
import assert from 'node:assert/strict'
process.env.WORLD_STALE_MS ??= '3000'; process.env.WORLD_PORT = '18784'; process.env.WORLD_URL = 'ws://127.0.0.1:18784'
const dev = await import('../dev/server.ts'); await new Promise(r => setTimeout(r, 300))
const { Bot, profile, sleep } = await import('./lib.mjs')
const TR = await import('../shared/games/trails.ts')
const M = await import('../shared/map.ts')
let failed = 0, n = 0
async function test(name, fn) { const t0 = Date.now(); try { await fn(); n++; console.log(`ok   ${name} (${Date.now() - t0} ms)`) } catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack}`) } await done() }
const all = []
const done = async () => { for (const b of all.splice(0)) b.close(); await sleep(150) }
const J = async (o = {}) => { const b = new Bot(profile(o), { room: 'games-1' }); const r = await b.connect(); assert.equal(r.t, 'hi'); all.push(b); return b }
const lastGame = b => b.last('game')
const goSit = async (b, [x, y]) => { b.send({ t: 'go', x, y }); assert.ok(await b.wait(() => { const s = b.self(); return s && Math.floor(s.x) === x && Math.floor(s.y) === y && (s.f & 8) }, 15000), `sat at ${x},${y}`) }

await test('rules: 15 Hz, no reverse, wall, head-on draw, first to 3, lobby clock, coins', () => {
  let now = 5000; const c = () => ({ now, rnd: () => 0 })
  assert.equal(TR.HZ, 15)
  const s = TR.Trails.start(['a', 'b'], c())
  assert.equal(TR.Trails.commit(s, 'a', 0, c()), ''); assert.equal(s.phase, 'bet')
  now += 300; assert.equal(TR.Trails.commit(s, 'b', 5, c()), '')
  assert.equal(s.phase, 'play'); assert.equal(s.ps[0].d, 'right')
  assert.equal(TR.Trails.act(s, 'a', { a: 'turn', d: 'left' }, c()), '', 'a reverse is ignored')
  assert.equal(s.ps[0].q, '')
  assert.equal(TR.Trails.act(s, 'a', { a: 'turn', d: 'up' }, c()), '')
  assert.equal(s.ps[0].q, 'up')
  now += TR.STEP; assert.ok(TR.Trails.tick(s, c()))
  assert.equal(s.ps[0].d, 'up'); assert.equal(s.ps[0].y, 8)
  // park a on the right edge, facing out
  const a = s.ps[0], b = s.ps[1]
  s.occ[a.y][a.x] = 0; a.x = TR.GW - 1; a.d = 'right'; a.q = ''; s.occ[a.y][a.x] = a.n
  now += TR.STEP; TR.Trails.tick(s, c())
  assert.equal(b.rounds, 1, 'the survivor takes the round'); assert.equal(s.phase, 'play'); assert.equal(s.ps.every(p => p.alive), true)
  // three rounds
  b.rounds = 2
  const a2 = s.ps[0]
  s.occ[a2.y][a2.x] = 0; a2.x = TR.GW - 1; a2.d = 'right'; a2.q = ''; s.occ[a2.y][a2.x] = a2.n
  now += TR.STEP; TR.Trails.tick(s, c())
  assert.equal(s.winner, 'b'); assert.equal(s.phase, 'over'); assert.deepEqual(s.pay, [{ uid: 'b', delta: 0 }].filter(() => false).concat(s.pay))
  assert.ok(s.pay.some(x => x.uid === 'b' && x.delta === 10))
  // head-on: fresh match, let them meet
  const h = TR.Trails.start(['a', 'b'], c())
  TR.Trails.commit(h, 'a', 0, c()); TR.Trails.commit(h, 'b', 0, c())
  for (let i = 0; i < 12 && h.phase === 'play' && h.round === 1; i++) { now += TR.STEP; TR.Trails.tick(h, c()) }
  assert.equal(h.ps[0].rounds, 0); assert.equal(h.ps[1].rounds, 0); assert.ok(h.round > 1, 'a mutual crash replays the round')
  // lobby clock locks a sitter who never chose
  const l = TR.Trails.start(['a', 'b'], c())
  TR.Trails.commit(l, 'a', 0, c())
  now += TR.LOBBY_MS; assert.ok(TR.Trails.tick(l, c())); assert.equal(l.phase, 'play')
})

await test('room: two of four seats, a turn, stake, chat', async () => {
  M.useMap('games'); const t = M.TABLES.find(x => x.kind === 'trails'); const seats = M.seatsOf(t); M.useMap('cafe-landscape')
  assert.equal(seats.length, 4)
  const A = await J({ name: 'Ann' }), B = await J({ name: 'Bo' })
  await goSit(A, seats[0]); await goSit(B, seats[1])
  assert.equal((await A.wait(() => lastGame(A)?.g === 'trails' && lastGame(A))).phase, 'bet')
  A.send({ t: 'gstart', g: 'trails' }); assert.equal((await A.wait(() => A.last('gerr'))).why, 'bad')
  const a0 = A.last('chips').bal
  A.send({ t: 'gact', a: 'bet', ante: 5 }); B.send({ t: 'gact', a: 'bet', ante: 0 })
  const play = await A.wait(() => lastGame(A)?.phase === 'play' && lastGame(A), 4000); assert.ok(play)
  assert.equal(play.bikes.length, 2); assert.equal(play.hz, 15)
  assert.equal((await A.wait(() => A.last('chips')?.bal === a0 - 5 && A.last('chips'), 3000)).bal, a0 - 5)
  A.send({ t: 'gact', a: 'turn', d: 'up' })
  assert.ok(await A.wait(() => lastGame(A)?.bikes?.some(b => b.id === A.me && (b.d === 'up' || b.y < 9)), 2000))
  A.send({ t: 'say', text: 'trails' })
  assert.equal((await B.wait(() => B.last('say') || B.last('said'))).text, 'trails')
  assert.ok(!A.text.join().includes('bot-'))
})
dev.default?.close?.()
console.log(`\n${n} passed, ${failed} failed`); process.exit(failed ? 1 : 0)
