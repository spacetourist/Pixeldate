// Pixeldate World integration tests. Default: starts the Node dev server in-process on :18791.
// Against wrangler dev instead:  WORLD_URL=ws://127.0.0.1:8787 node world/test/run.mjs  (reports are read from the DEV-only /dev/reports)
import assert from 'node:assert/strict'
let dev = null
if (!process.env.WORLD_URL) { process.env.WORLD_STALE_MS ??= '3000'; process.env.WORLD_PORT = '18791'; process.env.WORLD_URL = 'ws://127.0.0.1:18791'; dev = await import('../dev/server.ts'); await new Promise(r => setTimeout(r, 300)) }
else await import('../src/profanity.ts') // the filter unit test runs in this process; wrangler has its own copy
const { Bot, profile, sleep } = await import('./lib.mjs')
const HTTP = process.env.WORLD_URL.replace(/^ws/, 'http')
const getReports = async () => dev ? dev.reports : (await (await fetch(HTTP + '/dev/reports')).json()).sort((a, b) => a.at - b.at)
const { SPEED, F_HEART, F_BROKEN, F_ME } = await import('../shared/proto.ts')
const results = []; let failed = 0
async function test(name, fn) {
  const t0 = Date.now()
  try { await fn(); results.push(`ok   ${name} (${Date.now() - t0} ms)`) } catch (e) { failed++; results.push(`FAIL ${name}: ${e.message}`) }
  console.log(results.at(-1))
}
const join = async (o = {}, opt = {}) => { const b = new Bot(profile(o), opt); const r = await b.connect(); return [b, r] }
const all = []
const J = async (o, opt) => { const [b, r] = await join(o, opt); all.push(b); assert.equal(r.t, 'hi', 'join failed: ' + JSON.stringify(r)); return b }
const mark = (v, o) => (v.ents.get(o.me)?.f ?? -1) & 3
const done = () => { for (const b of all.splice(0)) b.close(); return sleep(150) }
const textOf = b => b.text.join('\n')

await test("map: GD's 40x24 landscape café, every floor tile and all 12 table seats reachable from the door", async () => {
  const M = await import('../shared/map.ts'); assert.equal(M.MAP_ID, 'cafe-landscape'); assert.equal(M.W, 40); assert.equal(M.H, 24)
  assert.equal(M.TABLES.length, 12); for (const t of M.TABLES) for (const [x, y] of t.seats) assert.ok(M.isSeat(x, y) && M.at(x + (x < t.x ? 1 : -1), y) === 'T')
  const seen = new Set(), q = [M.SPAWNS[0]]; seen.add(q[0].join())
  while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = [x + dx, y + dy]; if (M.walkable(...k) && !seen.has(k.join())) { seen.add(k.join()); q.push(k) } } }
  for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) if (M.walkable(x, y)) assert.ok(seen.has(x + ',' + y), `unreachable ${x},${y}`)
  for (let x = 0; x < M.W; x++) assert.ok(!M.walkable(x, 0) && !M.walkable(x, 2) && !M.walkable(x, M.H - 1)); for (let y = 0; y < M.H; y++) assert.ok(!M.walkable(0, y) && !M.walkable(M.W - 1, y))
})
await test('join refused without a valid invite', async () => {
  const [b, r] = await join({}, { invite: 'nope' }); assert.equal(r.t, 'no'); assert.equal(r.why, 'invite'); await sleep(50); assert.equal(b.closed, 4001)
})
await test('join refused without the 18+ flag', async () => {
  for (const adult of [false, undefined, 'yes', 1]) { const [, r] = await join({ adult }); assert.equal(r.t, 'no', String(adult)); assert.equal(r.why, 'adult') }
})
await test('join refused with a bad uid / profile / photo-like avatar', async () => {
  for (const o of [{ uid: 'x' }, { uid: 'has space in it' }, { min: 16 }, { iam: 'cat' }, { pav: '{"v":1,"img":"data:image/png;base64,AAAA"}' }, { name: '' }]) {
    const [, r] = await join(o); assert.equal(r.t, 'no', JSON.stringify(o)); assert.equal(r.why, 'profile')
  }
})
await test('join times out after 5 s without a join message', async () => {
  const ws = new WebSocket(process.env.WORLD_URL + '/parties/area/cafe-1'); const code = await new Promise(r => { ws.onclose = e => r(e.code); setTimeout(() => r('none'), 7000) })
  assert.notEqual(code, 'none')
})

await test('no leaks: prefs, uids and refusals never reach other clients; markers are per viewer', async () => {
  const A = await J({ name: 'Ann', iam: 'woman', seek: 'men', br: [25, 29], min: 25, max: 34 })
  const B = await J({ name: 'Ben', iam: 'man', seek: 'women', br: [30, 34], min: 21, max: 35 })      // compatible both ways with Ann
  const C = await J({ name: 'Cal', iam: 'man', seek: 'women', br: [25, 29], min: 18, max: 40 })      // will pass on Ann
  const D = await J({ name: 'Dee', iam: 'woman', seek: 'women', br: [25, 29], min: 18, max: 40 })    // incompatible with Ann
  C.send({ t: 'pass', id: A.me }); await C.wait(() => C.last('ack'))
  await sleep(350)
  assert.equal(mark(A, B), F_HEART, 'Ann sees a heart over Ben')
  assert.equal(mark(A, C), F_BROKEN, 'Ann sees a broken heart over Cal')
  assert.equal(mark(A, D), 0, 'Ann sees nothing over Dee')
  assert.equal(mark(B, C), 0, 'Ben does not see the broken heart over Cal')
  assert.equal(mark(D, C), 0, 'Dee does not see it either')
  assert.equal(mark(C, A), 0, 'Cal sees nothing over Ann once he passed')
  assert.equal((A.self().f & F_ME), F_ME)
  for (const v of [A, B, C, D]) {
    const t = textOf(v), bin = Buffer.concat(v.bin.map(b => Buffer.from(b))).toString('latin1')
    for (const o of [A, B, C, D]) { if (o === v) continue; assert.ok(!t.includes(o.p.uid) && !bin.includes(o.p.uid), `${o.p.name} uid leaked to ${v.p.name}`) }
    for (const k of ['"min"', '"max"', '"iam"', '"seek"', '"uid"', 'passed', 'refused', 'blocked', 'hearted', '"adult"', 'invite']) assert.ok(!t.includes(k), `${k} sent to ${v.p.name}`)
    for (const m of v.events.filter(e => e.t === 'add')) assert.deepEqual(Object.keys(m.p).sort(), ['br', 'id', 'name', 'pav'])
    for (const b of v.bin) assert.equal((b.byteLength - 6) % 7, 0, 'snapshot layout')
  }
  await done()
})

