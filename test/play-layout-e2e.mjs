// Mobile play layout: on a phone the felt takes most of the screen, chat history is tucked, Start call stays reachable.
// Desktop keeps chat beside the table. Blackjack (phone + desk) and Sweet Twenty (phone).
import puppeteer from 'puppeteer-core'
process.env.WORLD_PORT = '18783'; process.env.WORLD_URL = 'ws://127.0.0.1:18783'; process.env.WORLD_STALE_MS = '3000'
await import('../world/dev/server.ts')
const { sleep } = await import('../world/test/lib.mjs')
const APP = process.env.URL || 'http://127.0.0.1:4173/Pixeldate/app/'
const WQ = '?world=cafe&loopback&ws=ws://127.0.0.1:18783&invite=dev-invite-1&auto=1&room=games'
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
  const p = await ctx.newPage(); await p.setViewport(vp); p.tag = tag; p.sz = vp.width; p.touch = !!vp.hasTouch
  p.on('pageerror', e => { bad++; console.log('  PAGEERR', tag, e.message) }); p.on('console', m => { if (m.type() === 'error' && !/404|WebSocket/.test(m.text())) console.log(`  [${tag}]`, m.text().slice(0, 180)) })
  const uid = 'pl-' + tag + '-' + Date.now().toString(36)
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
const shot = async (p, name) => { await sleep(300); await p.screenshot({ path: `${OUT}${name}.png` }); console.log('  📷', `${name}.png`) }
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
    await walkTo(p, x, y, 22000)
    if (await seatedAt(p, x, y)) return true
    const [cx, cy] = await p.evaluate((a, b) => window.__world.tileCss(a, b), x, y).catch(() => [0, 0])
    if (cx) await tapAt(p, cx, cy)
  }
  return !!(await seatedAt(p, x, y))
}
const hop = async (p, pts) => { for (const [x, y] of pts) if (!(await walkTo(p, x, y, 22000)) || !(await inLounge(p))) return false; return true }
const layoutOf = (p, felt) => p.evaluate(sel => {
  const box = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom } }
  const ol = document.querySelector('[data-t=w-priv] ol')
  const call = document.querySelector('[data-t=w-call], [data-t=w-call-yes], [data-t=w-call-out]')
  return {
    vh: innerHeight, vw: innerWidth,
    felt: box(document.querySelector(sel)),
    stage: box(document.querySelector('.w-stage')),
    side: box(document.querySelector('[data-t=w-side]')),
    call: box(call),
    hit: box(document.querySelector('[data-t=bj-hit], [data-t=sw-end], [data-t=sw-play]')),
    olHidden: !ol || ol.getBoundingClientRect().height < 2,
    ol: box(ol && ol.getBoundingClientRect().height >= 2 ? ol : null),
    toggle: !!document.querySelector('[data-t=w-chat-toggle]'),
    open: document.querySelector('[data-t=w-priv]')?.dataset.open ?? '',
    layout: document.querySelector('[data-t=w-room]')?.dataset.layout ?? '',
  }
}, felt)

const M = await import('../world/shared/map.ts'); M.useMap('games')
const bj = M.TABLES.find(t => t.kind === 'blackjack')
const bjSeats = M.seatsOf(bj)
const sweet = M.TABLES.find(t => t.kind === 'sweet')
const swSeats = M.seatsOf(sweet)
const A = await player('a', PHONE, 'Ada'), B = await player('b', DESK, 'Bea', { iam: 'woman', seek: 'men' })
ok(await inLounge(A) && await inLounge(B), 'both open in the Games Lounge')

ok(await sitDown(A, bjSeats[0][0], bjSeats[0][1]), 'Ada sits at blackjack')
ok(await sitDown(B, bjSeats[2][0], bjSeats[2][1]), 'Bea sits at the same blackjack table')
for (const p of [A, B]) ok(await until(() => p.$( '[data-t=g-bj]'), 8000), p.tag + ' sees the blackjack table')
await press(A, '[data-t=bj-deal]'); await press(B, '[data-t=bj-deal]')
ok(await until(async () => (await attr(A, '[data-t=g-bj]', 'data-phase')) === 'play' || (await attr(A, '[data-t=g-bj]', 'data-res')), 8000), 'the hand is in play')

