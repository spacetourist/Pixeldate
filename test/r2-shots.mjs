// R2 screenshot harness: walks the real 4-step signup (no mocks) and captures each step + the photo ladder.
// The selfie is the design pack's Kofi photo, uploaded from /tmp; it is never copied into public/.
// usage: [URL=...] node test/r2-shots.mjs   (vite preview must be running on :4173)
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { copyFileSync } from 'node:fs'
const URL = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
const PHOTO = '/tmp/r2-kofi.webp'; copyFileSync('/workspace/design/pixeldate/player-two/assets/photos/kofi-full.webp', PHOTO)
const OUT = n => `/workspace/pixeldate/shots/r2-${n}.png`
const LADDER_T = 12000 // second pass, LV 2 · Spark held (u = t − 700 mod 8100 = 3200)
const now = new Date(), UM = now.getMonth() + 2 <= 12 ? now.getMonth() + 2 : 12, UY = now.getMonth() + 2 <= 12 ? now.getFullYear() - 18 : now.getFullYear() - 17

async function run(b, w, h, tag) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'no-preference' })
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message))
  const snap = async n => { await p.mouse.move(1, 1); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(450); await p.screenshot({ path: OUT(`${n}-${tag}`) }); console.log('shot', OUT(`${n}-${tag}`)) }
  await p.goto(URL + '?revealt=' + LADDER_T); await p.waitForFunction(() => !document.querySelector('[data-t=splash]'), null, { timeout: 15000 })
  await p.fill('[data-t=name]', 'Kofi'); await p.click('[data-t=iam-man]'); await snap('02-signup-name')
  await p.click('[data-t=next]'); await p.waitForSelector('[data-t=add-selfie]'); await snap('03-signup-photo')
  await p.setInputFiles('[data-t=gallery]', PHOTO); await p.waitForSelector('.rv-acts:not(.hid) [data-t=photo-confirm]'); await p.waitForSelector('[data-t=mini-5] img')
  await p.waitForTimeout(300); await snap('04-signup-ladder')
  // GD R3 fix 1: the whole ladder step, actions included, fits the viewport with no scrolling
  const fold = await p.evaluate(() => { const se = document.scrollingElement, m = document.querySelector('.pmain'), btn = document.querySelector('[data-t=photo-confirm]').getBoundingClientRect(); return { vh: innerHeight, docH: se.scrollHeight, mainScroll: m ? m.scrollHeight - m.clientHeight : 0, btnBottom: Math.round(btn.bottom), hero: Math.round(document.querySelector('.ladder-wrap')?.getBoundingClientRect().width || 0) } })
  console.log('fold', tag, JSON.stringify(fold), fold.btnBottom <= fold.vh && fold.docH <= fold.vh && fold.mainScroll <= 0 ? 'FITS' : 'SCROLLS')
  await p.click('[data-t=mini-3]'); await p.waitForSelector('[data-t=viewer]'); await snap('04b-signup-viewer'); await p.click('[data-t=viewer-close]')
  await p.click('[data-t=photo-confirm]'); await p.waitForSelector('[data-t=bday]')
  const pick = async (y, m) => { await p.click(`[data-t=month-${m}]`); await p.$eval('[data-t=year-reel]', (r, y) => r.querySelector('#yr-' + y).click(), y); await p.waitForTimeout(900) }
  await pick(UY, UM); await p.waitForSelector('[data-t=under18]'); await snap('05b-signup-under18')
  await pick(1997, 4); await snap('05-signup-birthday')
  await p.click('[data-t=next]'); await p.waitForSelector('[data-t=start]'); await p.click('[data-t=seek-women]')
  const setR = (sel, v) => p.$eval(sel, (e, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })) }, String(v))
  await setR('[data-t=min]', 1); await setR('[data-t=max]', 3); await p.$eval('[data-t=adult]', e => e.click()); await snap('06-signup-meet')
  await ctx.close()
}
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
for (const [w, h, tag] of [[390, 844, 'p390'], [1440, 900, 'd1440']]) await run(b, w, h, tag)
// reduced motion: the ladder is a static LV 1 with every level tappable
{ const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); const p = await ctx.newPage()
  await p.goto(URL); await p.waitForFunction(() => !document.querySelector('[data-t=splash]')); await p.fill('[data-t=name]', 'Kofi'); await p.click('[data-t=next]')
  await p.setInputFiles('[data-t=gallery]', PHOTO); await p.waitForSelector('.rv-acts:not(.hid) [data-t=photo-confirm]'); await p.waitForTimeout(500)
  await p.screenshot({ path: OUT('04-signup-ladder-reduced-motion-p390') }); console.log('shot reduced-motion'); await ctx.close() }
await b.close()
