// Games Room v1 server tests: Snap rules (pure module), then the Room over the Node dev server: 2-4 at a table, the
// shuffle, turns + timeouts, snap rate limit, privacy, reconnect, familiarity once per pair per day, map isolation.
import assert from 'node:assert/strict'
process.env.WORLD_STALE_MS ??= '3000'; process.env.WORLD_GINV_MS ??= '1500'; process.env.WORLD_PORT = '18793'; process.env.WORLD_URL = 'ws://127.0.0.1:18793'
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

await test('map: games map 40x24, 6 felt tables for two plus 3 blackjack tables, door, every seat reachable; café untouched after switching', async () => {
  M.useMap('games'); const snap = M.TABLES.filter(t => t.kind === 'snap'), bj = M.TABLES.filter(t => t.kind === 'blackjack'), sweet = M.TABLES.filter(t => t.kind === 'sweet'), trails = M.TABLES.filter(t => t.kind === 'trails')
  assert.equal(snap.length, 6); assert.equal(bj.length, 3); assert.equal(sweet.length, 1); assert.equal(trails.length, 1); assert.deepEqual(snap[0].seats, [[7, 9], [11, 9]]); assert.equal(snap[0].w, 3)
  for (const t of snap) assert.equal(M.seatsOf(t).length, 2)
  for (const t of bj) { assert.equal(M.seatsOf(t).length, 5); assert.equal(t.w, 7); for (const [x, y] of M.seatsOf(t)) assert.equal(M.at(x, y), 'b') }
  for (const t of sweet) { assert.equal(M.seatsOf(t).length, 2); assert.equal(t.w, 7); for (const [x, y] of M.seatsOf(t)) assert.equal(M.at(x, y), 'y') }
  for (const t of trails) { assert.equal(M.seatsOf(t).length, 4); for (const [x, y] of M.seatsOf(t)) assert.equal(M.at(x, y), 'r') }
  assert.ok(M.isDoor(11, 3) && M.isDoor(12, 3)); const seen = new Set([M.SPAWNS[0].join()]), q = [M.SPAWNS[0]]
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
await test('hooks: snap, blackjack, Sweet Twenty and Trails are ready, no pong yet', () => { assert.ok(GAMES.snap.ready); assert.ok(GAMES.blackjack.ready); assert.ok(GAMES.sweet.ready); assert.ok(GAMES.trails.ready); assert.ok(!('pong' in GAMES)); assert.equal(GAMES.snap.max, 2); assert.equal(GAMES.blackjack.max, 5); assert.equal(GAMES.blackjack.min, 1); assert.equal(GAMES.sweet.min, 2); assert.equal(GAMES.sweet.max, 2); assert.equal(GAMES.trails.min, 2); assert.equal(GAMES.trails.max, 4) })

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
  A.send({ t: 'gstart', g: 'pong' }); assert.equal((await A.wait(() => A.events.filter(e => e.t === 'gerr').length > 2 && A.last('gerr'))).why, 'bad')
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
await test('chips: one wallet per uid across the lounge, start balance, daily top-up when low, never below 0, apart from familiarity', async () => {
  const C = await import('../shared/chips.ts'), { memWallets, memPairs } = await import('../src/sim.ts')
  const w = memWallets(), D = Date.UTC(2026, 10, 5, 12)
  assert.deepEqual(await w.get('u1', D), { bal: C.CHIPS_START, topped: false })
  assert.equal(await w.move('u1', -C.CHIPS_START - 1, D), null, 'cannot go below 0')
  assert.equal(await w.move('u1', -950, D), 50)
  assert.equal(await w.move('u1', 0.5, D), null, 'whole chips only')
  assert.deepEqual(await w.get('u1', D), { bal: C.CHIPS_START, topped: true }, 'low → free top-up')
  await w.move('u1', -990, D); assert.deepEqual(await w.get('u1', D), { bal: 10, topped: false }, 'once a day')
  assert.deepEqual(await w.get('u1', D + 864e5), { bal: C.CHIPS_START, topped: true }, 'next day again')
  await w.move('u1', 500, D + 864e5); assert.deepEqual(await w.get('u1', D + 2 * 864e5), { bal: 1500, topped: false }, 'no top-up when not low')
  assert.ok(!('lv' in w.m.get('u1')) && !('seg' in w.m.get('u1')), 'wallet holds no familiarity')
  // the dev server shares one wallet store between lounge instances, and a lounge join sends the balance
  assert.ok(dev.wallets, 'dev server exports one shared wallet store')
  assert.ok(memPairs)
})
const BJ = await import('../shared/games/blackjack.ts')
await test('blackjack: own hands, hole card hidden, turn stays on Hit, clock stands, House to 17, per-hand payouts', () => {
  const C = (r, su = 0) => (r - 1) * 4 + su   // rank 1..13
  assert.deepEqual(BJ.total([C(1), C(6)]), { t: 17, soft: true }); assert.deepEqual(BJ.total([C(1), C(6), C(10)]), { t: 17, soft: false }); assert.equal(BJ.total([C(1), C(1), C(13)]).t, 12)
  let now = 1000; const c = () => ({ now, rnd: () => 0 })
  const s = BJ.Blackjack.start(['a', 'b'], c())
  assert.equal(BJ.Blackjack.canDeal(s, 'a', 7), 'bad-ante'); assert.equal(BJ.Blackjack.canDeal(s, 'z', 5), 'not-playing')
  assert.equal(BJ.Blackjack.act(s, 'a', { a: 'hit' }, c()), 'not-in-round')
  // pop from the end: a 10,6 · b 9,9 · house 10,7 · a's hit is a 2
  BJ.rig(s, [C(2), C(7), C(10), C(9), C(6), C(9), C(10)])
  assert.equal(BJ.Blackjack.commit(s, 'a', 25, c()), '')
  assert.equal(s.phase, 'bet', 'waiting on the other ante')
  now += 300; assert.equal(BJ.Blackjack.commit(s, 'b', 25, c()), '')
  assert.equal(s.phase, 'play'); assert.equal(BJ.total(s.ps[0].cards).t, 16); assert.equal(BJ.total(s.ps[1].cards).t, 18)
  const v = BJ.Blackjack.view(s, 'a', c()); assert.equal(v.house[1], null, 'hole card hidden'); assert.equal(v.houseTotal, null)
  assert.equal(s.turn, 0, 'seat order, a first')
  assert.equal(BJ.Blackjack.act(s, 'b', { a: 'hit' }, c()), 'not-your-turn')
  now += 300; assert.equal(BJ.Blackjack.act(s, 'a', { a: 'hit' }, c()), ''); assert.equal(s.turn, 0, 'a hit stays with a'); assert.equal(s.ps[0].cards.length, 3); assert.equal(s.ps[1].cards.length, 2)
  now += 300; assert.equal(BJ.Blackjack.canDouble(s, 'a', c()), 'no-double')
  assert.equal(BJ.Blackjack.act(s, 'a', { a: 'stand' }, c()), ''); assert.equal(s.turn, 1)
  now += BJ.TURN_MS; assert.ok(BJ.Blackjack.tick(s, c()), 'the clock stands for b'); assert.equal(s.last.k, 'settle')
  assert.equal(BJ.total(s.house).t, 17); assert.equal(s.phase, 'bet'); assert.equal(s.round, 1); assert.equal(s.winner, null)
  assert.equal(s.ps[0].res, 'win'); assert.equal(s.ps[1].res, 'win')
  assert.deepEqual(s.pay.map(x => x.delta), [50, 50])
  // leaving one player does not close the table; the last one does
  BJ.Blackjack.leave(s, 'b', c()); assert.equal(s.winner, null); assert.equal(s.ps.length, 1)
  BJ.Blackjack.leave(s, 'a', c()); assert.equal(s.winner, '')
})
const BJT = () => { M.useMap('games'); const t = M.TABLES.find(t => t.kind === 'blackjack'); M.useMap('cafe-landscape'); return t }
const rail = t => [...t.seats, ...t.extra]
const balOf = async b => (await b.wait(() => b.last('chips'))).bal
const playOut = async (bots, ms = 20000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = lastGame(bots[0]); if (!v || v.round >= 1 && v.phase === 'bet') return v
    if (v.phase === 'play') { const who = bots.find(b => b.me === v.turn); if (who && who._s !== v.seq) { who._s = v.seq; who.send({ t: 'gact', a: 'stand' }) } }
    await sleep(60)
  }
  throw new Error('round did not settle')
}
await test('room: blackjack table, each player antes their own coins, hole card hidden, no uids', async () => {
  const t = BJT(), seats = rail(t), [A, B] = [await J({ name: 'Cy' }), await J({ name: 'Di' })]
  await goSit(A, seats[0]); await goSit(B, seats[1])
  const a0 = await balOf(A), b0 = await balOf(B)
  A.send({ t: 'gstart', g: 'blackjack' }); assert.equal((await A.wait(() => A.last('gerr'))).why, 'bad', 'no second way to start')
  for (const b of [A, B]) assert.equal((await b.wait(() => lastGame(b)?.g === 'blackjack' && lastGame(b))).phase, 'bet')
  B.send({ t: 'gact', a: 'deal', ante: 3 }); assert.equal((await B.wait(() => B.last('gerr'))).why, 'bad-ante')
  A.send({ t: 'gact', a: 'deal', ante: 25 }); await sleep(200); assert.equal(lastGame(A).phase, 'bet', 'one ante does not deal the table')
  B.send({ t: 'gact', a: 'deal', ante: 25 })
  const g = await A.wait(() => { const v = lastGame(A); return v && (v.phase === 'play' || (v.round >= 1 && v.phase === 'bet')) ? v : null }, 5000); assert.ok(g)
  if (g.phase === 'play') {
    assert.equal(g.house.filter(x => x === null).length, 1, 'hole card hidden'); assert.equal(g.hand.length, 2); assert.equal(lastGame(B).hand.length, 2)
    assert.equal(g.ps.length, 2)
    await playOut([A, B])
  }
  const ra = lastGame(A), rb = lastGame(B)
  assert.equal(ra.round, 1); assert.ok(ra.res && rb.res); assert.equal(ra.house.every(x => x !== null), true)
  const back = r => ({ win: 50, bj: 62, push: 25, lose: 0, bust: 0 }[r] ?? -1)
  await sleep(500)
  assert.equal(A.last('chips').bal, a0 - 25 + back(ra.res))
  assert.equal(B.last('chips').bal, b0 - 25 + back(rb.res))
  assert.ok(!A.text.join().includes('bot-'), 'no uids on the wire')
})
await test('room: two tables, own turns, Double, rejected acts, AFK stand, mid-round wait, leave, chat', async () => {
  M.useMap('games'); const tables = M.TABLES.filter(t => t.kind === 'blackjack'); M.useMap('cafe-landscape')
  const [t1, t2] = tables, s1 = rail(t1), s2 = rail(t2)
  const A = await J({ name: 'Ann' }), B = await J({ name: 'Bo' }), C = await J({ name: 'Cy' }); let D
  await goSit(A, s1[0]); await goSit(B, s1[1]); await goSit(C, s2[0])
  await A.wait(() => lastGame(A)?.phase === 'bet'); await C.wait(() => lastGame(C)?.phase === 'bet')
  assert.notEqual(lastGame(A).tb, lastGame(C).tb, 'independent tables')
  const startBal = b => b.last('chips').bal
  const aStart = startBal(A), bStart = startBal(B)
  // C plays alone at table 2 and must not move table 1
  C.send({ t: 'gact', a: 'deal', ante: 5 })
  const cPlay = await C.wait(() => { const v = lastGame(C); return v && (v.phase === 'play' || v.round >= 1) ? v : null }, 4000)
  assert.ok(cPlay); assert.equal(lastGame(A).phase, 'bet', 'the other table is still betting'); assert.equal(lastGame(A).round, 0)
  A.send({ t: 'gact', a: 'deal', ante: 25 }); B.send({ t: 'gact', a: 'deal', ante: 25 })
  const g = await A.wait(() => { const v = lastGame(A); return v && (v.phase === 'play' || (v.round >= 1 && v.phase === 'bet')) ? v : null }, 5000); assert.ok(g)
  if (g.phase === 'play') {
    const first = [A, B].find(b => b.me === lastGame(A).turn), other = first === A ? B : A
    other.send({ t: 'gact', a: 'hit' }); assert.equal((await other.wait(() => other.last('gerr'))).why, 'not-your-turn')
    D = await J({ name: 'Dee' }); await goSit(D, s1[2])
    const dw = await D.wait(() => lastGame(D)?.phase === 'play' && lastGame(D), 4000); assert.ok(dw)
    assert.equal(dw.waiting || dw.mine === 'wait', true, 'mid-round seat waits')
    D.send({ t: 'gact', a: 'deal', ante: 5 }); assert.equal((await D.wait(() => D.last('gerr'))).why, 'waiting')
    if (lastGame(first).phase === 'play' && lastGame(first).turn === first.me && lastGame(first).hand.length === 2) {
      const seq = lastGame(first).seq, hand = lastGame(first).hand.length
      first.send({ t: 'gact', a: 'double' }); first.send({ t: 'gact', a: 'double' })
      const d = await first.wait(() => lastGame(first)?.seq !== seq && lastGame(first), 4000)
      assert.ok(await first.wait(() => first.events.some(e => e.t === 'gerr'), 2000), 'a second tap is refused')
      if (d && d.phase === 'play') { assert.equal(d.hand.length, hand + 1); assert.equal(d.ante, 50); await sleep(400); assert.equal(first.last('chips').bal, (first === A ? aStart : bStart) - 50) }
      else if (d) assert.equal(d.hand.length, hand + 1, 'double took one card')
    }
    // the player still to act is left for the clock
    const settled = await A.wait(() => lastGame(A)?.round >= 1 && lastGame(A)?.phase === 'bet' && lastGame(A), BJ.TURN_MS * 2 + 5000)
    assert.ok(settled, 'AFK clock finished the round')
    assert.ok(lastGame(A).last.k === 'settle' || lastGame(A).last.k === 'auto' || settled.last?.k === 'settle')
  } else {
    assert.ok(g.res, 'a natural settled immediately, still per player')
    D = await J({ name: 'Dee' }); await goSit(D, s1[2]); await D.wait(() => lastGame(D)?.phase === 'bet', 4000)
  }
  // D can join the next round
  D.send({ t: 'gact', a: 'deal', ante: 5 })
  await D.wait(() => lastGame(D)?.mine === 'locked' || lastGame(D)?.phase === 'play', 4000)
  assert.notEqual(lastGame(D).mine, 'wait')
  // chat reaches the table, not the other one
  A.send({ t: 'say', text: 'hello there' })
  assert.equal((await B.wait(() => B.last('say') || B.last('said'))).text, 'hello there')
  await sleep(250); assert.ok(!C.events.some(e => e.t === 'say' && e.text === 'hello there'), 'other table does not hear it')
  // leave during a fresh round: stand the hand, the other player is still in
  A.send({ t: 'gact', a: 'deal', ante: 5 }); await A.wait(() => lastGame(B)?.mine === 'locked' || lastGame(A)?.phase === 'play', 3000)
  B.send({ t: 'gact', a: 'deal', ante: 5 }); await A.wait(() => lastGame(A)?.phase === 'play', 4000)
  const leaver = [A, B].find(b => lastGame(b)?.turn === b.me) ?? A
  const stay = leaver === A ? B : A
  const before = stay.last('chips').bal
  leaver.send({ t: 'gquit' })
  assert.ok(await leaver.wait(() => leaver.last('game')?.on === false, 3000), 'leave closes their table')
  await sleep(600)
  assert.ok(lastGame(stay)?.on !== false, 'the other player keeps the table')
  if (lastGame(stay)?.phase === 'play') { const mid = stay.last('chips').bal; await sleep(400); assert.equal(stay.last('chips').bal, mid, 'settled once') }
  void before
  // not enough coins
  const poor = stay, w = dev.wallets.m.get(poor.p.uid)
  if (w && w.bal > 4) await dev.wallets.move(poor.p.uid, -(w.bal - 4))
  poor.send({ t: 'gact', a: 'deal', ante: 5 })
  // may already be in a round; either chips or in-round/waiting is a refusal, but a fresh bet with 4 coins is chips
  await sleep(300)
  if (lastGame(poor)?.phase === 'bet' && lastGame(poor)?.mine !== 'locked') assert.ok(poor.events.some(e => e.why === 'chips'), 'cannot ante more than you have')
})
// ---- "Play a game?": café invite → both teleport to the lounge, seated opposite each other at one free table ----
const Jc = o => J(o, 'cafe-1')
const tele = async (A, B) => {
  A.send({ t: 'ginv', id: B.me }); const inv = await B.wait(() => B.last('ginvite')); assert.equal(inv.from, A.me)
  B.send({ t: 'ginvans', yes: true }); const a = await A.wait(() => A.last('gtele')), b = await B.wait(() => B.last('gtele'))
  assert.ok(a && b); assert.equal(a.tk, b.tk); assert.equal(a.room, 'games-1'); assert.notEqual(a.slot, b.slot); return a.tk }
await test('invite: Play a game? → Accept → both land seated opposite at one free lounge table, ready for Snap', async () => {
  const A = await Jc({ name: 'Ann' }), B = await Jc({ name: 'Bo' }); await sleep(200)
  const tk = await tele(A, B); assert.match(tk, /^[0-9a-f]{32}$/)
  const LA = new Bot(A.p, { room: 'games-1', tk }), LB = new Bot(B.p, { room: 'games-1', tk }); all.push(LA, LB); A.close(); B.close()
  assert.equal((await LA.connect()).t, 'hi'); assert.equal((await LB.connect()).t, 'hi')
  assert.ok(await LA.wait(() => LA.last('gseat'))); assert.ok(await LB.wait(() => LB.last('gseat')))
  const sa = await LA.wait(() => { const s = LA.self(); return s && (s.f & 8) && s }), sb = await LB.wait(() => { const s = LB.self(); return s && (s.f & 8) && s })
  assert.ok(sa && sb, 'both seated'); M.useMap('games'); const t = M.TABLES.find(t => t.seats.some(([x, y]) => x === Math.floor(sa.x) && y === Math.floor(sa.y)))
  assert.ok(t, 'on a lounge seat'); assert.ok(t.seats.some(([x, y]) => x === Math.floor(sb.x) && y === Math.floor(sb.y)), 'same table'); assert.notEqual(Math.floor(sa.x), Math.floor(sb.x), 'opposite')
  LA.send({ t: 'gstart', g: 'snap' }); assert.ok(await LA.wait(() => LA.last('game')?.on !== false && LA.last('game')), 'Snap starts at once')
  assert.ok(!LA.text.join().includes(tk) && !LA.text.join().includes('bot-'), 'ticket not echoed, no uids')
})
await test('invite: duplicate, busy, spam (server rate limit), not from the lounge, blocked/gone targets', async () => {
  const A = await Jc(), B = await Jc(), C = await Jc(); await sleep(200)
  A.send({ t: 'ginv', id: B.me }); assert.ok(await B.wait(() => B.last('ginvite')))
  A.send({ t: 'ginv', id: B.me }); assert.equal((await A.wait(() => A.events.find(e => e.t === 'ginv' && e.ok === false)))?.why, 'dup')
  C.send({ t: 'ginv', id: B.me }); assert.equal((await C.wait(() => C.last('ginv')))?.why, 'busy')
  A.send({ t: 'ginv', id: C.me }); const sl = await A.wait(() => A.events.filter(e => e.t === 'ginv' && e.why === 'slow')[0]); assert.ok(sl && sl.wait > 0, 'too soon after the last one')
  A.send({ t: 'ginv', id: 9999 }); assert.ok(await A.wait(() => A.events.some(e => e.why === 'gone')))
  A.send({ t: 'ginv', id: A.me }); await sleep(150)
  const L = await J(); L.send({ t: 'ginv', id: L.me }); assert.equal((await L.wait(() => L.last('ginv')))?.why, 'here')
  assert.ok(B.events.filter(e => e.t === 'ginvite' && e.from).length === 1, 'invitee got exactly one prompt')
})
await test('invite: decline tells the inviter; it times out; inviter left → the prompt closes and Accept is refused', async () => {
  const A = await Jc(), B = await Jc(); await sleep(200)
  A.send({ t: 'ginv', id: B.me }); await B.wait(() => B.last('ginvite')); B.send({ t: 'ginvans', yes: false })
  assert.equal((await A.wait(() => A.last('ginvend')))?.why, 'no')
  const C = await Jc(), D = await Jc(); await sleep(200)
  C.send({ t: 'ginv', id: D.me }); await D.wait(() => D.last('ginvite')); assert.equal((await C.wait(() => C.last('ginvend'), 4000))?.why, 'late')
  assert.equal((await D.wait(() => D.last('ginvite')?.from === 0 && D.last('ginvite'))).why, 'late')
  const E = await Jc(), F = await Jc(); await sleep(200)
  E.send({ t: 'ginv', id: F.me }); await F.wait(() => F.last('ginvite')); E.close()
  assert.equal((await F.wait(() => F.last('ginvite')?.from === 0 && F.last('ginvite'))).why, 'gone')
  F.events.length = 0; F.send({ t: 'ginvans', yes: true }); await sleep(200); assert.ok(!F.last('gtele'), 'no teleport alone')
})
await test('invite: lounge full → both told (gfull), nobody is seated on top of anyone', async () => {
  M.useMap('games'); const sitters = []
  for (const t of M.TABLES) { const b = await J(); sitters.push(b); await goSit(b, t.seats[0]) }
  const A = await Jc(), B = await Jc(); await sleep(200); const tk = await tele(A, B)
  const LA = new Bot(A.p, { room: 'games-1', tk }); all.push(LA); A.close(); await LA.connect()
  assert.ok(await LA.wait(() => LA.last('gfull'))); await sleep(300); const s = LA.self(); assert.ok(s && !(s.f & 8), 'standing, not seated')
})
dev.default?.close?.()
console.log(`\n${n} passed, ${failed} failed`); process.exit(failed ? 1 : 0)
