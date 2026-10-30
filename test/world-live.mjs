// Pixeldate World · live smoke against the deployed workers.dev café (no local server, nothing written to production
// beyond two short visits: no reports, no blocks). Phone 390x844 @3x touch + desktop 1440x900.
//   gate: no invite / wrong invite refused, 18+ required · join from the invite link · each sees the other · heart both
//   ways · filtered bubble held and never delivered · bubble crosses · shared table card · shots → shots/world-cafe-live/
// Run: node test/world-live.mjs   (invite read from .secrets/world-invite.txt, never printed)
import puppeteer from 'puppeteer-core'
import { readFileSync, mkdirSync } from 'node:fs'
const { F_HEART, F_SIT } = await import('../world/shared/proto.ts')
const { SAMPLES } = await import('../src/avatar/kit/kit.gen.ts')
// Rehearse locally (no production writes): LIVE=http://localhost:4173 WS=ws://127.0.0.1:8787 INVITE_FILE=<file> OUT=… node test/world-live.mjs
const ORIGIN = process.env.LIVE || 'https://pixeldate-world.pixeldate.workers.dev', APP = ORIGIN + '/Pixeldate/app/?world=cafe' + (process.env.WS ? '&ws=' + encodeURIComponent(process.env.WS) : '')
const INV = readFileSync(process.env.INVITE_FILE || new URL('../.secrets/world-invite.txt', import.meta.url), 'utf8').trim()
const OUT = process.env.OUT || '/workspace/pixeldate/shots/world-cafe-live/'; mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let bad = 0, n = 0
const ok = (c, m) => { n++; if (c) console.log('✔', m); else { bad++; console.log('✘ FAIL', m) } }
const until = async (f, ms = 8000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f().catch(() => null); if (v) return v; await sleep(step) } return null }
// ── one site: the worker is the only Pixeldate site (bare host and /Pixeldate open the app, query kept; every asset
// ships; the café WebSocket refuses other sites' pages)
{ const WSO = (process.env.WS || ORIGIN.replace(/^http/, 'ws')).replace(/^ws/, 'http')
  const r1 = await fetch(ORIGIN + '/?world=cafe&x=1', { redirect: 'manual' }); ok(r1.status === 302 && r1.headers.get('location') === '/Pixeldate/app/?world=cafe&x=1', `/ → ${r1.status} ${r1.headers.get('location')}`)
  const r2 = await fetch(ORIGIN + '/Pixeldate?x=2', { redirect: 'manual' }); ok(r2.status === 302 && r2.headers.get('location') === '/Pixeldate/app/?x=2', `/Pixeldate → ${r2.status} ${r2.headers.get('location')}`)
  const land = await fetch(ORIGIN + '/Pixeldate/'), app = await fetch(ORIGIN + '/Pixeldate/app/'), appH = await app.text()
  ok(land.status === 200 && /Chemistry first/.test(await land.text()), '/Pixeldate/ serves the landing')
  ok(app.status === 200 && /type="module"/.test(appH), '/Pixeldate/app/ serves the app')
  const assets = [...appH.matchAll(/(?:src|href)="(\/Pixeldate\/[^"]+)"/g)].map(m => m[1]).concat(['/Pixeldate/art/landing-hero-wide.webp', '/Pixeldate/audio/piano/clair-de-lune.ogg', '/Pixeldate/audio/piano/clair-de-lune.m4a', '/Pixeldate/audio/emotes/aww_f1.ogg'])
  const st = await Promise.all(assets.map(a => fetch(ORIGIN + a, { method: 'HEAD' }).then(r => r.status)))
  ok(st.every(x => x === 200), `app assets ship (${st.filter(x => x === 200).length}/${st.length} 200)`)
  ok((await (await fetch(WSO + '/health')).text()) === 'ok', '/health reaches the worker')
  const { request } = await import(WSO.startsWith('https') ? 'node:https' : 'node:http')
  const up = origin => new Promise(res => { const q = request(WSO + '/parties/area/cafe-1', { headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', ...(origin ? { Origin: origin } : {}) } })
    q.on('upgrade', (r, sock) => { sock.destroy(); res(r.statusCode) }); q.on('response', r => { r.resume(); res(r.statusCode) }); q.on('error', () => res(0)); q.end() })
  ok(await up('https://evil.example') === 403, 'café WebSocket refuses a foreign Origin (403)')
  ok(await up(new URL(WSO).origin) === 101, 'café WebSocket accepts its own Origin')
  ok(await up('http://localhost:5173') === 101, 'café WebSocket accepts localhost (dev, tests)')
}
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 90000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const PHONE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const run = Date.now().toString(36)
async function player(tag, vp, prof) {
  const ctx = await browser.createBrowserContext(), p = await ctx.newPage(); await p.setViewport(vp)
  if (vp.isMobile) await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36')
  p.on('pageerror', e => { bad++; console.log('  PAGEERR', tag, e.message) })
  p.on('console', m => { if (m.type() === 'error') console.log(`  [${tag}]`, m.text().replaceAll(INV, '<invite>').slice(0, 160)) })
  prof = { age: 32, by: 1994, bm: 3, uid: `live-${tag}-${run}`, ...prof }
  await p.evaluateOnNewDocument(pr => { if (!localStorage.getItem('pd.profile')) localStorage.setItem('pd.profile', pr) }, JSON.stringify(prof))
  p.tag = tag; p.prof = prof; p.sz = vp.width; p.touch = !!vp.hasTouch; return p
}
const shot = async (p, name) => { await sleep(400); await p.screenshot({ path: `${OUT}${name}-${p.sz}.png` }); console.log('  📷', `${OUT}${name}-${p.sz}.png`) }
const st = p => p.evaluate(() => window.__world?.state())
const meEnt = async p => { const s = await st(p); return s?.ents.find(e => e.id === s.me) }
const entBy = async (p, name) => (await st(p))?.ents.find(e => e.name === name)
const press = (p, sel) => p.touch ? p.tap(sel) : p.click(sel)
const tapAt = (p, x, y) => p.touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y)
const walkTo = async (p, tx, ty, ms = 30000) => {
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
const clearInvite = p => p.$eval('[data-t=w-invite]', e => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })) })
async function sayUI(p, text) {
  if (!p.touch) { await p.keyboard.press('Enter'); await p.keyboard.type(text); await p.keyboard.press('Enter'); await p.keyboard.press('Escape') }
  else { await press(p, '[data-t=w-input]'); await p.type('[data-t=w-input]', text); await press(p, '[data-t=w-send]') }
}

