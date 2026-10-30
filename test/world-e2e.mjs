// Pixeldate World · café e2e in real Chrome against the built app (vite preview :4173) and the Node dev world server.
//   phone  390x844 @3x, touch: tap-to-walk, tap a person, chat bar, simulated on-screen keyboard
//   desktop 1440x900 @1x, mouse + keys: click-to-walk, arrows/WASD, Enter to talk, Esc to close, camera follows
//   cross-device: both players in one room see each other move and swap a bubble
//   phone camera: 2 CSS px per art px, eased follow, clamped at the walls (no empty bands), coral arrows to off-screen hearts
//   shots of every state at both sizes → shots/world-cafe-v02/     Run: node test/world-e2e.mjs   (FPS=1 adds the 40-player FPS run)
import puppeteer from 'puppeteer-core'
process.env.WORLD_PORT = '18793'; process.env.WORLD_URL = 'ws://127.0.0.1:18793'
const dev = await import('../world/dev/server.ts')
const { Bot, profile, sleep } = await import('../world/test/lib.mjs')
const { runBots } = await import('../world/test/bots.mjs')
const { SAMPLES } = await import('../src/avatar/kit/kit.gen.ts')
const { F_HEART, F_BROKEN, F_SIT } = await import('../world/shared/proto.ts')
const APP = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
const Q = '?world=cafe&ws=ws://127.0.0.1:18793'
const OUT = '/workspace/pixeldate/shots/world-cafe-v02/'
const { mkdirSync: mk } = await import('node:fs'); mk(OUT, { recursive: true })
let bad = 0, n = 0
const ok = (c, m) => { n++; if (c) console.log('✔', m); else { bad++; console.log('✘ FAIL', m) } }
const until = async (f, ms = 6000, step = 60) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f(); if (v) return v; await sleep(step) } return null }
await sleep(300)

// ── the cast (server-side bots). Players are men seeking women, 30–34, wanting 26–38.
const W = (name, o = {}, i = 0) => new Bot(profile({ name, iam: 'woman', seek: 'men', br: [30, 34], min: 28, max: 40, pav: JSON.stringify({ v: 1, ...SAMPLES[i % 12] }), ...o }))
const cast = {
  mia: W('Mia', {}, 1), noor: W('Noor', {}, 3), jo: W('Jo', { seek: 'women' }, 5),
  ava: W('Ava', {}, 7), lea: W('Lea', {}, 9), zed: W('Zed', { iam: 'man', seek: 'everyone', br: [25, 29] }, 0), kit: W('Kit', { iam: 'man', seek: 'women' }, 2),
  rae: W('Rae', { br: [40, 49], min: 35, max: 55 }, 4), sol: W('Sol', { iam: 'man', seek: 'men' }, 6), una: W('Una', { seek: 'everyone', br: [25, 29], min: 22, max: 34 }, 8),
}
for (const b of Object.values(cast)) await b.connect()
// spread out from the door one by one (the doorway crowd would otherwise block itself); the marker trio stands near both players
const place = { sol: [20, 4], rae: [14, 5], una: [11, 6], kit: [16, 7], zed: [22, 6], ava: [9, 11], mia: [17, 11], noor: [13, 12], jo: [20, 12], lea: [26, 12] }
const at = (b, [x, y]) => { const e = b.self(); return e && Math.abs(e.x - x - 0.5) < 0.6 && Math.abs(e.y - y - 0.5) < 0.6 }
for (const [k, t] of Object.entries(place)) { cast[k].send({ t: 'go', x: t[0], y: t[1] }); await sleep(350) }
for (let i = 0; i < 3; i++) { const late = Object.entries(place).filter(([k, t]) => !at(cast[k], t)); if (!late.length) break; for (const [k, t] of late) cast[k].send({ t: 'go', x: t[0], y: t[1] }); await sleep(2500) }
{ const late = Object.entries(place).filter(([k, t]) => !at(cast[k], t)).map(([k]) => k); if (late.length) console.log('  (not at their spot yet:', late.join(', ') + ')') }
const idOf = (bot, name) => [...bot.pubs.values()].find(p => p.name === name)?.id

