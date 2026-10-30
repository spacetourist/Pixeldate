// Live shots of landing v1 against prod (shots/landing-v1/): the landing, home with a café invite, a café button
// close-up, at 390 and 1440. The invite is read from .secrets/world-invite.txt, seeded into localStorage pd.invite
// (never in a URL) and never printed.   usage: node test/landing-live-shots.mjs
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { readFileSync, mkdirSync } from 'node:fs'
const { SAMPLES } = await import('../src/avatar/kit/kit.gen.ts')
const ROOT = new URL('..', import.meta.url).pathname, OUT = ROOT + 'shots/landing-v1/'; mkdirSync(OUT, { recursive: true })
const O = process.env.LIVE || 'https://pixeldate-world.pixeldate.workers.dev', LAND = O + '/Pixeldate/', APP = O + '/Pixeldate/app/'
const INV = readFileSync(ROOT + '.secrets/world-invite.txt', 'utf8').trim()
const prof = JSON.stringify({ name: 'Bea', age: 31, by: new Date().getFullYear() - 31, bm: 4, min: 26, max: 40, iam: 'woman', seek: 'men', uid: 'u-bea-shot', adult: true, pav: JSON.stringify({ v: 1, ...SAMPLES[2] }) })
const PHOTO = 'data:image/jpeg;base64,' + readFileSync(ROOT + 'test/fixtures/robin.jpg').toString('base64')
let fails = 0, passes = 0; const ok = (c, m) => { c ? passes++ : fails++; console.log(c ? '  ✓' : '  ✗', m) }
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const VPS = { 390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 1440: { viewport: { width: 1440, height: 900 } } }
const playing = p => p.waitForFunction(() => { const v = document.querySelector('.pd-bd video'); return v && !v.paused && v.currentTime > 0.3 && v.classList.contains('is-on') }, null, { timeout: 20000 }).then(() => true, () => false)
const shot = []
for (const sz of [390, 1440]) {
  { const ctx = await browser.newContext(VPS[sz]), p = await ctx.newPage(); await p.goto(LAND, { waitUntil: 'load' })
    ok(await playing(p), `${sz}: live landing backdrop video plays`); await p.waitForTimeout(900)
    await p.screenshot({ path: `${OUT}live-landing-${sz}.png` }); shot.push(`live-landing-${sz}.png`); await ctx.close() }
  { const ctx = await browser.newContext(VPS[sz]), p = await ctx.newPage(); await p.goto(LAND)
    await p.evaluate(async ([ls, photo]) => { for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v)
      await new Promise((res, rej) => { const r = indexedDB.open('pixeldate', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv')
        r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(photo, 'photo'); t.oncomplete = () => { r.result.close(); res() }; t.onerror = rej } }) }, [{ 'pd.profile': prof, 'pd.invite': INV }, PHOTO])
    await p.goto(APP); await p.locator('[data-t=lobby]').waitFor({ timeout: 20000 })
    ok(!p.url().includes(INV) && !(await p.evaluate(i => document.body.innerText.includes(i), INV)), `${sz}: invite not in the URL or on the page`)
    const b = p.locator('[data-t=cafe]'); ok(await b.isVisible(), `${sz}: café button shown`)
    ok(await playing(p), `${sz}: home backdrop video plays`); await p.waitForTimeout(900)
    await p.screenshot({ path: `${OUT}live-home-${sz}.png` }); shot.push(`live-home-${sz}.png`)
    const bb = await b.boundingBox(); await p.screenshot({ path: `${OUT}live-button-${sz}.png`, clip: { x: Math.max(0, bb.x - 16), y: bb.y - 16, width: bb.width + 32, height: bb.height + 32 } }); shot.push(`live-button-${sz}.png`)
    await ctx.close() }
}
await browser.close(); console.log('\nshots:', shot.map(s => 'shots/landing-v1/' + s).join(' ')); console.log(`landing-live-shots: ${passes}/${passes + fails} ${fails ? 'FAIL' : 'OK'}`); process.exit(fails ? 1 : 0)
