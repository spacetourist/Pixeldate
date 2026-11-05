// Games Room v1 server tests: Snap rules (pure module), then the Room over the Node dev server: 2-4 at a table, the
// shuffle, turns + timeouts, snap rate limit, privacy, reconnect, familiarity once per pair per day, map isolation.
import assert from 'node:assert/strict'
process.env.WORLD_STALE_MS ??= '3000'; process.env.WORLD_PORT = '18793'; process.env.WORLD_URL = 'ws://127.0.0.1:18793'
const dev = await import('../dev/server.ts'); await new Promise(r => setTimeout(r, 300))
const { Bot, profile, sleep } = await import('./lib.mjs')
const { Snap, rank, matches, TURN_MS, SNAP_GAP_MS, LOCK_MS } = await import('../shared/games/snap.ts')
const { cryptoRnd, shuffle, GAMES } = await import('../shared/games/index.ts')
const M = await import('../shared/map.ts')
let failed = 0, n = 0
async function test(name, fn) { const t0 = Date.now(); try { await fn(); n++; console.log(`ok   ${name} (${Date.now() - t0} ms)`) } catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack}`) } await done() }
const all = []
const done = async () => { for (const b of all.splice(0)) b.close(); await sleep(200) }
const J = async (o = {}, room = 'games-1') => { const b = new Bot(profile(o), { room }); const r = await b.connect(); assert.equal(r.t, 'hi', JSON.stringify(r)); all.push(b); return b }
const lastGame = b => b.last('game')
const goSit = async (b, [x, y]) => { b.send({ t: 'go', x, y }); assert.ok(await b.wait(() => { const s = b.self(); return s && Math.floor(s.x) === x && Math.floor(s.y) === y && (s.f & 8) }, 8000), `sat at ${x},${y}`) }

await test('map: games map 40x24, 12 tables for two, door, every seat reachable; café untouched after switching', async () => {
  M.useMap('games'); assert.equal(M.TABLES.length, 12); for (const t of M.TABLES) { assert.equal(M.seatsOf(t).length, 2); for (const [x, y] of M.seatsOf(t)) assert.ok(M.isSeat(x, y)) }
  assert.ok(M.isDoor(20, 3)); const seen = new Set([M.SPAWNS[0].join()]), q = [M.SPAWNS[0]]
  while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = [x + dx, y + dy]; if (M.walkable(...k) && !seen.has(k.join())) { seen.add(k.join()); q.push(k) } } }
  for (const t of M.TABLES) for (const s of M.seatsOf(t)) assert.ok(seen.has(s.join()), 'seat ' + s)
  M.useMap('cafe-landscape'); assert.equal(M.TABLES.length, 12); assert.equal(M.TABLES[0].extra.length, 0); assert.ok(!M.isSeat(4, 6))
  assert.equal(M.mapOf('games-3'), 'games'); assert.equal(M.mapOf('cafe-1'), 'cafe-landscape')
})
await test('snap: crypto shuffle is a permutation and unbiased enough; deal is round robin', () => {
  const counts = Array(52).fill(0)
  for (let i = 0; i < 4000; i++) { const d = shuffle(Array.from({ length: 52 }, (_, j) => j), cryptoRnd); assert.equal(new Set(d).size, 52); counts[d[0]]++ }
  assert.ok(Math.max(...counts) < 160 && Math.min(...counts) > 30, 'first card roughly uniform')
  for (const k of [2, 3, 4]) { const s = Snap.start(Array.from({ length: k }, (_, i) => 'p' + i), { now: 0, rnd: cryptoRnd }); assert.equal(s.ps.reduce((a, p) => a + p.hand.length, 0), 52); assert.ok(s.ps.every(p => p.hand.length >= Math.floor(52 / k))) }
})
await test('snap: turns, wrong-turn refused, timeout auto-flips, good snap takes the pile, false snap penalty, rate limit and lock', () => {
  let t = 0; const c = () => ({ now: t, rnd: () => 0 })
  const s = Snap.start(['a', 'b'], c()); s.turn = 0
  // stack the hands: a's 1st and b's 1st are the same rank
  s.ps[0].hand = [0, 8, 12, 16]; s.ps[1].hand = [1, 20, 24, 28]
  assert.equal(Snap.act(s, 'b', { a: 'flip' }, c()), 'not-your-turn')
  assert.equal(Snap.act(s, 'a', { a: 'flip' }, c()), ''); assert.equal(s.ps[s.turn].uid, 'b')
  assert.equal(Snap.act(s, 'a', { a: 'snap' }, c()), 'false-snap'); assert.equal(s.ps[0].hand.length, 2, 'penalty card')
  t += TURN_MS; assert.ok(Snap.tick(s, c())); assert.equal(s.last.k, 'auto'); assert.ok(matches(s))
  s.ps[0].lastSnap = t - 10; assert.equal(Snap.act(s, 'a', { a: 'snap' }, c()), 'slow-down', 'within SNAP_GAP_MS of the last press')
  t += SNAP_GAP_MS; assert.equal(Snap.act(s, 'b', { a: 'snap' }, c()), ''); assert.equal(s.pile.length, 0); assert.equal(s.ps[1].hand.length, 6)
  for (let i = 0; i < 3; i++) { t += SNAP_GAP_MS; Snap.act(s, 'a', { a: 'snap' }, c()) }
  t += SNAP_GAP_MS; assert.equal(Snap.act(s, 'a', { a: 'snap' }, c()), 'locked'); t += LOCK_MS; assert.notEqual(Snap.act(s, 'a', { a: 'snap' }, c()), 'locked')
  assert.equal(rank(0), rank(1))
})
await test('snap: a game always ends (timeouts only), and the winner is the last with cards', () => {
  let t = 0; const s = Snap.start(['a', 'b', 'c'], { now: 0, rnd: cryptoRnd })
  for (let i = 0; i < 400 && !Snap.done(s); i++) { t += TURN_MS; Snap.tick(s, { now: t, rnd: cryptoRnd }) }
  const d = Snap.done(s); assert.ok(d); assert.ok(['a', 'b', 'c', ''].includes(d.winner))
})
await test('hooks: blackjack and pong are registered but not ready', () => { assert.ok(GAMES.snap.ready); assert.ok(!GAMES.blackjack.ready); assert.ok(!('pong' in GAMES)); assert.equal(GAMES.snap.max, 2) })

const T = () => { M.useMap('games'); const t = M.TABLES[0]; M.useMap('cafe-landscape'); return t }
const play = async (bots, { snapper = null } = {}) => {
  // bots flip on their turn; `snapper` snaps every pair. Returns the final view per bot.
  const t0 = Date.now()
  while (Date.now() - t0 < 60000) {
    for (const b of bots) {
      const g = lastGame(b); if (!g?.on) continue
      if (g.winner !== null) continue
      const top = g.pile, pair = top.length >= 2 && (top.at(-1) >> 2) === (top.at(-2) >> 2)
      if (pair && b === snapper && b._snapSeq !== g.seq) { b._snapSeq = g.seq; b.send({ t: 'gact', a: 'snap' }) }
      else if (g.turn === b.me && b._flipSeq !== g.seq) { b._flipSeq = g.seq; b.send({ t: 'gact', a: 'flip' }) }
    }
    if (bots.every(b => lastGame(b)?.winner !== null && lastGame(b)?.winner !== undefined)) return bots.map(lastGame)
    await sleep(60)
  }
  throw new Error('game did not finish')
}

await test('room: two at a table start Snap; only the two get it; a third person can not join; plays to a winner', async () => {
  const t = T(), [A, B] = [await J({ name: 'Ann' }), await J({ name: 'Bo' })], X = await J({ name: 'Xi' })
  assert.equal(A.last('hi').room, 'games')
  A.send({ t: 'gstart', g: 'snap' }); assert.equal((await A.wait(() => A.last('gerr'))).why, 'sit')
  await goSit(A, t.seats[0]); A.send({ t: 'gstart', g: 'snap' }); assert.equal((await A.wait(() => A.events.filter(e => e.t === 'gerr').length > 1 && A.last('gerr'))).why, 'few')
  await goSit(B, t.seats[1])
  A.send({ t: 'gstart', g: 'blackjack' }); assert.equal((await A.wait(() => A.events.filter(e => e.t === 'gerr').length > 2 && A.last('gerr'))).why, 'soon')
  A.send({ t: 'gstart', g: 'snap' })
  for (const b of [A, B]) { const g = await b.wait(() => lastGame(b)?.on && lastGame(b)); assert.ok(g, b.p.name + ' got the game'); assert.equal(g.ps.length, 2); assert.equal(g.ps.reduce((a, p) => a + p.n, 0), 52) }
  assert.ok(!lastGame(X), 'a bystander never gets the game'); assert.ok(!A.text.join().includes('bot-'), 'no uids on the wire')
  const fin = await play([A, B], { snapper: B })
  assert.ok(fin.every(g => g.winner === fin[0].winner)); assert.ok([A.me, B.me, 0].includes(fin[0].winner))
})
await test('room: rate limit: snap spam from one player is refused (slow-down / locked) and the game survives', async () => {
  const t = T(), A = await J(), B = await J()
  await Promise.all([goSit(A, t.seats[0]), goSit(B, t.seats[1])])
  A.send({ t: 'gstart', g: 'snap' }); await A.wait(() => lastGame(A)?.on)
  for (let i = 0; i < 15; i++) A.send({ t: 'gact', a: 'snap' })
  await sleep(500); const errs = A.events.filter(e => e.t === 'gerr').map(e => e.why)
  assert.ok(errs.includes('slow-down'), JSON.stringify(errs))
  for (let i = 0; i < 4; i++) { await sleep(400); A.send({ t: 'gact', a: 'snap' }) }
  await sleep(300); assert.ok(A.events.some(e => e.t === 'gerr' && e.why === 'locked') || lastGame(A).ps.find(p => p.id === A.me).lock > 0, 'locked after repeated false snaps')
  await done()
})
await test('room: turn timeout flips for an idle player; reconnect puts you back in your seat in the same game', async () => {
  const t = T(), p = profile({ name: 'Rae' }), A = new Bot(p, { room: 'games-1' }); assert.equal((await A.connect()).t, 'hi'); all.push(A)
  const B = await J({ name: 'Sol' })
  await Promise.all([goSit(A, t.seats[0]), goSit(B, t.seats[1])])
  A.send({ t: 'gstart', g: 'snap' }); const g0 = await B.wait(() => lastGame(B)?.on && lastGame(B))
  const auto = await B.wait(() => lastGame(B)?.last.k === 'auto', TURN_MS + 2000); assert.ok(auto, 'auto flip after the turn clock')
  A.close(); assert.ok(await B.wait(() => lastGame(B)?.ps.find(x => x.id === A.me)?.away, 3000), 'shown away')
  const A2 = new Bot(p, { room: 'games-1' }); assert.equal((await A2.connect()).t, 'hi'); all.push(A2)
  const g = await A2.wait(() => lastGame(A2)?.on && lastGame(A2)); assert.ok(g, 'game resent on reconnect'); assert.equal(g.tb, g0.tb)
  assert.ok(await A2.wait(() => { const s = A2.self(); return s && Math.floor(s.x) === t.seats[0][0] && Math.floor(s.y) === t.seats[0][1] }), 'back in the seat')
  assert.ok(!g.ps.find(x => x.id === A2.me).out); await sleep(3000); assert.ok(!lastGame(A2).ps.find(x => x.id === A2.me).out, 'still in after settling')
  await done()
})
await test('room: standing up forfeits; last one in wins', async () => {
  const t = T(), A = await J(), B = await J()
  await Promise.all([goSit(A, t.seats[0]), goSit(B, t.seats[1])])
  A.send({ t: 'gstart', g: 'snap' }); await B.wait(() => lastGame(B)?.on)
  A.send({ t: 'go', x: 10, y: 9 }); const g = await B.wait(() => lastGame(B)?.winner != null && lastGame(B), 6000)
  assert.equal(g.winner, B.me); await done()
})
await test('familiarity: a finished game between a pair moves the meter one segment, once per pair per day', async () => {
  const t = T(), A = await J({ name: 'Liv', iam: 'woman', seek: 'men' }), B = await J({ name: 'Max', iam: 'man', seek: 'women' })
  await Promise.all([goSit(A, t.seats[0]), goSit(B, t.seats[1])])
  const c0 = await A.wait(() => { const c = A.last('card'); return c && c.rc !== undefined && A.events.filter(e => e.t === 'card').length >= 2 && c }); assert.ok(c0, 'pair card')
  const seg0 = A.last('card').seg, lv0 = A.last('card').lv
  A.send({ t: 'gstart', g: 'snap' }); await A.wait(() => lastGame(A)?.on)
  await play([A, B])
  const c1 = await A.wait(() => { const c = A.last('card'); return (c.seg !== seg0 || c.lv !== lv0) && c }); assert.ok(c1, 'meter moved')
  assert.ok(await A.wait(() => lastGame(A)?.fam), 'game view says so')
  const key = [A.p.uid, B.p.uid].sort().join('|'), rec = dev.pairs.m.get(key)
  assert.ok(rec?.gameUp, 'gameUp stored')
  const after = A.last('card'); A.send({ t: 'gstart', g: 'snap' }); await A.wait(() => lastGame(A)?.winner === null); await play([A, B]); await sleep(400)
  assert.deepEqual([A.last('card').lv, A.last('card').seg], [after.lv, after.seg], 'second game the same day: no change')
  await done()
})
await test('isolation: the café keeps its map and pairs while a Games Room runs in the same process', async () => {
  const C1 = await J({ iam: 'woman', seek: 'men' }, 'cafe-1'), C2 = await J({ iam: 'man', seek: 'women' }, 'cafe-1'), G = await J({}, 'games-1')
  assert.ok(C1.last('hi').sofas && !G.last('hi').sofas)
  M.useMap('cafe-landscape'); const ct = M.TABLES[0]
  G.send({ t: 'go', x: 30, y: 20 })
  await Promise.all([goSit(C1, ct.seats[0]), goSit(C2, ct.seats[1])])
  assert.ok(await C1.wait(() => C1.last('card')), 'café pair card')
  await done()
})
dev.default?.close?.()
console.log(`\n${n} passed, ${failed} failed`); process.exit(failed ? 1 : 0)