const phone = await layoutOf(A, '[data-t=g-bj]')
console.log('  phone', JSON.stringify(phone))
ok(phone.layout === 'phone', 'phone layout class')
ok(phone.felt && phone.felt.h / phone.vh >= 0.75, `blackjack stage is most of the phone (${Math.round(phone.felt.h)} / ${phone.vh})`)
ok(phone.side && phone.side.h >= 110 && phone.side.h <= 150, `chat dock is about 124px (${Math.round(phone.side?.h ?? 0)}px)`)
ok(!phone.olHidden, 'the dock keeps the last lines')
ok(phone.call && phone.call.b <= phone.vh + 1 && phone.call.y >= phone.side.y - 4 && phone.call.h >= 24, 'Start call stays in the dock')
ok(phone.hit && phone.hit.b <= phone.felt.b + 1, 'play controls sit inside the stage')
await shot(A, 'play-bj-phone')

await press(A, '[data-t=w-chat-toggle]')
const opened = await until(async () => { const L = await layoutOf(A, '[data-t=g-bj]'); return L.open === '1' && !L.olHidden ? L : null }, 3000)
ok(!!opened && opened.ol.y < opened.felt.b && opened.ol.b > opened.stage.y, 'history opens as a drawer over the table')
ok(opened && opened.call && opened.call.b <= opened.vh + 1, 'Start call stays reachable while history is open')
await press(A, '[data-t=w-chat-toggle]')
ok(await until(async () => (await attr(A, '[data-t=w-priv]', 'data-open')) === '0', 2000), 'history hides again')

const desk = await layoutOf(B, '[data-t=g-bj]')
console.log('  desk', JSON.stringify(desk))
ok(desk.layout === 'desk', 'desktop layout class')
ok(desk.side && desk.stage && desk.side.x >= desk.stage.r - 4, 'chat column sits beside the table')
ok(!desk.olHidden && desk.ol && desk.ol.h > 40, 'desktop chat history stays open')
ok(!desk.toggle, 'desktop has no tuck control')
ok(desk.call && desk.call.x >= desk.stage.r - 4, 'Start call stays in the side column')
await shot(B, 'play-bj-desk')

await press(A, '[data-t=bj-leave]'); await press(B, '[data-t=bj-leave]')
ok(await until(async () => !(await A.$('[data-t=g-bj]')) && !(await B.$('[data-t=g-bj]')), 6000), 'both leave the blackjack table')
ok(await sitDown(A, swSeats[0][0], swSeats[0][1]), 'Ada sits at Sweet Twenty')
ok(await sitDown(B, swSeats[1][0], swSeats[1][1]), 'Bea sits opposite')
for (const p of [A, B]) ok(await until(() => p.$('[data-t=g-sw]'), 8000), p.tag + ' sees Sweet Twenty')
await press(A, '[data-t=sw-play]'); await press(B, '[data-t=sw-play]')
ok(await until(async () => (await attr(A, '[data-t=g-sw]', 'data-phase')) === 'play', 8000), 'Sweet Twenty is in play')
const sw = await layoutOf(A, '[data-t=g-sw]')
console.log('  sweet', JSON.stringify(sw))
ok(sw.felt && sw.felt.h / sw.vh >= 0.75, `Sweet Twenty stage is most of the phone (${Math.round(sw.felt?.h ?? 0)} / ${sw.vh})`)
ok(sw.side && sw.side.h >= 110 && sw.side.h <= 150 && sw.call && sw.call.y >= sw.side.y - 4 && sw.call.b <= sw.vh + 1, 'Sweet Twenty uses the same dock and keeps Start call')
const deskSw = await layoutOf(B, '[data-t=g-sw]')
ok(deskSw.side && deskSw.stage && deskSw.side.x >= deskSw.stage.r - 4 && !deskSw.olHidden, 'Sweet Twenty desktop chat stays beside the table')
await shot(A, 'play-sweet-phone')
await shot(B, 'play-sweet-desk')

await browser.close()
console.log(`\n${n - bad}/${n} checks passed`)
process.exit(bad ? 1 : 0)
