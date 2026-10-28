// Pixel-avatar v0.1 harness: (1) lite vs full segmentation on the same photos (mask agreement + descriptor fields),
// (2) TS compose vs GD's kit.py sample renders, pixel-for-pixel, (3) flow screenshots at 390x844 + 1440x900 and a
// photo-vs-character sheet per photo, (4) slow-4G download -> "Got you!" time per mode, (5) privacy: every request logged.
// usage: (vite preview of a fresh build on :4173)  node test/avatar-v01.mjs   [PHOTOS=dir] [SKIP_THROTTLE=1]
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { readdirSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const ORIGIN = 'http://localhost:4173', APP = ORIGIN + '/Pixeldate/app/'
const DIR = process.env.PHOTOS || '/workspace/pixeldate-avatar-testphotos'
const OUT = process.env.OUT || new URL('../shots/avatar-v03/', import.meta.url).pathname
const GD = process.env.KIT_DIR || '/workspace/design/pixeldate/pixel-avatar'
mkdirSync(OUT, { recursive: true })
const photos = readdirSync(DIR).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort()
const b64 = f => readFileSync(join(DIR, f)).toString('base64')
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const reqs = [], errs = []
async function ctxFor(viewport, { throttle = false } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  if (throttle) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 })
  let wmsg = 1
  cdp.on('Target.attachedToTarget', async ({ sessionId, targetInfo }) => {
    if (targetInfo.type !== 'worker') return
    const send = (method, params = {}) => cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: wmsg++, method, params }) }).catch(() => {})
    await send('Network.enable')
    if (throttle) await send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 })
    await send('Runtime.runIfWaitingForDebugger')
  })
  cdp.on('Target.receivedMessageFromTarget', ({ message }) => { const m = JSON.parse(message); if (m.method === 'Network.requestWillBeSent') reqs.push({ url: m.params.request.url, method: m.params.request.method, post: m.params.request.hasPostData ? 1 : 0, from: 'worker' }) })
  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: false })
  page.on('request', r => reqs.push({ url: r.url(), method: r.method(), post: (r.postDataBuffer() || Buffer.alloc(0)).length, from: 'page' }))
  page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  return { ctx, page }
}

// ---------- (1) lite vs full on the same photos ----------
const acc = []
{
  const { ctx, page } = await ctxFor({ width: 1000, height: 800 })
  await page.goto(APP + '?avatar=debug')
  await page.waitForFunction(() => window.__pdAvatar && document.documentElement.dataset.avatar === 'ready', null, { timeout: 120_000 })
  await page.evaluate(() => window.__pdAvatar.preload('full'))
  for (const f of photos) {
    const r = await page.evaluate(async ([b, type]) => {
      const blob = new Blob([Uint8Array.from(atob(b), c => c.charCodeAt(0))], { type })
      const A = window.__pdAvatar, full = await A.analysePhoto(blob, 'full'), lite = await A.analysePhoto(blob, 'lite')
      const strip = r => { const { masks, landmarks, ...rest } = r; return rest }
      if (!full.ok || !lite.ok) return { full: strip(full), lite: strip(lite) }
      // per-class agreement on the same crops (same pose -> same boxes)
      const G = { person: c => c > 0, hair: c => c === 1, skin: c => c === 2 || c === 3, faceSkin: c => c === 3, clothes: c => c === 4 || c === 5 }
      const agree = {}
      for (let i = 0; i < full.masks.length; i++) {
        const F = full.masks[i], L = lite.masks[i], o = agree[F.name] = { sameBox: F.w === L.w && F.h === L.h && F.x0 === L.x0 && F.y0 === L.y0 }
        if (!o.sameBox) continue
        let same = 0; for (let k = 0; k < F.data.length; k++) if (F.data[k] === L.data[k] || (F.data[k] === 5 && L.data[k] === 4)) same++
        o.pixelAgree = Math.round(same / F.data.length * 1000) / 1000
        for (const [g, fn] of Object.entries(G)) { let I = 0, U = 0; for (let k = 0; k < F.data.length; k++) { const a = fn(F.data[k]), b2 = fn(L.data[k]); if (a && b2) I++; if (a || b2) U++ } o[g] = U ? Math.round(I / U * 1000) / 1000 : null }
      }
      return { full: strip(full), lite: strip(lite), agree }
    }, [b64(f), /png$/i.test(f) ? 'image/png' : 'image/jpeg'])
    acc.push({ photo: f, ...r })
    console.log(f, r.full.ok ? '' : `full: ${r.full.error.code}`, r.lite.ok ? '' : `lite: ${r.lite.error.code}`, r.agree ? JSON.stringify(r.agree) : '')
  }
  await ctx.close()
}

