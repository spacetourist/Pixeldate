// Board games: sit, pick chess, a few moves, resign, and the phone split (stage most of the screen, chat dock, Start call).
import puppeteer from 'puppeteer-core'
process.env.WORLD_PORT = '18779'; process.env.WORLD_URL = 'ws://127.0.0.1:18779'; process.env.WORLD_STALE_MS = '3000'
await import('../world/dev/server.ts')
const { sleep } = await import('../world/test/lib.mjs')
const APP = process.env.URL || 'http://127.0.0.1:4173/Pixeldate/app/'
const WQ = '?world=cafe&loopback&ws=ws://127.0.0.1:18779&invite=dev-invite-1&auto=1&room=games'
const OUT = '/opt/cursor/artifacts/'
;(await import('node:fs')).mkdirSync(OUT, { recursive: true })
let bad = 0, n = 0
const ok = (c, m) => { n++; if (c) console.log('✔', m); else { bad++; console.log('✘ FAIL', m) } }
const until = async (f, ms = 8000, step = 60) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f(); if (v) return v; await sleep(step) } return null }
await sleep(300)

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 90000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-features=CalculateNativeWinOcclusion', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const ctx = await browser.createBrowserContext()
async function player(tag, vp, name, extra = {}) {
  const p = await ctx.newPage(); await p.setViewport(vp); p.tag = tag; p.touch = !!vp.hasTouch
  p.on('pageerror', e => { bad++; console.log('  PAGEERR', tag, e.message) }); p.on('console', m => { if (m.type() === 'error' && !/404|WebSocket/.test(m.text())) console.log(`  [${tag}]`, m.text().slice(0, 200)) })
  const uid = 'bd-' + tag + '-' + Date.now().toString(36)
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
const shot = async (p, name) => { await sleep(250); await p.screenshot({ path: `${OUT}${name}.png` }); console.log('  📷', `${OUT}${name}.png`) }
const st = p => p.evaluate(() => window.__world?.state())
const meEnt = async p => { const s = await st(p); return s?.ents.find(e => e.id === s.me) }
const front = async p => { if (front.cur !== p) { await p.bringToFront(); front.cur = p; await sleep(120) } }
const tapAt = async (p, x, y) => { await front(p); return p.touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y) }
const press = async (p, sel) => { await front(p); return p.touch ? p.tap(sel) : p.click(sel) }
const txt = (p, sel) => p.$eval(sel, e => e.textContent).catch(() => '')
const attr = (p, sel, a) => p.$eval(sel, (e, a) => e.getAttribute(a), a).catch(() => null)
const inLounge = async p => (await txt(p, '[data-t=w-room-name]')) === 'Games Lounge'
const walkTo = async (p, tx, ty, ms = 22000) => {
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
    await walkTo(p, x, y, 24000)
    if (await seatedAt(p, x, y)) return true
    const [cx, cy] = await p.evaluate((a, b) => window.__world.tileCss(a, b), x, y).catch(() => [0, 0])
    if (cx) await tapAt(p, cx, cy)
  }
  return !!(await seatedAt(p, x, y))
}
const layoutOf = p => p.evaluate(() => {
  const box = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) } }
  const ol = document.querySelector('[data-t=w-priv] ol')
  const call = document.querySelector('[data-t=w-call], [data-t=w-call-yes], [data-t=w-call-out]')
  return {
    vh: innerHeight, vw: innerWidth,
    felt: box(document.querySelector('[data-t=g-bd]')),
    stage: box(document.querySelector('.w-stage')),
    side: box(document.querySelector('[data-t=w-side]')),
    call: box(call),
    olHidden: !ol || ol.getBoundingClientRect().height < 2,
    toggle: !!document.querySelector('[data-t=w-chat-toggle]'),
    layout: document.querySelector('[data-t=w-room]')?.dataset.layout ?? '',
    flip: document.querySelector('[data-t=bd-board]')?.getAttribute('data-flip') ?? '',
    phase: document.querySelector('[data-t=g-bd]')?.getAttribute('data-phase') ?? '',
  }
})
const move = async (p, from, to) => {
  await press(p, `[data-sq="${from}"]`)
  const dotted = await until(() => p.$(`[data-sq="${to}"] [data-t=bd-dot]`), 2000)
  if (!dotted) return false
  await press(p, `[data-sq="${to}"]`)
  return true
}

