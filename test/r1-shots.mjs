// R1 screenshot harness: a mocked partner (src/mock.ts) drives the match screen; no WebRTC, no network peers.
// Mock photos are read from the design pack and injected as data URLs; they are never copied into public/.
// usage: [URL=...] node test/r1-shots.mjs   (vite preview must be running)
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { readFileSync } from 'node:fs'
const URL = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
const PH = '/workspace/design/pixeldate/player-two/assets/photos/'
const du = f => 'data:image/webp;base64,' + readFileSync(PH + f).toString('base64')
const OUT = n => `/workspace/pixeldate/shots/r1-${n}.png`
export const cfg = (o = {}) => ({
  me: { name: 'Kofi', age: 29, by: 1997, bm: 3, min: 25, max: 35, iam: 'man', seek: 'women', uid: 'me-mock' }, mePhoto: du('kofi-full.webp'),
  them: { name: 'Rae', br: [25, 29], min: 25, max: 35, iam: 'woman', seek: 'men', uid: 'them-mock' }, themPhoto: du('rae-full.webp'),
  level: 2, pct: 60, tab: 'chat', view: 'stage', season: 'spring', script: 'chat', ...o })
export async function open(b, w, h, o = {}, ctxo = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce', ...ctxo })
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message))
  await p.addInitScript(c => { window.__pdMock = c; try { localStorage.setItem('pd.view', c.view) } catch {} }, cfg(o))
  await p.goto(URL); await p.waitForFunction(() => window.__pdMockReady, null, { timeout: 15000 })
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(700)
  return p
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
  const shots = [
    ['chat-stage-p390', 390, 844, {}], ['chat-compact-p390', 390, 844, { view: 'compact' }],
    ['chat-stage-d1440', 1440, 900, {}], ['chat-compact-d1440', 1440, 900, { view: 'compact' }],
    ['chat-stage-d1920', 1920, 1080, {}], ['chat-compact-d1920', 1920, 1080, { view: 'compact' }],
    ['chat-stage-p360', 360, 740, {}], ['chat-stage-t834', 834, 1112, {}],
    ['match-stage-p390', 390, 844, { tab: 'profile' }],
  ]
  for (const [n, w, h, o] of shots) { const p = await open(b, w, h, o); await p.screenshot({ path: OUT(n) }); await p.context().close(); console.log('shot', OUT(n)) }
  // reduced transparency: emulate the media feature via CDP (not in Playwright's emulateMedia yet)
  { const p = await open(b, 1440, 900, {}); const s = await p.context().newCDPSession(p)
    await s.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] }); await p.waitForTimeout(400)
    const ok = await p.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches)
    await p.screenshot({ path: OUT('chat-stage-reduced-transparency-d1440') }); console.log('shot reduced-transparency matches=' + ok); await p.context().close() }
  await b.close()
}