if (process.env.ACC_ONLY) { writeFileSync(join(OUT, 'acc.json'), JSON.stringify(acc, null, 1)); await browser.close(); process.exit(0) }
// ---------- (2) TS compose vs GD's kit.py renders ----------
let composeCheck
{
  const { ctx, page } = await ctxFor({ width: 390, height: 844 })
  await page.goto(APP + '?avatar=flow')
  await page.waitForFunction(() => window.__pdKit, null, { timeout: 60_000 })
  const refs = readdirSync(join(GD, 'sprites')).filter(f => /^sample-\d\d\.png$/.test(f)).sort().map(f => 'data:image/png;base64,' + readFileSync(join(GD, 'sprites', f)).toString('base64'))
  composeCheck = await page.evaluate(async refs => {
    const K = window.__pdKit, atlas = await K.loadAtlas(), out = []
    for (let i = 0; i < refs.length; i++) {
      const img = new Image(); img.src = refs[i]; await img.decode()
      const c = document.createElement('canvas'); c.width = 24; c.height = 32; const x = c.getContext('2d'); x.drawImage(img, 0, 0)
      const ref = x.getImageData(0, 0, 24, 32).data, mine = K.composeRGBA(atlas, { ...K.BASE, ...K.SAMPLES[i] })
      let diff = 0; for (let p = 0; p < 24 * 32; p++) { const a = ref[p * 4 + 3] > 127, b = mine[p * 4 + 3] > 127; if (a !== b || (a && [0, 1, 2].some(k => ref[p * 4 + k] !== mine[p * 4 + k]))) diff++ }
      out.push(diff)
    }
    return out
  }, refs)
  console.log('compose vs kit.py samples, differing pixels per sample:', JSON.stringify(composeCheck))
  await ctx.close()
}