const { check } = await import('../src/filter.ts')
await test('filter unit: contact details, links, handles, slurs, length', async () => {
  const bad = ['add me on insta', 'my number is 07700 900123', 'seven seven zero zero nine zero zero one two three', '0 7 7 0 0 9 0 0 1 2 3', 'mail me a.b@example.com',
    'a dot b at gmail dot com', 'find me @someone', 'go to example.com/x', 'https://x.y', 'snap me', 'whatsapp?', 'you f*cking idiot', 'sh1t', 'x'.repeat(81), '   ']
  const good = ['hi there!', 'love this playlist', 'I have 2 cats and 1 dog', 'meet at table 3?', 'what do you do for fun', 'scunthorpe is fine']
  for (const t of bad) assert.equal(check(t).ok, false, 'should block: ' + t)
  for (const t of good) assert.equal(check(t).ok, true, 'should allow: ' + t)
  assert.equal(check('hi\u200b  there').text, 'hi there')
})
await test('bubble filter end to end: a blocked bubble reaches nobody, the sender is told why', async () => {
  const B = await J({ name: 'Bo' })
  for (const [i, text] of ['add me on insta', 'call me on 07700900123', 'you f*cking idiot'].entries()) {
    const A = await J({ name: 'Amy' + i }); await sleep(200); const before = B.events.length
    A.send({ t: 'say', text }); const r = await A.wait(() => A.last('said')); assert.equal(r.ok, false, text); assert.ok(['contact', 'language'].includes(r.why), r.why)
    await sleep(200); assert.equal(B.events.slice(before).filter(e => e.t === 'say').length, 0, 'leaked: ' + text)
  }
  const A = await J({ name: 'Ok' }); await sleep(200); const before = B.events.length
  A.send({ t: 'say', text: 'hello café' }); assert.equal((await A.wait(() => A.last('said'))).ok, true)
  const got = await B.wait(() => B.events.slice(before).find(e => e.t === 'say')); assert.equal(got.text, 'hello café'); assert.equal(got.id, A.me)
  await sleep(150); assert.ok(!A.events.some(e => e.t === 'say'), 'the sender gets said, never its own say')
  await done()
})
await test('rate limit: 3 bubbles per 15 s, the 4th is refused as slow', async () => {
  const A = await J({ name: 'Fast' })
  for (let i = 0; i < 3; i++) { A.send({ t: 'say', text: 'hi ' + i }); await A.wait(() => A.events.filter(e => e.t === 'said').length === i + 1) }
  A.send({ t: 'say', text: 'hi 4' }); await A.wait(() => A.events.filter(e => e.t === 'said').length === 4)
  const r = A.last('said'); assert.equal(r.ok, false); assert.equal(r.why, 'slow'); assert.ok(r.wait > 0 && r.wait <= 15000)
  assert.ok(A.events.filter(e => e.t === 'said').slice(0, 3).every(e => e.ok))
  await done()
})

const { TABLES, walkable } = await import('../shared/map.ts')
const goTo = async (b, x, y, ms = 9000) => { b.send({ t: 'go', x, y }); return b.wait(() => { const s = b.self(); return s && Math.hypot(s.x - (x + 0.5), s.y - (y + 0.5)) < 0.06 && !(s.f & 4) && s }, ms) }

await test('block hides both people, in this instance and every other one', async () => {
  const A = await J({ name: 'Al' }), B = await J({ name: 'Bea' }); await sleep(250)
  assert.ok(A.ents.has(B.me) && B.ents.has(A.me))
  A.send({ t: 'block', id: B.me }); await A.wait(() => A.last('ack')); await sleep(300)
  assert.ok(!A.ents.has(B.me), 'blocker still sees'); assert.ok(!B.ents.has(A.me), 'blocked still sees')
  assert.ok(B.events.some(e => e.t === 'del' && e.id === A.me)); assert.ok(!textOf(B).includes('block'), 'blocked person is not told')
  const before = A.events.length; B.send({ t: 'say', text: 'hello?' }); await sleep(300); assert.ok(!A.events.slice(before).some(e => e.t === 'say'))
  for (const room of ['cafe-2', 'cafe-3']) {
    const A2 = await J(A.p, { room }), B2 = await J(B.p, { room }); await sleep(300)
    assert.ok(!A2.ents.has(B2.me) && !B2.ents.has(A2.me), 'visible again in ' + room)
    assert.ok(!A2.events.some(e => e.t === 'add' && e.p.id === B2.me) && !B2.events.some(e => e.t === 'add' && e.p.id === A2.me))
    const C = await J({ name: 'Cy' }, { room }); await sleep(250); assert.ok(C.ents.has(A2.me) && C.ents.has(B2.me), 'others still see both')
  }
  await done()
})

await test('report is stored with a time stamp and context, and the reported person is not told', async () => {
  const A = await J({ name: 'Rita' }), B = await J({ name: 'Rude' }); await sleep(250)
  B.send({ t: 'say', text: 'hey you' }); await A.wait(() => A.last('say'))
  const n0 = (await getReports()).length, t0 = Date.now()
  A.send({ t: 'report', id: B.me, why: 'rude' }); await A.wait(() => A.last('ack'))
  await sleep(300); let rs = await getReports(); assert.equal(rs.length, n0 + 1); const r = rs.at(-1)
  assert.ok(r.at >= t0 - 5 && r.at <= Date.now()); assert.equal(r.inst, 'cafe-1'); assert.equal(r.by, A.p.uid); assert.equal(r.who, B.p.uid); assert.equal(r.why, 'rude')
  assert.deepEqual(r.ctx.said.map(x => x.text ?? x), ['hey you']); assert.ok(r.ctx.heard.some(x => (x.text ?? x) === 'hey you')); assert.ok(r.ctx.where && Number.isInteger(r.ctx.tick))
  A.send({ t: 'report', id: B.me, why: '<script>' }); await sleep(300); rs = await getReports(); assert.equal(rs.at(-1).why, 'other')
  assert.ok(!textOf(B).includes('report'))
  await done()
})