// ── browser
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 90000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=CalculateNativeWinOcclusion', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const PHONE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
async function player(tag, vp, name, sample, extra = {}) {
  const ctx = await browser.createBrowserContext(), p = await ctx.newPage(); await p.setViewport(vp)
  p.on('pageerror', e => { bad++; console.log('  PAGEERR', tag, e.message) }); p.on('console', m => { if (m.type() === 'error' && !/404|WebSocket/.test(m.text())) console.log(`  [${tag}]`, m.text().slice(0, 160)) })
  const prof = { name, age: 32, by: 1994, bm: 3, min: 26, max: 38, iam: 'man', seek: 'women', uid: 'e2e-' + tag + '-' + Date.now().toString(36), pav: JSON.stringify({ v: 1, ...SAMPLES[sample] }), ...extra }
  await p.evaluateOnNewDocument(pr => { if (!localStorage.getItem('pd.profile')) localStorage.setItem('pd.profile', pr) }, JSON.stringify(prof))
  p.tag = tag; p.prof = prof; p.sz = vp.width; return p
}
const shot = async (p, name) => { await sleep(350); await p.screenshot({ path: `${OUT}${name}-${p.sz}.png` }); console.log('  📷', `${name}-${p.sz}.png`) }
const st = p => p.evaluate(() => window.__world?.state())
const meEnt = async p => { const s = await st(p); return s?.ents.find(e => e.id === s.me) }
const entBy = async (p, name) => (await st(p))?.ents.find(e => e.name === name)
const tapAt = (p, x, y) => p.touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y)
const tapTile = async (p, tx, ty) => { const [x, y] = await p.evaluate((a, b) => window.__world.tileCss(a, b), tx, ty); await tapAt(p, x, y) }
const tapPerson = async (p, name) => { const e = await entBy(p, name); const [x, y] = await p.evaluate(id => window.__world.css(id), e.id); const c = await p.$eval('[data-t=w-canvas]', c => c.getBoundingClientRect().toJSON()); if (x < c.left || x > c.right || y < c.top || y > c.bottom) console.log(`  ${p.tag}: ${name} is off camera at ${x | 0},${y | 0}`); await tapAt(p, x, y) }
// tap-to-walk the way a person would: tap the tile if it is on screen, otherwise tap toward it at the screen edge and go again
// (the phone shows ~12 tiles across, so far tiles take a couple of hops)
const walkTo = async (p, tx, ty, ms = 15000) => {
  const there = async () => { const m = await meEnt(p); return m && Math.abs(m.x - tx - 0.5) < 0.6 && Math.abs(m.y - ty - 0.5) < 0.6 }
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await there()) return true
    const c = await p.$eval('[data-t=w-canvas]', c => c.getBoundingClientRect().toJSON()), [x, y] = await p.evaluate((a, b) => window.__world.tileCss(a, b), tx, ty)
    const m = 28, on = x > c.left + m && x < c.right - m && y > c.top + m && y < c.bottom - m
    if (on) { await tapAt(p, x, y); return !!(await until(there, ms - (Date.now() - t0))) }
    const cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2, dx = x - cx, dy = y - cy, k = Math.min((c.width / 2 - m) / Math.abs(dx || 1e-9), (c.height / 2 - m) / Math.abs(dy || 1e-9))
    await tapAt(p, cx + dx * k, cy + dy * k)
    let last = null; await until(async () => { const e = await meEnt(p); const still = last && Math.abs(e.x - last.x) < 0.01 && Math.abs(e.y - last.y) < 0.01; last = e; return still }, 4000, 250)
  }
  return there()
}
const press = (p, sel) => p.touch ? p.tap(sel) : p.click(sel)
const said = new Map() // per player: say timestamps, to stay inside 3 per 15 s
async function sayUI(p, text, viaEnter) {
  const ts = said.get(p) || []; while (ts.length >= 3 && Date.now() - ts[ts.length - 3] < 15500) await sleep(250); ts.push(Date.now()); said.set(p, ts)
  if (viaEnter) { await p.keyboard.press('Enter'); await p.keyboard.type(text); await p.keyboard.press('Enter') }
  else { await press(p, '[data-t=w-input]'); await p.type('[data-t=w-input]', text); await press(p, '[data-t=w-send]') }
}