// ---------- (3) flow screens + photo-vs-character sheets ----------
const positives = acc.filter(a => a.lite.ok).map(a => a.photo)
async function flowShots(vp, tag) {
  const { ctx, page } = await ctxFor(vp)
  const tap = async sel => { const l = page.locator(sel).first(); await l.waitFor({ state: 'attached' }); await l.evaluate(e => { e.scrollIntoView({ block: 'center' }); e.click() }) }
  const shot = n => page.screenshot({ path: join(OUT, `${n}-${tag}.png`), fullPage: true })
  const reqMark = reqs.length
  await page.goto(APP + '?avatar=flow'); await page.waitForFunction(() => document.documentElement.dataset.avatarFlow === 'upload'); await page.evaluate(() => document.fonts.ready)
  await shot('upload')
  await tap('[data-t=av-hand]'); await page.waitForFunction(() => document.documentElement.dataset.avatarFlow === 'tweak'); await page.waitForTimeout(150)
  await shot('build-by-hand')
  const byHandReqs = reqs.slice(reqMark).filter(r => /\/avatar\/(wasm|models)\//.test(r.url)).length
  await page.goto(APP + '?avatar=flow'); await page.waitForFunction(() => document.documentElement.dataset.avatarFlow === 'upload')
  const sheets = []
  for (const [i, f] of positives.entries()) {
    if (i) { await tap('.av-back'); await page.waitForFunction(() => document.documentElement.dataset.avatarFlow === 'upload') }
    await page.setInputFiles('#pd-file', join(DIR, f))
    await page.waitForFunction(() => document.documentElement.dataset.avatarFlow === 'got', null, { timeout: 120_000 }); await page.waitForTimeout(200)
    const id = f.replace(/\D/g, '')
    if (tag === '390x844' || i === 0) {
      await shot('got-you' + (tag === '390x844' ? '-' + id : ''))
      await page.evaluate(() => { const s = document.querySelector('.avf'); s.scrollTop = s.scrollHeight }); await page.waitForTimeout(80)
      await shot('got-you' + (tag === '390x844' ? '-' + id : '') + '-scrolled')
      if (tag === '390x844') { await page.evaluate(() => { document.querySelector('.avf').scrollTop = 0 }); await page.waitForTimeout(60); await page.screenshot({ path: join(OUT, `got-you-${id}-fold-${tag}.png`) }) }
      await page.evaluate(() => { document.querySelector('.avf').scrollTop = 0 })
    }
    if (i === 0) {
      const st = await page.evaluate(() => ({ dis: document.querySelector('[data-t=av-thatsme]').disabled, sel: document.querySelectorAll('.av-tile.sel').length }))
      console.log(`[${tag}] Got you! before picks: That's me disabled=${st.dis}, preselected tiles=${st.sel}`)
      { const bst = await page.evaluate(() => { const b = document.querySelector('[data-t=av-thatsme]'), c = getComputedStyle(b); return { dis: b.disabled, bg: c.backgroundColor, fg: c.color, opacity: c.opacity, best: document.querySelector('.av-tile b')?.closest('.av-tile')?.dataset.t ?? null, hair: window.__pdFlow.m.bestHair } })
      console.log(`[${tag}] That's me before-pick:`, JSON.stringify(bst))
      await page.screenshot({ path: join(OUT, `button-before-pick-${tag}.png`) }) }
      await tap('[data-t=av-build-slim]'); await tap('.av-tiles:not(.three) .av-tile >> nth=0'); await page.waitForTimeout(100)
      await page.evaluate(() => { document.querySelector('.avf').scrollTop = 0 })
      await shot('got-you-picked')
      { const bst = await page.evaluate(() => { const b = document.querySelector('[data-t=av-thatsme]'), c = getComputedStyle(b); return { dis: b.disabled, bg: c.backgroundColor, fg: c.color, opacity: c.opacity, best: document.querySelector('.av-tile b')?.closest('.av-tile')?.dataset.t ?? null, hair: window.__pdFlow.m.bestHair } })
      console.log(`[${tag}] That's me after-pick:`, JSON.stringify(bst))
      await page.screenshot({ path: join(OUT, `button-after-pick-${tag}.png`) }) }
      await tap('[data-t=av-tweak]'); await page.waitForFunction(() => document.documentElement.dataset.avatarFlow === 'tweak'); await tap('[data-t=av-tab-Hair]'); await page.waitForTimeout(150)
      await shot('tweak')
      await tap('[data-t=av-tab-Top]'); await page.waitForTimeout(100); await shot('tweak-top')
      await tap('[data-t=av-looks]'); await page.waitForFunction(() => document.documentElement.dataset.avatarFlow === 'done')
      const saved = await page.evaluate(() => localStorage.getItem('pd.avatar'))
      console.log(`[${tag}] saved pd.avatar ${Buffer.byteLength(saved)} B: ${saved}`)
      await shot('saved')
      await tap('.av-back'); await tap('.av-back'); await page.waitForFunction(() => document.documentElement.dataset.avatarFlow === 'got')
    }
    // v0.2: detected hat -> cap by default; Extras offers cap and beanie in the same (sampled) colour
    if (tag === '390x844' && await page.evaluate(() => window.__pdFlow.m.options.acc === 'cap')) {
      await tap('[data-t=av-tweak]'); await page.waitForFunction(() => document.documentElement.dataset.avatarFlow === 'tweak'); await tap('[data-t=av-tab-Extras]'); await page.waitForTimeout(150)
      await shot('extras-cap-' + id)
      await tap('[data-t=av-opt-acc-beanie]'); await page.waitForTimeout(100); await page.evaluate(() => { document.querySelector('.avf').scrollTop = 0 })
      await shot('extras-beanie-' + id)
      await tap('.av-back'); await page.waitForFunction(() => document.documentElement.dataset.avatarFlow === 'got')
      console.log(`[${tag}] ${id} Extras: cap -> beanie, acc now`, await page.evaluate(() => JSON.stringify({ acc: window.__pdFlow.m.options.acc, accc: window.__pdFlow.m.options.accc })))
    }
    if (tag === '390x844') {
      const png = await page.evaluate(async () => {
        const F = window.__pdFlow, K = window.__pdKit, atlas = await K.loadAtlas(), img = document.querySelector('.av-photo img')
        const H = 512, pw = Math.round(img.naturalWidth * H / img.naturalHeight), c = document.createElement('canvas'); c.width = pw + 24 * 16 + 48; c.height = H + 40
        const x = c.getContext('2d'); x.fillStyle = '#0C0722'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, pw, H)
        const o = { ...F.m.options, build: F.m.options.build ?? 'regular', hair: F.m.options.hair ?? 'crop' }
        const t = document.createElement('canvas'); t.width = 24; t.height = 32; t.getContext('2d').putImageData(new ImageData(K.composeRGBA(atlas, o), 24, 32), 0, 0)
        x.imageSmoothingEnabled = false; x.drawImage(t, pw + 24, 0, 24 * 16, 32 * 16)
        x.fillStyle = '#A49CC2'; x.font = '13px sans-serif'
        x.fillText(`${o.skin} · ${o.hairc} ${o.hair}* · ${o.topc} ${o.top} · ${o.top === 'dress' ? '' : o.bottomc + ' ' + o.bottom + ' · '}${o.tights ? o.tights + ' tights · ' : ''}${o.shoec} ${o.shoes} · ${o.acc}   (*build/hair = placeholder until picked)`, 8, H + 26)
        return c.toDataURL()
      })
      const p = join(OUT, `character-${id}.png`); writeFileSync(p, Buffer.from(png.split(',')[1], 'base64')); sheets.push(p)
      sheets.push(await page.evaluate(() => JSON.stringify({ ...window.__pdFlow.m.options, best: window.__pdFlow.m.bestHair, choices: window.__pdFlow.m.hairChoices, check: Object.keys(window.__pdFlow.m.check) })))
    }
  }
  await ctx.close()
  return { byHandReqs, sheets }
}
const flow390 = await flowShots({ width: 390, height: 844 }, '390x844')
const flow1440 = await flowShots({ width: 1440, height: 900 }, '1440x900')
console.log('Build it by hand: avatar asset requests =', flow390.byHandReqs)
for (let i = 0; i < flow390.sheets.length; i += 2) console.log(flow390.sheets[i], flow390.sheets[i + 1])