// two players who are each other's type: he (phone) seeks women 26–38, she (desk) seeks men 28–40
const phone = await player('phone', PHONE, { name: 'Sam', min: 26, max: 38, iam: 'man', seek: 'women', pav: JSON.stringify({ v: 1, ...SAMPLES[10] }) })
const desk = await player('desk', DESK, { name: 'Jess', age: 30, by: 1996, min: 28, max: 40, iam: 'woman', seek: 'men', pav: JSON.stringify({ v: 1, ...SAMPLES[1] }) })

// ── gate on the phone: no invite → Enter off; 18+ unticked → Enter off; wrong invite → refused; the real one → in
await phone.goto(APP, { waitUntil: 'networkidle0' }); await phone.waitForSelector('[data-t=w-gate]')
ok(await phone.$eval('[data-t=w-enter]', b => b.disabled) && !(await phone.$eval('[data-t=w-invite]', e => e.value)), 'phone: no invite in the link → Enter stays off')
await press(phone, '[data-t=w-adult]'); ok(await phone.$eval('[data-t=w-enter]', b => b.disabled), 'phone: 18+ ticked but still no invite → Enter off')
await shot(phone, '01-gate-no-invite')
await press(phone, '[data-t=w-adult]'); await phone.type('[data-t=w-invite]', 'pd-not-a-real-invite')
ok(await phone.$eval('[data-t=w-enter]', b => b.disabled), 'phone: invite typed but 18+ unticked → Enter off (18+ gate)')
await press(phone, '[data-t=w-adult]'); await press(phone, '[data-t=w-enter]')
ok(await until(() => phone.$('[data-t=w-refused]')), 'phone: wrong invite refused by the live server')
ok(!(await phone.$('[data-t=w-room]')), 'phone: no café behind a wrong invite'); await shot(phone, '02-refused')
await clearInvite(phone); await phone.type('[data-t=w-invite]', INV); await press(phone, '[data-t=w-enter]')
ok(await until(() => phone.$('[data-t=w-room]'), 10000), 'phone: joined with the real invite + 18+')

// ── desktop arrives from the hidden link itself (?world=cafe&invite=…), ticks 18+ and enters
await desk.goto(APP + '&invite=' + encodeURIComponent(INV), { waitUntil: 'networkidle0' }); await desk.waitForSelector('[data-t=w-gate]')
ok(await desk.$eval('[data-t=w-invite]', (e, v) => e.value === v, INV) && await desk.$eval('[data-t=w-enter]', b => b.disabled), 'desk: the link fills the invite; Enter waits for 18+')
await press(desk, '[data-t=w-adult]'); await press(desk, '[data-t=w-enter]')
ok(await until(() => desk.$('[data-t=w-room]'), 10000), 'desk: joined from the invite link')
for (const p of [phone, desk]) { const s = await until(async () => { const s = await st(p); return s?.gl ? s : null }, 10000); ok(s && s.gl === 'webgl', `${p.tag}: café renders (${s?.gl}, layout ${s?.layout}, k=${s?.k})`) }
ok((await st(phone)).inst === (await st(desk)).inst, `both in the same room (${(await st(phone)).inst})`)
ok(await until(async () => (await entBy(phone, 'Jess')) && (await entBy(desk, 'Sam'))), 'each sees the other')
// v05 here count: the header counts exactly the people in the room (you included), no phantom +1
for (const p of [phone, desk]) { const c = await until(async () => { const n = await p.$eval('[data-t=w-count]', e => +(e.dataset.n ?? parseInt(e.textContent))).catch(() => -1), s = await st(p); return n >= 2 && n === s.ents.length ? [n, s.ents.length] : null }, 8000)
  ok(!!c, `${p.tag}: "here" count = people on the map (${c?.join(' = ')})`) }

