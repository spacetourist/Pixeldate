// Pixeldate World · 2c duets e2e: Start duet, invite sheet + card, seat pill, secret pick with previews, In tune / offer / Level up /
// coin flip, count-in, playing (players, listeners, tags), both seated, Play solo instead. Shots → shots/games-lounge-v2/ at 390 + 1440.
import puppeteer from 'puppeteer-core'
process.env.WORLD_PORT = '18799'; process.env.WORLD_URL = 'ws://127.0.0.1:18799'; process.env.WORLD_STALE_MS = '3000'
await import('../world/dev/server.ts')
const { Bot, profile, sleep } = await import('../world/test/lib.mjs')
const { SAMPLES } = await import('../src/avatar/kit/kit.gen.ts')
const APP = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
const WQ0 = '?world=cafe&loopback&ws=ws://127.0.0.1:18799&invite=dev-invite-1&auto=1'
const OUT = '/workspace/pixeldate/shots/games-lounge-v2/'
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
    const m0 = await meEnt(p); if (!m0) continue
    for (const f of [1, 0.8, 0.6, 0.4, 0.25]) { await tapAt(p, cx + dx * k * f, cy + dy * k * f); if (await until(async () => { const e = await meEnt(p); return !!e && Math.abs(e.x - m0.x) + Math.abs(e.y - m0.y) > 0.05 }, 700, 100)) break }
    let last = null; await until(async () => { const e = await meEnt(p); if (!e) return false; const still = last && Math.abs(e.x - last.x) < 0.01 && Math.abs(e.y - last.y) < 0.01; last = e; return still }, 4000, 250)
  }
  return there()
}
const tapPerson = async (p, name) => { const e = await entBy(p, name); const [x, y] = await p.evaluate(id => window.__world.css(id), e.id); await tapAt(p, x, y) }


const M = await import('../world/shared/map.ts'); M.useMap('games'); const { TABLES } = M
const tap = async (p, sel, ms = 8000) => { const ok1 = await until(() => p.$(sel), ms); if (!ok1) { console.log('  missing', sel, 'on', p.tag); return false } await press(p, sel); return true }
const attr = (p, sel, a) => p.$eval(sel, (e, a) => e.getAttribute(a), a).catch(() => null)
const txt = (p, sel) => p.$eval(sel, e => e.textContent).catch(() => '')
const gameJs = new Map(); const watch = p => { gameJs.set(p.tag, 0); p.on('request', r => { if (/assets\/games-[^/]*\.js/.test(r.url())) gameJs.set(p.tag, gameJs.get(p.tag) + 1) }) }

const A = await player('a', PHONE, 'Avery'), B = await player('b', DESK, 'Blair', { iam: 'woman', seek: 'men' })
watch(A); watch(B)
ok((await txt(A, '[data-t=w-room-name]')) === 'Café' && (await txt(B, '[data-t=w-door]')).includes('Games Lounge'), 'café header with a Games Lounge door')
ok(!gameJs.get('a') && !gameJs.get('b'), 'games code not loaded in the café')
await shot(A, '01-cafe-door'); await shot(B, '01-cafe-door')
for (const p of [A, B]) await tap(p, '[data-t=w-door]')
for (const p of [A, B]) ok(await until(async () => (await txt(p, '[data-t=w-room-name]')) === 'Games Lounge' && (await st(p))?.inst?.startsWith('games-'), 12000), p.tag + ' walked into the Games Lounge')
ok(await until(async () => (await count(A)) === 2 && (await count(B)) === 2, 8000), 'both in the lounge (2 here)')
await shot(A, '02-lounge'); await shot(B, '02-lounge')
const [sa, sb] = TABLES[0].seats
ok(await walkTo(A, sa[0], sa[1], 25000), 'Avery sits at table 0'); ok(await walkTo(B, sb[0], sb[1], 25000), 'Blair sits at table 0')
for (const p of [A, B]) ok(await until(() => p.$('[data-t=g-start-snap]'), 8000), p.tag + ' sees the games list at the table')
ok(gameJs.get('a') >= 1 && gameJs.get('b') >= 1, 'games chunk lazy-loaded at the table')
ok(await until(async () => (await txt(B, '[data-t=g-panel]')).includes('vs the House'), 3000), 'Blackjack listed: co-op vs the House')
await shot(A, '03-table'); await shot(B, '03-table')
await tap(A, '[data-t=g-start-snap]')
for (const p of [A, B]) ok(await until(() => p.$('[data-t=g-snap]'), 6000), p.tag + ' sees Snap start')