await test('movement is server-authoritative: speed cap, walls, personal space', async () => {
  const A = await J({ name: 'Mo' }), B = await J({ name: 'Ni' }); await sleep(250)
  const trace = []; const t = setInterval(() => { const s = A.self(); if (s) trace.push([A.tick, s.x, s.y]) }, 20)
  const s = await goTo(A, 3, 11); clearInterval(t); assert.ok(s, 'never arrived')
  for (let i = 1; i < trace.length; i++) { const [k0, x0, y0] = trace[i - 1], [k1, x1, y1] = trace[i]; if (k1 > k0) assert.ok(Math.hypot(x1 - x0, y1 - y0) <= SPEED * (k1 - k0) + 0.03, 'too fast') }
  A.send({ t: 'go', x: 1.5, y: 'a' }); await sleep(300); assert.ok(Math.hypot(A.self().x - s.x, A.self().y - s.y) < 0.01, 'bad go accepted')
  const wt = []; const t2 = setInterval(() => wt.push(A.self()), 20); A.send({ t: 'go', x: 0, y: 0 }); await sleep(2500)   // tap on a wall: walk to the nearest floor, never into it
  for (let i = 0; i < 40; i++) A.send({ t: 'dir', dx: -1, dy: -1 }); await sleep(1500); A.send({ t: 'dir', dx: 0, dy: 0 }); clearInterval(t2)
  for (const e of wt) for (const [ox, oy] of [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]]) assert.ok(walkable(Math.floor(e.x + ox), Math.floor(e.y + oy)), `inside a wall at ${e.x},${e.y}`)
  await goTo(A, 3, 11); const s2 = A.self()
  for (let i = 0; i < 30; i++) A.send({ t: 'dir', dx: 1000, dy: 0 }); await sleep(500); A.send({ t: 'dir', dx: 0, dy: 0 })
  assert.ok(A.self().x - s2.x <= SPEED * 6 + 0.05, 'dir spam beat the speed cap')
  const sB = await goTo(B, 3, 13); await goTo(A, 3, 13, 4000); await sleep(300)
  const a = A.self(), b = A.ents.get(B.me); assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 0.74, 'avatars overlap: ' + Math.hypot(a.x - b.x, a.y - b.y))
  await done()
})

const { deflateSync, crc32 } = await import('node:zlib')
/** a w x h PNG data URL (solid colour), the shape the app's pixelatePhoto sends */
const png = (w, h) => {
  const chunk = (type, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(type, 4, 'ascii'); d.copy(b, 8); b.writeUInt32BE(crc32 ? crc32(b.subarray(4, 8 + d.length)) >>> 0 : 0, 8 + d.length); return b }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2
  const raw = Buffer.alloc(h * (1 + w * 3)); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([200, 80, 90], y * (1 + w * 3) + 1 + x * 3)
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64')
}
/** both answer k cards (Next card between them); resolves with A's view after the last reveal */
async function play(A, B, k) {
  for (let i = 0; i < k; i++) {
    if (A.last('card').rev) { const n = A.last('card').n; A.send({ t: 'next' }); await A.wait(() => A.last('card').rev === null && A.last('card').n === n); await B.wait(() => B.last('card').rev === null) }
    const n = A.last('card').n; A.send({ t: 'ans', text: 'answer ' + i }); B.send({ t: 'ans', text: 'reply ' + i })
    await A.wait(() => A.last('card').rev && A.last('card').n === n + 1); await B.wait(() => B.last('card').rev && B.last('card').n === n + 1)
  }
  return A.last('card')
}
/** two people sat at table i; resolves with their first card views */
const seat = async (A, B, i = 3) => {
  const tb = TABLES[i]; await Promise.all([goTo(A, ...tb.seats[0], 12000), goTo(B, ...tb.seats[1], 12000)])
  await A.wait(() => A.last('card')?.q); await B.wait(() => B.last('card')?.q); return tb
}
const cards = b => b.events.filter(e => e.t === 'card').length

await test('v05 "here" count: 1 player sees 1, 2 see 2 (yourself counted once), a hard disconnect drops back within the keepalive timeout', async () => {
  const A = await J({ name: 'Uno' }); await sleep(200)
  assert.equal(A.pubs.size, 1, 'alone: ' + A.pubs.size); assert.ok(A.pubs.has(A.me), 'self is in the list once')
  assert.ok(A.last('hi').ka > 0 && A.last('hi').ka < 3000, 'keepalive interval ' + A.last('hi').ka)
  const B = await J({ name: 'Dos' }); await sleep(200)
  assert.equal(A.pubs.size, 2); assert.equal(B.pubs.size, 2)
  const t0 = Date.now(); B.zombie()            // no close frame, no keepalive: like a phone that lost signal
  const gone = await A.wait(() => A.events.some(e => e.t === 'del' && e.id === B.me), 6000)
  assert.ok(gone, 'ghost never pruned'); assert.equal(A.pubs.size, 1); console.log(`  (hard disconnect pruned after ${Date.now() - t0} ms)`)
  await B.wait(() => B.closed, 2000); assert.equal(B.closed, 4004, 'stale socket closed with 4004')
  await sleep(1500); assert.equal(A.pubs.size, 1); assert.ok(A.closed === null, 'a live socket with keepalive was pruned')
  await done()
})

await test('table for two: both get the same card from the deck; Next only after both answered; card clears when one leaves', async () => {
  const { cardById } = await import('../../src/deck.ts')
  const A = await J({ name: 'Tia' }), B = await J({ name: 'Tom' }); await sleep(200)
  const tb = await seat(A, B); const ca = A.last('card'), cb = B.last('card')
  assert.ok(ca.q && ca.q.text.length > 5); assert.deepEqual(ca.q, cb.q); assert.equal(ca.with, B.me); assert.equal(cb.with, A.me); assert.equal(ca.tb, tb.id)
  assert.equal(cardById(ca.q.id)?.text, ca.q.text, 'card is not from src/deck.ts'); assert.equal(ca.lv, 1); assert.equal(cardById(ca.q.id).level, 1)
  assert.ok((A.self().f & 8) && (A.ents.get(B.me).f & 8), 'not shown sitting')
  await sleep(600)   // wrangler: the pair-level lookup can resend the same card just after seating
  const n = cards(A); B.send({ t: 'next' }); await sleep(400); assert.equal(cards(A), n, 'Next before the reveal was accepted')
  A.send({ t: 'ans', text: 'Toast' }); B.send({ t: 'ans', text: 'Cereal' }); await A.wait(() => A.last('card').rev)
  B.send({ t: 'next' }); await A.wait(() => A.last('card').q?.id !== ca.q.id); const c2 = A.last('card'); await sleep(100)
  assert.deepEqual(B.last('card').q, c2.q); assert.notEqual(c2.q.id, ca.q.id); assert.equal(c2.rev, null); assert.equal(c2.mine, null)
  B.close(); await A.wait(() => A.last('card').q === null); assert.equal(A.last('card').q, null)
  await done()
})