// ── one full pass per device: gate → café → bubble → filtered → person menu → report → table card → block
async function flow(p, o) {
  const L = p.tag
  // gate: refused without a valid invite, Enter disabled without 18+
  await p.goto(APP + Q + '&invite=nope', { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-t=w-gate]')
  ok(await p.$eval('[data-t=w-enter]', b => b.disabled), `${L}: Enter disabled until 18+ is ticked`)
  await shot(p, '01-gate')
  await press(p, '[data-t=w-adult]'); await press(p, '[data-t=w-enter]')
  ok(await until(() => p.$('[data-t=w-refused]')), `${L}: bad invite refused`); await shot(p, '02-refused')
  await p.$eval('[data-t=w-invite]', e => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })) })
  await p.type('[data-t=w-invite]', 'dev-invite-1'); await press(p, '[data-t=w-enter]')
  ok(await until(() => p.$('[data-t=w-room]'), 6000), `${L}: joined with invite + 18+`)
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('pd.profile')).adult === true), `${L}: 18+ saved on the profile`)
  await until(async () => { const s = await st(p); return s?.ents.length >= 11 && s.gl }, 8000)  // renderer init is async (Pixi picks a backend)
  const s0 = await st(p)
  ok(s0.layout === o.layout && (await p.$eval('[data-t=w-room]', e => e.dataset.layout)) === o.layout, `${L}: layout ${s0.layout}`)
  ok(Number.isInteger(s0.k) && s0.k >= 1, `${L}: integer pixel scale k=${s0.k} (dpr ${o.dpr})`)
  const cv = await p.$eval('[data-t=w-canvas]', c => ({ w: c.width, h: c.height, cw: c.getBoundingClientRect().width, ch: c.getBoundingClientRect().height }))
  ok(Math.abs(cv.cw * o.dpr - cv.w) < 1.01 && Math.abs(cv.ch * o.dpr - cv.h) < 1.01, `${L}: canvas backing store = css x dpr (${cv.w}x${cv.h}), no browser resampling`)
  ok(s0.gl === 'webgl', `${L}: PixiJS v8 renderer (${s0.gl})`)
  const [MW, MH] = s0.map
  ok(MW === 640 && MH === 384, `${L}: one shared 40x24 café (${MW}x${MH} art px)`)
  ok(s0.vw <= MW + 1e-6 && s0.vh <= MH + 1e-6, `${L}: view ${s0.vw.toFixed(1)}x${s0.vh.toFixed(1)} art px never bigger than the room (no empty bands)`)
  if (o.layout === 'phone') ok(s0.k / o.dpr === 2 && Math.abs(s0.vw / 16 - 12.2) < 0.3, `${L}: 2x scale, ${(s0.vw / 16).toFixed(1)} tiles across at 390`)
  else { const side = await p.$eval('.w-side, [data-t=w-say]', e => e.getBoundingClientRect().left); ok(side > 1000, `${L}: chat bar down the side (x=${side})`); ok(s0.vw < MW && s0.vh < MH, `${L}: camera view ${s0.vw.toFixed(0)}x${s0.vh.toFixed(0)} smaller than the map, so it follows`) }
  const sb = await p.$eval('[data-t=w-say]', e => e.getBoundingClientRect().toJSON()); ok(sb.bottom <= o.h + 0.5, `${L}: chat bar on screen (bottom ${sb.bottom.toFixed(0)})`)

  // walk: phone taps, desktop clicks; then desktop keys
  const before = await st(p)
  let lag = 0; const lagT = setInterval(async () => { const s = await st(p).catch(() => null); if (s) lag = Math.max(lag, Math.hypot(s.cam[0] - s.camT[0], s.cam[1] - s.camT[1])) }, 50)
  ok(await walkTo(p, o.stand[0], o.stand[1]), `${L}: ${p.touch ? 'tap' : 'click'}-to-walk reached tile ${o.stand}`)
  clearInterval(lagT); await sleep(900)
  { const s = await st(p); ok(lag > 0.5 && Math.hypot(s.cam[0] - s.camT[0], s.cam[1] - s.camT[1]) < 0.1, `${L}: camera eases after me (lagged up to ${lag.toFixed(1)} px, settled on target)`) }
  if (o.layout === 'desk') {
    const camA = (await st(p)).cam
    const m0 = await meEnt(p); await p.keyboard.down('ArrowLeft'); await sleep(900); await p.keyboard.up('ArrowLeft'); await sleep(300); const m1 = await meEnt(p)
    ok(m1.x < m0.x - 1.5, `${L}: ArrowLeft walks (${m0.x.toFixed(1)} → ${m1.x.toFixed(1)})`)
    await p.keyboard.down('w'); await sleep(700); await p.keyboard.up('w'); await sleep(300); const m2 = await meEnt(p)
    ok(m2.y < m1.y - 1, `${L}: W walks up (${m1.y.toFixed(1)} → ${m2.y.toFixed(1)})`)
    await p.keyboard.down('d'); await sleep(900); await p.keyboard.up('d'); await p.keyboard.down('s'); await sleep(700); await p.keyboard.up('s'); await sleep(300)
    const camB = (await st(p)).cam; ok(camA.join() !== camB.join() || camA.join() !== before.cam.join(), `${L}: camera follows (${before.cam} → ${camA} → ${camB})`)
    await walkTo(p, o.stand[0], o.stand[1])
  }
  // markers, per viewer: Mia heart, Noor broken (she passed on me), Jo nothing
  const meId = (await st(p)).me
  await until(() => idOf(cast.noor, p.prof.name)); cast.noor.send({ t: 'pass', id: idOf(cast.noor, p.prof.name) })
  ok(await until(async () => ((await entBy(p, 'Mia'))?.f & F_HEART), 4000), `${L}: coral heart over Mia (compatible both ways, not met)`)
  ok(await until(async () => ((await entBy(p, 'Noor'))?.f & F_BROKEN), 4000), `${L}: broken heart over Noor (passed on me)`)
  const jo = await entBy(p, 'Jo'); ok(jo && !(jo.f & (F_HEART | F_BROKEN)), `${L}: nothing over Jo (not compatible)`)
  const noorSees = cast.noor.ents.get(idOf(cast.noor, p.prof.name)); ok(noorSees && !(noorSees.f & (F_HEART | F_BROKEN)), `${L}: Noor sees no marker over me (she passed)`)
  if (o.layout === 'phone') {
    // off-screen heart: walk to the left wall, Mia (heart) is out of view to the right → an arrow on the right edge
    await walkTo(p, ...o.arrowAt); await sleep(900)
    const mia = await entBy(p, 'Mia'), s = await st(p), a = s.arrows.find(x => x.id === mia.id)
    ok(a && a.oct === 0 && a.x > s.css[0] - 30, `${L}: coral arrow at the right edge points to Mia off screen (${a ? `${a.x.toFixed(0)},${a.y.toFixed(0)} oct ${a.oct}` : 'none'})`)
    ok(s.arrows.every(x => s.ents.find(e => e.id === x.id)?.f & F_HEART), `${L}: arrows only for people with a heart (${s.arrows.length})`)
    await shot(p, '13-arrow')
    // walls: bottom-left corner, the camera stops at the room edge and shows nothing outside it
    await walkTo(p, ...o.wallAt); await sleep(1000)
    const w = await st(p)
    ok(w.cam[0] === 0 && Math.abs(w.cam[1] - (MH - w.vh)) < 0.01, `${L}: camera clamped at the walls (cam ${w.cam.map(v => v.toFixed(1))}, view ${w.vw.toFixed(0)}x${w.vh.toFixed(0)} of ${MW}x${MH})`)
    await shot(p, '14-wall')
    await walkTo(p, o.stand[0], o.stand[1], 15000); await sleep(900)
  }
  await shot(p, '03-cafe')
  console.log('  cast on screen:', JSON.stringify(await p.evaluate(() => window.__world.state().ents.map(e => [e.name, e.f, ...(window.__world.css(e.id) || []).map(Math.round)]))))

  // bubbles: someone else's, then mine
  cast.mia.send({ t: 'say', text: 'love the lamps in here' }); cast.jo.send({ t: 'say', text: 'first time here?' })
  ok(await until(() => p.$$eval('[data-t=bubble]', es => es.some(e => e.textContent === 'love the lamps in here'))), `${L}: Mia's bubble shows over her`)
  const myLine = o.layout === 'phone' ? 'anyone into climbing?' : 'coffee or tea?'
  await sayUI(p, myLine, o.layout === 'desk')
  ok(await until(() => p.$$eval('[data-t=bubble].mine', es => es.some(e => e.textContent === 'coffee or tea?' || e.textContent === 'anyone into climbing?'))), `${L}: my bubble shows (${o.layout === 'desk' ? 'Enter → type → Enter' : 'tap input, type, Say'})`)
  ok(await until(() => cast.mia.events.some(e => e.t === 'say' && e.id === idOf(cast.mia, p.prof.name) && e.text === myLine)), `${L}: Mia heard me`)
  await shot(p, '04-bubble')
  if (o.layout === 'desk') { await p.keyboard.press('Escape'); ok(await p.evaluate(() => document.activeElement?.dataset?.t !== 'w-input'), `${L}: Esc leaves the chat input`) }
  // filtered: the sender sees it held; nobody else gets it
  const bad1 = o.layout === 'phone' ? 'text me on 07700 900123' : 'add me @sam_k on insta'
  const heardBefore = cast.mia.events.length
  await sayUI(p, bad1, o.layout === 'desk')
  ok(await until(() => p.$$eval('[data-t=bubble].held', es => es.some(e => e.textContent.includes('07700') || e.textContent.includes('@sam_k')))), `${L}: filtered bubble held for me`)
  ok(await until(() => p.$eval('[data-t=w-note]', e => /Not sent/.test(e.textContent)).catch(() => false)), `${L}: "not sent" note`)
  await shot(p, '05-filtered'); await sleep(400)
  ok(!cast.mia.events.slice(heardBefore).some(e => e.t === 'say' && /07700|sam_k/.test(e.text)) && !cast.jo.events.some(e => e.t === 'say' && /07700|sam_k/.test(e.text)), `${L}: nobody else got the filtered text`)
  if (o.layout === 'desk') await p.keyboard.press('Escape')

  // person menu: name, bracket, Heart/Pass/Report/Block
  await tapPerson(p, 'Kit' === o.reportee ? 'Kit' : o.reportee)
  ok(await until(() => p.$('[data-t=w-person]')), `${L}: ${p.touch ? 'tap' : 'click'} a person opens their card`)
  const pn = await p.$eval('[data-t=w-person]', e => e.textContent); ok(pn.includes(o.reportee) && /\d\d–\d\d/.test(pn), `${L}: card shows name + bracket ("${pn.slice(0, 40)}")`)
  ok(!/\b(2[0-9]|3[0-9]) years|seek|women|men\b/i.test(pn), `${L}: card shows no age, prefs or wishes`)
  await shot(p, '06-person')
  await press(p, '[data-t=w-report]'); await p.waitForSelector('[data-t=w-reasons]'); await shot(p, '07-report')
  const nRep = dev.reports.length; await press(p, '[data-t=w-why-rude]')
  ok(await until(() => dev.reports.length > nRep), `${L}: report stored`)
  const rep = dev.reports.at(-1); ok(rep.by === p.prof.uid && rep.why === 'rude' && rep.at > 0 && rep.ctx && Array.isArray(rep.ctx.where), `${L}: report has time, reason and context`)
  if (o.layout === 'desk') { await tapPerson(p, o.reportee); await p.waitForSelector('[data-t=w-person]'); await p.keyboard.press('Escape'); ok(await until(async () => !(await p.$('[data-t=w-person]'))), `${L}: Esc closes the person card`) }

  // table for two: I take a seat, a bot takes the other; same card for both
  const [mine, theirs] = o.table
  ok(await walkTo(p, mine[0], mine[1], 15000), `${L}: walked to seat ${mine}`)
  cast[o.partner].send({ t: 'go', x: theirs[0], y: theirs[1] })
  ok(await until(() => p.$('[data-t=w-card]'), 15000), `${L}: shared question card appears`)
  const q = await p.$eval('[data-t=w-q]', e => e.textContent), bc = await until(() => cast[o.partner].last('card')?.q)
  ok(bc && bc.text === q, `${L}: ${cast[o.partner].p.name} got the same card ("${q.slice(0, 40)}…")`)
  ok(((await meEnt(p)).f & F_SIT), `${L}: I'm sitting`)
  await shot(p, '08-card')
  await press(p, '[data-t=w-next]'); ok(await until(async () => (await p.$eval('[data-t=w-q]', e => e.textContent)) !== q), `${L}: Next card`)

  // block: both disappear for each other
  await tapPerson(p, o.blockee); await p.waitForSelector('[data-t=w-person]'); await press(p, '[data-t=w-block]'); await p.waitForSelector('[data-t=w-confirm]'); await shot(p, '09-block')
  const bk = cast[o.blockee.toLowerCase()]; await press(p, '[data-t=w-block-yes]')
  ok(await until(async () => !(await entBy(p, o.blockee))), `${L}: ${o.blockee} gone for me`)
  ok(await until(() => !bk.ents.has(meId) && !bk.pubs.has(meId)), `${L}: I'm gone for ${o.blockee}`)
  await shot(p, '10-blocked')
  return meId
}

