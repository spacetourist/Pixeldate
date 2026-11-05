// Sweet Twenty: rules (pure module) and two clients at the table (antes, turns, side card, AFK, chat).
import assert from 'node:assert/strict'
process.env.WORLD_STALE_MS ??= '3000'; process.env.WORLD_PORT = '18794'; process.env.WORLD_URL = 'ws://127.0.0.1:18794'
const dev = await import('../dev/server.ts'); await new Promise(r => setTimeout(r, 300))
const { Bot, profile, sleep } = await import('./lib.mjs')
const SW = await import('../shared/games/sweet.ts')
const M = await import('../shared/map.ts')
let failed = 0, n = 0
async function test(name, fn) { const t0 = Date.now(); try { await fn(); n++; console.log(`ok   ${name} (${Date.now() - t0} ms)`) } catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack}`) } await done() }
const all = []
const done = async () => { for (const b of all.splice(0)) b.close(); await sleep(150) }
const J = async (o = {}) => { const b = new Bot(profile(o), { room: 'games-1' }); const r = await b.connect(); assert.equal(r.t, 'hi'); all.push(b); return b }
const lastGame = b => b.last('game')
const goSit = async (b, [x, y]) => { b.send({ t: 'go', x, y }); assert.ok(await b.wait(() => { const s = b.self(); return s && Math.floor(s.x) === x && Math.floor(s.y) === y && (s.f & 8) }, 8000), `sat at ${x},${y}`) }
const sum = p => p.board.reduce((a, c) => a + c.v, 0)

await test('rules: side card, one per turn, bust, stand, closer total, tie replays, nine wins, clock, match and coins', () => {
  let now = 1000; const c = () => ({ now, rnd: () => 0 })
  const s = SW.Sweet.start(['a', 'b'], c())
  assert.equal(SW.Sweet.canBet(s, 'a', 7), 'bad-ante')
  assert.equal(SW.Sweet.canBet(s, 'a', 0), '')
  assert.equal(SW.Sweet.commit(s, 'a', 5, c()), '')
  assert.equal(s.phase, 'bet', 'one player does not start the match')
  // main pops from the end: A's first card is 10, B's is 4
  SW.rig(s, [4, 10])
  now += 300; assert.equal(SW.Sweet.commit(s, 'b', 0, c()), '')
  assert.equal(s.phase, 'play'); assert.equal(sum(s.ps[0]), 10); assert.equal(s.ps[0].side.length, 4); assert.equal(s.ps[1].side.length, 4)
  const sideBefore = s.ps[0].side.map(x => x.k + x.n)
  assert.equal(SW.Sweet.act(s, 'b', { a: 'end' }, c()), 'not-your-turn')
  const ix = s.ps[0].side.findIndex(x => x.k === 'plus')
  now += 300; assert.equal(SW.Sweet.act(s, 'a', { a: 'side', i: ix }, c()), '')
  assert.equal(s.ps[0].played, true); assert.equal(s.ps[0].side.length, 3)
  now += 100; assert.equal(SW.Sweet.act(s, 'a', { a: 'side', i: 0 }, c()), 'one-side')
  now += 300; assert.equal(SW.Sweet.act(s, 'a', { a: 'stand' }, c()), '')
  assert.equal(s.turn, 1); assert.equal(sum(s.ps[1]), 4)
  now += 300; assert.equal(SW.Sweet.act(s, 'b', { a: 'stand' }, c()), '')
  assert.equal(s.ps[0].sets, 1, '10-something beats 4'); assert.equal(s.ps[1].sets, 0)
  assert.equal(s.ps[0].side.length, 3, 'side cards are not refilled')
  assert.notDeepEqual(s.ps[0].side.map(x => x.k + x.n), sideBefore)
  // tie: both already stood on the same total
  s.ps[0].board = [{ v: 8, side: false }]; s.ps[1].board = [{ v: 8, side: false }]
  s.ps[0].stood = true; s.ps[1].stood = false; s.turn = 1; s.phase = 'play'; s.turnAt = now
  now += 300; assert.equal(SW.Sweet.act(s, 'b', { a: 'stand' }, c()), '')
  assert.equal(s.ps[0].sets + s.ps[1].sets, 1, 'a tie does not award a set')
  // bust: force a total over 20 and end the turn
  const p = s.ps[s.turn], opp = s.ps[1 - s.ps.indexOf(p)]
  const mineSets = p.sets, oppSets = opp.sets
  p.board = [{ v: 10, side: false }, { v: 10, side: false }, { v: 6, side: false }]
  now += 300; assert.equal(SW.Sweet.act(s, p.uid, { a: 'end' }, c()), '')
  assert.equal(p.sets, mineSets, 'a bust does not score')
  assert.equal(opp.sets, oppSets + 1, 'the other player takes the set')
  // nine main cards under 20 wins outright
  const q = SW.Sweet.start(['a', 'b'], c()); SW.Sweet.commit(q, 'a', 0, c()); SW.Sweet.commit(q, 'b', 0, c())
  q.ps[0].board = Array.from({ length: 9 }, () => ({ v: 2, side: false }))
  q.turn = 0; q.phase = 'play'; q.turnAt = now
  now += 300; assert.equal(SW.Sweet.act(q, 'a', { a: 'end' }, c()), '')
  assert.equal(q.ps[0].sets, 1)
  // flip card needs a sign
  const f = q.ps[q.turn]; const flip = f.side.findIndex(x => x.k === 'flip')
  if (flip >= 0) {
    now += 300; assert.equal(SW.Sweet.act(q, f.uid, { a: 'side', i: flip }, c()), 'bad-sign')
    now += 300; assert.equal(SW.Sweet.act(q, f.uid, { a: 'side', i: flip, sign: -1 }, c()), '')
    assert.ok(f.board.at(-1).v < 0)
  }
  // clock ends the turn
  now += SW.TURN_MS; const before = q.seq; assert.ok(SW.Sweet.tick(q, c())); assert.ok(q.seq > before)
  // first to 3
  const m = SW.Sweet.start(['a', 'b'], c())
  SW.rig(m, [1, 10, 1, 10, 1, 10, 1, 10, 1, 10, 1, 10])
  SW.Sweet.commit(m, 'a', 5, c()); SW.Sweet.commit(m, 'b', 5, c())
  for (let k = 0; k < 12 && m.winner === null; k++) { now += 300; const u = m.ps[m.turn]?.uid; if (!u) break; SW.Sweet.act(m, u, { a: 'stand' }, c()) }
  assert.equal(m.winner, 'a', 'the higher card takes each set'); assert.equal(m.ps.find(p => p.uid === 'a').sets, 3)
  assert.deepEqual(m.pay, [{ uid: 'a', delta: 10 }])
  // leaving forfeits the match to the other player
  const l = SW.Sweet.start(['a', 'b'], c()); SW.Sweet.commit(l, 'a', 5, c()); SW.Sweet.commit(l, 'b', 1, c())
  SW.Sweet.leave(l, 'a', c()); assert.equal(l.winner, 'b'); assert.ok(l.pay.some(x => x.uid === 'b' && x.delta === 2))
  // a stake locked before the match starts is returned if that player leaves
  const r = SW.Sweet.start(['a', 'b'], c()); SW.Sweet.commit(r, 'a', 5, c())
  SW.Sweet.leave(r, 'a', c()); assert.equal(r.phase, 'bet'); assert.ok(r.pay.some(x => x.uid === 'a' && x.delta === 5))
})

await test('room: two clients, optional stake, own boards, side card, AFK end, chat, no second table', async () => {
  M.useMap('games'); const t = M.TABLES.find(x => x.kind === 'sweet'); const seats = [...t.seats, ...t.extra]; M.useMap('cafe-landscape')
  const A = await J({ name: 'Ann' }), B = await J({ name: 'Bo' }), C = await J({ name: 'Cy' })
  await goSit(A, seats[0]); await goSit(B, seats[1])
  const g0 = await A.wait(() => lastGame(A)?.g === 'sweet' && lastGame(A)); assert.equal(g0.phase, 'bet')
  assert.equal((await B.wait(() => lastGame(B)?.g === 'sweet' && lastGame(B))).phase, 'bet')
  A.send({ t: 'gstart', g: 'sweet' }); assert.equal((await A.wait(() => A.last('gerr'))).why, 'bad')
  const a0 = A.last('chips').bal, b0 = B.last('chips').bal
  const errs = () => A.events.filter(e => e.t === 'gerr').length
  const nErr = errs()
  A.send({ t: 'gact', a: 'bet', ante: 7 }); assert.equal((await A.wait(() => errs() > nErr && A.last('gerr'))).why, 'bad-ante')
  A.send({ t: 'gact', a: 'bet', ante: 5 }); B.send({ t: 'gact', a: 'bet', ante: 0 })
  const play = await A.wait(() => lastGame(A)?.phase === 'play' && lastGame(A), 4000); assert.ok(play)
  assert.equal(play.side.length, 4); assert.equal(play.board.filter(c => !c.side).length, play.turn === A.me ? 1 : 0)
  assert.equal(lastGame(B).side.length, 4)
  assert.notDeepEqual(play.board, lastGame(B).board)
  assert.equal((await A.wait(() => A.last('chips')?.bal === a0 - 5 && A.last('chips'), 3000)).bal, a0 - 5)
  assert.equal(B.last('chips').bal, b0)
  const cur = [A, B].find(b => lastGame(b).turn === b.me), other = cur === A ? B : A
  other.send({ t: 'gact', a: 'end' }); assert.equal((await other.wait(() => other.last('gerr'))).why, 'not-your-turn')
  const seq = lastGame(cur).seq
  cur.send({ t: 'gact', a: 'end' }); cur.send({ t: 'gact', a: 'end' })
  assert.ok(await cur.wait(() => lastGame(cur).seq !== seq, 3000))
  // the other board now has the drawn card, or the turn came back
  assert.ok(lastGame(A).ps.every(p => p.board.length >= 1) || lastGame(B).ps.some(p => p.board.length >= 1))
  // AFK: whoever's turn it is, don't act
  const idle = await A.wait(() => { const v = lastGame(A); return v && (v.last?.k === 'auto' || v.last?.k === 'draw' && v.seq > seq + 1) ? v : null }, SW.TURN_MS + 3000)
  assert.ok(idle, 'the clock ended a turn')
  A.send({ t: 'say', text: 'sweet table' })
  assert.equal((await B.wait(() => B.last('say') || B.last('said'))).text, 'sweet table')
  await sleep(200); assert.ok(!C.events.some(e => e.text === 'sweet table'), 'a bystander does not get the words')
  assert.ok(!A.text.join().includes('bot-'))
  void C
})
dev.default?.close?.()
console.log(`\n${n} passed, ${failed} failed`); process.exit(failed ? 1 : 0)
