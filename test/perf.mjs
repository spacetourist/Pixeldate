// Budget check: LCP < 2s, CLS < 0.05, initial JS <= 120 KB gz. Mobile emulation (Pixel-ish 412x915 @2.6, touch) + 4x CPU slowdown.
// usage: [NET=4g] [URL=http://localhost:4173/Pixeldate/] node test/perf.mjs   (vite preview of a fresh build must be running)
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { cfg } from './r1-shots.mjs'
const BASE = process.env.URL || 'http://localhost:4173/Pixeldate/'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
async function run(name, path, mock) { // mock: a src/mock.ts config (match by default, or scene: 'lobby')
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' })
  const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  if (process.env.NET === '4g') { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }) } // Lighthouse 'slow 4G'
  const js = new Set(); p.on('response', r => { if (/\.js(\?|$)/.test(r.url())) js.add(new URL(r.url()).pathname) })
  await p.addInitScript(() => {
    window.__lcp = 0; window.__cls = 0
    new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__lcp = e.startTime; window.__lcpEl = (e.element?.tagName || '') + '.' + (e.element?.className || '') + ' ' + (e.url || '').slice(-30) } }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true })
  })
  if (mock) await p.addInitScript(c => { window.__pdMock = c }, mock)
  await p.goto(BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(3000)
  const [lcp, cls, el] = await p.evaluate(() => [window.__lcp, window.__cls, window.__lcpEl]); if (process.env.LCPEL) console.log('   lcp el', el)
  let gz = 0; const files = []
  for (const f of js) { const local = 'dist' + f.replace(/^\/Pixeldate/, ''); if (!existsSync(local)) continue; const n = gzipSync(readFileSync(local), { level: 9 }).length; gz += n; files.push(`${f.split('/').pop()} ${(n / 1024).toFixed(1)}KB`) }
  console.log(`${name.padEnd(22)} LCP ${lcp.toFixed(0)} ms   CLS ${cls.toFixed(3)}   JS loaded ${(gz / 1024).toFixed(1)} KB gz  [${files.join(', ')}]`)
  await ctx.close(); return { lcp, cls, gz }
}
const r = [await run('landing /', '', false), await run('app /app/ (onboard)', 'app/', false), await run('app match (mock)', 'app/', cfg({ tab: 'chat' })), await run('app lobby (mock)', 'app/', cfg({ scene: 'lobby' })),
  // R5 pages (lazy chunk)
  await run('app matches (mock)', 'app/', cfg({ page: 'matches' })), await run('app you (mock)', 'app/', cfg({ page: 'profile' })), await run('app settings (mock)', 'app/', cfg({ scene: 'lobby', page: 'settings' }))]
const ok = r.every(x => x.lcp < 2000) && r.every(x => x.cls < 0.05) && r[1].gz <= 120 * 1024
console.log(ok ? 'BUDGETS OK' : 'BUDGET MISS'); await b.close(); process.exit(ok ? 0 : 1)
