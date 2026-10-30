// 'Enter the café' on the home screen (src/ui/cafe-button.tsx, GD final spec: design world/landing README §6), on the
// built app (dist) at 390 and 1440: hidden without an invite; shown with pd.invite (and after ?invite= on the app URL,
// which saves it); directly under Find someone, full width, 54px tall, #281D52 fill (#33276A hover), 2px #05020F edge,
// 20px pixel cup (cream cup, coral band, butter steam) + cream #FFF1C1 Bricolage label, no friends dot without a count;
// over the café backdrop; a click opens ?world=cafe (the café gate). Shots: shots/cafe-button-v2/.   usage: npm run build && node test/cafe-button.mjs
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'
const { SAMPLES } = await import('../src/avatar/kit/kit.gen.ts')
const ROOT = new URL('..', import.meta.url).pathname, OUT = ROOT + 'shots/cafe-button-v2/'; mkdirSync(OUT, { recursive: true })
const PORT = 4186, O = 'http://localhost:' + PORT, APP = O + '/Pixeldate/app/'
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' }
const srv = await new Promise(ok => { const s = createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname)
  if (p === '/seed') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<!doctype html><title>seed</title>') }
  if (!p.startsWith('/Pixeldate/')) { r.writeHead(404); return r.end('nope') }
  let f = join(ROOT, 'dist', p.slice('/Pixeldate/'.length)); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html')
  if (!existsSync(f)) { r.writeHead(404); return r.end('404') }
  r.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f)) }).listen(PORT, () => ok(s)) })
let fails = 0, passes = 0
const ok = (c, m) => { c ? passes++ : fails++; console.log(c ? '  ✓' : '  ✗', m) }
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const VPS = { 390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 1440: { viewport: { width: 1440, height: 900 } } }
const prof = JSON.stringify({ name: 'Bea', age: 31, by: new Date().getFullYear() - 31, bm: 4, min: 26, max: 40, iam: 'woman', seek: 'men', uid: 'u-bea', adult: true, pav: JSON.stringify({ v: 1, ...SAMPLES[2] }) })
const PHOTO = 'data:image/jpeg;base64,' + readFileSync(ROOT + 'test/fixtures/robin.jpg').toString('base64')
const INV = 'test-invite-cafe-1'   // a fake invite: the button only checks one is held; the café gate checks it
async function open(sz, ls, q = '') {
  const ctx = await browser.newContext(VPS[sz]), page = await ctx.newPage(); page.on('pageerror', e => console.log('  PAGEERR', e.message))
  await page.goto(O + '/seed'); await page.evaluate(async ([ls, photo]) => { for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v)
    await new Promise((res, rej) => { const r = indexedDB.open('pixeldate', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv')   // the photo, as src/prefs.ts stores it
      r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(photo, 'photo'); t.oncomplete = () => { r.result.close(); res() }; t.onerror = rej } }) }, [ls, PHOTO])
  await page.goto(APP + q); await page.locator('[data-t=lobby]').waitFor({ timeout: 15000 }); await page.locator('[data-t=find]').waitFor()
  await page.waitForFunction(() => !document.querySelector('[data-t=find]').disabled, null, { timeout: 10000 }).catch(() => console.log('  (signalling not up: Find someone still says Connecting…)')); await page.waitForTimeout(900)
  return { ctx, page } }