const phone = await player('phone', PHONE, 'Sam', 10); phone.touch = true
const desk = await player('desk', DESK, 'Alex', 11)
const T0 = Date.now()
const phoneId = await flow(phone, { layout: 'phone', dpr: 3, h: 844, stand: [15, 10], arrowAt: [1, 12], wallAt: [2, 22], reportee: 'Kit', table: [[2, 9], [5, 9]], partner: 'ava', blockee: 'Una' })
// phone keyboard: headless Chrome has no soft keyboard, so shrink the viewport the way one would and check the bar stays put
await press(phone, '[data-t=w-input]'); await phone.setViewport({ ...PHONE, height: 844 - 336 }); await sleep(600)
{ const b = await phone.$eval('[data-t=w-say]', e => e.getBoundingClientRect().toJSON()), c = await phone.$eval('[data-t=w-canvas]', e => e.getBoundingClientRect().toJSON())
  ok(b.bottom <= 508.5 && b.top > 300 && c.height > 120, `phone: with a 336 px keyboard the chat bar sits just above it (bar ${b.top.toFixed(0)}–${b.bottom.toFixed(0)}, café ${c.height.toFixed(0)} px tall)`)
  await phone.type('[data-t=w-input]', 'typing with the keyboard up'); await shot(phone, '11-keyboard') }
