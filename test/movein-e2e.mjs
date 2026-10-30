// One-site move, end to end: the old GitHub Pages hand-off page (dist-handoff, built with HANDOFF_TARGET pointing at a
// second local origin) packs this device's data into the fragment; the new site (dist, the real app) imports it once.
// Two origins: OLD http://127.0.0.1:4180 (hand-off) → NEW http://localhost:4181 (app). 390 and 1440.
// Cases: full move (profile, history, blocked, invite, other prefs, a realistic multi-MB photo compressed), the toast
// and the cleared fragment, the query kept, no re-send once moved, existing data never overwritten + blocked lists
// merged as a union, no-data plain redirect (landing and an unknown old path), and a forged fragment ignored safely.
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { execFileSync } from 'node:child_process'
// a real world dev server for the moved-world shot (Ada walks into the café with what moved)
const WPORT = 18799; process.env.WORLD_PORT = String(WPORT); process.env.WORLD_URL = 'ws://127.0.0.1:' + WPORT
await import('../world/dev/server.ts')
const { SAMPLES } = await import('../src/avatar/kit/kit.gen.ts')
const ROOT = new URL('..', import.meta.url).pathname, OUT = ROOT + 'shots/movein-v1/'; mkdirSync(OUT, { recursive: true })
const OLD = 'http://127.0.0.1:4180', NEW = 'http://localhost:4181', HO = '/tmp/movein-handoff/'
execFileSync('node', [ROOT + 'tools/build-handoff.mjs'], { env: { ...process.env, HANDOFF_TARGET: NEW, HANDOFF_OUT: HO }, stdio: 'inherit' })
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' }
// GitHub Pages semantics: /Pixeldate/ is the artifact root, dirs serve index.html, anything else → 404.html
const serve = (dir, port, notFound) => new Promise(ok => { const s = createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname)
  if (p === '/seed') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<!doctype html><title>seed</title>') } // a blank page on this origin to seed storage
  if (!p.startsWith('/Pixeldate/')) { r.writeHead(404); return r.end('nope') }
  let f = join(dir, p.slice('/Pixeldate/'.length)); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html')
  if (!existsSync(f)) { if (!notFound) { r.writeHead(404, { 'content-type': 'text/plain' }); return r.end('Pixeldate World') } r.writeHead(404, { 'content-type': 'text/html' }); return r.end(readFileSync(join(dir, notFound))) }
  r.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f)) }).listen(port, () => ok(s)) })