// ── walk near each other; hearts both ways (each other's type, not met yet)
ok(await walkTo(phone, 15, 10), 'phone: tap-to-walk to 15,10'); ok(await walkTo(desk, 18, 10), 'desk: click-to-walk to 18,10')
ok(await until(async () => ((await entBy(phone, 'Jess'))?.f & F_HEART) && ((await entBy(desk, 'Sam'))?.f & F_HEART)), 'coral heart over each other (compatible both ways, not met)')
{ const a = await entBy(desk, 'Sam'); await walkTo(phone, 14, 11); ok(await until(async () => { const b = await entBy(desk, 'Sam'); return Math.hypot(b.x - a.x, b.y - a.y) > 1 }), 'desk sees the phone player walk') }
await shot(phone, '03-cafe-heart'); await shot(desk, '03-cafe-heart')

// ── bubbles: one crosses, a filtered one is held for its sender and never delivered
const phoneId = (await st(phone)).me, deskId = (await st(desk)).me
await sayUI(desk, 'hi from the big screen')
ok(await until(() => phone.$$eval('[data-t=bubble]', (es, id) => es.some(e => e.dataset.id === String(id) && e.textContent === 'hi from the big screen'), deskId)), 'phone sees the desktop bubble')
await sayUI(phone, 'hello from my phone')
ok(await until(() => desk.$$eval('[data-t=bubble]', (es, id) => es.some(e => e.dataset.id === String(id) && e.textContent === 'hello from my phone'), phoneId)), 'desktop sees the phone bubble')
ok(await until(() => desk.$$eval('[data-t=w-log] li', es => es.some(li => li.textContent.includes('hello from my phone')))), 'desktop chat log has it')
await shot(phone, '04-bubbles'); await shot(desk, '04-bubbles')
await sayUI(phone, 'text me on 07700 900123')
ok(await until(() => phone.$$eval('[data-t=bubble].held', es => es.some(e => e.textContent.includes('07700')))), 'phone: filtered bubble held ("not sent")')
await sleep(2500)
ok(!(await desk.evaluate(() => document.body.innerText.includes('07700'))), 'desktop never got the filtered text (not on the map, not in the log)')
await shot(phone, '05-filtered')
await sayUI(desk, 'add me @jess_k on insta')
ok(await until(() => desk.$$eval('[data-t=bubble].held', es => es.some(e => e.textContent.includes('@jess_k')))), 'desk: filtered bubble held'); await sleep(2000)
ok(!(await phone.evaluate(() => document.body.innerText.includes('jess_k'))), 'phone never got the filtered handle'); await shot(desk, '05-filtered')