await phone.$eval('[data-t=w-input]', e => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })); e.blur() })
await phone.setViewport(PHONE); await sleep(400)
const deskId = await flow(desk, { layout: 'desk', dpr: 1, h: 900, stand: [20, 10], reportee: 'Zed', table: [[18, 15], [21, 15]], partner: 'lea', blockee: 'Kit' })

// ── cross-device: same room, each sees the other move, bubbles both ways
ok((await st(phone)).inst === (await st(desk)).inst, `cross: phone and desktop in the same room (${(await st(phone)).inst})`)
const seen = async (p, id) => (await st(p)).ents.find(e => e.id === id)
ok(await seen(phone, deskId) && await seen(desk, phoneId), 'cross: each sees the other')
for (const p of [phone, desk]) { ok(await walkTo(p, ...(p === phone ? [10, 12] : [12, 13])), `cross: ${p.tag} walks over`); await sleep(200) }
{ const a = await seen(desk, phoneId); await phone.touchscreen.tap(...await phone.evaluate(() => window.__world.tileCss(8, 13)))
  ok(await until(async () => { const b = await seen(desk, phoneId); return b && Math.hypot(b.x - a.x, b.y - a.y) > 1 }, 6000), 'cross: desktop sees the phone player walk (touch)') }
{ const a = await seen(phone, deskId); await desk.keyboard.down('ArrowRight'); await sleep(700); await desk.keyboard.up('ArrowRight')
  ok(await until(async () => { const b = await seen(phone, deskId); return b && b.x > a.x + 1 }, 6000), 'cross: phone sees the desktop player walk (keys)') }