const s1 = await serve(HO, 4180, '404.html'), s2 = await serve(ROOT + 'dist', 4181)
let fails = 0, passes = 0
const ok = (c, m) => { c ? passes++ : fails++; console.log(c ? '  ✓' : '  ✗', m) }
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const VPS = { 390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 1440: { viewport: { width: 1440, height: 900 } } }
const now = Date.now()
// realistic photos: the portrait fixtures (as a camera roll / readAsDataURL would hand them over)
const fixture = f => 'data:image/jpeg;base64,' + readFileSync(ROOT + 'test/fixtures/' + f).toString('base64')
const prof = (name, uid) => JSON.stringify({ name, age: 31, by: now && new Date().getFullYear() - 31, bm: 4, min: 26, max: 40, iam: 'woman', seek: 'men', uid, adult: true, pav: JSON.stringify({ v: 1, ...SAMPLES[2] }) })
const hist = (id, name) => JSON.stringify([{ id, uid: 'u-' + id, name, br: [30, 34], lv: 3, pct: 40, at: now - 36e5, end: now - 30e5, how: 'left' }])
// seed one origin: localStorage + the photo in IndexedDB exactly as src/prefs.ts writes it (db pixeldate v1, store kv)
async function seed(page, ls, photo) {
  await page.evaluate(async ([ls, photo]) => {
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v)
    if (photo?.startsWith('BIG:')) { // a realistic camera-roll photo: a real portrait at 3000x4000 with sensor grain (multi-MB)
      const im = new Image(); await new Promise(r => { im.onload = r; im.src = photo.slice(4) })
      const c = document.createElement('canvas'); c.width = 3000; c.height = 4000; const x = c.getContext('2d')
      const k = Math.max(3000 / im.naturalWidth, 4000 / im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k; x.drawImage(im, (3000 - w) / 2, (4000 - h) / 2, w, h)
      const d = x.getImageData(0, 0, 3000, 4000), a = d.data; for (let i = 0; i < a.length; i += 4) { const g = (Math.random() - .5) * 26; a[i] += g; a[i + 1] += g; a[i + 2] += g }
      x.putImageData(d, 0, 0); photo = c.toDataURL('image/jpeg', 0.92)
    } else if (photo === 'BIG') { // a realistic camera-roll photo: 3000x4000 with detail, readAsDataURL-sized (multi-MB)
      const c = document.createElement('canvas'); c.width = 3000; c.height = 4000; const x = c.getContext('2d')
      const g = x.createLinearGradient(0, 0, 3000, 4000); g.addColorStop(0, '#e9a'); g.addColorStop(1, '#258'); x.fillStyle = g; x.fillRect(0, 0, 3000, 4000)
      const d = x.getImageData(0, 0, 3000, 4000), a = d.data; for (let i = 0; i < a.length; i += 4) { const n = (Math.random() * 60) | 0; a[i] += n; a[i + 1] += n; a[i + 2] += n }
      x.putImageData(d, 0, 0); x.fillStyle = '#fc6'; x.beginPath(); x.arc(1500, 1600, 700, 0, 7); x.fill(); photo = c.toDataURL('image/jpeg', 0.92)
    }
    if (photo) await new Promise((res, rej) => { const r = indexedDB.open('pixeldate', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv')
      r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(photo, 'photo'); t.oncomplete = () => { r.result.close(); res() }; t.onerror = rej } })
    return photo?.length
  }, [ls, photo])
  return page.evaluate(() => new Promise(res => { const r = indexedDB.open('pixeldate', 1); r.onupgradeneeded = () => r.transaction.abort(); r.onerror = () => res(0)
    r.onsuccess = () => { try { const g = r.result.transaction('kv').objectStore('kv').get('photo'); g.onsuccess = () => { r.result.close(); res(g.result?.length || 0) } } catch { res(0) } } }))
}
const dump = page => page.evaluate(() => new Promise(res => { const ls = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k) }
  const r = indexedDB.open('pixeldate', 1); r.onupgradeneeded = () => r.transaction.abort(); r.onerror = () => res({ ls, photo: null })
  r.onsuccess = () => { try { const g = r.result.transaction('kv').objectStore('kv').get('photo'); g.onsuccess = () => { r.result.close(); res({ ls, photo: g.result || null }) } } catch { res({ ls, photo: null }) } } }))