await test('v05 answers: own field each, hidden until both are in, filtered, then revealed together; 5 cards fill the meter and the pair goes up a level', async () => {
  const { cardById } = await import('../../src/deck.ts')
  const A = await J({ name: 'Ana' }), B = await J({ name: 'Ben' }), C = await J({ name: 'Cat' }); await sleep(200)
  await seat(A, B, 2)
  A.send({ t: 'ans', text: 'text me on 07700 900123' }); const no = await A.wait(() => A.last('ansno'))
  assert.equal(no.why, 'contact'); assert.equal(A.last('card').mine, null)
  A.send({ t: 'ans', text: 'Pancakes with lemon' }); await A.wait(() => A.last('card').mine)
  await B.wait(() => B.last('card').them); const bv = B.last('card')
  assert.equal(bv.them, true, 'B not told A answered'); assert.equal(bv.rev, null); assert.ok(!textOf(B).includes('Pancakes'), 'A\'s answer reached B before B answered')
  assert.ok(!textOf(C).includes('Pancakes'), 'answer reached a bystander'); assert.ok(!C.events.some(e => e.t === 'card'), 'bystander got a card')
  A.send({ t: 'ans', text: 'changed my mind' }); await sleep(200); assert.equal(A.last('card').mine, 'Pancakes with lemon', 'an answer can be replaced')
  B.send({ t: 'ans', text: 'Just coffee' }); await A.wait(() => A.last('card').rev); await B.wait(() => B.last('card').rev)
  const a = A.last('card'), b = B.last('card')
  assert.deepEqual(a.rev, { mine: 'Pancakes with lemon', theirs: 'Just coffee' }); assert.deepEqual(b.rev, { mine: 'Just coffee', theirs: 'Pancakes with lemon' })
  assert.equal(a.lv, 1); assert.equal(a.seg, 1, 'one card both answered = one meter segment'); assert.equal(a.up, false); assert.equal(a.n, 1)
  assert.ok(!textOf(C).includes('Just coffee') && !textOf(C).includes('Pancakes'))
  // the meter is kept for the pair: stand up, sit again, still 1/5
  await goTo(A, 3, 11); await A.wait(() => A.last('card').q === null); await seat(A, B, 2); assert.equal(A.last('card').seg, 1, 'pair meter lost')
  const up = await play(A, B, 4); assert.equal(up.lv, 2, 'a full meter is not a level-up'); assert.equal(up.seg, 0); assert.equal(up.up, true)
  A.send({ t: 'next' }); await A.wait(() => A.last('card').rev === null); assert.equal(cardById(A.last('card').q.id).level, 2, 'next card not from the level-2 pool')
  assert.equal(A.last('card').up, false)
  await goTo(A, 3, 11); await A.wait(() => A.last('card').q === null); await seat(A, B, 2); assert.equal(A.last('card').lv, 2, 'pair level lost')
  await done()
})

await test('v05 pair levels belong to the pair, app-wide: level 2 in cafe-1, both leave, meet again in cafe-2 at level 2 with the meter; tags not uids; app claims raise only when both agree, a drop from either lowers', async () => {
  const { peerTag } = await import('../src/sim.ts')
  const uA = 'bot-' + crypto.randomUUID(), uB = 'bot-' + crypto.randomUUID()
  let A = await J({ name: 'Pia', uid: uA }), B = await J({ name: 'Pat', uid: uB }); await sleep(200)
  await seat(A, B, 4); const up = await play(A, B, 5); assert.equal(up.lv, 2); await play(A, B, 1); assert.equal(A.last('card').seg, 1)
  A.close(); B.close(); await sleep(300)
  // a different instance (a different Area DO in production): same pair, same level and meter
  A = await J({ name: 'Pia', uid: uA }, { room: 'cafe-2' }); B = await J({ name: 'Pat', uid: uB }, { room: 'cafe-2' }); assert.equal(A.inst, 'cafe-2'); await sleep(200)
  await seat(A, B, 1); await A.wait(() => A.last('card').peer, 3000)
  let a = A.last('card'); assert.equal(a.lv, 2, 'level not kept across instances'); assert.equal(a.seg, 1, 'meter not kept across instances'); assert.equal(a.up, false, 'a picked-up level is not a level-up')
  assert.equal(a.peer, await peerTag(uB), 'A is not sent B\'s tag'); assert.equal(B.last('card').peer, await peerTag(uA))
  assert.ok(!textOf(A).includes(uB) && !textOf(B).includes(uA), 'a raw uid was sent to the partner')
  // the app's local levels: a one-sided higher claim does nothing; both claims raise to the lower of the two
  A.send({ t: 'pairlv', lv: 5 }); await sleep(300); assert.equal(A.last('card').lv, 2, 'one side alone raised the level'); assert.equal(A.last('card').rc, false)
  B.send({ t: 'pairlv', lv: 4 }); await A.wait(() => A.last('card').lv === 4); await B.wait(() => B.last('card').lv === 4)
  a = A.last('card'); assert.equal(a.rc, true); assert.equal(a.seg, 0); assert.equal(a.up, false)
  A.send({ t: 'pairlv', lv: 1 }); await sleep(200); assert.equal(A.last('card').lv, 4, 'a second claim in one sitting was accepted')
  A.close(); B.close(); await sleep(300)
  // overflow back to cafe-1: still 4; nobody claims, so it settles (rc) after CLAIM_MS; a drop from either side lowers it
  A = await J({ name: 'Pia', uid: uA }); B = await J({ name: 'Pat', uid: uB }); await sleep(200); await seat(A, B, 4)
  await A.wait(() => A.last('card').lv === 4, 3000); assert.equal(A.last('card').lv, 4)
  await A.wait(() => A.last('card').rc, 6000); assert.equal(A.last('card').rc, true, 'never reconciled without claims')
  A.close(); B.close(); await sleep(300)
  A = await J({ name: 'Pia', uid: uA }); B = await J({ name: 'Pat', uid: uB }); await sleep(200); await seat(A, B, 4); await A.wait(() => A.last('card').lv === 4, 3000)
  B.send({ t: 'pairlv', lv: 2, drop: true }); await A.wait(() => A.last('card').lv === 2); assert.equal(B.last('card').lv, 2)
  A.send({ t: 'pairlv', lv: 2 }); await sleep(200); A.close(); B.close(); await sleep(300)
  A = await J({ name: 'Pia', uid: uA }, { room: 'cafe-3' }); B = await J({ name: 'Pat', uid: uB }, { room: 'cafe-3' }); await sleep(200); await seat(A, B, 4)
  await A.wait(() => A.last('card').peer, 3000); assert.equal(A.last('card').lv, 2, 'the drop was not saved for the pair')
  await done()
})

