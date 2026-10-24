// R4 screenshot harness: the static landing (01), lobby (07), finding (08) and every page/match notice from the one
// toast system (08b they left, 08c couldn't connect, ...). Notices are raised through the app's real code paths
// (leave(), the Net status handler, the offline event, the mic error, a failing join) via the mock API; only the
// generic toast is pushed straight into the store. usage: [URL=...] node test/r4-shots.mjs   (vite preview running)
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { open } from './r1-shots.mjs'
const BASE = (process.env.URL || 'http://localhost:4173/Pixeldate/app/').replace(/app\/$/, '')
const OUT = n => `/workspace/pixeldate/shots/r4-${n}.png`
const SIZES = [['p390', 390, 844], ['d1440', 1440, 900]]
const api = (p, f, ...a) => p.evaluate(([f, a]) => window.__pdMockApi[f](...a), [f, a])
const log = []
const shot = async (p, n, o = {}) => { await p.screenshot({ path: OUT(n), ...o })
  const t = await p.evaluate(() => [...document.querySelectorAll('.toast')].map(x => `${x.dataset.t || '-'}:${x.querySelector('.tmain b, b')?.textContent}`).join(' | '))
  log.push(`${OUT(n)}  ${t}`); console.log('shot', OUT(n), t) }
// a Net stand-in so leave() -> find() really runs: finding never resolves, joins fail the way PeerJS does
const fakeNet = (p, join = 'peer-unavailable') => p.evaluate(j => window.__pdMockApi.setNet({ busy: false, code: 'k7q2px', release() {}, send() {},
  find: () => new Promise(() => {}), joinCode: () => new Promise((_, r) => setTimeout(() => r(new Error(j)), 200)) }), join)
const settle = p => p.waitForTimeout(500)

const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
for (const [sz, w, h] of SIZES) {
  // 01 landing: first viewport and the whole page
  { const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' }); const p = await ctx.newPage()
    p.on('pageerror', e => console.log('PAGEERR', e.message)); await p.goto(BASE, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready)
    await shot(p, `landing-${sz}`)
    for (let y = 0; y < 6000; y += 400) { await p.mouse.wheel(0, 400); await p.waitForTimeout(60) } await p.waitForLoadState('networkidle'); await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(200)
    await shot(p, `landing-full-${sz}`, { fullPage: true })
    console.log('  links', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('a')].map(a => a.getAttribute('href')))), 'scripts', await p.evaluate(() => document.scripts.length))
    await ctx.close() }
  // 07 lobby, 08 finding, generic toast
  { const p = await open(b, w, h, { scene: 'lobby' }); await settle(p); await shot(p, `lobby-${sz}`)
    await api(p, 'setScreen', 'finding'); await settle(p); await shot(p, `finding-${sz}`); await api(p, 'setScreen', 'lobby')
    await p.evaluate(() => window.__pdToast({ title: 'Code copied', body: 'Send it to a friend to meet them.', icon: 'check', role: 'success', t: 'generic' })); await settle(p); await shot(p, `toast-generic-${sz}`); await p.context().close() }
  // 08b they left / moved on / skipped / blocked: from a live (mock) match, through leave(); lands on finding
  for (const why of ['left', 'moved', 'skipped', 'blocked']) {
    const p = await open(b, w, h, {}); await fakeNet(p); await api(p, 'leave', why, true); await settle(p); await shot(p, `notice-${why}-${sz}`); await p.context().close() }
  // 08c couldn't connect (signalling down > 1.5 s), offline (real offline event), then back online
  { const p = await open(b, w, h, { scene: 'lobby' }); await api(p, 'netStatus', 'retrying'); await p.waitForTimeout(1800); await shot(p, `notice-noconn-${sz}`)
    await api(p, 'netStatus', 'up'); await p.context().setOffline(true); await settle(p); await shot(p, `notice-offline-${sz}`)
    await p.context().setOffline(false); await settle(p); await shot(p, `notice-online-${sz}`); await p.context().close() }
  // friend code: join fails (bad code) and busy
  for (const [n, err] of [['join-failed', 'peer-unavailable'], ['join-busy', 'busy']]) {
    const p = await open(b, w, h, { scene: 'lobby' }); await fakeNet(p, err); await p.fill('[data-t=joincode]', 'ZZ9-41X'); await p.click('[data-t=join]')
    await p.waitForTimeout(700); await shot(p, `notice-${n}-${sz}`); await p.context().close() }
  // permissions: microphone blocked, in a match
  { const p = await open(b, w, h, { tab: 'call' }); await api(p, 'setCamErr', 'mic'); await settle(p); await shot(p, `notice-mic-${sz}`); await p.context().close() }
}
// reduced transparency: the lobby art drops behind a solid panel; the landing nav goes solid
{ const p = await open(b, 390, 844, { scene: 'lobby' }); const cdp = await p.context().newCDPSession(p)
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] }); await settle(p); await shot(p, 'lobby-reduced-transparency-p390'); await p.context().close() }
await b.close()
console.log('\n' + log.join('\n'))