// visit an old URL, follow the hand-off, and record every URL the tab went through (to see whether a fragment was sent)
async function visit(page, url) {
  const seen = []; const h = f => f === page.mainFrame() && seen.push(f.url()); page.on('framenavigated', h)
  await page.goto(url).catch(() => {}); await page.waitForURL(u => u.origin === NEW, { timeout: 15000 }); await page.waitForLoadState('load')
  await page.waitForTimeout(1500); page.off('framenavigated', h); return seen
}
// GD movein-v1 toast: 8px under the top bar, centred, #281D52 fill, 2px #05020F edge, mint 2px left rim, gone after 4 s
async function toastStyle(page, sz, where) {
  await page.waitForTimeout(400)
  const r = await page.evaluate(() => { const t = document.querySelector('[data-t=moved-toast]'), cs = getComputedStyle(t), b = t.getBoundingClientRect()
    const h = [...document.querySelectorAll('header')].find(e => e.getBoundingClientRect().height > 0), hb = h?.getBoundingClientRect(), logo = h?.querySelector('.logo')?.getBoundingClientRect()
    return { bg: cs.backgroundColor, bd: cs.borderTopColor + ' ' + cs.borderTopWidth + ' ' + cs.borderLeftColor, sh: cs.boxShadow, top: b.top, bottom: b.bottom, mid: (b.left + b.right) / 2, vw: innerWidth, hb: hb?.bottom, lb: logo && [logo.left, logo.right, logo.top, logo.bottom], bl: b.left, br: b.right } })
  ok(r.bg === 'rgb(40, 29, 82)' && r.bd === 'rgb(5, 2, 15) 2px rgb(5, 2, 15)' && /rgb\(72, 229, 194\) 2px 0px 0px 0px inset/.test(r.sh), `toast ${sz}: #281D52 fill, 2px #05020F edge, mint 2px left rim (${r.bg} · ${r.bd} · ${r.sh})`)
  ok(Math.abs(r.mid - r.vw / 2) <= 1, `toast ${sz}: centred (${r.mid} of ${r.vw})`)
  if (where === 'header' && r.hb == null) ok(r.top === 8, `toast ${sz}: no top bar here (side rail), 8px top inset (${r.top})`)
  else if (where === 'header') { ok(r.hb != null && Math.abs(r.top - (r.hb + 8)) <= 1, `toast ${sz}: 8px under the header bar (bar bottom ${r.hb}, toast top ${r.top})`)
    ok(r.lb && (r.top >= r.lb[3] || r.br <= r.lb[0] || r.bl >= r.lb[1]), `toast ${sz}: clear of the pixeldate logo`) }
  else ok(r.top >= 8 && r.top <= 50, `toast ${sz}: no bar on the café join, sits at the top inset (${r.top})`)
}
async function toastGone(page, t0) {
  const at = await page.waitForFunction(() => !document.querySelector('[data-t=moved-toast]'), null, { timeout: 8000 }).then(() => page.evaluate(() => performance.now()), () => null)
  ok(at != null && at - t0 >= 3600 && at - t0 <= 5600, `toast fades out after 4 s (gone at ${at == null ? 'never' : ((at - t0) / 1000).toFixed(1) + ' s'})`)
}
const blockedUids = s => JSON.parse(s || '[]').map(b => typeof b === 'string' ? b : b.uid)

