// Sweet Twenty, two browsers: sit at the heart table, lock an optional stake, see main cards and side tiles, end a turn, chat.
// Shots → pixeldate/shots/games-lounge-v3/sweet-twenty/ at 390 and 1440.
import puppeteer from 'puppeteer-core'
process.env.WORLD_PORT = '18796'; process.env.WORLD_URL = 'ws://127.0.0.1:18796'; process.env.WORLD_STALE_MS = '3000'
await import('../world/dev/server.ts')
const { sleep } = await import('../world/test/lib.mjs')
const APP = process.env.URL || 'http://127.0.0.1:4173/Pixeldate/app/'
const WQ = '?world=cafe&loopback&ws=ws://127.0.0.1:18796&invite=dev-invite-1&auto=1&room=games'
const OUT = '/workspace/pixeldate/shots/games-lounge-v3/sweet-twenty/'
;(await import('node:fs')).mkdirSync(OUT, { recursive: true })
let bad = 0, n = 0
const ok = (c, m) => { n++; if (c) console.log('✔', m); else { bad++; console.log('✘ FAIL', m) } }
const until = async (f, ms = 8000, step = 60) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f(); if (v) return v; await sleep(step) } return null }
await sleep(300)

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 90000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-features=CalculateNativeWinOcclusion', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const ctx = await browser.createBrowserContext()
async function player(tag, vp, name, extra = {}) {
  const p = await ctx.newPage(); await p.setViewport(vp); p.tag = tag; p.sz = vp.width; p.touch = !!vp.hasTouch
  p.on('pageerror', e => { bad++; console.log('  PAGEERR', tag, e.message) }); p.on('console', m => { if (m.type() === 'error' && !/404|WebSocket/.test(m.text())) console.log(`  [${tag}]`, m.text().slice(0, 180)) })
  const uid = 'sw-' + tag + '-' + Date.now().toString(36)
  const prof = { name, age: 32, by: 1994, bm: 3, min: 26, max: 38, iam: 'man', seek: 'women', adult: true, uid, ...extra }
  await p.goto(APP + '?loopback&blank', { waitUntil: 'domcontentloaded' })
  await p.evaluate(async (pr, uid) => {
    sessionStorage.setItem('pd-uid', uid); sessionStorage.setItem('pd.profile', pr)
    const c = new OffscreenCanvas(240, 320), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 240, 320); gr.addColorStop(0, '#FF6F91'); gr.addColorStop(1, '#3D2C8D'); g.fillStyle = gr; g.fillRect(0, 0, 240, 320)
    g.fillStyle = '#FFE0C2'; g.beginPath(); g.arc(120, 130, 60, 0, 7); g.fill(); g.fillStyle = '#2A2150'; g.fillRect(40, 220, 160, 100)
    const b = await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 }), url = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b) })
    await new Promise((res, rej) => { const r = indexedDB.open('pixeldate-' + uid, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onerror = rej
      r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(url, 'photo'); t.oncomplete = () => { r.result.close(); res() } } })
  }, JSON.stringify(prof), uid)
  await p.goto(APP + WQ, { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-t=w-room]', { timeout: 20000 })
  return p
}
const shot = async (p, name) => { await sleep(350); await p.screenshot({ path: `${OUT}${name}-${p.sz}.png` }); console.log('  📷', `${name}-${p.sz}.png`) }
const st = p => p.evaluate(() => window.__world?.state())
const meEnt = async p => { const s = await st(p); return s?.ents.find(e => e.id === s.me) }
const front = async p => { if (front.cur !== p) { await p.bringToFront(); front.cur = p; await sleep(120) } }
const tapAt = async (p, x, y) => { await front(p); return p.touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y) }
const press = async (p, sel) => { await front(p); return p.touch ? p.tap(sel) : p.click(sel) }
const txt = (p, sel) => p.$eval(sel, e => e.textContent).catch(() => '')
const attr = (p, sel, a) => p.$eval(sel, (e, a) => e.getAttribute(a), a).catch(() => null)
const inLounge = async p => (await txt(p, '[data-t=w-room-name]')) === 'Games Lounge'
const walkTo = async (p, tx, ty, ms = 20000) => {
  const there = async () => { const m = await meEnt(p); return m && Math.abs(m.x - tx - 0.5) < 0.6 && Math.abs(m.y - ty - 0.5) < 0.6 }
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (!(await inLounge(p))) return false
    if (await there()) return true
    const c = await p.$eval('[data-t=w-canvas]', c => c.getBoundingClientRect().toJSON()), [x, y] = await p.evaluate((a, b) => window.__world.tileCss(a, b), tx, ty)
    const m = 28, on = x > c.left + m && x < c.right - m && y > c.top + m && y < c.bottom - m
    if (on) { await tapAt(p, x, y); if (await until(there, Math.min(9000, ms - (Date.now() - t0)))) return true; continue }
    const cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2, dx = x - cx, dy = y - cy, k = Math.min((c.width / 2 - m) / Math.abs(dx || 1e-9), (c.height / 2 - m) / Math.abs(dy || 1e-9))
    const m0 = await meEnt(p); if (!m0) continue
    for (const f of [1, 0.8, 0.6, 0.4, 0.25]) { await tapAt(p, cx + dx * k * f, cy + dy * k * f); if (await until(async () => { const e = await meEnt(p); return !!e && Math.abs(e.x - m0.x) + Math.abs(e.y - m0.y) > 0.05 }, 700, 100)) break }
    let last = null; await until(async () => { const e = await meEnt(p); if (!e) return false; const still = last && Math.abs(e.x - last.x) < 0.01 && Math.abs(e.y - last.y) < 0.01; last = e; return still }, 4000, 250)
  }
  return !!(await there()) && await inLounge(p)
}
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

