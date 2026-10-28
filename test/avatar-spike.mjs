// Pixel-avatar detection spike harness: runs each test photo through ?avatar=debug, saves screenshots + results JSON,
// and measures model/WASM download sizes, cold load and inference, normal and throttled (4x CPU + slow 4G).
// usage: (vite preview of a fresh build on :4173)  node test/avatar-spike.mjs   [PHOTOS=dir] [URL=...] [SKIP_THROTTLE=1]
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { readdirSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
const URL_ = process.env.URL || 'http://localhost:4173/Pixeldate/app/?avatar=debug'
const DIR = process.env.PHOTOS || '/workspace/pixeldate-avatar-testphotos'
const OUT = process.env.OUT || new URL('../shots/avatar-spike/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const photos = readdirSync(DIR).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort()
const origin = new URL(URL_).origin

// on-disk asset sizes (raw + gzip -9)
const pub = new URL('../public/avatar/', import.meta.url).pathname
const sizes = {}
for (const d of ['wasm', 'models']) for (const f of readdirSync(join(pub, d))) { const b = readFileSync(join(pub, d, f)); sizes[`${d}/${f}`] = { raw: statSync(join(pub, d, f)).size, gzip: gzipSync(b, { level: 9 }).length } }

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
async function run(label, { throttle = false, noWorker = false, only } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: 1 })
  if (noWorker) await ctx.addInitScript(() => { window.__pdNoWorker = true })
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  if (throttle) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }) // Lighthouse slow 4G
  }
  // every request the page (and its workers) makes: the photo must never go over the network
  const reqs = [], xfer = {}
  // Dedicated workers are separate CDP targets: page-level CPU throttling and request events don't reach them.
  // Auto-attach (non-flat) so we can throttle the avatar Worker too and log its network traffic.
  const workerIds = new Map(); let wmsg = 1
  const toWorker = (sessionId, method, params = {}) => cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: wmsg++, method, params }) }).catch(() => {})
  cdp.on('Target.attachedToTarget', async ({ sessionId, targetInfo }) => {
    if (targetInfo.type !== 'worker') return
    await toWorker(sessionId, 'Network.enable')
    if (throttle) await toWorker(sessionId, 'Emulation.setCPUThrottlingRate', { rate: 4 })
    await toWorker(sessionId, 'Runtime.runIfWaitingForDebugger')
  })
  cdp.on('Target.receivedMessageFromTarget', ({ message }) => {
    const m = JSON.parse(message)
    if (m.method === 'Network.requestWillBeSent') { workerIds.set(m.params.requestId, m.params.request.url); reqs.push({ url: m.params.request.url, method: m.params.request.method, type: 'worker:' + m.params.type, post: m.params.request.postData?.length || (m.params.request.hasPostData ? 1 : 0) }) }
    if (m.method === 'Network.loadingFinished') { const u = workerIds.get(m.params.requestId); if (u && /\/avatar\//.test(u)) xfer[u.replace(/.*\/avatar\//, '')] = m.params.encodedDataLength }
  })
  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: false })
  page.on('request', r => reqs.push({ url: r.url(), method: r.method(), type: r.resourceType(), post: (r.postDataBuffer() || Buffer.alloc(0)).length }))
  const ids = new Map()
  cdp.on('Network.requestWillBeSent', e => ids.set(e.requestId, e.request.url))
  cdp.on('Network.loadingFinished', e => { const u = ids.get(e.requestId); if (u && /\/avatar\//.test(u)) xfer[u.replace(/.*\/avatar\//, '')] = e.encodedDataLength })
  const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  const t0 = Date.now()
  await page.goto(URL_)
  await page.waitForFunction(() => ['ready', 'error'].includes(document.documentElement.dataset.avatar), null, { timeout: 900_000, polling: 250 })
  const coldMs = Date.now() - t0
  const load = await page.evaluate(() => window.__avatarDebug)
  const nLoadReqs = reqs.length
  console.log(`[${label}] cold load ${coldMs} ms`, load.err || '', JSON.stringify(load.load?.ms), 'cpu-throttle:', throttle ? (noWorker ? 'main thread 4x' : 'requested for worker (Chrome does not apply it to dedicated workers)') : 'none', 'blocked:', JSON.stringify(load.load?.blocked))
  const res = []
  if (load.err) { await ctx.close(); return { label, throttle, noWorker, coldMs, loadErr: load.err, errors: errs, transfer: xfer, requestsDuringAnalysis: [], foreignRequests: [], requestsWithBody: [], results: [] } }
  for (const f of only ? photos.filter(p => only.includes(p)) : photos) {
    await page.setInputFiles('#avatar-file', join(DIR, f))
    await page.waitForFunction(n => document.documentElement.dataset.avatar !== 'busy' && document.getElementById('avatar-status')?.textContent?.includes(n) && window.__avatarDebug?.r, f, { timeout: 300_000, polling: 100 })
    const r = await page.evaluate(() => { const r = window.__avatarDebug.r; const { masks, landmarks, ...rest } = r; return { ...rest, maskSizes: masks?.map(m => [m.name, m.w, m.h]) } })
    const shot = join(OUT, `${label}-${f.replace(/\.\w+$/, '')}.png`)
    if (!throttle || label.includes('main')) await page.screenshot({ path: shot, fullPage: true })
    res.push({ photo: f, shot, ...r })
    const d = r.descriptor
    console.log(`[${label}] ${f}: ${r.ok ? 'ok' : r.error.message + ' (' + r.error.code + ')'} ${JSON.stringify(r.ms)}` + (d ? `\n   build=${d.build.value} hair=${d.hairLength.value}/${d.hairVolume.value} lower=${d.lowerBody.value} sleeve=${d.sleeve.value} glasses=${d.glasses.value} ` +
      Object.entries(d.colours).map(([k, c]) => `${k}=${c.value ? c.value.raw + '>' + c.value.name : '-'}@${c.confidence}`).join(' ') : ''))
  }
  const after = reqs.slice(nLoadReqs)
  const foreign = reqs.filter(r => !r.url.startsWith(origin) && !r.url.startsWith('data:') && !r.url.startsWith('blob:'))
  const withBody = reqs.filter(r => r.post > 0 || !['GET', 'HEAD'].includes(r.method))
  await ctx.close()
  return { label, throttle, noWorker, coldMs, requestsSeen: reqs.length, blockedAttempts: res.at(-1)?.blocked ?? load.load?.blocked ?? [], load: load.load, loadErr: load.err, transfer: xfer, requestsDuringAnalysis: after.map(r => r.url), foreignRequests: foreign, requestsWithBody: withBody, errors: errs, results: res }
}
const runs = [await run('normal')]
if (!process.env.SKIP_THROTTLE) {
  const pos = photos.slice(0, 99)
  runs.push(await run('throttled', { throttle: true, only: pos }))
  runs.push(await run('throttled-main', { throttle: true, noWorker: true, only: pos.slice(0, 3) }))
}
await browser.close()
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), url: URL_, sizes, runs }, null, 1))
const bad = runs.flatMap(r => [...r.foreignRequests, ...r.requestsWithBody, ...r.requestsDuringAnalysis.map(u => ({ url: u }))])
for (const r of runs) console.log(`[${r.label}] off-origin attempts blocked in-app: ${r.blockedAttempts?.length || 0} ${[...new Set(r.blockedAttempts || [])].join(' ')}; requests seen: ${r.requestsSeen}`)
console.log(bad.length ? `PRIVACY CHECK FAILED ${JSON.stringify(bad)}` : 'PRIVACY OK: no foreign requests, no request bodies, no requests at all while analysing')
console.log('sizes', JSON.stringify(sizes))