for (const sz of [390, 1440]) {
  console.log(`\n── ${sz}: full move`)
  { const ctx = await browser.newContext(VPS[sz]), page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message))
    await page.route(NEW + '/parties/**', r => r.abort()) // no world server here; the move is all client-side
    await page.goto(OLD + '/seed'); await page.waitForLoadState('load')
    const oldLs = { 'pd.profile': prof('Ada', 'u-ada-' + sz), 'pd.history': hist('h1', 'Robin'), 'pd-blocked': JSON.stringify([{ uid: 'x-bad1', name: 'Bad One', at: now - 864e5 }, 'x-bad2']),
      'pd.invite': 'dev-invite-1', 'pd.sounds': 'off', 'pd.motion': 'reduce', 'pd-bday': '1995-04' }
    const big = await seed(page, oldLs, 'BIG:' + fixture('sam.jpg')); ok(big > 1.5e6, `old site photo is realistic size (${(big / 1e6).toFixed(1)} MB data URL)`)
    const seen = await visit(page, OLD + '/Pixeldate/app/?world=cafe&ref=home&ws=ws://127.0.0.1:' + WPORT)
    const t0 = await page.evaluate(() => +(document.querySelector('[data-t=moved-toast]')?.dataset.at ?? NaN))
    const sent = seen.find(u => u.includes('#pdmove=')), u = new URL(page.url())
    ok(!!sent, `hand-off sent the data in the fragment (${sent ? Math.round(sent.length / 1024) : 0} kB URL)`)
    ok(u.pathname === '/Pixeldate/app/' && u.search === '?world=cafe&ref=home&ws=ws://127.0.0.1:' + WPORT, `lands on the new site with the query kept: ${u.pathname}${u.search}`)
    ok(u.hash === '', 'fragment cleared from the address bar (history.replaceState)')
    ok(await page.locator('[data-t=moved-toast]').isVisible(), 'toast: "Your profile moved here"')
    await toastStyle(page, sz, 'join')
    await page.screenshot({ path: `${OUT}moved-toast-${sz}.png` })
    const d = await dump(page)
    for (const k of Object.keys(oldLs)) if (k !== 'pd-blocked') ok(d.ls[k] === oldLs[k], `moved ${k}`)
    ok(JSON.stringify(blockedUids(d.ls['pd-blocked'])) === '["x-bad1","x-bad2"]', 'moved blocked list (both entries)')
    ok(typeof d.photo === 'string' && d.photo.startsWith('data:image/jpeg') && d.photo.length <= 240000 && d.photo.length > 5000, `photo moved, compressed ${(big / 1e6).toFixed(1)} MB → ${Math.round((d.photo?.length || 0) / 1024)} kB`)
    const dims = await page.evaluate(src => new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = src }), d.photo)
    ok(Math.max(...dims) <= 1280 && dims[1] > dims[0], `photo kept its shape, ≤1280 px (${dims.join('×')})`)
    await page.waitForTimeout(1500)
    ok(await page.getByText('Joining as').isVisible() && (await page.locator('body').innerText()).includes('Joining as Ada'), 'signed in on the new site as Ada (?world=cafe opens the café join, not the signup)')
    ok(await page.locator('input').evaluateAll(xs => xs.some(x => x.value === 'dev-invite-1')), 'moved invite pre-filled in the café join')
    ok((await dump(page)).ls['pd.profile'] === oldLs['pd.profile'], 'profile still there after boot (not logged out for a missing photo)')
    await toastGone(page, t0)
    if (!(await page.locator('[data-t=w-adult]').isChecked())) await page.locator('[data-t=w-adult]').check()
    await page.locator('[data-t=w-enter]').click()
    ok(!!(await page.locator('[data-t=w-room]').waitFor({ timeout: 20000 }).then(() => 1, () => 0)), 'moved-world: Ada enters the café with the moved invite')
    await page.waitForFunction(() => window.__world?.ents?.size || document.querySelector('[data-t=w-canvas]'), null, { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${OUT}moved-world-${sz}.png` })
    // second visit to the old site: plain redirect, nothing re-sent
    const seen2 = await visit(page, OLD + '/Pixeldate/app/?world=cafe')
    ok(!seen2.some(u => u.includes('pdmove')), 'second visit: plain redirect, no data re-sent (pd.moved flag)')
    ok(page.url() === NEW + '/Pixeldate/app/?world=cafe', 'second visit keeps the query: ' + page.url().replace(NEW, ''))
    ok(!(await page.locator('[data-t=moved-toast]').count()), 'no toast on a plain redirect')
    await page.goto(OLD + '/seed'); ok(!!(await page.evaluate(() => localStorage.getItem('pd.moved'))), 'old site keeps its pd.moved flag')
    ok(!errs.length, 'no page errors ' + errs.join('; ')); await ctx.close() }

  console.log(`\n── ${sz}: existing data on the new site is never overwritten; blocked lists merge`)
  { const ctx = await browser.newContext(VPS[sz]), page = await ctx.newPage(); await page.route(NEW + '/parties/**', r => r.abort())
    await page.goto(NEW + '/seed'); const newLs = { 'pd.profile': prof('Bea', 'u-bea'), 'pd.history': hist('h9', 'Sam'), 'pd-blocked': JSON.stringify([{ uid: 'x-bad2', name: 'Two (kept here)', at: now }, { uid: 'x-bad3', name: 'Three', at: now }]), 'pd.sounds': 'on' }
    const newPhoto = fixture('robin.jpg') // Bea's own photo here (a real portrait, not a placeholder)
    await seed(page, newLs, newPhoto)
    await page.goto(OLD + '/seed'); const oldLs = { 'pd.profile': prof('Ada', 'u-ada'), 'pd.history': hist('h1', 'Robin'), 'pd-blocked': JSON.stringify([{ uid: 'x-bad1', name: 'One', at: now }, 'x-bad2']), 'pd.invite': 'INVITE-TEST-123', 'pd.sounds': 'off' }
    await seed(page, oldLs, 'BIG:' + fixture('alex.jpg'))
    const seen = await visit(page, OLD + '/Pixeldate/app/'); ok(seen.some(u => u.includes('#pdmove=')), 'data sent')
    const d = await dump(page)
    ok(d.ls['pd.profile'] === newLs['pd.profile'], 'profile here kept (not overwritten)')
    ok(d.photo === newPhoto, 'photo here kept (not overwritten)')
    ok(d.ls['pd.history'] === newLs['pd.history'], 'history here kept')
    ok(d.ls['pd.sounds'] === 'on', 'setting here kept')
    ok(d.ls['pd.invite'] === 'INVITE-TEST-123', 'missing key (invite) filled in')
    const bl = blockedUids(d.ls['pd-blocked']); ok(JSON.stringify([...bl].sort()) === '["x-bad1","x-bad2","x-bad3"]', 'blocked lists merged as a union: ' + bl.join(', '))
    ok(JSON.parse(d.ls['pd-blocked']).find(b => b.uid === 'x-bad2')?.name === 'Two (kept here)', 'a person blocked on both keeps the entry made here')
    ok(new URL(page.url()).hash === '' && await page.locator('[data-t=moved-toast]').isVisible(), 'fragment cleared, toast shown')
    ok(await page.locator('[data-t=lobby]').isVisible(), 'still signed in as the profile here (lobby)')
    await toastStyle(page, sz, 'header')
    await page.screenshot({ path: `${OUT}merged-${sz}.png` }); await ctx.close() }

  console.log(`\n── ${sz}: no data → plain redirect (landing, unknown old path)`)
  { const ctx = await browser.newContext(VPS[sz]), page = await ctx.newPage()
    let seen = await visit(page, OLD + '/Pixeldate/?utm=x'); ok(page.url() === NEW + '/Pixeldate/?utm=x' && !seen.some(u => u.includes('pdmove')), 'landing → same path + query, nothing sent: ' + page.url().replace(NEW, ''))
    ok(!(await page.locator('[data-t=moved-toast]').count()), 'no toast')
    await page.goto(OLD + '/seed'); ok(!!(await page.evaluate(() => localStorage.getItem('pd.moved'))), 'flag set even with nothing to move')
    ok(!(await page.evaluate(() => indexedDB.databases ? indexedDB.databases().then(x => x.some(d => d.name === 'pixeldate')) : false)), 'the hand-off did not create an empty photo database on the old site')
    await page.evaluate(() => localStorage.clear())
    seen = await visit(page, OLD + '/Pixeldate/art/old-thing.webp?a=1'); ok(page.url() === NEW + '/Pixeldate/art/old-thing.webp?a=1', 'unknown old path (404.html) → same path + query on the new site')
    await ctx.close() }

  console.log(`\n── ${sz}: a forged or broken fragment`)
  { const ctx = await browser.newContext(VPS[sz]), page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message))
    await page.goto(NEW + '/Pixeldate/app/#pdmove=%%%not-base64'); await page.waitForTimeout(800)
    ok(new URL(page.url()).hash === '' && !errs.length, 'broken fragment: cleared, no crash')
    const evil = Buffer.from(JSON.stringify({ v: 1, ls: { 'pd-blocked': '"x"', 'other': 'nope', 'pd.moved': '1' } })).toString('base64url')
    await page.goto(NEW + '/Pixeldate/app/?q=1'); await page.evaluate(() => localStorage.setItem('pd-blocked', JSON.stringify(['x-keep'])))
    await page.goto(NEW + '/Pixeldate/app/?q=1#pdmove=' + evil); await page.waitForTimeout(800)
    const d = await dump(page); ok(d.ls['pd-blocked'] === '["x-keep"]' || blockedUids(d.ls['pd-blocked']).join() === 'x-keep', 'a junk blocked list never removes anyone already blocked')
    ok(!('other' in d.ls) && !('pd.moved' in d.ls), 'only pd.* / pd-* keys are accepted (and never the flag)')
    await ctx.close() }
}
await browser.close(); s1.close(); s2.close()
console.log(`\nmovein-e2e: ${passes}/${passes + fails} passed`); process.exit(fails ? 1 : 0)
