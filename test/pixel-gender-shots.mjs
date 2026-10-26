// Pixel gender character cards: checkpoint shots of the real build (no injection), motion + reduced motion, at 390x844,
// 1440x900 and 1920x1080, plus the settings age dropdown at 390 and an mp4 of the select interaction at 390.
// usage: [URL=https://…/Pixeldate/app/] node test/pixel-gender-shots.mjs [filter]   (default: local vite preview :4173)
// Output: /workspace/pixeldate/shots/pixel-gender/
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { mkdirSync, copyFileSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const APP = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
process.env.URL = APP // r1-shots reads URL at import time
const { open } = await import('./r1-shots.mjs')
const DIR = '/workspace/pixeldate/shots/pixel-gender/', OUT = n => DIR + n + '.png'
mkdirSync(DIR, { recursive: true })
const PHOTO = '/tmp/r2-kofi.webp'; copyFileSync('/workspace/design/pixeldate/player-two/assets/photos/kofi-full.webp', PHOTO)
const only = process.argv[2] || ''
const SIZES = [[390, 844, 'p390'], [1440, 900, 'd1440'], [1920, 1080, 'd1920']]
const measure = p => p.evaluate(() => {
  const g = document.querySelector('.pg'); if (!g) return { pg: null }
  const r = e => { const b = e.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height) }
  const cta = document.querySelector('[data-t=next],[data-t=start]')
  return { vw: innerWidth, px: getComputedStyle(g).getPropertyValue('--px').trim(), cards: [...g.querySelectorAll('.pg-card')].map(r), sprite: r(g.querySelector('.pg-spr')),
    checked: [...g.querySelectorAll('input')].filter(i => i.checked).map(i => i.value), hOverflow: document.scrollingElement.scrollWidth > innerWidth,
    labelFont: getComputedStyle(g.querySelector('.pg-lab')).fontFamily.split(',')[0], cta: cta ? { bottom: Math.round(cta.getBoundingClientRect().bottom), disabled: cta.disabled } : null }
})
const snap = async (p, n, settle = 700) => { await p.mouse.move(1, 1); await p.waitForTimeout(settle); console.log(n.padEnd(30), JSON.stringify(await measure(p))); await p.screenshot({ path: OUT(n), animations: 'disabled' }) }

async function signup(b, w, h, rm) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: rm ? 'reduce' : 'no-preference' }); const p = await ctx.newPage()
  p.on('pageerror', e => console.log('PAGEERR', e.message))
  await p.goto(APP + '?revealt=3000'); await p.waitForFunction(() => !document.querySelector('[data-t=splash]'), null, { timeout: 15000 })
  await p.evaluate(() => document.fonts.ready); await p.fill('[data-t=name]', 'Kofi'); return { ctx, p }
}
async function toStep4(p) {
  await p.click('[data-t=iam-man]'); await p.click('[data-t=next]'); await p.waitForSelector('[data-t=add-selfie]')
  await p.setInputFiles('[data-t=gallery]', PHOTO); await p.waitForSelector('.rv-acts:not(.hid) [data-t=photo-confirm]'); await p.click('[data-t=photo-confirm]'); await p.waitForSelector('[data-t=bday]')
  await p.click('[data-t=month-4]'); await p.$eval('[data-t=year-reel]', r => r.querySelector('#yr-1997').click()); await p.waitForTimeout(900)
  await p.click('[data-t=next]'); await p.waitForSelector('[data-t=start]')
  const setR = (sel, v) => p.$eval(sel, (e, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })) }, String(v))
  await setR('[data-t=min]', 1); await setR('[data-t=max]', 3); await p.$eval('[data-t=adult]', e => e.click())
}
const profile = async (b, w, h, rm, k) => { const p = await open(b, w, h, { page: 'profile' }, { reducedMotion: rm ? 'reduce' : 'no-preference' })
  await p.click(`[data-t=edit-${k}]`); await p.waitForSelector('.setrow .pg'); await p.$eval('.setrow .pg', g => g.closest('.setrow').scrollIntoView({ block: 'center' })); return p }

const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
for (const [w, h, tag] of SIZES) for (const rm of [false, true]) {
  const sfx = `-${tag}${rm ? '-rm' : ''}`
  if (!only || only === 'step1') { const { ctx, p } = await signup(b, w, h, rm)
    await snap(p, 'step1-none' + sfx); await p.click('[data-t=iam-man]'); await snap(p, 'step1-man' + sfx); await p.click('[data-t=iam-woman]'); await snap(p, 'step1-woman' + sfx); await ctx.close() }
  if (!only || only === 'step4') { const { ctx, p } = await signup(b, w, h, rm); await toStep4(p)
    await snap(p, 'step4-none' + sfx); await p.click('[data-t=seek-women]'); await snap(p, 'step4-women' + sfx); await ctx.close() }
  if (!only || only === 'settings') { const p = await profile(b, w, h, rm, 'seek') // saved seek = women → preselected
    await snap(p, 'settings-seek-saved' + sfx); await p.click('[data-t=seek-everyone]'); await snap(p, 'settings-seek-everyone' + sfx)
    if (tag === 'p390' && !rm) { const r = await p.$eval('.setrow .range', e => { const b = e.getBoundingClientRect(); return { x: 0, y: Math.max(0, b.top - 340), width: innerWidth, height: 420 } })
      const sel = await p.$$eval('.setrow .range select', s => s.map(e => ({ value: e.value, w: Math.round(e.getBoundingClientRect().width), fits: e.scrollWidth <= e.clientWidth })))
      console.log('age selects', JSON.stringify(sel)); await p.screenshot({ path: OUT('settings-age-dropdown-p390'), clip: r, animations: 'disabled' }) }
    await p.context().close() }
  if (!only || only === 'iam') { const p = await profile(b, w, h, rm, 'iam') // saved iam = man → preselected
    await snap(p, 'profile-iam-saved' + sfx); await p.click('[data-t=iam-woman]'); await snap(p, 'profile-iam-woman' + sfx); await p.context().close() }
}
if (!only || only === 'rt') { // reduced transparency (CDP media emulation) on step 1 after a pick
  const { ctx, p } = await signup(b, 390, 844, false); const s = await ctx.newCDPSession(p)
  await s.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] }); await p.click('[data-t=iam-woman]'); await snap(p, 'step1-woman-p390-solid'); await ctx.close() }
if (!only || only === 'video') { // the select interaction at 390: hover, pick Man, change to Woman (real-time, motion on)
  const vd = '/tmp/pg-video/'; rmSync(vd, { recursive: true, force: true })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'no-preference', recordVideo: { dir: vd, size: { width: 390, height: 844 } } }); const p = await ctx.newPage()
  await p.goto(APP); await p.waitForFunction(() => !document.querySelector('[data-t=splash]'), null, { timeout: 15000 }); await p.fill('[data-t=name]', 'Kofi'); await p.waitForTimeout(1500)
  await p.hover('[data-t=iam-man]'); await p.waitForTimeout(700); await p.click('[data-t=iam-man]'); await p.waitForTimeout(1800)
  await p.hover('[data-t=iam-woman]'); await p.waitForTimeout(600); await p.click('[data-t=iam-woman]'); await p.waitForTimeout(1800)
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(1800); await ctx.close()
  const f = vd + readdirSync(vd).find(n => n.endsWith('.webm'))
  execFileSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1', '-i', f, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', DIR + 'select-interaction-p390.mp4'])
  console.log('video', DIR + 'select-interaction-p390.mp4') }
await b.close()