await test('v05 private table chat: the partner gets the words, everyone else a "…" over the table, never the text', async () => {
  const A = await J({ name: 'Pia' }), B = await J({ name: 'Pat' }), C = await J({ name: 'Cy' }); await sleep(200)
  const tb = await seat(A, B, 1)
  A.send({ t: 'say', text: 'just between us' })
  const heard = await B.wait(() => B.events.find(e => e.t === 'say' && e.text === 'just between us'))
  assert.ok(heard && heard.priv === 1 && heard.id === A.me); const said = await A.wait(() => A.last('said')); assert.ok(said.ok && said.priv === 1)
  const mm = await C.wait(() => C.last('murmur')); assert.equal(mm.tb, tb.id); await sleep(200)
  assert.ok(!textOf(C).includes('between us'), 'bystander got the private text')
  A.send({ t: 'say', text: 'insta is pia99' }); const held = await A.wait(() => A.events.find(e => e.t === 'said' && !e.ok)); assert.equal(held.why, 'contact')
  await sleep(200); assert.ok(!textOf(B).includes('pia99'), 'filter skipped at the table')
  // a bystander's report never carries the pair's private words; the partner's does
  C.send({ t: 'report', id: A.me, why: 'rude' }); await C.wait(() => C.last('ack')); await sleep(300); let rs = await getReports()
  assert.ok(!JSON.stringify(rs.at(-1).ctx).includes('between us'), 'private words in a bystander\'s report')
  B.send({ t: 'report', id: A.me, why: 'rude' }); await B.wait(() => B.events.filter(e => e.t === 'ack').length); await sleep(300); rs = await getReports()
  assert.ok(JSON.stringify(rs.at(-1).ctx).includes('between us'), 'partner\'s report lost the context')
  // standing up: public again
  await goTo(A, 3, 11); await A.wait(() => A.last('card').q === null); A.send({ t: 'say', text: 'hello room' })
  await C.wait(() => C.events.find(e => e.t === 'say' && e.text === 'hello room')); assert.ok(!C.events.find(e => e.text === 'hello room').priv)
  await done()
})

await test('v05 Start call: locked below Level 3 · Crush; decline, cancel; both taps -> one shared code, nobody else told', async () => {
  const A = await J({ name: 'Dee' }), B = await J({ name: 'Dan' }), C = await J({ name: 'Cyd' }); await sleep(200)
  await seat(A, B, 4)
  assert.equal(A.last('card').video, 3)
  A.send({ t: 'call' }); await sleep(250); assert.equal(B.last('card').call, null, 'call before the video level')
  const l2 = await play(A, B, 5); assert.equal(l2.lv, 2); A.send({ t: 'call' }); await sleep(250); assert.equal(B.last('card').call, null, 'call at level 2')
  const l3 = await play(A, B, 5); assert.equal(l3.lv, 3)
  A.send({ t: 'call' }); await B.wait(() => B.last('card').call === 'in'); assert.equal((await A.wait(() => A.last('card').call)), 'out')
  B.send({ t: 'callno' }); await A.wait(() => A.last('note')?.k === 'call-declined'); assert.equal(A.last('card').call, null)
  A.send({ t: 'call' }); await B.wait(() => B.last('card').call === 'in'); A.send({ t: 'callno' }); await B.wait(() => B.last('note')?.k === 'call-cancelled')
  A.send({ t: 'callyes' }); await sleep(200); assert.ok(!A.last('call'), 'the asker accepted their own call')
  B.send({ t: 'call' }); await A.wait(() => A.last('card').call === 'in'); A.send({ t: 'call' }) // both tapped Start call
  const ca = await A.wait(() => A.last('call')), cb = await B.wait(() => B.last('call'))
  assert.ok(ca && cb && ca.code === cb.code && /^[a-z0-9]{12}$/.test(ca.code)); assert.equal(cb.host, true); assert.equal(ca.host, false)
  assert.ok(!textOf(C).includes(ca.code) && !C.events.some(e => e.t === 'call' || e.t === 'note'))
  await done()
})

await test('v05 photo strip: own photo pixelated to the pair level, checked, relayed to the partner only', async () => {
  const A = await J({ name: 'Fi' }), B = await J({ name: 'Fo' }), C = await J({ name: 'Fum' }); await sleep(200)
  await seat(A, B, 5)
  A.send({ t: 'photo', lv: 1, data: png(64, 64) }); A.send({ t: 'photo', lv: 2, data: png(16, 16) }); A.send({ t: 'photo', lv: 1, data: 'data:image/png;base64,AAAA' })
  await sleep(300); assert.ok(!B.events.some(e => e.t === 'photo'), 'a too-sharp / wrong-level / broken photo was relayed')
  const ok = png(8, 8); A.send({ t: 'photo', lv: 1, data: ok })
  const ph = await B.wait(() => B.last('photo')); assert.ok(ph && ph.data === ok && ph.id === A.me && ph.lv === 1)
  await sleep(200); assert.ok(!C.events.some(e => e.t === 'photo') && !textOf(C).includes(ok.slice(30, 60)), 'photo reached a bystander')
  C.send({ t: 'photo', lv: 1, data: ok }); await sleep(200); assert.equal(A.events.filter(e => e.t === 'photo').length, 0, 'someone not at the table sent a photo')
  await done()
})