// ── table for two: both sit at the same table → the same question card for both
ok(await walkTo(desk, 18, 15), 'desk: walked to a seat (18,15)'); ok(await walkTo(phone, 21, 15, 45000), 'phone: walked to the other seat (21,15)')
const cardP = await until(() => phone.$('[data-t=w-card]'), 15000), cardD = await until(() => desk.$('[data-t=w-card]'), 15000)
ok(cardP && cardD, 'shared question card appears for both')
if (cardP && cardD) {
  const qp = await phone.$eval('[data-t=w-q]', e => e.textContent), qd = await desk.$eval('[data-t=w-q]', e => e.textContent)
  ok(qp === qd, `same question on both ("${qp.slice(0, 50)}…")`)
  ok(((await meEnt(phone)).f & F_SIT) && ((await meEnt(desk)).f & F_SIT), 'both seated')
  const w = async p => (await p.$eval('[data-t=w-with]', e => e.textContent)).replace(/^with /, '')
  ok(await w(phone) === 'Jess' && await w(desk) === 'Sam', 'card names the other person')
}
// ── v05 table (only when the deployed client has GD's v05 panel): private chat, hidden answers revealed together,
//    the meter, Start call locked until Level 3. Writes only the pair's level record for these two throwaway uids.
if (cardP && cardD && await phone.$('[data-t=w-lv]')) {
  const typeIn = async (p, sel, t) => { await p.bringToFront(); await p.focus(sel); await p.keyboard.type(t) }
  const lv0 = (await phone.$eval('[data-t=w-lv]', e => e.textContent)).trim(); ok(/^Level 1 Stranger\s*·\s*0\/5 to Spark$/.test(lv0), `v05 header: "${lv0}"`)
  const line = 'just between us, live ' + run
  await press(phone, '[data-t=w-input]'); await typeIn(phone, '[data-t=w-input]', line); await press(phone, '[data-t=w-send]')
  ok(await until(() => desk.$$eval('[data-t=w-priv] li', (es, t) => es.some(e => e.textContent.includes(t)), line)), 'v05 private: Jess sees the table line in "Just you two"')
  await shot(phone, '08-private'); await shot(desk, '08-private')
  await typeIn(phone, '[data-t=w-ans-input]', 'coffee, obviously'); await press(phone, '[data-t=w-ans-send]')
  ok(await until(() => phone.$('[data-t=w-hid]')) && !(await desk.evaluate(() => document.body.innerText.includes('coffee, obviously'))), 'v05 card: my answer hidden from Jess until she answers')
  await typeIn(desk, '[data-t=w-ans-input]', 'tea, sorry'); await desk.keyboard.press('Enter')
  ok(await until(() => phone.$('[data-t=w-done]')) && await until(() => desk.$('[data-t=w-done]')), 'v05 card: both revealed together, "Ticked off"')
  for (const p of [phone, desk]) { const r = await p.evaluate(() => ({ lv: document.querySelector('[data-t=w-lv]')?.textContent, s: document.querySelector('[data-t=w-callrow]')?.dataset.call, dis: document.querySelector('[data-t=w-call]')?.disabled }))
    ok(/1\/5/.test(r.lv) && r.s === 'locked' && r.dis, `v05 ${p.tag}: meter "${r.lv?.trim()}", Start call locked`) }
  await shot(phone, '09-revealed'); await shot(desk, '09-revealed')
} else console.log('  (deployed client is pre-v05: v05 table checks skipped)')
await shot(phone, '06-card'); await shot(desk, '06-card')
// ── outsiders (390 + 1440): two more visitors see the pair seated at their table, never their private table chat
for (const [tag, vp, name, pav] of [['out390', PHONE, 'Ola', 4], ['out1440', DESK, 'Kit', 7]]) {
  const o = await player(tag, vp, { name, iam: 'woman', seek: 'everyone', min: 50, max: 60, pav: JSON.stringify({ v: 1, ...SAMPLES[pav] }) })
  await o.goto(APP + '&invite=' + encodeURIComponent(INV), { waitUntil: 'networkidle0' }); await o.waitForSelector('[data-t=w-gate]')
  await press(o, '[data-t=w-adult]'); await press(o, '[data-t=w-enter]')
  ok(await until(() => o.$('[data-t=w-room]'), 10000), `${tag}: joined`)
  ok(await until(async () => { const a = await entBy(o, 'Sam'), b = await entBy(o, 'Jess'); return a && b && (a.f & F_SIT) && (b.f & F_SIT) }, 10000), `${tag}: sees Sam and Jess seated at their table`)
  await walkTo(o, 19, 12); await o.bringToFront(); await sleep(600)
  ok(!(await o.$('[data-t=w-card]')) && !(await o.evaluate(() => document.body.innerText.includes('just between us'))), `${tag}: no card and none of the pair's private chat`)
  await shot(o, '10-outsider'); await o.browserContext().close()
}
// person panel (Heart / Pass / Report / Block) on the desktop, without pressing anything
{ const e = await entBy(desk, 'Sam'); const [x, y] = await desk.evaluate(id => window.__world.css(id), e.id); await desk.mouse.click(x, y - 8)
  ok(await until(() => desk.$('[data-t=w-person]'), 4000), 'desk: clicking Sam opens his panel'); await shot(desk, '07-person'); await desk.keyboard.press('Escape') }
{ const e = await entBy(phone, 'Jess'); const [x, y] = await phone.evaluate(id => window.__world.css(id), e.id); await phone.touchscreen.tap(x, y - 8)
  ok(await until(() => phone.$('[data-t=w-person]'), 4000), 'phone: tapping Jess opens her panel'); await shot(phone, '07-person') }
// nothing in the page carries prefs, uids or the invite list
for (const p of [phone, desk]) { const leak = await p.evaluate(() => { const j = JSON.stringify([...window.__world.net.pubs.values()]); return /uid|seek|"min"|"max"|iam|refus|live-/.test(j) }); ok(!leak, `${p.tag}: no prefs/uids in what the page holds`) }
await browser.close()
console.log(bad ? `world live: ${bad} FAILED of ${n}` : `world live: ALL ${n} OK`)
process.exit(bad ? 1 : 0)