const M = await import('../world/shared/map.ts'); M.useMap('games')
const table = M.TABLES.find(t => t.kind === 'sweet'), seats = M.seatsOf(table)
const sweetJs = new Map()
const A = await player('a', PHONE, 'Ada'), B = await player('b', DESK, 'Bea', { iam: 'woman', seek: 'men' })
for (const p of [A, B]) { sweetJs.set(p.tag, 0); p.on('request', r => { if (/sweet-table-[^/]*\.js/.test(r.url())) sweetJs.set(p.tag, sweetJs.get(p.tag) + 1) }) }
ok(await inLounge(A) && await inLounge(B), 'both open in the Games Lounge')
ok(!sweetJs.get('a') && !sweetJs.get('b'), 'Sweet Twenty stays unloaded until someone sits')
// Stay off b/y seats until the sit. (26, 19) is a blackjack rail and opens that table.
const hop = async (p, pts) => { for (const [x, y] of pts) if (!(await walkTo(p, x, y, 20000)) || !(await inLounge(p))) return false; return true }
ok(await hop(A, [[8, 10], [8, 18], [9, 19]]) && await inLounge(A), 'Ada walks south to the heart table')
ok(await hop(B, [[20, 10], [20, 18], [19, 19]]) && await inLounge(B), 'Bea walks south to the heart table')
await shot(A, '01-lounge'); await shot(B, '01-lounge')
ok(await hop(A, [[8, 22], [9, 20]]), 'Ada stands beside her seat')
ok(await hop(B, [[22, 22], [19, 20]]), 'Bea stands beside her seat')
ok(await sitDown(A, seats[0][0], seats[0][1]), 'Ada sits at Sweet Twenty')
ok(await sitDown(B, seats[1][0], seats[1][1]), 'Bea sits opposite')
for (const p of [A, B]) ok(await until(() => p.$('[data-t=g-sw]'), 8000), p.tag + ' sees the fullscreen table')
ok(sweetJs.get('a') >= 1 && sweetJs.get('b') >= 1, 'the table chunk loads on sit')
ok(!!(await A.$('[data-t=sw-leave]')) && !!(await A.$('[data-t=w-call]')), 'Leave and Start call stay on the table')
ok((await txt(A, '[data-t=g-sw]')).includes('Sweet Twenty') && (await txt(A, '[data-t=g-sw]')).includes('coins · never cash'), 'title and coins copy')
const coins = async p => parseInt(await txt(p, '[data-t=w-chips]'))
const a0 = await coins(A)
ok(await until(() => A.$('[data-t=sw-play]'), 4000) && await until(() => B.$('[data-t=sw-play]'), 4000), 'both can lock a stake')
await press(A, '[data-t=sw-ante-5]'); await press(A, '[data-t=sw-play]')
await press(B, '[data-t=sw-play]')
ok(await until(async () => (await attr(A, '[data-t=g-sw]', 'data-phase')) === 'play', 8000), 'the set starts once both have locked')
const sides = p => p.$$eval('[data-t=sw-side]', els => els.length).catch(() => 0)
ok(await until(async () => (await sides(A)) === 4, 4000), 'Ada has four side tiles')
ok(await until(async () => (await sides(B)) === 4, 4000), 'Bea has four side tiles')
ok((await A.$$('[data-t=g-sw] .g-face')).length + (await B.$$('[data-t=g-sw] .g-face')).length >= 1, 'the server has drawn a main card')
const turnA = (await attr(A, '[data-t=g-sw]', 'data-turn')) === 'me'
const cur = turnA ? A : B
if (await cur.$('[data-t=sw-side]:not([disabled])')) await press(cur, '[data-t=sw-side]')
await press(cur, '[data-t=sw-end]')
ok(await until(async () => (await attr(A, '[data-t=g-sw]', 'data-seq')) !== '1' || (await A.$$('[data-t=g-sw] .g-face')).length >= 1, 4000), 'ending the turn moved the set')
await shot(A, '02-midround'); await shot(B, '02-midround')
await front(A); await A.click('[data-t=w-input]'); await A.type('[data-t=w-input]', 'sweet table')
await press(A, '[data-t=w-send]')
ok(await until(async () => (await txt(B, '[data-t=w-priv]')).includes('sweet table'), 5000), 'table chat reaches the other seat')
await shot(A, '03-chat'); await shot(B, '03-chat')
ok(Number.isFinite(a0) && (await coins(A)) === a0 - 5, 'Ada’s 5 coins are locked on the match')
ok((await A.$eval('[data-t=g-sw]', e => e.getBoundingClientRect().width)) <= 390, 'the table fits the 390 screen')
await browser.close()
console.log(`\n${n - bad}/${n} checks passed`); process.exit(bad ? 1 : 0)
