// Lounge floor: SNAP reads with an N, and a nearby table plus its sign stays inside the viewport.
import puppeteer from 'puppeteer-core'
import { execFileSync } from 'node:child_process'
process.env.WORLD_PORT = '18776'; process.env.WORLD_URL = 'ws://127.0.0.1:18776'; process.env.WORLD_STALE_MS = '3000'
await import('../world/dev/server.ts')
const { sleep } = await import('../world/test/lib.mjs')
const APP = process.env.URL || 'http://127.0.0.1:4173/Pixeldate/app/'
const WQ = '?world=cafe&loopback&ws=ws://127.0.0.1:18776&invite=dev-invite-1&auto=1&room=games'
const OUT = '/opt/cursor/artifacts/'
;(await import('node:fs')).mkdirSync(OUT, { recursive: true })
let bad = 0, n = 0
const ok = (c, m) => { n++; if (c) console.log('✔', m); else { bad++; console.log('✘ FAIL', m) } }

// The painted N is #.# / ### / #.# / #.# / #.#, not a filled block that reads as W.
{
  const got = execFileSync('python3', ['-c', `
from PIL import Image
im=Image.open('src/world/art/lounge-pixel.png')
px=im.load()
def g(x,y0):
    return '/'.join(''.join('#' if px[x+dx,y0+dy][0]>240 else '.' for dx in range(3)) for dy in range(5))
print(g(109,146), g(229,146))
`], { encoding: 'utf8' }).trim()
  ok(got === '#.#/###/#.#/#.#/#.# #.#/###/#.#/#.#/#.#', 'both SNAP signs use an N, not a W (' + got + ')')
}

const until = async (f, ms = 8000, step = 60) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f(); if (v) return v; await sleep(step) } return null }
await sleep(200)
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 90000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-features=CalculateNativeWinOcclusion', '--disable-background-timer-throttling'] })
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const ctx = await browser.createBrowserContext()
async function player(tag, vp, name) {
  const p = await ctx.newPage(); await p.setViewport(vp); p.touch = !!vp.hasTouch
  p.on('pageerror', e => { bad++; console.log('  PAGEERR', tag, e.message) })
  const uid = 'fl-' + tag + '-' + Date.now().toString(36)
  const prof = { name, age: 32, by: 1994, bm: 3, min: 26, max: 38, iam: 'man', seek: 'women', adult: true, uid }
  await p.goto(APP + '?loopback&blank', { waitUntil: 'domcontentloaded' })
  await p.evaluate(async (pr, uid) => {
    sessionStorage.setItem('pd-uid', uid); sessionStorage.setItem('pd.profile', pr)
    const c = new OffscreenCanvas(240, 320), g = c.getContext('2d'); g.fillStyle = '#3D2C8D'; g.fillRect(0, 0, 240, 320)
    const b = await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 }), url = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b) })
    await new Promise((res, rej) => { const r = indexedDB.open('pixeldate-' + uid, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onerror = rej
      r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(url, 'photo'); t.oncomplete = () => { r.result.close(); res() } } })
  }, JSON.stringify(prof), uid)
  await p.goto(APP + WQ, { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-t=w-canvas]', { timeout: 20000 })
  return p
}
const shot = async (p, name) => { await sleep(400); await p.screenshot({ path: `${OUT}${name}.png` }); console.log('  📷', `${OUT}${name}.png`) }
const me = async p => p.evaluate(() => { const s = window.__world?.state(); return s?.ents.find(e => e.id === s.me) })
const tapAt = async (p, x, y) => p.touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y)
const walkTo = async (p, tx, ty, ms = 22000) => {
  const there = async () => { const m = await me(p); return m && Math.abs(m.x - tx - 0.5) < 0.7 && Math.abs(m.y - ty - 0.5) < 0.7 }
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await there()) return true
    const c = await p.$eval('[data-t=w-canvas]', c => c.getBoundingClientRect().toJSON())
    const [x, y] = await p.evaluate((a, b) => window.__world.tileCss(a, b), tx, ty)
    const on = x > c.left + 28 && x < c.right - 28 && y > c.top + 28 && y < c.bottom - 28
    if (on) { await tapAt(p, x, y); if (await until(there, 8000)) return true; continue }
    const cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2
    await tapAt(p, cx + Math.sign(x - cx) * (c.width / 2 - 40), cy + Math.sign(y - cy) * (c.height / 2 - 40))
    await sleep(600)
  }
  return !!(await there())
}
/** art-pixel corners of a piece, in CSS, and whether each is inside the canvas */
const pieceIn = (p, box) => p.evaluate(box => {
  const c = document.querySelector('[data-t=w-canvas]').getBoundingClientRect()
  const pts = [[box[0], box[1]], [box[0] + box[2], box[1]], [box[0], box[1] + box[3]], [box[0] + box[2], box[1] + box[3]]]
  const at = pts.map(([ax, ay]) => { const [x, y] = window.__world.tileCss(ax / 16 - 0.5, ay / 16 - 0.5); return { x, y } })
  return { at, ok: at.every(q => q.x >= c.left - 2 && q.x <= c.right + 2 && q.y >= c.top - 2 && q.y <= c.bottom + 2), c: { l: c.left, t: c.top, r: c.right, b: c.bottom } }
}, box)

