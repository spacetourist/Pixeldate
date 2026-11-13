// Four Up, two browsers: sit, drop a piece, see it fall, chat. Shots at 390 and 1440.
import puppeteer from 'puppeteer-core'
process.env.WORLD_PORT = '18788'; process.env.WORLD_URL = 'ws://127.0.0.1:18788'; process.env.WORLD_STALE_MS = '3000'
await import('../world/dev/server.ts')
const { sleep } = await import('../world/test/lib.mjs')
const APP = process.env.URL || 'http://127.0.0.1:4173/Pixeldate/app/'
const WQ = '?world=cafe&loopback&ws=ws://127.0.0.1:18788&invite=dev-invite-1&auto=1&room=games'
const OUT = '/workspace/pixeldate/shots/games-lounge-v3/four-up/'
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
  const uid = 'fu-' + tag + '-' + Date.now().toString(36)
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
    const box = await p.$eval('[data-t=w-canvas]', c => c.getBoundingClientRect().toJSON()), [x, y] = await p.evaluate((a, b) => window.__world.tileCss(a, b), tx, ty)
    const m = 28, on = x > box.left + m && x < box.right - m && y > box.top + m && y < box.bottom - m
    if (on) { await tapAt(p, x, y); if (await until(there, Math.min(9000, ms - (Date.now() - t0)))) return true; continue }
    const cx = (box.left + box.right) / 2, cy = (box.top + box.bottom) / 2, dx = x - cx, dy = y - cy, k = Math.min((box.width / 2 - m) / Math.abs(dx || 1e-9), (box.height / 2 - m) / Math.abs(dy || 1e-9))
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
const hop = async (p, pts) => { for (const [x, y] of pts) if (!(await walkTo(p, x, y, 22000)) || !(await inLounge(p))) return false; return true }
const M = await import('../world/shared/map.ts'); M.useMap('games')
const seats = M.seatsOf(M.TABLES.find(t => t.kind === 'fourup'))
const js = new Map()
const A = await player('a', PHONE, 'Ada'), B = await player('b', DESK, 'Bea', { iam: 'woman', seek: 'men' })
for (const p of [A, B]) { js.set(p.tag, 0); p.on('request', r => { if (/fourup-table-[^/]*\.js/.test(r.url())) js.set(p.tag, js.get(p.tag) + 1) }) }
ok(await inLounge(A) && await inLounge(B), 'both open in the Games Lounge')
ok(!js.get('a') && !js.get('b'), 'Four Up stays unloaded until someone sits')
await hop(A, [[15, 10], [17, 14]]); await hop(B, [[24, 10], [24, 14]])
ok(await inLounge(A) && await inLounge(B), 'both are still in the lounge by the grid')
await shot(A, '01-lounge'); await shot(B, '01-lounge')
ok(await sitDown(A, seats[0][0], seats[0][1]), 'Ada sits at Four Up')
ok(await sitDown(B, seats[1][0], seats[1][1]), 'Bea sits opposite')
for (const p of [A, B]) ok(await until(() => p.$('[data-t=g-fu]'), 8000), p.tag + ' sees the fullscreen grid')
ok(js.get('a') >= 1 && js.get('b') >= 1, 'the grid chunk loads on sit')
ok(!!(await A.$('[data-t=fu-leave]')) && !!(await A.$('[data-t=w-call]')), 'Leave and Start call stay on the table')
await press(A, '[data-t=fu-play]'); await press(B, '[data-t=fu-play]')
ok(await until(async () => (await attr(A, '[data-t=g-fu]', 'data-phase')) === 'play', 4000), 'the match starts')
ok((await A.$$('[data-t=fu-col]')).length === 7, 'seven columns')
ok((await A.$eval('[data-t=g-fu]', e => e.getBoundingClientRect().width)) <= 390, 'the grid fits the 390 screen')
const cur = (await attr(A, '[data-t=g-fu]', 'data-turn')) === 'me' ? A : B
await press(cur, '[data-t=fu-col][data-c="3"]')
ok(await until(async () => (await A.$$('[data-t=fu-cell][data-n]')).length >= 1, 4000), 'a piece has dropped')
await shot(A, '02-drop'); await shot(B, '02-drop')
await front(A); await A.click('[data-t=w-input]'); await A.type('[data-t=w-input]', 'your drop')
await press(A, '[data-t=w-send]')
ok(await until(async () => (await txt(B, '[data-t=w-priv]')).includes('your drop'), 5000), 'table chat reaches the other seat')
await shot(A, '03-chat'); await shot(B, '03-chat')
await browser.close()
console.log(`\n${n - bad}/${n} checks passed`); process.exit(bad ? 1 : 0)
