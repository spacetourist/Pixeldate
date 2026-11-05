// Pixeldate World · games-lounge v3 e2e: the open archway (walk through, no gate), "Play a game?" invite → teleport, sharp cards/coins.
// (was: 2c duets e2e: Start duet, invite sheet + card, seat pill, secret pick with previews, In tune / offer / Level up /
// coin flip, count-in, playing (players, listeners, tags), both seated, Play solo instead. Shots → shots/games-lounge-v3/ at 390 + 1440.
import puppeteer from 'puppeteer-core'
process.env.WORLD_PORT = '18797'; process.env.WORLD_URL = 'ws://127.0.0.1:18797'; process.env.WORLD_STALE_MS = '3000'
await import('../world/dev/server.ts')
const { Bot, profile, sleep } = await import('../world/test/lib.mjs')
const { SAMPLES } = await import('../src/avatar/kit/kit.gen.ts')
const APP = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
const WQ0 = '?world=cafe&loopback&ws=ws://127.0.0.1:18797&invite=dev-invite-1&auto=1'
const OUT = '/workspace/pixeldate/shots/games-lounge-v3/'
;(await import('node:fs')).mkdirSync(OUT, { recursive: true })
let bad = 0, n = 0
const ok = (c, m) => { n++; if (c) console.log('✔', m); else { bad++; console.log('✘ FAIL', m) } }
const { createHash } = await import('node:crypto')
const until = async (f, ms = 6000, step = 60) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f(); if (v) return v; await sleep(step) } return null }
await sleep(300)

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 90000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-features=CalculateNativeWinOcclusion', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const PHONE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const ctx = await browser.createBrowserContext()   // one context: ?loopback keeps each tab's profile in its own sessionStorage, and FakePeer links the tabs
async function player(tag, vp, name, extra = {}) {
  const p = await ctx.newPage(); await p.setViewport(vp); p.tag = tag; p.sz = vp.width; p.touch = !!vp.hasTouch
  p.on('pageerror', e => { bad++; console.log('  PAGEERR', tag, e.message) }); p.on('console', m => { if (m.type() === 'error' && !/404|WebSocket/.test(m.text())) console.log(`  [${tag}]`, m.text().slice(0, 160)) })
  await p.evaluateOnNewDocument(() => { window.__gum = 0; const md = navigator.mediaDevices; if (md) { const g = md.getUserMedia.bind(md); md.getUserMedia = c => { window.__gum++; return g(c) } } })
  const uid = 'gm-' + tag + '-' + Date.now().toString(36)
  const prof = { name, age: 32, by: 1994, bm: 3, min: 26, max: 38, iam: 'man', seek: 'women', adult: true, uid, ...extra }
  await p.goto(APP + '?loopback&blank', { waitUntil: 'domcontentloaded' })
  await p.evaluate(async (pr, uid, nophoto) => {
    sessionStorage.setItem('pd-uid', uid); sessionStorage.setItem('pd.profile', pr); if (nophoto) return
    const c = new OffscreenCanvas(240, 320), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 240, 320); gr.addColorStop(0, '#FF6F91'); gr.addColorStop(1, '#3D2C8D'); g.fillStyle = gr; g.fillRect(0, 0, 240, 320)
    g.fillStyle = '#FFE0C2'; g.beginPath(); g.arc(120, 130, 60, 0, 7); g.fill(); g.fillStyle = '#2A2150'; g.fillRect(40, 220, 160, 100)
    const b = await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 }), url = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b) })
    await new Promise((res, rej) => { const r = indexedDB.open('pixeldate-' + uid, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onerror = rej
      r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(url, 'photo'); t.oncomplete = () => { r.result.close(); res() } } })
  }, JSON.stringify(prof), uid, !!extra.nophoto)
  await p.goto(APP + WQ0 + (extra.q || ''), { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-t=w-room]', { timeout: 20000 })
  p.prof = prof; return p
}
const shot = async (p, name) => { await sleep(400); await p.screenshot({ path: `${OUT}${name}-${p.sz}.png` }); console.log('  📷', `${name}-${p.sz}.png`) }
const st = p => p.evaluate(() => window.__world?.state())
const meEnt = async p => { const s = await st(p); return s?.ents.find(e => e.id === s.me) }
const entBy = async (p, name) => (await st(p))?.ents.find(e => e.name === name)
const front = async p => { if (front.cur !== p) { await p.bringToFront(); front.cur = p; await sleep(120) } }   // the tabs share a window (loopback); only the front one gets input
const tapAt = async (p, x, y) => { await front(p); return p.touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y) }
const press = async (p, sel) => { await front(p); return p.touch ? p.tap(sel) : p.click(sel) }
const typeIn = async (p, sel, t) => { await front(p); await p.type(sel, t) }
const count = p => p.$eval('[data-t=w-count]', e => +e.dataset.n).catch(() => -1)
const walkTo = async (p, tx, ty, ms = 15000) => {
  const there = async () => { const m = await meEnt(p); return m && Math.abs(m.x - tx - 0.5) < 0.6 && Math.abs(m.y - ty - 0.5) < 0.6 }
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await there()) return true
    const c = await p.$eval('[data-t=w-canvas]', c => c.getBoundingClientRect().toJSON()), [x, y] = await p.evaluate((a, b) => window.__world.tileCss(a, b), tx, ty)
    const m = 28, on = x > c.left + m && x < c.right - m && y > c.top + m && y < c.bottom - m
    if (on) { await tapAt(p, x, y); if (await until(there, Math.min(9000, ms - (Date.now() - t0)))) return true; continue }   // a tap lost under a closing panel: tap again
    const cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2, dx = x - cx, dy = y - cy, k = Math.min((c.width / 2 - m) / Math.abs(dx || 1e-9), (c.height / 2 - m) / Math.abs(dy || 1e-9))
    // an edge point can land on furniture (the server ignores taps on solid tiles): step closer to the middle until one moves us
    const m0 = await meEnt(p)
    for (const f of [1, 0.8, 0.6, 0.4, 0.25]) { await tapAt(p, cx + dx * k * f, cy + dy * k * f); if (await until(async () => { const e = await meEnt(p); return Math.abs(e.x - m0.x) + Math.abs(e.y - m0.y) > 0.05 }, 700, 100)) break }
    let last = null; await until(async () => { const e = await meEnt(p); const still = last && Math.abs(e.x - last.x) < 0.01 && Math.abs(e.y - last.y) < 0.01; last = e; return still }, 4000, 250)
  }
  return there()
}
const tapPerson = async (p, name) => { const e = await entBy(p, name); const [x, y] = await p.evaluate(id => window.__world.css(id), e.id); await tapAt(p, x, y) }