const M = await import('../world/shared/map.ts'); M.useMap('games')
const seats = M.seatsOf(M.TABLES.find(t => t.kind === 'board'))
const A = await player('a', PHONE, 'Ada'), B = await player('b', DESK, 'Bea', { iam: 'woman', seek: 'men' })
ok(await inLounge(A) && await inLounge(B), 'both open in the Games Lounge')
ok(await sitDown(A, seats[0][0], seats[0][1]), `Ada sits at the board (${seats[0]})`)
ok(await sitDown(B, seats[1][0], seats[1][1]), `Bea sits opposite (${seats[1]})`)
for (const p of [A, B]) ok(await until(() => p.$('[data-t=g-bd]'), 8000), p.tag + ' sees the board table')
for (const p of [A, B]) {
  await press(p, '[data-t=bd-game-chess]'); await press(p, '[data-t=bd-clock-off]')
  ok(await until(() => p.$('[data-t=bd-ready]:not([disabled])'), 3000), p.tag + ' can confirm the pick')
  await press(p, '[data-t=bd-ready]')
}
ok(await until(async () => (await attr(A, '[data-t=g-bd]', 'data-phase')) === 'play' && (await attr(B, '[data-t=g-bd]', 'data-phase')) === 'play', 6000), 'both picked chess, no clock')
const white = (await attr(A, '[data-t=bd-board]', 'data-flip')) === '0' ? A : B
const black = white === A ? B : A
ok(await until(async () => (await attr(white, '[data-t=g-bd]', 'data-turn')) === 'me', 3000), 'white to move')
ok(await move(white, 'e2', 'e4'), 'white plays e2-e4 (dot, then the square)')
ok(await until(async () => (await attr(black, '[data-t=g-bd]', 'data-turn')) === 'me', 4000), 'black to move')
ok(await move(black, 'e7', 'e5'), 'black plays e7-e5')
ok(await until(async () => (await attr(white, '[data-t=g-bd]', 'data-turn')) === 'me', 4000), 'white to move again')
const last = await white.$eval('[data-sq="e5"]', e => e.className).catch(() => '')
ok(last.includes('last'), 'the last move is highlighted')

const phone = await layoutOf(A), desk = await layoutOf(B)
console.log('  phone', JSON.stringify(phone)); console.log('  desk', JSON.stringify(desk))
ok(phone.layout === 'phone' && phone.felt && phone.felt.h / phone.vh >= 0.75, `phone stage is most of the screen (${phone.felt?.h} / ${phone.vh})`)
ok(phone.side && phone.side.h >= 110 && phone.side.h <= 150, `phone chat dock is about 124px (${phone.side?.h}px)`)
ok(phone.call && phone.call.b <= phone.vh + 1 && phone.call.y >= (phone.side?.y ?? 0) - 4 && phone.call.h >= 24, 'Start call stays in the phone dock')
ok(desk.layout === 'desk' && desk.side && desk.stage && desk.side.x >= desk.stage.r - 4, 'desktop chat sits beside the board')
ok(!desk.olHidden && !desk.toggle, 'desktop chat stays open, with no tuck control')
ok(desk.call && desk.call.x >= desk.stage.r - 4, 'Start call stays in the desktop side column')
await shot(A, 'board-phone'); await shot(B, 'board-desk')

await press(white, '[data-t=bd-resign]')
ok(await until(async () => (await attr(black, '[data-t=g-bd]', 'data-phase')) === 'over', 4000), 'resign ends the game')
const status = await txt(black, '[data-t=g-status]')
ok(/win/i.test(status), 'the other player is told they win (' + status + ')')

await browser.close()
console.log(`\n${n - bad}/${n} checks passed`)
process.exit(bad ? 1 : 0)