await sleep(500)
await sayUI(desk, 'hi from the big screen', true)
ok(await until(() => phone.$$eval('[data-t=bubble]', (es, id) => es.some(e => e.dataset.id === String(id) && e.textContent === 'hi from the big screen'), deskId)), 'cross: phone sees the desktop bubble')
await desk.keyboard.press('Escape'); await sayUI(phone, 'hello from my phone', false)
ok(await until(() => desk.$$eval('[data-t=bubble]', (es, id) => es.some(e => e.dataset.id === String(id) && e.textContent === 'hello from my phone'), phoneId)), 'cross: desktop sees the phone bubble')
await shot(phone, '12-cross'); await shot(desk, '12-cross')
// leaks in the browser: nothing the page got carries prefs, refusals or uids
for (const p of [phone, desk]) {
  const leak = await p.evaluate(() => { const n = window.__world.net, j = JSON.stringify([...n.pubs.values()]); return /uid|seek|"min"|"max"|iam|pass|refus|bot-/.test(j) ? j.slice(0, 200) : '' })
  ok(!leak, `${p.tag}: no prefs/uids/refusals in what the page holds ${leak}`)
}
console.log(`  flow time ${((Date.now() - T0) / 1000).toFixed(0)} s`)
await phone.browserContext().close(); await desk.browserContext().close()
for (const b of Object.values(cast)) b.close()