const M = await import('../world/shared/map.ts'); M.useMap('games'); const { TABLES } = M
const tap = async (p, sel, ms = 8000) => { const ok1 = await until(() => p.$(sel), ms); if (!ok1) { console.log('  missing', sel, 'on', p.tag); return false } await press(p, sel); return true }
const attr = (p, sel, a) => p.$eval(sel, (e, a) => e.getAttribute(a), a).catch(() => null)
const txt = (p, sel) => p.$eval(sel, e => e.textContent).catch(() => '')
const gameJs = new Map(); const watch = p => { gameJs.set(p.tag, 0); p.on('request', r => { if (/assets\/games-[^/]*\.js/.test(r.url())) gameJs.set(p.tag, gameJs.get(p.tag) + 1) }) }


const gateSeen = p => p.evaluate(() => { window.__gate = 0; new MutationObserver(() => { if (document.querySelector('[data-t=w-enter]')) window.__gate = 1 }).observe(document.body, { childList: true, subtree: true }) })
const A = await player('a', PHONE, 'Avery'), B = await player('b', DESK, 'Blair', { iam: 'woman', seek: 'men' })
M.useMap(M.mapOf('cafe-1'))
const dc = (() => { for (let x = 0; x < 40; x++) if (M.isDoor(x, 3)) return x })()
for (const p of [A, B]) ok(await until(async () => (await st(p))?.art?.archway?.[0] === 80 && (await st(p)).art.archway[1] === 64, 8000), p.tag + ' café archway sprite drawn (80x64)')
ok((await txt(B, '[data-t=w-door]')).includes('Games Lounge'), 'header "Games Lounge →" kept')
// stand under the archway so it's in view
ok(await walkTo(A, dc, 5, 25000), 'Avery walks up to the archway'); ok(await walkTo(B, dc + 1, 5, 25000), 'Blair walks up to the archway')
await shot(A, '01-cafe-archway'); await shot(B, '01-cafe-archway')
// walk through: tap the doorway; no gate, quick fade, keep moving into the lounge
await gateSeen(A)
const t0 = Date.now()
{ const [x, y] = await A.evaluate((a, b) => window.__world.tileCss(a, b), dc, 3); await tapAt(A, x, y) }
ok(await until(async () => (await txt(A, '[data-t=w-room-name]')) === 'Games Lounge' && (await st(A))?.inst?.startsWith('games-'), 12000), 'Avery walked through the archway into the Games Lounge')
console.log('  door → lounge in', Date.now() - t0, 'ms (walk included)')
ok(!(await A.evaluate(() => window.__gate)), 'no entry screen / gate during the switch')
ok(await until(async () => { const m = await meEnt(A); return m && m.y > 4.2 }, 6000), 'kept walking into the lounge after the archway')
ok(await until(async () => (await st(A))?.art?.archway?.[0] === 80, 6000), 'lounge archway sprite drawn')
ok(!(await A.$('[data-t=w-fade]')), 'fade lifted')
await shot(A, '02-lounge-archway')
// and back the same way (desk keyboard path: Blair stays in the café)
{ M.useMap('games'); const ld = (() => { for (let x = 0; x < 40; x++) if (M.isDoor(x, 3)) return x })(); M.useMap(M.mapOf('cafe-1'))
  const [x, y] = await A.evaluate((a, b) => window.__world.tileCss(a, b), ld, 3); await tapAt(A, x, y) }