// ---------- (4) slow 4G: tap "Choose from library" -> download -> Got you! ----------
const slow = {}
if (!process.env.SKIP_THROTTLE) for (const mode of ['lite', 'full']) {
  const { ctx, page } = await ctxFor({ width: 390, height: 844 }, { throttle: true })
  await page.goto(APP + '?avatar=flow' + (mode === 'full' ? '&seg=full' : '')); await page.waitForFunction(() => document.documentElement.dataset.avatarFlow === 'upload', null, { timeout: 120_000 })
  const t0 = Date.now(); let shotAt = 0
  await page.setInputFiles('#pd-file', join(DIR, positives[0]))
  const marks = {}
  for (;;) {
    const s = await page.evaluate(() => ({ sc: document.documentElement.dataset.avatarFlow, p: window.__pdFlow.progress }))
    const pct = s.p ? s.p.loaded / s.p.total : 0
    if (!marks.firstByte && s.p?.loaded > 0) marks.firstByte = Date.now() - t0
    if (mode === 'lite' && !shotAt && pct > 0.3) { shotAt = 1; await page.screenshot({ path: join(OUT, 'upload-downloading-390x844.png') }) }
    if (!marks.downloaded && pct >= 1) marks.downloaded = Date.now() - t0
    if (s.sc === 'got') { marks.gotYou = Date.now() - t0; break }
    if (Date.now() - t0 > 900_000) { marks.timeout = true; break }
    await page.waitForTimeout(250)
  }
  slow[mode] = marks; console.log(`[slow 4G ${mode}]`, JSON.stringify(marks))
  if (mode === 'lite') { const c2 = await ctxFor({ width: 1440, height: 900 }, { throttle: true }); await c2.page.goto(APP + '?avatar=flow'); await c2.page.waitForFunction(() => document.documentElement.dataset.avatarFlow === 'upload'); await c2.page.setInputFiles('#pd-file', join(DIR, positives[0])); await c2.page.waitForFunction(() => (window.__pdFlow.progress?.loaded ?? 0) / (window.__pdFlow.progress?.total || 1) > 0.3, null, { timeout: 300_000, polling: 250 }); await c2.page.screenshot({ path: join(OUT, 'upload-downloading-1440x900.png') }); await c2.ctx.close() }
  await ctx.close()
}
await browser.close()

const foreign = reqs.filter(r => !r.url.startsWith(ORIGIN) && !/^(data|blob):/.test(r.url)), bodies = reqs.filter(r => r.post > 0 || !['GET', 'HEAD'].includes(r.method))
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), accuracy: acc, composeCheck, flow390, slow, requests: reqs.length, foreign, bodies, errors: errs }, null, 1))
if (errs.length) console.log('page errors:', JSON.stringify(errs.slice(0, 10)))
console.log(foreign.length || bodies.length ? `PRIVACY CHECK FAILED ${JSON.stringify([...foreign, ...bodies].slice(0, 5))}` : `PRIVACY OK: ${reqs.length} requests, all same-origin GETs, no request bodies`)