// ── FPS with 40 in the room (39 bots + the phone), raw Chrome numbers: unthrottled and CPU throttled 4x
if (process.env.FPS) {
  await sleep(1500)
  const crowd = await runBots(39, { room: 'cafe-1' })
  const p = await player('fps', PHONE, 'Fay', 4, { adult: true }); p.touch = true
  await p.goto(APP + Q + '&invite=dev-invite-1&auto=1', { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-t=w-room]')
  await until(async () => (await st(p))?.ents.length >= 40, 8000)
  const cdp = await p.createCDPSession(), res = {}
  for (const rate of [1, 4]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate }); await sleep(1500)
    const f = await p.evaluate(() => new Promise(r => { let k = 0; const t0 = performance.now(); const go = () => { k++; if (performance.now() - t0 < 5000) requestAnimationFrame(go); else r(k / ((performance.now() - t0) / 1000)) }; requestAnimationFrame(go) }))
    const s = await st(p); res['x' + rate] = { fps: +f.toFixed(1), ents: s.ents.length }; console.log(`  FPS at ${s.ents.length} players, CPU x${rate}: ${f.toFixed(1)}`)
  }
  const { writeFileSync, mkdirSync } = await import('node:fs'); mkdirSync('world/test/.out', { recursive: true }); writeFileSync('world/test/.out/fps.json', JSON.stringify(res, null, 1))
  ok(res.x1.ents === 40, 'fps: 40 players on screen')
  crowd.stop(); await p.browserContext().close()
}
await browser.close()
console.log(bad ? `world e2e: ${bad} FAILED of ${n}` : `world e2e: ALL ${n} OK`)
process.exit(bad ? 1 : 0)