ok(await until(async () => (await txt(A, '[data-t=w-room-name]')) === 'Café' && (await st(A))?.inst?.startsWith('cafe-'), 12000), 'Avery walked back to the café')
ok(!(await A.evaluate(() => window.__gate)), 'no gate on the way back either')
await until(async () => (await count(B)) === 2, 8000)
// café chat, then "Play a game?" from the chat log (desk) and the tap target (phone)
await typeIn(B, '[data-t=w-input]', 'hello there'); await front(B); await B.keyboard.press('Enter')
await typeIn(A, '[data-t=w-input]', 'hi Blair, fancy a game'); await press(A, '[data-t=w-send]')
ok(await until(() => B.$('[data-t=w-ginv-log]'), 6000), 'desk café chat line offers "Play a game?"')
await tapPerson(A, 'Blair'); ok(await until(() => A.$('[data-t=w-ginv]'), 4000), 'tap target offers "Play a game?"')
ok((await txt(A, '[data-t=w-ginv]')) === 'Play a game?', 'label is "Play a game?"')
await press(A, '[data-t=w-ginv]')
ok(await until(() => A.$('[data-t=w-ginv-out]'), 4000), 'Avery sees the invite waiting')
ok(await until(() => B.$('[data-t=w-ginvite]'), 4000), 'Blair gets the Accept/Decline prompt')
ok(/\d+s/.test(await txt(B, '[data-t=w-ginvite-s]')) && parseInt(await txt(B, '[data-t=w-ginvite-s]')) > 20, 'with a ~30 s countdown (' + await txt(B, '[data-t=w-ginvite-s]') + ')')
ok((await B.evaluate(() => window.__world.sounds())).includes('chime'), 'invite chime hook fired')
// duplicate → note
await tapPerson(A, 'Blair'); await tap(A, '[data-t=w-ginv]'); ok(await until(async () => /already asked/.test(await txt(A, '[data-t=w-note]')), 3000), 'duplicate invite refused')
await shot(B, '03-invite'); await shot(A, '03-invite')
const logBefore = (await txt(B, '[data-t=w-log]'))
await gateSeen(A); await gateSeen(B)
await press(B, '[data-t=w-ginvite-yes]')
for (const p of [A, B]) ok(await until(async () => (await txt(p, '[data-t=w-room-name]')) === 'Games Lounge', 12000), p.tag + ' teleported to the Games Lounge')
for (const p of [A, B]) ok(!(await p.evaluate(() => window.__gate)), p.tag + ' no gate on teleport')
for (const p of [A, B]) ok((await p.evaluate(() => window.__world.sounds())).includes('swoosh'), p.tag + ' teleport swoosh hook fired')
M.useMap('games')
const ea = await until(async () => { const m = await meEnt(A); return m && (m.f & 1) && M.isSeat(Math.floor(m.x), Math.floor(m.y)) ? m : null }, 8000)
const eb = await until(async () => { const m = await meEnt(B); return m && (m.f & 1) && M.isSeat(Math.floor(m.x), Math.floor(m.y)) ? m : null }, 8000)
ok(ea && eb && Math.floor(ea.y) === Math.floor(eb.y) && Math.abs(ea.x - eb.x) > 1.5, 'seated opposite each other at one table')
ok((await txt(B, '[data-t=w-log]')).includes('hello there') || logBefore === '', 'café chat carried on (log not cleared)')
for (const p of [A, B]) ok(await until(() => p.$('[data-t=g-start-snap]'), 8000), p.tag + ' ready for Snap or blackjack')
await tap(A, '[data-t=g-start-snap]')
for (const p of [A, B]) ok(await until(() => p.$('[data-t=g-snap]'), 6000), p.tag + ' Snap started')
for (let i = 0; i < 4; i++) { if ((await attr(A, '[data-t=g-snap]', 'data-turn')) === 'me') await press(A, '[data-t=g-flip]'); else { await front(B); await B.keyboard.press('f') } await sleep(400) }
const face = await until(() => A.$('.g-face'), 4000)
ok(!!face, 'card faces drawn')
ok(await A.$eval('.g-face', e => /\.svg|svg\+xml/.test(e.src) && e.getBoundingClientRect().width === 60), "face is GD's SVG at the same 60 px size")
await shot(A, '04-snap-cards'); await shot(B, '04-snap-cards')
{ const el = await A.$('.g-face'); await el.screenshot({ path: OUT + '04-card-zoom-390.png' }) }
{ const el = await B.$('.g-face'); if (el) await el.screenshot({ path: OUT + '04-card-zoom-1440.png' }) }
await tap(A, '[data-t=g-stand]'); await sleep(800)
if (await until(() => B.$('[data-t=g-done]'), 4000)) await tap(B, '[data-t=g-done]')
const [sa] = TABLES[0].seats
// blackjack for the coins: back at a table together
const tbl = TABLES.findIndex(t => t.seats.some(s => s[0] === Math.floor(eb.x) && s[1] === Math.floor(eb.y))), seatA = TABLES[tbl].seats.find(s => s[0] !== Math.floor(eb.x))
ok(await walkTo(A, seatA[0], seatA[1], 25000), 'Avery sits back down')
if (await until(() => A.$('[data-t=g-done]'), 2500)) await tap(A, '[data-t=g-done]')
if (await until(() => A.$('[data-t=g-start-blackjack]'), 8000)) { await tap(A, '[data-t=g-start-blackjack]')
  ok(await until(() => A.$('[data-t=g-bj]'), 6000), 'Blackjack table')
  ok(await until(() => A.$('.g-chip b'), 4000), 'coins drawn with crisp numbers')
  await shot(A, '05-bj-coins'); await shot(B, '05-bj-coins')
  await tap(A, '[data-t=bj-ante-5]'); await press(A, '[data-t=bj-deal]'); await sleep(1200)
  ok((await A.$$('[data-t=bj-house] .g-card')).length === 2, 'House shows 2 cards')
  await shot(A, '06-bj-cards'); await shot(B, '06-bj-cards') }
else ok(false, 'blackjack offered')
void sa
await browser.close()
console.log(`\n${n - bad}/${n} checks passed`); process.exit(bad ? 1 : 0)