const SWEET = [148, 268, 164, 96], TRAILS = [500, 108, 100, 80], BJ = [48, 168, 188, 112]
const A = await player('a', PHONE, 'Ada')
ok(await walkTo(A, 18, 22), 'Ada stands by the heart')
await sleep(500)
const sweet = await pieceIn(A, SWEET)
console.log('  sweet', JSON.stringify(sweet))
ok(sweet.ok, 'the heart and its sign sit inside the 390px view')
await shot(A, 'lounge-floor-phone')
ok(await walkTo(A, 34, 15), 'Ada stands by the Trails cabinet')
await sleep(500)
const trails = await pieceIn(A, TRAILS)
ok(trails.ok, 'the Trails cabinet sits inside the phone view')
await shot(A, 'lounge-floor-phone-trails')
await shot(A, 'trails-cabinet-close')

const fitOf = p => p.evaluate(() => {
  const c = document.querySelector('[data-t=w-canvas]').getBoundingClientRect()
  const css = (ax, ay) => window.__world.tileCss(ax / 16 - 0.5, ay / 16 - 0.5)
  const tl = css(0, -16), br = css(640, 384)
  const room = { x: tl[0], y: tl[1], r: br[0], b: br[1] }
  const rw = room.r - room.x, rh = room.b - room.y
  const cover = Math.max(rw / c.width, rh / c.height)
  const dx = (room.x + room.r) / 2 - (c.left + c.right) / 2
  const dy = (room.y + room.b) / 2 - (c.top + c.bottom) / 2
  const tray = document.querySelector('.w-et-tray')?.getBoundingClientRect()
  const hit = !!(tray && !(tray.right < room.x || tray.left > room.r || tray.bottom < room.y || tray.top > room.b))
  return { cover, dx, dy, hit, rw: Math.round(rw), rh: Math.round(rh), cw: Math.round(c.width), ch: Math.round(c.height) }
})
const B = await player('b', DESK, 'Bea')
for (const [w, h, name] of [[1440, 900, 'lounge-floor-desk'], [1280, 800, 'lounge-floor-desk-1280'], [1024, 640, 'lounge-floor-desk-1024']]) {
  await B.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
  await sleep(500)
  const f = await fitOf(B)
  console.log(`  ${w}x${h}`, JSON.stringify(f))
  ok(f.cover >= 0.8, `${w}: the room covers ${Math.round(f.cover * 100)}% of the tighter edge`)
  ok(Math.abs(f.dx) <= 2 && Math.abs(f.dy) <= 2, `${w}: centred within 2px (${f.dx.toFixed(2)}, ${f.dy.toFixed(2)})`)
  ok(!f.hit, `${w}: the emote bar stays off the room`)
  if (w !== 1024) await shot(B, name)
}
const bj = await pieceIn(B, BJ), sw = await pieceIn(B, SWEET)
ok(bj.ok && sw.ok, 'desktop shows the blackjack table and the heart, uncropped')

await browser.close()
console.log(`\n${n - bad}/${n} checks passed`)
process.exit(bad ? 1 : 0)