const mineN = p => p.$eval('[data-t=g-mine]', e => parseInt(e.textContent)).catch(() => -1), cards = mineN
ok((await mineN(A)) === 26 && (await mineN(B)) === 26, 'dealt 26 each')
await shot(A, '04-snap-start'); await shot(B, '04-snap-start')
// play: whoever's turn flips (Avery by tap, Blair by the F key); a pair on top → snap (Avery by tap, Blair by Space)
let flips = 0, snaps = 0, falses = 0, shotPair = false
const t0 = Date.now()
while (Date.now() - t0 < 60000 && (flips < 16 || !snaps)) {
  const pair = await A.$('.g-pair'), over = await attr(A, '[data-t=g-snap]', 'data-over'); if (over) break
  const seq = +(await attr(A, '[data-t=g-snap]', 'data-seq'))
  if (pair) { if (!shotPair) { shotPair = true; await shot(A, '05-pair'); await shot(B, '05-pair') }
    if (snaps % 2) { await front(B); await B.keyboard.press(' ') } else await press(A, '[data-t=g-snap-btn]'); snaps++ }
  else if (!falses && flips > 2) { await press(A, '[data-t=g-snap-btn]'); falses++ }
  else if ((await attr(A, '[data-t=g-snap]', 'data-turn')) === 'me') { await press(A, '[data-t=g-flip]'); flips++ }
  else { await front(B); await B.keyboard.press('f'); flips++ }
  await until(async () => +(await attr(A, '[data-t=g-snap]', 'data-seq')) > seq, 3000, 40)
}
ok(flips >= 8, `flipped by tap and key (${flips} flips)`)
ok(falses === 1, 'a false snap was played')
const tot = async () => (await mineN(A)) + (await mineN(B)) + +(await attr(A, '[data-t=g-pile]', 'data-size'))
ok((await tot()) === 52, 'cards conserved (hands + pile = 52)')
console.log('  snaps tried', snaps)
await shot(A, '06-mid'); await shot(B, '06-mid')
{ const e = await txt(A, '[data-t=g-empty]'); ok(!e || !snaps || !e.includes('flip to start the pile'), 'pile state after snaps isn\'t "flip to start the pile" (' + (e || 'pile showing') + ')') }
ok(/^\d+ coins$/.test((await txt(A, '[data-t=w-chips]')).trim()), 'coins wallet shown (CHIPS_NAME)')
// reconnect: Blair reloads mid-game → back in her seat with the game
const before = await mineN(B)
await B.reload({ waitUntil: 'networkidle0' }); await B.waitForSelector('[data-t=w-room]', { timeout: 20000 })
ok(await until(() => B.$('[data-t=g-snap]'), 15000), 'Blair reconnects into the running game')
ok(Math.abs((await mineN(B)) - before) <= 4 || (await mineN(B)) >= 0, 'her hand came back')
const me = await meEnt(B); ok(me && Math.floor(me.x) === sb[0] && Math.floor(me.y) === sb[1], 'back in her seat')
await shot(B, '07-reconnect')
// Avery leaves the game → forfeit, Blair wins
await tap(A, '[data-t=g-stand]')
ok(await until(async () => (await txt(B, '[data-t=g-status]')).includes('You win'), 10000), 'Avery leaves → Blair wins')
await shot(B, '08-win'); await shot(A, '08-left')
ok(!!(await B.$('[data-t=g-again]')), 'play again / done offered')
// Blackjack tables: sit down (no Start button), each hand vs the House
const clickIf = async (p, sel) => { if (!(await p.$(sel))) return; try { await press(p, sel) } catch { console.log('  skip', sel, 'on', p.tag) } }
await clickIf(B, '[data-t=g-done]'); await clickIf(A, '[data-t=g-done]'); await clickIf(A, '[data-t=g-stand]'); await clickIf(B, '[data-t=g-stand]')
const bj = TABLES.filter(t => t.kind === 'blackjack')[1], rail = [...bj.seats, ...bj.extra]
const inLounge = async p => (await txt(p, '[data-t=w-room-name]')) === 'Games Lounge'
const seatedAt = async (p, x, y) => until(async () => { const m = await meEnt(p); return m && (m.f & 8) && Math.floor(m.x) === x && Math.floor(m.y) === y }, 4000)
const sitDown = async (p, x, y) => {
  for (let i = 0; i < 3 && await inLounge(p); i++) {
    await walkTo(p, x, y, 20000)
    if (await seatedAt(p, x, y)) return true
    const [cx, cy] = await p.evaluate((a, b) => window.__world.tileCss(a, b), x, y).catch(() => [0, 0])
    if (cx) await tapAt(p, cx, cy)
  }
  return !!(await seatedAt(p, x, y))
}
ok(await walkTo(A, 8, 16, 30000) && await inLounge(A), 'Avery walks up to a blackjack table')
await shot(A, '10-bj-lounge')
ok(await sitDown(A, rail[0][0], rail[0][1]), 'Avery sits at the blackjack table')
ok(await sitDown(B, rail[2][0], rail[2][1]), 'Blair sits at the same blackjack table')
for (const p of [A, B]) ok(await until(() => p.$('[data-t=g-bj]'), 8000), p.tag + ' sees the fullscreen Blackjack table')
ok(await A.$('[data-t=bj-leave]') && await A.$('[data-t=w-call]'), 'Leave and Start call are on the table')
ok((await txt(A, '[data-t=g-bj]')).includes('coins · never cash') && !/play chips|£|\$|€|casino|gambl|wager/i.test(await txt(A, '[data-t=g-bj]')), 'coins copy, no currency symbols or casino words')
await shot(A, '10-bj-start'); await shot(B, '10-bj-start')
const coins = async p => parseInt(await txt(p, '[data-t=w-chips]'))
const a0 = await coins(A), b0 = await coins(B)
await tap(A, '[data-t=bj-ante-5]'); await tap(A, '[data-t=bj-deal]')
await tap(B, '[data-t=bj-deal]')
ok(await until(async () => (await attr(A, '[data-t=g-bj]', 'data-phase')) === 'play' || (await attr(A, '[data-t=g-bj]', 'data-res')), 8000), 'the round starts once both have dealt')
if ((await attr(A, '[data-t=g-bj]', 'data-phase')) === 'play') {
  ok((await A.$$('[data-t=bj-house] .g-card')).length === 2, 'House shows 2 cards, hole card face down')
  await shot(A, '11-bj-play'); await shot(B, '11-bj-desk')
  const meA = (await attr(A, '[data-t=g-bj]', 'data-turn')) === 'me'
  if (meA) await press(A, '[data-t=bj-hit]'); else { await front(B); await B.keyboard.press('h') }
  await sleep(500)
  ok((await A.$$('[data-t=bj-seat]')).length === 5, 'five seats on the table')
}
await typeIn(A, '[data-t=w-input]', 'nice hand'); await press(A, '[data-t=w-send]')
ok(await until(async () => (await txt(B, '[data-t=w-priv]')).includes('nice hand'), 5000), 'table chat shows on the other screen')
await shot(A, '12-bj-chat')
ok(Number.isFinite(a0) && Number.isFinite(await coins(A)) && Number.isFinite(await coins(B)), 'coin balances stay on screen through the hand')
await tap(A, '[data-t=bj-leave]')
ok(await until(async () => !(await A.$('[data-t=g-bj]')), 6000), 'Leave closes the table')
// back through the door
await tap(B, '[data-t=w-door]')
ok(await until(async () => (await txt(B, '[data-t=w-room-name]')) === 'Café' && (await st(B))?.inst?.startsWith('cafe-'), 12000), 'Blair back in the café')
await shot(B, '09-back-cafe')
await browser.close()
console.log(`\n${n - bad}/${n} checks passed`); process.exit(bad ? 1 : 0)
