// The café backdrop (src/backdrop.ts, design world/landing README §5) on the built site (dist): the landing hero at
// 390 and 1440 and the home lobby. Poster first (in the HTML, preloaded, no <video> before load, integer-scale fit with
// the README anchors), then the video swaps in (muted, inline, native loop, fades in only once playing); reduced motion
// (OS or the app's own setting) and data saver get the poster only, and flipping to reduce drops a playing video; it
// pauses while the tab is hidden and while the hero is scrolled out of view; a resize across the crop rule swaps
// poster + video; the landing never loads PixiJS or the café. Shots: shots/landing-v1/local-*.
// usage: npm run build && node test/landing-backdrop.mjs
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'
const { SAMPLES } = await import('../src/avatar/kit/kit.gen.ts')
const ROOT = new URL('..', import.meta.url).pathname, OUT = ROOT + 'shots/landing-v1/'; mkdirSync(OUT, { recursive: true })
const PORT = 4187, O = 'http://localhost:' + PORT, LAND = O + '/Pixeldate/', APP = O + '/Pixeldate/app/'
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' }
const srv = await new Promise(ok => { const s = createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname)
  if (p === '/seed') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<!doctype html><title>seed</title>') }
  if (!p.startsWith('/Pixeldate/')) { r.writeHead(404); return r.end('nope') }
  let f = join(ROOT, 'dist', p.slice('/Pixeldate/'.length)); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html')
  if (!existsSync(f)) { r.writeHead(404); return r.end('404') }
  const body = readFileSync(f), type = MIME[extname(f)] || 'application/octet-stream', m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '')
  if (m) { const a = +m[1], b = m[2] ? +m[2] : body.length - 1; r.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${b}/${body.length}`, 'content-length': b - a + 1 }); return r.end(body.subarray(a, b + 1)) }
  r.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': body.length }); r.end(body) }).listen(PORT, () => ok(s)) })
let fails = 0, passes = 0
const ok = (c, m) => { c ? passes++ : fails++; console.log(c ? '  ✓' : '  ✗', m) }
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const VPS = { 390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 1440: { viewport: { width: 1440, height: 900 } } }
const CROPS = { landscape: [480, 304], portrait: [160, 320] }
// README §5 scale rule, recomputed here from the box
const geom = (ay) => document.querySelector('.pd-bd') && (() => { const r = document.querySelector('.pd-bd'), W = r.clientWidth, H = r.clientHeight, crop = W / H < 0.7 ? 'portrait' : 'landscape'
  const [cw, ch] = crop === 'portrait' ? [160, 320] : [480, 304], s = Math.max(3, Math.ceil(Math.max(W / cw, H / ch))), want = { w: cw * s, h: ch * s, l: Math.round((W - cw * s) / 2), t: Math.round((H - ch * s) * ay[crop]) }
  const box = (el) => el && { w: parseFloat(el.style.width), h: parseFloat(el.style.height), l: parseFloat(el.style.left), t: parseFloat(el.style.top) }
  const img = r.querySelector('img'), v = r.querySelector('video'), eq = (b) => !!b && b.w === want.w && b.h === want.h && b.l === want.l && b.t === want.t
  return { W, H, crop, s, ds: r.dataset.crop, dscale: +r.dataset.scale, want, img: box(img), imgOk: eq(box(img)), vidOk: !v || eq(box(v)), poster: (img.currentSrc || img.src).split('/').pop(),
    vsrc: v && v.src.split('/').pop(), pixel: getComputedStyle(img).imageRendering, covers: want.w >= W && want.h >= H } })()
const st = () => { const v = document.querySelector('.pd-bd video'); return v ? { on: v.classList.contains('is-on'), paused: v.paused, t: v.currentTime, muted: v.muted, loop: v.loop, inline: v.playsInline, pip: v.hasAttribute('disablepictureinpicture'), hidden: v.getAttribute('aria-hidden'), op: +getComputedStyle(v).opacity, state: v.parentElement.dataset.video } : null }
const LANDING_AY = { portrait: 0.25, landscape: 1 }, HOME_AY = { portrait: 0.5, landscape: 0.5 }
async function landing(sz, opts = {}, init) {
  const ctx = await browser.newContext({ ...VPS[sz], ...opts }), page = await ctx.newPage(), reqs = []
  page.on('pageerror', e => console.log('  PAGEERR', e.message)); page.on('request', q => reqs.push(new URL(q.url()).pathname))
  await page.addInitScript(() => { window.__early = null; document.addEventListener('DOMContentLoaded', () => { const r = document.querySelector('.pd-bd'); window.__early = { video: !!r?.querySelector('video'), img: !!r?.querySelector('img'), fitted: !!r?.querySelector('img')?.style.width } }) })
  if (init) await page.addInitScript(init)
  await page.goto(LAND, { waitUntil: 'load' }); return { ctx, page, reqs } }
const playing = (page) => page.waitForFunction(() => { const v = document.querySelector('.pd-bd video'); return v && v.classList.contains('is-on') && !v.paused && v.currentTime > 0.3 }, null, { timeout: 20000 }).then(() => true, () => false)
// ── static HTML: the poster is in the markup and preloaded; the only script is the backdrop
{ const html = readFileSync(ROOT + 'dist/index.html', 'utf8'), hero = html.slice(html.indexOf('<header class="ld-hero">'), html.indexOf('</header>'))
  console.log('\nmarkup')
  ok(/<div class="pd-bd pd-bd--landing" aria-hidden="true"><picture><source media="\(min-width: 448px\)" srcset="\/Pixeldate\/art\/bd\/poster-landscape\.png"><img class="pd-bd__poster" src="\/Pixeldate\/art\/bd\/poster-portrait\.png" alt=""/.test(hero), 'poster <img> is in the hero markup (portrait src, landscape <source> ≥448px)')
  ok(/rel="preload" as="image" href="\/Pixeldate\/art\/bd\/poster-portrait\.png" media="\(max-width: 447px\)"/.test(html) && /rel="preload" as="image" href="\/Pixeldate\/art\/bd\/poster-landscape\.png" media="\(min-width: 448px\)"/.test(html), 'both posters preloaded per media')
  ok(!/<video/.test(html) && !/\.mp4/.test(html), 'no <video> and no .mp4 in the HTML')
  ok(!/landing-hero-(tall|wide)/.test(html), 'old hero art gone from the landing') }
for (const sz of [390, 1440]) {
  const crop = sz === 390 ? 'portrait' : 'landscape'
  console.log(`\nlanding ${sz}`)
  // 1. poster first, then the video
  { const { ctx, page, reqs } = await landing(sz)
    const early = await page.evaluate(() => window.__early)
    ok(early && early.img && !early.video && early.fitted, `${sz}: at DOMContentLoaded: poster present and already fitted, no video yet (${JSON.stringify(early)})`)
    const g = await page.evaluate(geom, LANDING_AY)
    ok(g.crop === crop && g.ds === crop && g.poster === `poster-${crop}.png`, `${sz}: ${crop} crop + poster (box ${g.W}×${g.H}, ${g.poster})`)
    ok(g.imgOk && g.dscale === g.s && g.s >= 3 && Number.isInteger(g.s) && g.covers && g.pixel === 'pixelated', `${sz}: integer scale ×${g.s} (${g.want.w}×${g.want.h} at ${g.want.l},${g.want.t}; ay ${LANDING_AY[crop]}), covers the hero, pixelated`)
    const posterFirst = reqs.findIndex(p => p.endsWith(`poster-${crop}.png`)), vidReq = reqs.findIndex(p => p.endsWith('.mp4'))
    ok(posterFirst >= 0 && !reqs.some(p => p.endsWith(`poster-${crop === 'portrait' ? 'landscape' : 'portrait'}.png`)), `${sz}: only the ${crop} poster is fetched`)
    ok(await playing(page), `${sz}: the video swaps in and plays`)
    await page.waitForTimeout(800)   // the .6 s fade
    const s = await page.evaluate(st), g2 = await page.evaluate(geom, LANDING_AY), reqs2 = reqs.filter(p => p.endsWith('.mp4'))
    ok(g2.vsrc === `backdrop-${crop}.mp4` && g2.vidOk && reqs2.every(p => p.endsWith(`backdrop-${crop}.mp4`)), `${sz}: video is backdrop-${crop}.mp4, same box as the poster`)
    ok(s.muted && s.loop && s.inline && s.pip && s.hidden === 'true' && s.op > 0.99 && s.state === 'playing', `${sz}: muted, playsinline, native loop, no PiP, aria-hidden, faded in (${JSON.stringify(s)})`)
    ok(reqs.indexOf(reqs.find(p => p.endsWith('.mp4'))) > posterFirst, `${sz}: the video is requested after the poster`)
    await page.screenshot({ path: `${OUT}local-landing-${sz}.png` })
    // 2. pause on hidden, resume on visible
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')) })
    await page.waitForTimeout(400); const t1 = await page.evaluate(st); await page.waitForTimeout(600); const t2 = await page.evaluate(st)
    ok(t1.paused && t2.paused && t1.t === t2.t, `${sz}: tab hidden → paused (t ${t1.t.toFixed(2)} = ${t2.t.toFixed(2)})`)
    await page.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')) })
    await page.waitForTimeout(800); const t3 = await page.evaluate(st)
    ok(!t3.paused && t3.t > t2.t, `${sz}: visible again → plays (t ${t3.t.toFixed(2)})`)
    // 3. out of view → paused
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.ld-hero').getBoundingClientRect().bottom + scrollY + 400)); await page.waitForTimeout(700)
    const o1 = await page.evaluate(st); ok(o1.paused, `${sz}: hero scrolled out of view → paused`)
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(800)
    ok(!(await page.evaluate(st)).paused, `${sz}: back in view → plays`)
    // 4. the OS flips to reduced motion → the video goes, the poster stays
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(400)
    const r = await page.evaluate(() => ({ v: !!document.querySelector('.pd-bd video'), img: document.querySelector('.pd-bd img').complete && document.querySelector('.pd-bd img').naturalWidth > 0 }))
    ok(!r.v && r.img, `${sz}: reduced motion switched on → video removed, poster shown`)
    await page.emulateMedia({ reducedMotion: 'no-preference' }); ok(await playing(page), `${sz}: switched back off → the video returns`)
    // 5. no PixiJS / café on the landing
    ok(!reqs.some(p => /\/assets\/(world|engine|bundler|WebGL|WebGPU|Canvas|RenderTarget|App|app)-/.test(p) || /\/world\//.test(p)), `${sz}: landing loads no PixiJS, café or app chunks (${reqs.filter(p => p.endsWith('.js')).map(p => p.split('/').pop()).join(', ')})`)
    await ctx.close() }
  // 6. reduced motion from the start → poster only
  { const { ctx, page, reqs } = await landing(sz, { reducedMotion: 'reduce' }); await page.waitForTimeout(3500)
    ok(!(await page.evaluate(() => !!document.querySelector('.pd-bd video'))) && !reqs.some(p => p.endsWith('.mp4')), `${sz}: prefers-reduced-motion → poster only, no video fetched`)
    await page.screenshot({ path: `${OUT}local-landing-${sz}-reduced.png` }); await ctx.close() }
  // 7. data saver → poster only
  { const { ctx, page, reqs } = await landing(sz, {}, () => { Object.defineProperty(navigator, 'connection', { configurable: true, get: () => ({ saveData: true, effectiveType: '4g', addEventListener() {} }) }) }); await page.waitForTimeout(3500)
    ok(!(await page.evaluate(() => !!document.querySelector('.pd-bd video'))) && !reqs.some(p => p.endsWith('.mp4')), `${sz}: navigator.connection.saveData → poster only, no video fetched`); await ctx.close() }
}
// 8. resize across the crop rule: poster + video swap
console.log('\nresize')
{ const { ctx, page } = await landing(1440); await playing(page)
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600)
  const g = await page.evaluate(geom, LANDING_AY)
  ok(g.crop === 'portrait' && g.poster === 'poster-portrait.png' && g.imgOk, `1440→390: re-fit to portrait (×${g.s}), poster swapped (${g.poster})`)
  ok(await playing(page) && (await page.evaluate(geom, LANDING_AY)).vsrc === 'backdrop-portrait.mp4', '1440→390: video swapped to backdrop-portrait.mp4 and playing')
  await page.setViewportSize({ width: 1100, height: 800 }); await page.waitForTimeout(600)
  const g2 = await page.evaluate(geom, LANDING_AY); ok(g2.crop === 'landscape' && g2.imgOk && g2.vidOk, `390→1100: back to landscape ×${g2.s}, fitted`)
  await ctx.close() }
// 9. home lobby
const prof = JSON.stringify({ name: 'Bea', age: 31, by: new Date().getFullYear() - 31, bm: 4, min: 26, max: 40, iam: 'woman', seek: 'men', uid: 'u-bea', adult: true, pav: JSON.stringify({ v: 1, ...SAMPLES[2] }) })
const PHOTO = 'data:image/jpeg;base64,' + readFileSync(ROOT + 'test/fixtures/robin.jpg').toString('base64')
async function home(sz, opts = {}) {
  const ctx = await browser.newContext({ ...VPS[sz], ...opts }), page = await ctx.newPage(), reqs = []; page.on('pageerror', e => console.log('  PAGEERR', e.message)); page.on('request', q => reqs.push(new URL(q.url()).pathname))
  await page.goto(O + '/seed'); await page.evaluate(async ([p, photo]) => { localStorage.setItem('pd.profile', p)
    await new Promise((res, rej) => { const r = indexedDB.open('pixeldate', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv')
      r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(photo, 'photo'); t.oncomplete = () => { r.result.close(); res() }; t.onerror = rej } }) }, [prof, PHOTO])
  await page.goto(APP); await page.locator('[data-t=lobby]').waitFor({ timeout: 15000 }); return { ctx, page, reqs } }
for (const sz of [390, 1440]) {
  console.log(`\nhome ${sz}`)
  const crop = sz === 390 ? 'portrait' : 'landscape'
  { const { ctx, page } = await home(sz)
    const g = await page.evaluate(geom, HOME_AY)
    ok(g && g.crop === crop && g.poster === `poster-${crop}.png` && g.imgOk && g.covers, `${sz}: home backdrop in .bgart: ${crop} ×${g?.s}, ay .5, covers (${g?.W}×${g?.H})`)
    ok(await playing(page), `${sz}: home video plays`)
    const card = await page.evaluate(() => { const c = document.querySelector('.lobbycard'); return [getComputedStyle(c).backgroundColor, getComputedStyle(c, '::before').backgroundColor] })
    ok(card[0] === 'rgba(0, 0, 0, 0)' && card[1] === 'rgba(22, 16, 51, 0.88)', `${sz}: translucent lobby card (#161033 @ 88 %: ${card[1]})`)
    // the app's own Reduce motion (Settings) drops the video too
    await page.evaluate(() => { document.documentElement.dataset.motion = 'reduce' }); await page.waitForTimeout(400)
    ok(!(await page.evaluate(() => !!document.querySelector('.pd-bd video'))), `${sz}: the app's Reduce motion setting → video removed`)
    await page.evaluate(() => { delete document.documentElement.dataset.motion }); ok(await playing(page), `${sz}: setting off → video back`)
    await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}local-home-${sz}.png` }); await ctx.close() }
  { const { ctx, page, reqs } = await home(sz, { reducedMotion: 'reduce' }); await page.waitForTimeout(3000)
    ok(!(await page.evaluate(() => !!document.querySelector('.pd-bd video'))) && !reqs.some(p => p.endsWith('.mp4')), `${sz}: home under reduced motion → poster only`); await ctx.close() }
}
await browser.close(); srv.close()
console.log(`\nlanding-backdrop: ${passes}/${passes + fails} ${fails ? 'FAIL' : 'OK'}`); process.exit(fails ? 1 : 0)