for (const sz of [390, 1440]) {
  console.log(`\n${sz}`)
  // 1. no invite → no button
  { const { ctx, page } = await open(sz, { 'pd.profile': prof })
    ok(await page.locator('[data-t=cafe]').count() === 0, `${sz}: no invite → no café button`)
    await page.screenshot({ path: `${OUT}home-no-invite-${sz}.png` }); await ctx.close() }
  // 2. pd.invite held → the button, styled, under Find someone
  { const { ctx, page } = await open(sz, { 'pd.profile': prof, 'pd.invite': INV })
    const b = page.locator('[data-t=cafe]'); ok(await b.isVisible(), `${sz}: pd.invite held → café button shown`)
    const r = await page.evaluate(() => { const c = document.querySelector('[data-t=cafe]'), f = document.querySelector('[data-t=find]'), cb = c.getBoundingClientRect(), fb = f.getBoundingClientRect(), cs = getComputedStyle(c), bs = getComputedStyle(c, '::before')
      const ic = c.querySelector('[data-t=cafe-icon]'), ip = ic?.querySelector('path'), next = f.nextElementSibling
      return { next: next === c, gap: Math.round(cb.top - fb.bottom), w: [Math.round(cb.width), Math.round(fb.width), Math.round(cb.left), Math.round(fb.left)], fill: bs.backgroundColor, edge: cs.backgroundColor, inset: [bs.top, bs.left, bs.right], col: cs.color, font: cs.fontFamily, label: c.textContent.trim(),
        h: Math.round(cb.height), weight: cs.fontWeight, size: cs.fontSize, just: cs.justifyContent, dot: !!c.querySelector('.dot,[data-t=cafe-inside]'),
        icon: ic && { fills: [...ic.querySelectorAll('path')].map(x => getComputedStyle(x).fill + (x.getAttribute('opacity') ? '@' + x.getAttribute('opacity') : '')), before: ic.compareDocumentPosition(c.querySelector('.lb')) & 4, w: ic.getBoundingClientRect().width, h: ic.getBoundingClientRect().height, crisp: ic.getAttribute('shape-rendering') }, href: c.getAttribute('href') } })
    ok(r.next && r.gap >= 0 && r.gap <= 16, `${sz}: directly under Find someone (next sibling, ${r.gap}px gap)`)
    ok(r.w[0] === r.w[1] && r.w[2] === r.w[3], `${sz}: full width, same as Find someone (${r.w})`)
    ok(r.fill === 'rgb(40, 29, 82)', `${sz}: #281D52 fill (${r.fill})`)
    ok(r.edge === 'rgb(5, 2, 15)' && r.inset[1] === '2px' && r.inset[2] === '2px', `${sz}: 2px #05020F edge (${r.edge}, inset ${r.inset})`)
    ok(r.label === 'Enter the café' && r.col === 'rgb(255, 241, 193)' && /Bricolage/.test(r.font) && r.weight === '700' && r.size === '16px', `${sz}: cream #FFF1C1 Bricolage 700 16px label "${r.label}" (${r.col})`)
    ok(r.h === 54 && r.just === 'center', `${sz}: 54px tall, content centred (${r.h}px, ${r.just})`)
    ok(r.icon && r.icon.fills.join() === 'rgb(255, 216, 77)@0.85,rgb(255, 241, 193),rgb(255, 111, 89)' && r.icon.before && r.icon.w === 20 && r.icon.h === 20 && r.icon.crisp === 'crispEdges',
      `${sz}: 20px pixel cup before the label: butter steam 85 %, cream cup, coral band (${JSON.stringify(r.icon)})`)
    ok(!r.dot, `${sz}: no "N inside" dot without a friends count`)
    await b.hover(); await page.waitForTimeout(300)
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('[data-t=cafe]'), '::before').backgroundColor) === 'rgb(51, 39, 106)', `${sz}: hover fill #33276A`)
    await page.mouse.move(0, 0); await page.waitForTimeout(300)
    ok(await page.evaluate(() => !!document.querySelector('.bgart .pd-bd--home img.pd-bd__poster') && !document.querySelector('.bgart picture')), `${sz}: home sits on the café backdrop (poster in .bgart, old art gone)`)
    await page.screenshot({ path: `${OUT}home-with-invite-${sz}.png` })
    const f = await page.locator('[data-t=find]').boundingBox(), c = await b.boundingBox()
    await page.screenshot({ path: `${OUT}button-closeup-${sz}.png`, clip: { x: Math.max(0, f.x - 16), y: f.y - 16, width: f.width + 32, height: c.y + c.height - f.y + 32 } })
    // 3. it navigates to the café
    await (sz === 390 ? b.tap() : b.click()); await page.waitForURL(/[?&]world=cafe\b/, { timeout: 10000 }).catch(() => {})
    const u = new URL(page.url()); ok(u.pathname === '/Pixeldate/app/' && u.searchParams.get('world') === 'cafe' && !u.searchParams.has('invite'), `${sz}: opens ${u.pathname}${u.search} (no invite in the URL)`)
    ok(!!(await page.locator('[data-t=w-gate]').waitFor({ timeout: 15000 }).then(() => 1, () => 0)), `${sz}: the café gate shows`)
    await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}after-tap-cafe-gate-${sz}.png` }); await ctx.close() }
  // 4. ?invite= on the app URL (nothing stored yet) → saved, button shown
  { const { ctx, page } = await open(sz, { 'pd.profile': prof }, '?invite=' + INV)
    ok(await page.locator('[data-t=cafe]').isVisible() && await page.evaluate(() => localStorage.getItem('pd.invite')) === INV, `${sz}: ?invite= saved → café button shown`); await ctx.close() }
}
await browser.close(); srv.close()
console.log(`\ncafe-button: ${passes}/${passes + fails} ${fails ? 'FAIL' : 'OK'}`); process.exit(fails ? 1 : 0)