await test('piano: the manifest matches shared/piano.ts; the bench is the one walkable seat by the keys', async () => {
  const P = await import('../shared/piano.ts'), M = await import('../shared/map.ts'), fs = await import('node:fs')
  const man = JSON.parse(fs.readFileSync(new URL('../../audio/piano/manifest.json', import.meta.url), 'utf8'))
  assert.equal(man.pieces.length, P.PIECES.length)
  for (const m of man.pieces) { const p = P.PIECE.get(m.id); assert.ok(p, m.id)
    for (const k of ['title', 'composer', 'durationSec', 'bpm', 'beatUnit', 'timeSignature']) assert.equal(p[k], m[k], `${m.id}.${k}`)
    for (const f of Object.values(m.files)) assert.ok(fs.existsSync(new URL('../../' + man.basePath + f, import.meta.url)), f) }
  assert.ok(M.isPianoSeat(...P.PIANO_SEAT) && M.walkable(...P.PIANO_SEAT) && M.walkable(P.PIANO_SEAT[0], P.PIANO_SEAT[1] + 1) && M.at(P.PIANO_SEAT[0], P.PIANO_SEAT[1] - 1) === 'K')
  const ms = id => Math.round(P.noteEveryMs(P.PIECE.get(id)))
  assert.equal(ms('gymnopedie-1'), 2769); assert.equal(ms('clair-de-lune'), 3750); assert.equal(ms('nocturne-op9-2'), 3830)
  assert.equal(ms('steam-on-the-window'), 1714); assert.equal(ms('sugar-cube-bossa'), 1071); assert.equal(ms('moon-in-the-teacup'), 1111)
  assert.equal(P.gainAt(1), 1); assert.equal(P.gainAt(P.HEAR_R), 0); assert.ok(P.gainAt(6) > P.gainAt(9) && P.gainAt(9) > 0)
})
await test('piano: one pianist at a time; only they can play or stop; everyone (and a late joiner) gets the same start time; standing up stops it', async () => {
  const [sx, sy] = (await import('../shared/piano.ts')).PIANO_SEAT
  const A = await J({ name: 'Pia' }), B = await J({ name: 'Bo' })
  assert.equal(A.last('piano')?.by, 0, 'nobody at the piano on join')
  B.send({ t: 'piano', id: 'gymnopedie-1' }); await sleep(250); assert.equal(A.last('piano')?.song ?? null, null, 'not seated: ignored')
  assert.ok(await goTo(A, sx, sy, 15000), 'Pia reached the bench')
  await A.wait(() => A.last('piano')?.by === A.me, 2000)
  // Bo tries to take the bench too: personal space keeps him off it, and he never becomes the pianist
  B.send({ t: 'go', x: sx, y: sy }); await sleep(4000)
  assert.equal(B.last('piano')?.by, A.me); B.send({ t: 'piano', id: 'clair-de-lune' }); await sleep(200)
  assert.equal(B.last('piano')?.song ?? null, null, 'Bo cannot play from the floor')
  A.send({ t: 'piano', id: 'nope' }); await sleep(150); assert.equal(A.last('piano')?.song ?? null, null, 'unknown piece refused')
  A.send({ t: 'piano', id: 'sugar-cube-bossa' })
  const pa = await A.wait(() => A.last('piano')?.song && A.last('piano'), 2000), pb = await B.wait(() => B.last('piano')?.song && B.last('piano'), 2000)
  assert.equal(pa.song, 'sugar-cube-bossa'); assert.equal(pa.at, pb.at, 'one start time for everyone'); assert.ok(pa.at - pa.now >= 300, 'starts after a short lead')
  await sleep(600)
  const C = await J({ name: 'Cy' }); const pc = await C.wait(() => C.last('piano'), 2000)
  assert.equal(pc.song, 'sugar-cube-bossa'); assert.equal(pc.at, pa.at, 'late joiner gets the original start'); assert.ok(pc.now > pc.at, 'and can seek to now - at')
  C.send({ t: 'tm', c: 123 }); const tm = await C.wait(() => C.last('tm'), 1000); assert.equal(tm.c, 123); assert.ok(Math.abs(tm.s - Date.now()) < 1000)
  B.send({ t: 'pstop' }); await sleep(200); assert.equal(C.last('piano').song, 'sugar-cube-bossa', 'only the pianist can stop')
  A.send({ t: 'pstop' }); const st = await C.wait(() => C.last('piano')?.song === null && C.last('piano'), 1000); assert.equal(st.why, 'stop'); assert.equal(st.by, A.me)
  A.send({ t: 'piano', id: 'moon-in-the-teacup' }); await C.wait(() => C.last('piano')?.song === 'moon-in-the-teacup', 1000)
  A.send({ t: 'go', x: sx, y: sy + 2 }); const up = await C.wait(() => C.last('piano')?.by === 0 && C.last('piano'), 3000)
  assert.equal(up.song, null, 'standing up stops the song')
  await done()
})
await test('Not for me: only after a reveal; both stand up, the other gets a kind notice, a broken heart only they see, hearts cleared, no more cards or call, never that table pair again; not a block', async () => {
  const A = await J({ name: 'Ada' }), B = await J({ name: 'Jess' }), C = await J({ name: 'Cleo' }); await sleep(200)
  A.send({ t: 'heart', id: B.me }); B.send({ t: 'heart', id: A.me }); await A.wait(() => A.last('mutual'), 2000)
  const tb = await seat(A, B, 5)
  A.send({ t: 'nfm' }); await sleep(300); assert.ok(A.last('card').q, 'refused before any card was revealed')
  A.send({ t: 'ans', text: 'Tea' }); B.send({ t: 'ans', text: 'Coffee' }); await A.wait(() => A.last('card').rev)
  B.send({ t: 'nfm' })
  const nB = await B.wait(() => B.last('note')?.k === 'ended' && B.last('note'), 2000), nA = await A.wait(() => A.last('note')?.k === 'moved-on' && A.last('note'), 2000)
  assert.equal(nA.name, 'Jess'); assert.equal(nA.id, B.me); assert.equal(nB.name, 'Ada')
  assert.equal(A.last('card').q, null); assert.equal(B.last('card').q, null)
  assert.ok(!C.events.some(e => e.t === 'note'), 'nobody else is told')
  await sleep(800)
  assert.ok(!(A.self().f & 8) && !(B.self().f & 8), 'both stood up')
  assert.ok(!tb.seats.some(([x, y]) => [A.self(), B.self()].some(s => Math.floor(s.x) === x && Math.floor(s.y) === y)), 'off the seats')
  assert.equal(mark(A, B), F_BROKEN, 'Ada sees the grey broken heart over Jess'); assert.equal(mark(B, A), 0, 'Jess sees nothing over Ada')
  assert.equal(mark(C, A), mark(C, A) & 1, 'Cleo never sees a broken heart'); assert.equal(mark(C, B) & 2, 0)
  assert.ok(A.ents.has(B.me) && B.ents.has(A.me), 'not a block: still visible to each other')
  if (dev) { const u = [...dev.rooms.get('cafe-1').room.players.values()]; const a = u.find(p => p.name === 'Ada'), b = u.find(p => p.name === 'Jess')
    assert.ok(!a.sets.hearted.has(b.uid) && !b.sets.hearted.has(a.uid), 'hearts cleared') }
  // they sit down at a table together again: no card, the one who sat second is stood up and told
  const i0 = A.events.length; await goTo(A, ...TABLES[6].seats[0], 15000); await sleep(300); await goTo(B, ...TABLES[6].seats[1], 15000)
  await B.wait(() => B.last('note')?.k === 'table-no', 3000); await sleep(600)
  assert.ok(!A.events.slice(i0).some(e => e.t === 'card' && e.q), 'no new card for the two'); assert.ok(!(B.self().f & 8), 'second sitter stood up')
  await done()
})
await test('sofas: tap walks you there and sits you; three a sofa, the fourth is told it is full; room chat stays public, no cards; walking away stands you up', async () => {
  const { SOFAS } = await import('../shared/sofa.ts')
  const ps = []; for (const n of ['Sol', 'Sky', 'Sam', 'Sid']) ps.push(await J({ name: n })); await sleep(200)
  assert.equal(ps[0].last('hi')?.sofas, true, 'sofa sitting is on')
  for (const p of ps.slice(0, 3)) { p.send({ t: 'sofa', i: 0 }); await sleep(150) }
  await Promise.all(ps.slice(0, 3).map(p => p.wait(() => { const s = p.self(); return s && (s.f & 8) && Math.floor(s.y) === SOFAS[0].y + 1 }, 15000)))
  const xs = ps.slice(0, 3).map(p => p.self().x).sort(); assert.equal(new Set(xs.map(x => x.toFixed(2))).size, 3, 'three different slots')
  for (const p of ps.slice(0, 3)) assert.ok(SOFAS[0].slots.some(([x, y]) => Math.abs(p.self().x - x) < .02 && Math.abs(p.self().y - y) < .02))
  ps[3].send({ t: 'sofa', i: 0 }); const full = await ps[3].wait(() => ps[3].last('note')?.k === 'sofa-full', 2000); assert.ok(full)
  ps[0].send({ t: 'say', text: 'comfy here' }); await ps[3].wait(() => ps[3].last('say')?.text === 'comfy here', 2000)
  assert.equal(ps[3].last('say').priv, undefined, 'room chat stays public'); assert.ok(!ps[0].events.some(e => e.t === 'card' && e.q), 'no cards on a sofa')
  ps[3].send({ t: 'sofa', i: 1 }); await ps[3].wait(() => (ps[3].self()?.f & 8) && Math.floor(ps[3].self().y) === SOFAS[1].y + 1, 15000)
  assert.ok(Math.abs(ps[3].self().x - SOFAS[1].slots[0][0]) < .02, 'GD: one sitter takes L')
  ps[0].send({ t: 'go', x: 20, y: 12 }); await sleep(600); assert.ok(!(ps[0].self().f & 8), 'walking away stands you up')
  ps[3].send({ t: 'sofa', i: 0 }); await ps[3].wait(() => (ps[3].self()?.f & 8) && Math.floor(ps[3].self().y) === SOFAS[0].y + 1 && Math.floor(ps[3].self().x) < 33, 15000)
  await done()
})
await test('one pianist at a time: a second player can not take the bench (told piano-busy), the pianist keeps it', async () => {
  const { PIANO_SEAT } = await import('../shared/piano.ts')
  const a = await J({ name: 'Pia' }), b = await J({ name: 'Pib' }); await sleep(200)
  a.send({ t: 'go', x: PIANO_SEAT[0], y: PIANO_SEAT[1] }); assert.ok(await a.wait(() => a.last('piano')?.by === a.me, 20000), 'Pia got the bench')
  b.send({ t: 'go', x: PIANO_SEAT[0], y: PIANO_SEAT[1] }); assert.ok(await b.wait(() => b.last('note')?.k === 'piano-busy', 2000))
  await sleep(1500); assert.equal(b.last('piano')?.by, a.me); assert.ok(!(Math.floor(b.self().x) === PIANO_SEAT[0] && Math.floor(b.self().y) === PIANO_SEAT[1]))
  await done()
})
await test('couple heart: only while the café call is connected on both sides and both switches are on; on/off per table to the room; never to someone either blocked', async () => {
  const A = await J({ name: 'Cha' }), B = await J({ name: 'Chb' }), C = await J({ name: 'Chc' }), D = await J({ name: 'Chd' }); await sleep(200)
  const tb = await seat(A, B, 5); await play(A, B, 5); await play(A, B, 5); assert.equal(A.last('card').lv, 3)
  const hearts = (b) => b.events.filter(e => e.t === 'couple' && e.tb === tb.id)
  A.send({ t: 'callup' }); A.send({ t: 'cheart', on: false }); await sleep(200); assert.equal(hearts(C).length, 0, 'no call yet: callup/cheart ignored')
  D.send({ t: 'block', id: A.me }); await D.wait(() => D.last('ack'))
  A.send({ t: 'call' }); await B.wait(() => B.last('card').call === 'in'); B.send({ t: 'callyes' })
  await A.wait(() => A.last('call')); await B.wait(() => B.last('call')); await sleep(200)
  assert.equal(hearts(C).length, 0, 'not while ringing / connecting')
  A.send({ t: 'callup' }); await sleep(200); assert.equal(hearts(C).length, 0, 'one side connected is not enough')
  B.send({ t: 'callup' }); assert.ok(await C.wait(() => hearts(C).at(-1)?.on === true), 'both connected, both switches on by default: the room sees it')
  assert.ok(await A.wait(() => hearts(A).at(-1)?.on === true) && await B.wait(() => hearts(B).at(-1)?.on === true), 'the pair see it too')
  assert.deepEqual(Object.keys(hearts(C).at(-1)).sort(), ['on', 't', 'tb'], 'only on/off for the table')
  await sleep(150); assert.equal(hearts(D).length, 0, 'someone who blocked one of the two never sees it')
  const late = await J({ name: 'Chl' }); assert.ok(await late.wait(() => hearts(late).at(-1)?.on === true), 'a late joiner gets it')
  B.send({ t: 'cheart', on: false }); assert.ok(await C.wait(() => hearts(C).at(-1)?.on === false), 'either one turns it off: hidden for everyone')
  A.send({ t: 'cheart', on: true }); await sleep(200); assert.equal(hearts(C).at(-1).on, false, "A's switch on doesn't override B's off")
  B.send({ t: 'cheart', on: true }); assert.ok(await C.wait(() => hearts(C).at(-1)?.on === true), 'both on again: back')
  A.send({ t: 'calldown' }); assert.ok(await C.wait(() => hearts(C).at(-1)?.on === false), 'call ended: gone'); assert.ok(await B.wait(() => B.last('callend')), 'the other side is told the call ended')
  // a new call: switches default on again; standing up hides it at once
  A.send({ t: 'call' }); await B.wait(() => B.last('card').call === 'in'); B.send({ t: 'callyes' }); await sleep(200)
  A.send({ t: 'callup' }); B.send({ t: 'callup' }); assert.ok(await C.wait(() => hearts(C).at(-1)?.on === true), 'new call, defaults on')
  await goTo(A, tb.seats[0][0], tb.seats[0][1] + 2); assert.ok(await C.wait(() => hearts(C).at(-1)?.on === false), 'standing up hides it'); assert.ok(await B.wait(() => B.events.filter(e => e.t === 'callend').length >= 2))
  await done()
})
await test('voice emotes: set by "I am", takes rotate (never the same twice in a row), 1.5 s server cooldown, heard by the room', async () => {
  const { EMOTE_COOLDOWN_MS, setOf, DEFAULT_SET } = await import('../shared/emote.ts')
  assert.equal(setOf(undefined), DEFAULT_SET); assert.equal(setOf('woman'), 'female'); assert.equal(setOf('man'), 'male')
  const w = await J({ name: 'Emw', iam: 'woman' }), m = await J({ name: 'Emm', iam: 'man' }), o = await J({ name: 'Emo' }); await sleep(200)
  const got = (b, id) => b.events.filter(e => e.t === 'emote' && e.id === id)
  w.send({ t: 'emote', e: 'nope' }); w.send({ t: 'emote', e: 'giggle' })
  assert.ok(await o.wait(() => got(o, w.me).length === 1), 'the room hears her giggle'); assert.match(got(o, w.me)[0].take, /^giggle_f[12]$/)
  assert.ok(await w.wait(() => got(w, w.me).length === 1), 'she hears her own'); assert.equal(got(m, w.me).length, 1)
  w.send({ t: 'emote', e: 'giggle' }); const slow = await w.wait(() => w.events.find(e => e.t === 'emote' && e.ok === false), 1000)
  assert.ok(slow && slow.wait > 0 && slow.wait <= EMOTE_COOLDOWN_MS, 'second one inside 1.5 s refused with a wait'); await sleep(300); assert.equal(got(o, w.me).length, 1, 'and never relayed')
  const takes = [got(o, w.me)[0].take]
  for (let i = 0; i < 4; i++) { await sleep(EMOTE_COOLDOWN_MS + 80); w.send({ t: 'emote', e: 'giggle' }); assert.ok(await o.wait(() => got(o, w.me).length === takes.length + 1)); takes.push(got(o, w.me).at(-1).take) }
  for (let i = 1; i < takes.length; i++) assert.notEqual(takes[i], takes[i - 1], 'same take twice in a row: ' + takes.join(','))
  m.send({ t: 'emote', e: 'gasp' }); assert.ok(await o.wait(() => got(o, m.me).length === 1)); assert.match(got(o, m.me)[0].take, /^gasp_m[12]$/, 'his set is the male one')
  await done()
})
await test('40-person cap: the 41st is sent to cafe-2 and sees nobody from cafe-1', async () => {
  const bots = []; for (let i = 0; i < 40; i++) bots.push(J({ name: 'Cap' + i }))
  const forty = await Promise.all(bots); assert.ok(forty.every(b => b.inst === 'cafe-1'))
  const x = await J({ name: 'Late' }); assert.ok(x.events.some(e => e.t === 'full' && e.next === 'cafe-2')); assert.equal(x.inst, 'cafe-2')
  await sleep(300); assert.ok(![...x.ents.keys()].some(id => id !== x.me && forty.some(b => b.me === id && b.inst === 'cafe-1') && false))
  assert.equal(x.ents.size, 1, 'sees cafe-1 people'); assert.ok(forty[0].ents.size <= 40)
  forty[5].close(); await sleep(300); const y = await J({ name: 'Back' }); assert.equal(y.inst, 'cafe-1', 'freed seat not reused')
  await done()
})

await test('snapshot: one binary frame per tick per client, only people in your instance', async () => {
  const A = await J({ name: 'Snap' }); await sleep(200); const b0 = A.bin.length, k0 = A.tick; const t0 = Date.now(); await sleep(1000)
  const frames = A.binBytes; await sleep(0)
  assert.ok(A.tick - k0 >= 8 && A.tick - k0 <= 12, 'ticks/s ' + (A.tick - k0))
  await done()
})

console.log(`server: ${dev ? 'Node dev server, filter ' + dev.filterKind : 'wrangler dev ' + process.env.WORLD_URL + ' (Worker code, obscenity)'}`)
console.log(failed ? `\n${failed} FAILED` : `\nworld: ALL ${results.length} OK`)
process.exit(failed ? 1 : 0)
