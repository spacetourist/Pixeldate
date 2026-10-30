import puppeteer from 'puppeteer-core'
import { createHash } from 'node:crypto'
import { cfg as mockCfg } from './r1-shots.mjs'
const LB = !!process.env.LOOPBACK
const BASE = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
const URL = BASE + (LB ? '?loopback&dev=1' : '?dev=1')
let shared, dialogs = 0
const S = p => `/workspace/pixeldate/shots/${p}.png`
const shot = async (p, n) => { await p.bringToFront(); await new Promise(r => setTimeout(r, 400)); await p.screenshot({ path: S(n) }) }
let cur = null
const wrap = p => new Proxy(p, { get(t, k) { const v = t[k]; if (typeof v !== 'function') return v; if (k === 'bringToFront') return v.bind(t); return async (...a) => { if (LB && cur !== t) { cur = t; await t.bringToFront(); await new Promise(r => setTimeout(r, 150)) } return v.apply(t, a) } } })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('✔', ...a); const T0 = Date.now(); const step = s => console.log('  ..', ((Date.now()-T0)/1000).toFixed(1), s)
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 90000,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns,CalculateNativeWinOcclusion,IntensiveWakeUpThrottling', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
// review shots: hide dev-only UI (dev-skip bar, '· DEV' badge suffix) just for the capture
const clean = p => p.evaluate(() => { document.querySelectorAll('[data-t=skip-stage]').forEach(e => e.style.display = 'none'); document.querySelectorAll('.devsfx').forEach(e => e.style.display = 'none') })
async function shotV(p, n, full = true) { await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 }); await sleep(250); await clean(p); await p.screenshot({ path: S(n), fullPage: full }); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }) }
const setR = (p, sel, v) => p.$eval(sel, (e, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })) }, String(v))
async function pickBday(p, y, m) {
  await p.click(`[data-t=month-${m}]`)
  await p.$eval('[data-t=year-reel]', (r, y) => { r.querySelector('#yr-' + y).click() }, y); await sleep(700)
  const sel = await p.$eval('.yr.on', e => +e.textContent); if (sel !== y) throw 'year reel ' + sel + ' != ' + y
}
async function page(name, iam, seek, age, face) {
  const ctx = LB ? (shared ||= await browser.createBrowserContext()) : await browser.createBrowserContext(); const p = await ctx.newPage()
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
  p.on('console', m => { if (!/404/.test(m.text())) console.log(`  [${name}]`, m.text().slice(0, 150)) })
  await p.evaluateOnNewDocument(() => { window.__pdRevealLog = []; window.__pdRecv = [] }) // refine reveal privacy log (test opt-in)
  p.on('dialog', d => { dialogs++; d.accept() }); p.on('pageerror', e => console.log('  PAGEERR', name, e.message))
  step('goto ' + name); await p.goto(URL, { waitUntil: 'networkidle0' }); step('loaded'); await p.waitForFunction(() => !document.querySelector('[data-t=splash]'), { timeout: 10000 })
  if (name === 'Sam') await shotV(p, 'v3.6-signup-empty-412')
  // R2 + v0.4: the signup is a 5-step split (You · Your photo · Your character · Birthday · Who you'd like to meet); each step has its own Continue
  await p.type('[data-t=name]', name)
  // pixel-gender: "I am" has NO default; Continue (and Enter in the name field) wait for a pick
  { const r = await p.evaluate(() => ({ checked: document.querySelectorAll('input[name=iam]:checked').length, on: document.querySelectorAll('[data-t^=iam-].on').length, next: document.querySelector('[data-t=next]').disabled, cards: document.querySelectorAll('.pg [data-t^=iam-].pg-card input[type=radio]').length }))
    if (r.checked || r.on || !r.next || r.cards !== 2) throw 'step 1 default selection / Continue ' + JSON.stringify(r) }
  await p.focus('[data-t=name]'); await p.keyboard.press('Enter'); await sleep(150); if (!(await p.$('[data-t=name]'))) throw 'Enter in name advanced without an "I am" pick'
  if (name === 'Sam') { // keyboard: Tab from the name lands on the (unpicked) group, Space picks, arrows move; ring only for keyboard users
    await p.keyboard.press('Tab'); const f = await p.evaluate(() => document.activeElement.closest('[data-t]')?.dataset.t); if (f !== 'iam-man') throw 'Tab did not reach the I am group: ' + f
    await p.keyboard.press('Space'); await p.keyboard.press('ArrowRight'); await sleep(100)
    const k = await p.evaluate(() => { const l = document.querySelector('[data-t=iam-woman]'), cs = getComputedStyle(l); return { v: document.querySelector('input[name=iam]:checked')?.value, focus: document.activeElement === l.querySelector('input'), kbd: 'kbd' in document.documentElement.dataset, ring: cs.outlineStyle + ' ' + cs.outlineWidth, next: document.querySelector('[data-t=next]').disabled } })
    if (k.v !== 'woman' || !k.focus || !k.kbd || k.ring !== 'solid 3px' || k.next) throw 'I am radios by keyboard ' + JSON.stringify(k)
    await p.keyboard.press('ArrowLeft'); if ((await p.$eval('input[name=iam]:checked', e => e.value)) !== 'man') throw 'ArrowLeft'
    await p.mouse.click(5, 5); const pr = await p.$eval('[data-t=iam-man]', e => getComputedStyle(e).outlineStyle); if (pr !== 'none') throw 'focus ring shown after pointer use: ' + pr
    log('"I am": no default, Continue + Enter blocked until a pick; Tab reaches the group, Space/arrows pick, 3px ring only for keyboard users', JSON.stringify(k)) }
  await p.click(`[data-t=iam-${iam}]`)
  if (!(await p.$eval(`[data-t=iam-${iam}] input`, e => e.checked)) || (await p.$$('[data-t^=iam-].on')).length !== 1 || await p.$eval('[data-t=next]', e => e.disabled)) throw 'iam radio state'
  await p.click('[data-t=next]')
  await p.waitForSelector('[data-t=add-selfie]'); if (!(await p.$eval('[data-t=next]', e => e.disabled))) throw 'photo step continues without a photo'
  await (await p.$('[data-t=gallery]')).uploadFile(`/workspace/pixeldate/test/fixtures/${face}.jpg`)
  const t0 = Date.now(); await p.waitForSelector('.rv-acts:not(.hid) [data-t=photo-confirm]', { timeout: 6000 }) // the ≈2.5 s first pass (no Skip)
  if (Date.now() - t0 > 4500) throw 'ladder first pass too slow: ' + (Date.now() - t0) + ' ms'
  await p.waitForSelector('[data-t=ladder-replay]'); if (await p.$('[data-t=reveal-skip]') || await p.$('[data-t=ladder-play]')) throw 'old Skip/Pause controls still present'
  await p.waitForSelector('[data-t=mini-5] img'); if ((await p.$$('[data-t=minis] img')).length !== 5) throw '5 minis missing'
  if (name === 'Sam') { await p.click('[data-t=mini-3]'); await p.waitForSelector('[data-t=viewer]'); const w = await p.$eval('[data-t=viewer] img', e => e.naturalWidth); if (w !== 32) throw 'viewer not 32 blocks: ' + w
    await shotV(p, 'v3.6-viewer-412', false); await p.click('[aria-label="Next level"]'); if (!(await p.$eval('[data-t=viewer-name]', e => e.textContent)).includes('LV 4')) throw 'viewer next'
    await p.click('[data-t=viewer-close]'); await sleep(200); if (await p.$('[data-t=viewer]')) throw 'viewer did not close'; log('5 minis; viewer opens at 32 blocks, next works, X closes') }
  await p.click('[data-t=photo-confirm]')
  // v0.4 Pixel You: signup step 3 (SPEC "step 3 of signup"), a lazy chunk, skippable. Sam builds it by hand, everyone else skips.
  await p.waitForSelector('[data-t=av-flow] [data-t=av-hand]', { timeout: 15000 })
  const avReq = () => p.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).filter(u => /\/avatar\/(models|wasm)\/|\/(engine|bundler|worker)-[\w-]+\.js/.test(u)))
  { const r = await p.evaluate(() => ({ step: document.querySelector('[data-t=av-step]').textContent, skip: !!document.querySelector('[data-t=av-skip]'), cur: !!document.querySelector('[data-t=av-current]'), ds: document.querySelector('.app.flow')?.dataset.step }))
    if (r.step !== 'Step 3 of 5' || !r.skip || r.cur || r.ds !== '3') throw 'signup avatar step ' + JSON.stringify(r) }
  if (name === 'Sam') {
    await p.click('[data-t=av-hand]'); await p.waitForSelector('[data-t=av-looks]'); await p.click('[data-t=av-looks]'); await p.waitForSelector('[data-t=av-continue]')
    { const r = await p.evaluate(() => ({ copy: document.querySelector('.av-p')?.textContent, json: !!document.querySelector('#av-saved,.av-json') })); if (r.copy !== 'Saved as a tiny character file. Your photo is never kept.' || r.json) throw 'signup saved screen ' + JSON.stringify(r) }
    const saved = await p.evaluate(() => window.__pdFlow.saved); await p.click('[data-t=av-continue]'); await p.waitForSelector('[data-t=bday]')
    if (await p.evaluate(() => localStorage.getItem('pd.avatar'))) throw 'embedded flow wrote pd.avatar'
    // Back from Birthday returns to the character step, which now offers "Tweak my current character"
    await p.click('[data-t=back]'); await p.waitForSelector('[data-t=av-current]'); await p.click('[data-t=av-current]'); await p.waitForSelector('[data-t=av-looks]')
    const o = await p.evaluate(() => window.__pdFlow.o); if (JSON.stringify({ ...o, v: 1 }) !== saved) throw 'tweak-current did not start from the saved options'
    await p.click('[data-t=av-looks]'); await p.waitForSelector('[data-t=av-continue]'); await p.click('[data-t=av-continue]'); await p.waitForSelector('[data-t=bday]')
    const ar = await avReq(); if (ar.length) throw 'Build it by hand downloaded the engine/models: ' + ar
    log(`signup step 3 "Your character": Build it by hand -> Looks like me -> Continue (${saved.length} B options JSON, not in pd.avatar); Back offers Tweak my current character; 0 engine/model requests`)
  } else {
    await p.click('[data-t=av-skip]'); await p.waitForSelector('[data-t=bday]')
    const ar = await avReq(); if (ar.length) throw 'Skip downloaded the engine/models: ' + ar
    log(name + ': signup step 3 "Skip for now" goes straight to Birthday, 0 engine/model requests')
  }
  if (name === 'Sam') { // under-18 block: born this month next year-boundary -> 17
    const now = new Date(), m = now.getMonth() + 2
    if (m <= 12) { await pickBday(p, now.getFullYear() - 18, m); await p.waitForSelector('[data-t=under18]')
      if (!(await p.$eval('[data-t=next]', e => e.disabled))) throw 'under-18 not blocked'; log('under-18 birthday blocks Continue and shows the message') }
    await shotV(p, 'v3.9-birthday-under18-412', true) }
  await pickBday(p, new Date().getFullYear() - age, 1)
  if (await p.$('[data-t=under18]')) throw 'under18 shown for adult'
  if (name === 'Sam') { const r = await p.$eval('[data-t=bday-readout]', e => e.textContent); if (!r.includes("You're " + age) || !r.includes('Winter-born') || !r.includes('25–29')) throw 'readout ' + r; log('birthday readout:', r) }
  await p.click('[data-t=next]'); await p.waitForSelector('[data-t=start]')
  // GD: on step-5 first load (390x844) the sticky Continue bar must not cover the 18+ panel; OFF track has the #4A3C85 edge
  { await sleep(150); const r = await p.evaluate(() => { const c = document.querySelector('[data-t=adult-card]').getBoundingClientRect(), f = document.querySelector('.pfoot').getBoundingClientRect(), t = getComputedStyle(document.querySelector('[data-t=adult-box]')).boxShadow
      return { top: c.top, bot: c.bottom, bar: f.top, vh: innerHeight, edge: /rgb\(74, 60, 133\)/.test(t) } })
    if (!(r.bot <= r.bar || r.top >= r.vh) || !r.edge) throw '18+ panel covered by the Continue bar or OFF edge missing ' + JSON.stringify(r)
    if (name === 'Sam') log('step 5 first load: 18+ panel fully above the sticky Continue bar, OFF toggle edge #4A3C85', JSON.stringify(r)) }
  // pixel-gender: "I want to meet" has NO default either; with 18+ ticked, Continue still waits for it
  { const r = await p.evaluate(() => ({ checked: document.querySelectorAll('input[name=seek]:checked').length, on: document.querySelectorAll('[data-t^=seek-].on').length, cards: document.querySelectorAll('.pg [data-t^=seek-].pg-card input[type=radio]').length }))
    if (r.checked || r.on || r.cards !== 2) throw 'step 4 default selection ' + JSON.stringify(r)
    await p.$eval('[data-t=adult]', e => e.click()); if (!(await p.$eval('[data-t=start]', e => e.disabled))) throw 'start enabled with no "I want to meet" pick'; await p.$eval('[data-t=adult]', e => e.click()) }
  if (name === 'Sam') { await p.focus('[data-t=seek-men] input'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowLeft')
    if ((await p.$eval('input[name=seek]:checked', e => e.value)) !== 'men') throw 'seek radios by keyboard'; log('"I want to meet": no default, Continue blocked until a pick (18+ ticked), arrows pick') }
  await p.click(`[data-t=seek-${seek}]`)
  if (!(await p.$eval(`[data-t=seek-${seek}] input`, e => e.checked)) || (await p.$$('[data-t^=seek-].on')).length !== 1) throw 'seek radio state'
  if (!(await p.$eval('[data-t=start]', e => e.disabled))) throw 'start enabled before 18+ tick'
  await p.$eval('[data-t=adult]', e => e.click())
  if (name === 'Sam') await shotV(p, 'v3.6-signup-filled-412')
  step('filled ' + name); return wrap(p)
}
const t = (p, sel) => p.waitForSelector(sel, { timeout: 60000 })
const click = async (p, sel) => { await t(p, sel); await p.click(sel) }
const tab = async (p, n) => click(p, `[data-t=tab-${n}]`)
const dismiss = async (...ps) => { for (const p of ps) await p.evaluate(() => { document.querySelector('[data-t=ans-pair]')?.click() }) }
async function answerCard(p, text) { step('vis ' + await p.evaluate(() => document.visibilityState + ' ' + document.querySelectorAll('[data-t=card] [data-t=answer]').length + ' ' + location.search)); await click(p, '[data-t=card] [data-t=answer]'); await t(p, '[data-t=ans-input]'); await p.type('[data-t=ans-input]', text); await p.click('[data-t=ans-send]'); await sleep(600); await dismiss(a, b) }
async function photoW(p) { return p.evaluate(() => window.__pdLastPhotoW) }

const mode = process.argv[2] || 'full'
if (mode === 'incompat') {
  // man seeking women vs man seeking women: must NOT match
  const AGE = process.argv[3] === 'age'
  const a = AGE ? await page('Ann', 'woman', 'men', 30, 'alex') : await page('Ann', 'man', 'women', 30, 'alex'), b = AGE ? await page('Ben', 'man', 'women', 41, 'robin') : await page('Ben', 'man', 'women', 30, 'robin')
  if (AGE) { console.log('  age case: Ann (woman, 30) wants men 18-34; Ben (man, 41) wants everyone 18-99'); await a.$eval('[data-t=max]', e => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, '3'); e.dispatchEvent(new Event('input', { bubbles: true })) }) }
  for (const p of [a, b]) { await click(p, '[data-t=start]'); await t(p, '[data-t=code]'); await sleep(1000) }
  await a.click('[data-t=find]'); await sleep(1500); await b.click('[data-t=find]'); for (let i = 0; i < 10; i++) { await a.evaluate(() => 1); await sleep(1000); await b.evaluate(() => 1); await sleep(1000) }
  const matched = (await a.$('[data-t=their-photo]')) || (await b.$('[data-t=their-photo]'))
  console.log(matched ? '✘ incompatible pair matched' : '✔ incompatible pair did not match in 25 s'); await browser.close(); process.exit(matched ? 1 : 0)
}
// compatible: woman 29 seeking men 25-40 and man 31 seeking everyone 18-99
const a = await page('Sam', 'woman', 'men', 29, 'sam'), b = await page('Alex', 'man', 'women', 31, 'alex')
await setR(a, '[data-t=min]', 1); await setR(a, '[data-t=max]', 4) // stops: 25 .. (40 edge) -> 25 – 39
{ const v = await a.$eval('[data-t=range-val]', e => e.textContent); if (v !== '25 – 39') throw 'range ' + v
  await setR(a, '[data-t=min]', 6); if (await a.$eval('[data-t=range-val]', e => e.textContent) !== '35 – 39') throw 'thumbs crossed'; await setR(a, '[data-t=min]', 1)
  if (await b.$eval('[data-t=range-val]', e => e.textContent) !== '18 – 70+') throw 'default range'; log('age range slider snaps to bracket edges: 25 – 39, thumbs cannot cross, default 18 – 70+') }
await shot(a, '01-onboarding')
{ const st = () => a.evaluate(() => ({ c: document.querySelector('[data-t=adult]').checked, svg: document.querySelector('[data-t=adult-box]').classList.contains('is-on') && document.querySelector('[data-t=adult-card]').classList.contains('is-on'), btn: !document.querySelector('[data-t=start]').disabled }))
  const lab = async () => { const r = await a.evaluate(() => { const b = document.querySelector('[data-t=adult-card]').getBoundingClientRect(); return [b.left + 40, b.top + b.height / 2] }); await a.mouse.click(...r) }
  const box = async () => { const r = await a.evaluate(() => { const b = document.querySelector('[data-t=adult-box]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2] }); await a.mouse.click(...r) }
  await a.$eval('[data-t=adult-card]', e => e.scrollIntoView({ block: 'center' })); await sleep(200)
  const seq = [lab, lab, lab, box, box, lab, box, box, box]  // 9 taps, no waits: ends unchecked->checked toggles; initial checked
  for (const f of seq) await f()
  await sleep(100); const r = await st(); if (r.c !== r.svg || r.c !== r.btn || r.c !== false) throw 'tick desync ' + JSON.stringify(r)
  await box(); await sleep(50); const r2 = await st(); if (!r2.c || !r2.svg || !r2.btn) throw 'tick desync2 ' + JSON.stringify(r2)
  log('18+ confirmation panel: 10 rapid panel/toggle taps, toggle, input and Continue stay in sync')
  for (const [w, n] of [[412, 'v3.5-signup-412'], [360, 'v3.5-signup-360']]) { await a.setViewport({ width: w, height: 915, deviceScaleFactor: 2 }); await sleep(200); await a.screenshot({ path: S(n), fullPage: true }) }
  await a.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }) }
for (const p of [a, b]) { await p.bringToFront(); await click(p, '[data-t=start]'); step('started'); await p.waitForFunction(() => document.querySelector('[data-t=find]') && !document.querySelector('[data-t=find]').disabled, { timeout: 15000 }).catch(async e => { await p.screenshot({path: S('dbg')}); console.log(await p.evaluate(() => document.body.innerText.slice(0,200))); throw e }) }
// v0.4 You › Profile › Your character: the character from the stored JSON, and Edit reopens the flow (tweak current)
async function b_noChar() { await click(b, '[data-t=top-profile]'); await t(b, '[data-t=edit-avatar]'); const r = await b.evaluate(() => (document.querySelector('[data-t=you-char]') ? 'canvas ' : '') + document.querySelector('[data-t=edit-avatar]').textContent); await click(b, '[data-t=top-back]'); await t(b, '[data-t=find]'); return r === 'Make one' ? '' : r }
const prof = p => p.evaluate(() => JSON.parse(sessionStorage.getItem('pd.profile') || localStorage.getItem('pd.profile')))
{ await click(a, '[data-t=top-profile]'); await a.waitForSelector('[data-t=you-char][data-drawn]', { timeout: 15000 })
  const before = (await prof(a)).pav, shown = await a.$eval('[data-t=you-char]', e => e.dataset.av); if (!before || shown !== before) throw 'You page character ' + shown
  if ((await a.$eval('[data-t=edit-avatar]', e => e.textContent)) !== 'Edit') throw 'edit entry label'
  await a.click('[data-t=edit-avatar]'); await a.waitForSelector('[data-t=av-current]'); if ((await a.$eval('[data-t=av-step]', e => e.textContent)) !== 'Your character' || await a.$('[data-t=av-skip]')) throw 'edit flow header/skip'
  await a.click('[data-t=av-current]'); await a.waitForSelector('[data-t=av-looks]')
  await a.evaluate(() => { const b = [...document.querySelectorAll('.av-sw button')].find(x => !x.classList.contains('sel')); b.click() }); await sleep(150)
  await a.click('[data-t=av-looks]'); await a.waitForSelector('[data-t=av-continue]')
  { const r = await a.evaluate(() => ({ copy: document.querySelector('.av-p')?.textContent, json: !!document.querySelector('#av-saved,.av-json') })); if (r.copy !== 'Saved as a tiny character file. Your photo is never kept.' || r.json) throw 'edit saved screen ' + JSON.stringify(r) }
  await a.click('[data-t=av-continue]')
  await a.waitForFunction(b => !document.querySelector('[data-t=av-flow]') && document.querySelector('[data-t=you-char]')?.dataset.av !== b, { timeout: 5000 }, before)
  const after = (await prof(a)).pav; if (after === before || (await a.$eval('[data-t=you-char]', e => e.dataset.av)) !== after) throw 'edit did not update the stored character'
  { const b = await b_noChar(); if (b) throw 'Alex (skipped) shows a character row: ' + b }
  log(`You › Profile shows the character from pd.profile.pav (${after.length} B); Edit -> Tweak my current character -> a skin swatch -> Continue updates it`)
  await click(a, '[data-t=top-back]'); await t(a, '[data-t=find]') }
await shot(a, '02-lobby')
const t0 = Date.now(); await a.click('[data-t=find]'); await sleep(300); await t(a, '[data-t=finding]')
{ await a.waitForFunction(() => document.querySelector('[data-t=finding]')?.dataset.rr, { timeout: 10000 }); const r = await a.evaluate(() => ({ rr: document.querySelector('[data-t=finding]').dataset.rr, img: document.querySelector('[data-t=finding]').dataset.img, cap: document.querySelector('.rr-cap').textContent, radar: !!document.querySelector('.radar'), lede: document.querySelector('.lobbycard .lede[role=status]')?.textContent }))
  if (r.radar || !['webgl2', '2d', 'static'].includes(r.rr) || r.img !== 'cinema-seats' || !['Warming up…', 'Movie night'].includes(r.cap) || !r.lede) throw 'finding refine art ' + JSON.stringify(r)
  log('finding screen runs the refine reveal (no radar):', JSON.stringify(r)) }
await shot(a, '03-finding'); await b.click('[data-t=find]')
await t(a, '[data-t=their-photo]'); await t(b, '[data-t=their-photo]'); log(`matched via lobby in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
const nameA = await b.$eval('.plate', e => e.textContent); log('B sees', nameA); if (await b.$('[data-t=season-badge]')) throw 'season shown at Stranger'; if (!nameA.includes('Sam, 25–29')) throw 'bracket not shown'
{ const th = await b.evaluate(() => window.__pdThem); const bad = ['age', 'by', 'bm'].filter(k => k in th); if (bad.length || JSON.stringify(th).includes(String(new Date().getFullYear() - 29))) throw 'birthday leaked: ' + JSON.stringify(th); log('peer received only the bracket:', JSON.stringify(th.br), 'keys', Object.keys(th).join(',')) }
// v0.4: the peer gets the character as the options JSON in the hello profile and draws it with the kit (no image sent)
{ const pavA = (await prof(a)).pav, th = await b.evaluate(() => window.__pdThem), tha = await a.evaluate(() => window.__pdThem)
  if (th.pav !== pavA) throw 'peer pav ' + JSON.stringify(th.pav) + ' != ' + pavA
  if ('pav' in tha) throw 'Alex skipped, but Sam received a pav'
  const KNOWN = ['v', 'build', 'hair', 'top', 'bottom', 'shoes', 'beard', 'acc', 'face', 'skin', 'hairc', 'topc', 'bottomc', 'shoec', 'accc', 'tights'], j = JSON.parse(th.pav)
  if (th.pav.length > 512 || /data:|base64|blob:/i.test(th.pav) || Object.keys(j).some(k => !KNOWN.includes(k)) || Object.values(j).some(v => v !== null && typeof v !== 'string' && v !== 1)) throw 'pav is not plain kit options: ' + th.pav
  await b.waitForSelector('[data-t=their-char][data-drawn]', { timeout: 15000 })
  const px = await b.evaluate(async () => { const c = document.querySelector('[data-t=their-char]'), k = window.__pdKit, at = await k.loadAtlas(), want = k.composeRGBA(at, JSON.parse(c.dataset.av)), s = c.width / 24, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let bad = 0; for (let y = 0; y < 32; y++) for (let x = 0; x < 24; x++) { const i = ((y * s + 1) * c.width + x * s + 1) * 4, w = (y * 24 + x) * 4; for (let q = 0; q < 4; q++) if (d[i + q] !== want[w + q]) { bad++; break } } return { bad, s, av: c.dataset.av } })
  if (px.bad || px.av !== pavA) throw 'their character render ' + JSON.stringify(px)
  { const z = await b.evaluate(() => { const c = document.querySelector('[data-t=their-char]'), r = c.getBoundingClientRect(), k = c.closest('[data-t=their-char-card]'), l = k.querySelector('.label'), kr = k.getBoundingClientRect(), lr = l.getBoundingClientRect()
      return { w: c.clientWidth, h: c.clientHeight, bw: c.width, bh: c.height, ir: getComputedStyle(c).imageRendering, fits: lr.right <= kr.right + 0.5 && l.scrollWidth <= l.clientWidth + 1 && kr.right <= innerWidth } })
    if (z.w !== 72 || z.h !== 96 || z.bw % 24 || z.bw / 24 !== z.bh / 32 || (z.bw / 24) % 3 || z.ir !== 'pixelated' || !z.fits) throw 'their character size/crisp/layout ' + JSON.stringify(z)
    log('their character card at 390: sprite 72x96 CSS px (3x integer, bitmap ' + z.bw + 'x' + z.bh + ', pixelated), text fits the card') }
  if (await a.$('[data-t=their-char]')) throw 'Sam shows a character for Alex, who skipped'
  log(`peer sees the character from the JSON: Alex got pav (${th.pav.length} B, kit names only, keys ${Object.keys(j).length}) in the hello profile and draws it at ${px.s}x, 0/768 cells differ from composeRGBA; Sam shows none for Alex (skipped)`) }
await shot(b, 'v04-match-their-char')
await sleep(1500)
const pw = async p => p.evaluate(() => window.__pd?.photoW)
const ph = async p => p.evaluate(() => window.__pd?.photoH)
log('received photo widths at Stranger:', await pw(a), await pw(b)); if (await pw(a) !== 8 || await pw(b) !== 8 || await ph(a) !== 8 || await ph(b) !== 8) throw 'photo payload not 8x8'
await shot(b, '04-match-stranger')
// Q1 via the pinned card on A while B is on the call tab
await tab(a, 'chat'); await tab(b, 'call')
await click(a, '[data-t=pinned-card] [data-t=answer]'); await a.type('[data-t=ans-input]', 'Toast and coffee'); await a.click('[data-t=ans-send]')
await t(b, '[data-t=ans-turn]'); if ((await b.content()).includes('Toast and coffee')) throw 'partner answer leaked before B answered'
log('B (on call tab) sees "your turn"; answer text not in the DOM')
const shotW412 = async (p, n) => { await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 }); await clean(p); await shot(p, n); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }) }
await shotW412(b, 'v3.4-their-turn-412')
if (!(await a.$eval('.chat', e => e.textContent)).includes('You answered Q1')) throw 'A chat log missing Q1'
await b.click('[data-t=ans-turn]'); await t(b, '[data-t=ans-input]'); await b.type('[data-t=ans-input]', 'Porridge'); await b.click('[data-t=ans-send]')
await t(a, '[data-t=ans-pair]'); await t(b, '[data-t=ans-pair]')
for (const p of [a, b]) { const x = await p.$eval('[data-t=ans-pair]', e => e.textContent); if (!x.includes('Toast and coffee') || !x.includes('Porridge')) throw 'pair reveal missing answers' }
await sleep(1500); await shotW412(b, 'v3.4-answer-event-412'); log('both see the paired reveal')
await b.click('[data-t=evt-close]'); await a.click('[data-t=evt-close]')
await tab(b, 'chat')
for (const p of [a, b]) { const x = await p.$eval('[data-t=pair-log]', e => e.textContent); if (!x.includes('Toast and coffee') || !x.includes('Porridge')) throw 'chat log missing the Q1 pair' }
await shotW412(b, 'v3.4-header-412'); { const r = await b.evaluate(() => { const s = document.querySelector('[data-t=skip]').getBoundingClientRect(), w = document.querySelector('.who').getBoundingClientRect(); return { gap: s.left - w.right, block: !!document.querySelector('[title^=Block]') } }); if (r.gap < 12 || r.block) throw 'header ' + JSON.stringify(r); log('header: skip gap', r.gap, 'block hidden') }
log('Q1 pair recorded in both chat logs')
// chat
await tab(a, 'chat'); await tab(b, 'chat')
await a.type('[data-t=chat-input]', 'Hi Alex!'); await a.click('[data-t=chat-send]')
await t(b, '[data-t=msg-them]'); await b.type('[data-t=chat-input]', 'Hey Sam, how is your day?'); await b.click('[data-t=chat-send]'); await t(a, '[data-t=msg-them]'); log('chat exchanged')
await tab(a, 'profile'); await tab(b, 'profile')
// one card on both sides, then drop next card to chat
await answerCard(a, 'Toast and coffee'); await sleep(400)
await click(a, '[data-t=to-chat]'); // To chat
await tab(b, 'chat'); await sleep(500); await answerCard(b, 'Porridge'); await sleep(800)
await shot(b, '05-chat-card')
const dots = await a.$$eval('[data-t=dot-them].on', e => e.length); log('card answered on both sides, ticked dots seen by A:', dots)
await tab(b, 'profile'); await tab(a, 'profile'); await sleep(300)
await shot(b, '06-reveal-locked')
for (const [n, p] of [['A', a], ['B', b]]) { const t1 = Date.now(); await p.evaluate(() => 1); step(n + ' responsive ' + (Date.now() - t1)) }
for (let i = 0; i < 3; i++) { step('round ' + i); await answerCard(a, 'a' + i); await sleep(300); await answerCard(b, 'b' + i); await sleep(700) }
await t(a, '[data-t=reveal][data-state=ready]'); await t(b, '[data-t=reveal][data-state=ready]'); log('meter full, Reveal more unlocked on both')
for (const p of [a, b]) for (const sel of ['[data-t=ans-pair]', '[data-t=ready]']) if (await p.$(sel)) await p.evaluate(s => { const m = document.querySelector(s); m.dispatchEvent(new MouseEvent('click', { bubbles: true })) }, sel)
await sleep(300); await a.click('[data-t=reveal]'); await t(a, '[data-t=ready-waiting]'); log('A tapped: "Waiting for Alex…"')
await t(b, '[data-t=ready] [data-t=ready-reveal]'); await shot(b, '07-reveal-unlocked-their-turn'); log('B nudged with the Ready modal')
const lvlB = await b.$eval('.chip', e => e.textContent); if (!lvlB.includes('LV 1')) throw 'level rose on one tap'
await b.click('[data-t=ready-reveal]'); await t(a, '[data-t=lvup]'); await t(b, '[data-t=lvup]'); await sleep(1300)
await b.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 }); await clean(b); await shot(b, 'v3.4-levelup-412'); await b.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
for (const [n, p] of [['A', a], ['B', b]]) await revealCheck(p, n, 1, 2)
log('level-up event on both:', await a.$eval('[data-t=lvup-name]', e => e.textContent), '/', await b.$eval('[data-t=lvup-name]', e => e.textContent))
for (const p of [a, b]) await p.click('[data-t=lvup-close]'); await sleep(500)
log('after both tapped:', await a.$eval('.chip', e => e.textContent), '/', await b.$eval('.chip', e => e.textContent), 'photo widths', await pw(a), await pw(b))
if (await pw(a) !== 16) throw 'not 16'
// pair level (app-wide): each phone stores the level under the partner's tag, marked as set in the chat
const ptag = uid => createHash('sha256').update('pd-pair:' + uid).digest('hex').slice(0, 32)
const plv = async (p, q) => { const u = (await prof(q)).uid; return p.evaluate(t => JSON.parse(sessionStorage.getItem('pd.pairlv') || localStorage.getItem('pd.pairlv') || '{}')[t] || null, ptag(u)) }
const plv2 = async () => [await plv(a, b), await plv(b, a)]
{ let r; for (let i = 0; i < 30; i++) { r = await plv2(); if (r[0]?.lv === 2 && r[1]?.lv === 2) break; await sleep(200) }
  if (!(r[0]?.lv === 2 && r[0].drop && r[1]?.lv === 2 && r[1].drop)) throw 'pair level not stored at Spark ' + JSON.stringify(r); log('pair level stored on both phones:', JSON.stringify(r)) }
await tab(b, 'profile'); await t(b, '[data-t=season-badge]'); log('season badge at Spark:', await b.$eval('[data-t=season-badge]', e => e.textContent))
await b.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 }); await sleep(300); await clean(b); await shot(b, 'v3.9-match-bracket-412'); await b.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
await shot(b, '08-after-reveal-spark')
// drop from A
await a.click('[data-t=drop]'); await sleep(1500)
log('after A dropped:', await a.$eval('.chip', e => e.textContent), '/', await b.$eval('.chip', e => e.textContent), 'photo widths', await pw(a), await pw(b))
if (await pw(b) !== 8) throw 'drop not applied'
{ const r = await plv2(); if (r[0]?.lv !== 1 || r[1]?.lv !== 1) throw 'drop not stored ' + JSON.stringify(r); log('drop stored on both phones:', JSON.stringify(r)) }
// call
// call: request from the chat screen, B accepts
const shotW = async (p, n) => { for (const w of [360, 412]) { await p.setViewport({ width: w, height: 800, deviceScaleFactor: 2 }); await shot(p, `${n}-${w}`) } await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }) }
await tab(a, 'call'); await tab(b, 'chat'); await click(a, '[data-t=call-video]'); await t(a, '[data-t=ring-out]'); await shotW(a, '09a-call-request')
await t(b, '[data-t=ring-in]'); await shotW(b, '09b-incoming-request'); log('call request shown on B')
await b.click('[data-t=call-accept]')
await t(b, '[data-t=remote-video]'); log('accepted; call started')
if (!LB) await b.waitForFunction(() => { const v = document.querySelector('[data-t=remote-video]'); return v && v.videoWidth > 0 }, { timeout: 30000 })
await a.waitForFunction(() => { const v = document.querySelector('[data-t=remote-video]'); return v && v.videoWidth > 0 }, { timeout: 30000 })
await sleep(3000)
const vr = p => p.evaluate(() => { const v = document.querySelector('[data-t=remote-video]'); const s = v.srcObject.getVideoTracks()[0].getSettings(); return { w: v.videoWidth, h: v.videoHeight, sw: s.width, sh: s.height } })
const out = await a.evaluate(() => { const t = window.__pdCam.out.getVideoTracks()[0]; return { sent: window.__pdCam.out === document.querySelector('[data-t=remote-video]').srcObject.constructor && 1, w: t.getSettings().width, h: t.getSettings().height, rawW: window.__pdCam.stream.getVideoTracks()[0].getSettings().width } })
log('outgoing call track (what the peer receives):', JSON.stringify(out), 'raw camera stays local')
log('video element fed by call stream:', JSON.stringify(await vr(a)), LB ? '(loopback echo of the outgoing track)' : '')
if (!LB) log('B receives', JSON.stringify(await vr(b)))
if (out.w !== 8 || out.h !== 6) throw 'outgoing track not capped to 8x6 at Stranger: ' + JSON.stringify(out)
log('outgoing video track is exactly 8x6 at level 1')
// GD R3 fix 3: my PiP shows exactly what they receive (the outgoing pixelated track), never the raw camera
const pip = await a.evaluate(() => { const v = document.querySelector('[data-t=pip-video]'); const t = v?.srcObject?.getVideoTracks()[0]; return { same: !!t && t === window.__pdCam.out.getVideoTracks()[0], raw: !!t && t === window.__pdCam.stream.getVideoTracks()[0], w: t?.getSettings().width } })
if (!pip.same || pip.raw) throw 'PiP is not the outgoing track: ' + JSON.stringify(pip)
log('PiP shows the outgoing track (what they see):', JSON.stringify(pip))
// GD R4 fix 2: my own preview is mirrored in CSS only; the remote video and the outgoing track are not
const mir = await a.evaluate(() => { const pv = document.querySelector('[data-t=pip-video]'), rv = [...document.querySelectorAll('video')].find(v => v !== pv); return { pip: getComputedStyle(pv).transform, remote: rv ? getComputedStyle(rv).transform : 'none' } })
if (mir.pip !== 'matrix(-1, 0, 0, 1, 0, 0)' || /matrix\(-1/.test(mir.remote)) throw 'PiP mirror wrong: ' + JSON.stringify(mir)
log('self PiP mirrored (CSS only), remote not:', JSON.stringify(mir))
if (out.w > 32 || (await vr(a)).w > 32 || (!LB && (await vr(b)).w > 32)) throw 'video too detailed'
// block-content check on the received frame: 4x4 px cells should be uniform
const uni = await (LB ? a : b).evaluate(() => { const v = document.querySelector('[data-t=remote-video]'); const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const x = c.getContext('2d'); x.drawImage(v, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let distinct = new Set(); for (let i = 0; i < d.length; i += 4) distinct.add(d[i] >> 3 << 10 | d[i + 1] >> 3 << 5 | d[i + 2] >> 3); return { px: c.width * c.height, colours: distinct.size } })
log('received frame colour check', JSON.stringify(uni))
await shotW((LB ? a : b), '09c-call-pixelated')
await click(a, '[data-t=hangup]'); await b.waitForFunction(() => !document.querySelector('[data-t=remote-video]'), { timeout: 10000 }); await a.waitForFunction(() => !document.querySelector('[data-t=remote-video]')); log('hang up ended the call on both sides')
// dev skip-stage: A asks, B accepts, both move to Spark immediately
await tab(a, 'chat'); await tab(b, 'chat'); await click(a, '[data-t=skip-stage]'); await t(b, '[data-t=skip-in]'); await shotW(b, '11-skip-request')
await b.click('[data-t=skip-accept]'); await sleep(1500)
if (await pw(a) !== 16 || await pw(b) !== 16 || await ph(a) !== 16) throw 'skip did not raise to 16x16 photo'
log('skip accepted: both at', await a.$eval('.chip, [data-t=tab-profile]', e => e.textContent), 'photo payload 16x16')
// skip from B
for (const p of [a, b]) if (await p.$('[data-t=lvup]')) await p.click('[data-t=lvup-close]'); await sleep(300); await b.click('[data-t=skip]'); await sleep(2000); for (const p of [a, b]) step('after skip: ' + (await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 120))))
await t(a, '[data-t=finding]'); await t(b, '[data-t=finding]'); log('Skip ended match; both returned to lobby and auto-search for the next match')
await shot(b, '10-after-skip')

// ── R5: matches history, settings that persist, unblock, delete (all data on this device) ──
for (const p of [a, b]) await click(p, '[data-t=cancel]')
await sleep(500)
const store = (p, js) => p.evaluate(js, LB)
const ST = lb => lb ? sessionStorage : localStorage
{ const n = await a.evaluate(() => window.__pdSounds || 0); if (!n) throw 'no level-up / combo sound played with Sounds on'; log('sounds on by default: played', n, '8-bit cues') }
await click(a, '[data-t=top-settings]'); await t(a, '[data-t=page-settings]'); await click(a, '[data-t=top-matches]'); await t(a, '[data-t=page-matches]')
{ const rows = await a.$$eval('[data-t=hist-row]', r => r.map(e => e.textContent)); if (!rows.some(x => x.includes('Alex'))) throw 'history has no Alex: ' + JSON.stringify(rows)
  if (!(await a.$eval('[data-t=on-device]', e => /this device/i.test(e.textContent)))) throw 'matches page does not say data stays on the device'
  log('matches history shows the ended match:', rows[0].replace(/\s+/g, ' ').slice(0, 60)) }
await shot(a, 'r5-e2e-matches')
await click(a, '[data-t=top-settings]'); await t(a, '[data-t=page-settings]')
for (const k of ['set-view-compact', 'set-motion', 'set-solid', 'set-sounds']) await a.click(`[data-t=${k}]`)
const prefsNow = p => store(p, lb => { const s = lb ? sessionStorage : localStorage, h = document.documentElement
  return { view: s.getItem('pd.view'), motion: s.getItem('pd.motion'), solid: s.getItem('pd.solid'), sounds: s.getItem('pd.sounds'), dm: h.dataset.motion || null, ds: 'solid' in h.dataset, dur: getComputedStyle(h).getPropertyValue('--dur-fast').trim() } })
{ const r = await prefsNow(a); if (r.view !== 'compact' || r.motion !== 'on' || r.solid !== 'on' || r.sounds !== 'off' || r.dm !== 'reduce' || !r.ds || r.dur !== '0s') throw 'settings not applied ' + JSON.stringify(r) }
await a.reload({ waitUntil: 'networkidle0' }); await t(a, '[data-t=find]') // returning user: straight to the lobby, profile + photo restored from this device
{ const r = await prefsNow(a); if (r.view !== 'compact' || r.motion !== 'on' || r.solid !== 'on' || r.sounds !== 'off' || r.dm !== 'reduce' || !r.ds || r.dur !== '0s') throw 'settings lost on reload ' + JSON.stringify(r)
  if (!(await a.$('.lobbycard img, [data-t=me-photo], .who img'))) throw 'photo not restored on reload' }
await click(a, '[data-t=top-settings]'); await t(a, '[data-t=page-settings]')
{ const r = await a.evaluate(() => Object.fromEntries(['set-motion', 'set-solid', 'set-sounds'].map(k => [k, document.querySelector(`[data-t=${k}]`).getAttribute('aria-checked')]).concat([['compact', document.querySelector('[data-t=set-view-compact]').getAttribute('aria-pressed')]])))
  if (r['set-motion'] !== 'true' || r['set-solid'] !== 'true' || r['set-sounds'] !== 'false' || r.compact !== 'true') throw 'settings UI after reload ' + JSON.stringify(r)
  log('each setting persists across a reload (view compact, reduce motion, solid panels, sounds off): storage, html[data-motion/data-solid], --dur-fast 0s, switches', JSON.stringify(r)) }
// pixel-gender: the picks were saved, and the You editors pre-select the saved value and save a change
{ const pr = await store(a, lb => JSON.parse((lb ? sessionStorage : localStorage).getItem('pd.profile'))); if (pr.iam !== 'woman' || pr.seek !== 'men') throw 'signup picks not saved ' + JSON.stringify(pr) }
await click(a, '[data-t=top-profile]'); await click(a, '[data-t=edit-iam]'); await t(a, '.setrow .pg')
{ const r = await a.evaluate(() => ({ v: [...document.querySelectorAll('input[name=iam]:checked')].map(e => e.value), on: [...document.querySelectorAll('[data-t^=iam-].on')].map(e => e.dataset.t) }))
  if (r.v.join() !== 'woman' || r.on.join() !== 'iam-woman') throw 'I am editor does not pre-select the saved value ' + JSON.stringify(r) }
await a.focus('[data-t=iam-woman] input'); await a.keyboard.press('ArrowLeft'); await a.click('[data-t=edit-save]'); await sleep(200)
{ const pr = await store(a, lb => JSON.parse((lb ? sessionStorage : localStorage).getItem('pd.profile'))); if (pr.iam !== 'man') throw 'I am edit not saved ' + JSON.stringify(pr) }
await click(a, '[data-t=edit-seek]'); await t(a, '.setrow .pg--3')
{ const r = await a.evaluate(() => ({ v: [...document.querySelectorAll('input[name=seek]:checked')].map(e => e.value), order: [...document.querySelectorAll('.pg--3 .pg-card')].map(e => e.dataset.t), h: [...new Set([...document.querySelectorAll('.pg--3 .pg-card')].map(e => e.getBoundingClientRect().height))] }))
  if (r.v.join() !== 'men' || r.order.join() !== 'seek-women,seek-men,seek-everyone' || r.h.length !== 1) throw 'I want to meet editor ' + JSON.stringify(r) }
await a.click('[data-t=seek-everyone]'); await a.click('[data-t=edit-save]'); await sleep(200)
{ const pr = await store(a, lb => JSON.parse((lb ? sessionStorage : localStorage).getItem('pd.profile'))); if (pr.iam !== 'man' || pr.seek !== 'everyone') throw 'I want to meet edit not saved ' + JSON.stringify(pr)
  log('signup picks saved (woman / men); You editors pre-select the saved value (3-up Women/Men/Everyone, equal heights), keyboard + click changes saved:', JSON.stringify({ iam: pr.iam, seek: pr.seek })) }
await click(a, '[data-t=top-settings]'); await t(a, '[data-t=page-settings]')
// unblock: a blocked person (as Skip & block stores them) is listed and can be unblocked
await store(a, lb => (lb ? sessionStorage : localStorage).setItem('pd-blocked', JSON.stringify([{ uid: 'x-robin', name: 'Robin', br: [30, 34], at: Date.now() - 864e5 }])))
await click(a, '[data-t=top-matches]'); await click(a, '[data-t=top-settings]'); await t(a, '[data-t=blocked-row]')
if (!(await a.$eval('[data-t=blocked-row]', e => e.textContent)).includes('Robin')) throw 'blocked row'
await a.click('[data-t=unblock]'); await t(a, '[data-t=blocked-empty]')
{ const bl = await store(a, lb => (lb ? sessionStorage : localStorage).getItem('pd-blocked')); if (bl.includes('x-robin')) throw 'unblock not stored ' + bl; log('unblock removes the row and the stored entry:', bl) }
// delete profile: in-app confirm (never window.confirm), then nothing of Pixeldate is left on this device
await a.click('[data-t=delete]'); await t(a, '[data-t=confirm-delete][role=alertdialog]'); await shot(a, 'r5-e2e-delete-confirm')
await Promise.all([a.waitForNavigation({ waitUntil: 'networkidle0' }), a.click('[data-t=confirm-delete-yes]')]); await t(a, '[data-t=name]')
{ const r = await a.evaluate(async () => ({ keys: [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter(k => /^pd[-.]/.test(k) && !['pd-uid', 'pd-dev'].includes(k)), dbs: (await indexedDB.databases()).map(d => d.name).filter(n => n.startsWith('pixeldate')), html: document.documentElement.dataset.motion || null }))
  if (r.keys.length || r.dbs.length || r.html) throw 'delete left data ' + JSON.stringify(r)
  if (dialogs) throw dialogs + ' native dialogs were opened'
  log('delete profile (in-app confirm, 0 native dialogs) wiped local data (pd-uid / pd-dev are recreated on boot by the signup / ?dev=1): other pd.* keys', JSON.stringify(r.keys), 'IndexedDB', JSON.stringify(r.dbs), '-> signup') }

// ── refine reveal privacy: the level-up refine may only use the two frames the partner sent (src/refine/level.ts) ──
async function revealCheck(p, n, from, to) {
  await p.waitForFunction(f => (window.__pdRevealLog || []).some(l => l.to === f), { timeout: 15000 }, to)
  const reqs = []; const onReq = r => { const u = r.url(); if (!u.startsWith('data:') && (/\.(webp|jpe?g|png|avif|rr)(\?|$)/.test(u) || ['image', 'fetch', 'xhr'].includes(r.resourceType()))) reqs.push(u) }
  p.on('request', onReq); const res0 = await p.evaluate(() => performance.getEntriesByType('resource').length)
  await sleep(1900) // let the 1.2 s refine (+ the 400 ms hold) finish
  p.off('request', onReq)
  const r = await p.evaluate(async (from, to, res0) => {
    const L = window.__pdRevealLog.filter(l => l.to === to).at(-1), recv = window.__pdRecv
    const last = lv => recv.filter(x => x.level === lv).at(-1)?.src
    const px = src => new Promise(ok => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const x = c.getContext('2d'); x.drawImage(i, 0, 0); ok({ w: c.width, d: x.getImageData(0, 0, c.width, c.height).data }) }; i.src = src })
    const A = await px(L.srcA), B = await px(L.srcB), n = 1 << L.lo
    // independent re-derivation from the RECEIVED frames only: cell samples of a, b (box mean only for the full photo)
    const want = (P, m, avg) => { const o = []; const s = P.w / m; for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) { let R = 0, G = 0, Bl = 0, k = 0
      const ys = avg ? [Math.floor(y * s), Math.floor((y + 1) * s)] : [Math.floor((y + .5) * s), Math.floor((y + .5) * s) + 1], xs = avg ? [Math.floor(x * s), Math.floor((x + 1) * s)] : [Math.floor((x + .5) * s), Math.floor((x + .5) * s) + 1]
      for (let yy = ys[0]; yy < ys[1]; yy++) for (let xx = xs[0]; xx < xs[1]; xx++) { const q = (yy * P.w + xx) * 4; R += P.d[q]; G += P.d[q + 1]; Bl += P.d[q + 2]; k++ } o.push(R / k, G / k, Bl / k, 255) } return o }
    const diff = (got, w) => { let m = 0; for (let i = 0; i < w.length; i++) m = Math.max(m, Math.abs(got[i] - w[i])); return got.length === w.length ? m : 999 }
    return { from: L.from, to: L.to, lo: L.lo, maxD: L.maxD, mode: L.mode, prep: L.prep, aW: A.w, bW: B.w, n,
      srcA: L.srcA === last(from), srcB: L.srcB === last(to), coarse: diff(L.coarse, want(A, n, false)), fine: diff(L.fine, want(B, 2 * n, to === 5)),
      newRes: performance.getEntriesByType('resource').slice(res0).map(e => e.name).filter(u => !u.startsWith('data:')), frames: L.frames.length, fmax: Math.max(...L.frames) }
  }, from, to, res0)
  const fullOK = to === 5 ? r.bW === 512 : r.bW === 2 * r.aW
  if (r.from !== from || r.to !== to || !r.srcA || !r.srcB || r.maxD !== r.lo + 1 || r.aW !== r.n || !fullOK || r.coarse > 1 || r.fine > 1 || reqs.length || r.newRes.length)
    throw `${n}: level-up refine used something other than the two received frames ` + JSON.stringify({ ...r, reqs })
  log(`${n}: level-up refine ${from}->${to} built only from the 2 received frames (srcs match __pdRecv, tree depth ${r.lo}->${r.maxD} = ${r.n}->${2 * r.n} grid, grids re-derived from the received images: max diff coarse ${r.coarse} / fine ${r.fine}, 0 image/fetch requests during the reveal) · ${r.mode}/${r.prep}, ${r.frames} frames, worst ${r.fmax.toFixed(2)} ms`)
}
// ── finding loop + 4->5 reveal on the mock partner (deterministic: ?capture drives a virtual clock) ──
async function refineMock() {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1440, height: 900 })
  p.on('pageerror', e => console.log('  PAGEERR mock', e.message))
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  await p.evaluateOnNewDocument(c => { window.__pdMock = c; window.__pdRevealLog = []; window.__pdRecv = [] }, mockCfg({ scene: 'finding' }))
  await p.goto(BASE + '?capture=1&seed=4242', { waitUntil: 'networkidle0' }); await p.waitForFunction(() => window.__rr, { timeout: 15000 })
  const r = await p.evaluate(async () => { await window.__rr.ready; const caps = [], seen = []; let ms = 0, lastPhase = ''
    while (window.__rr.stats.shown.length < 10 && ms < 120000) { ms += 1000 / 30; await window.__rr.frame(ms); const ph = window.__rr.phase()
      if (ph !== lastPhase) { lastPhase = ph; if (ph === 'hold') { await window.__rr.frame(ms += 400); caps.push(document.querySelector('.rr-cap').textContent) } if (ph === 'reveal') seen.push(document.querySelector('.rr-cap').textContent) } }
    return { mode: window.__rr.mode, prep: window.__rr.prep(), shown: window.__rr.stats.shown, caps, seen: [...new Set(seen)], css: document.querySelector('.rr canvas').getBoundingClientRect().width }
  })
  const rep = r.shown.some((x, i) => i && x === r.shown[i - 1]), first7 = new Set(r.shown.slice(0, 7)).size
  // the Date Night set: the caption payoff is the board's chip text alone, per image
  const DN = { 'cinema-seats': 'Movie night', 'diner-milkshake': 'Two straws', 'shared-umbrella': 'Stay dry?', 'dusk-picnic': 'Picnic?', 'ferris-wheel': 'Top view', 'coffee-cups': 'Coffee?', 'rooftop-bikes': 'Ride along' }
  const capsOK = r.caps.every((c, i) => c === DN[r.shown[i]]), setOK = r.shown.every(x => x in DN) && new Set(r.shown.slice(0, 7)).size === 7
  if (rep || first7 !== 7 || !setOK || r.shown[0] !== 'cinema-seats' || r.caps.length < 8 || !capsOK || r.seen.join() !== 'Warming up…' || r.css < 560)
    throw 'finding loop ' + JSON.stringify(r)
  log(`finding loop (${r.mode}, prep in ${r.prep}): ${r.shown.length} images, first cinema-seats, all 7 Date Night images in the first 7, no immediate repeats; caption "Warming up…" while refining, payoff = chip text (${r.caps.slice(0, 3).map(c => '"' + c + '"').join(', ')}…); canvas ${r.css} css px at 1440`)
  // a second seed also opens on the cinema
  await p.goto(BASE + '?capture=1&seed=99', { waitUntil: 'networkidle0' }); await p.waitForFunction(() => window.__rr)
  const f2 = await p.evaluate(async () => { await window.__rr.ready; return window.__rr.stats.shown[0] }); if (f2 !== 'cinema-seats') throw 'finding first image ' + f2
  // reduced motion: 8 -> 16 -> 32 -> sharp, no splits
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await p.goto(BASE + '?capture=1&seed=7', { waitUntil: 'networkidle0' }); await p.waitForFunction(() => window.__rr)
  const rm = await p.evaluate(async () => { await window.__rr.ready; const ph = []; for (let ms = 0; ms < 5000; ms += 50) { await window.__rr.frame(ms); ph.push(window.__rr.phase()) } return { reduced: window.__rr.reduced, phases: [...new Set(ph)] } })
  if (!rm.reduced || rm.phases.join() !== 'rm') throw 'reduced-motion finding ' + JSON.stringify(rm)
  log('reduced motion: finding steps 8/16/32/sharp only (phases ' + rm.phases.join() + ')')
  // the 4 -> 5 reveal (to the received full photo) on the mock partner
  await ctx.close(); const c2 = await browser.createBrowserContext(); const q = await c2.newPage(); await q.setViewport({ width: 1440, height: 900 })
  await q.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  await q.evaluateOnNewDocument(c => { window.__pdMock = c; window.__pdRevealLog = []; window.__pdRecv = []; try { localStorage.setItem('pd.view', 'stage') } catch {} }, mockCfg({ level: 4, pct: 100, tab: 'profile' }))
  await q.goto(BASE, { waitUntil: 'networkidle0' }); await q.waitForFunction(() => window.__pdMockReady, { timeout: 15000 }); await sleep(800)
  await q.evaluate(() => window.__pdMockApi.raise(4)); await revealCheck(q, 'mock 4->5', 4, 5)
  await c2.close()
}
await refineMock()
// standalone ?avatar=flow (reachable on the live site): no step label (it isn't inside signup), no raw options JSON;
// the JSON shows only with &avatar=debug
async function flowPage() {
  const ctx = await browser.createBrowserContext(), p = await ctx.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
  const run = async q => { await p.goto(BASE + q, { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-t=av-hand]'); const s0 = await p.$('[data-t=av-step]')
    await p.click('[data-t=av-hand]'); await p.waitForSelector('[data-t=av-looks]'); await p.click('[data-t=av-looks]'); await p.waitForFunction(() => document.documentElement.dataset.avatarFlow === 'done')
    return p.evaluate(s0 => ({ step: s0 || !!document.querySelector('[data-t=av-step]'), copy: document.querySelector('.av-p')?.textContent, json: document.querySelector('#av-saved')?.textContent ?? null, body: document.body.innerText }), !!s0) }
  const r = await run('?avatar=flow')
  if (r.step || r.copy !== 'Saved as a tiny character file. Your photo is never kept.' || r.json !== null || /\{"v"|bytes|Step \d of/.test(r.body)) throw 'flow page leaks debug/step text ' + JSON.stringify(r)
  const d = await run('?avatar=flow&avatar=debug'); if (!d.json?.startsWith('{')) throw 'flow&debug should show the options JSON ' + JSON.stringify(d)
  log('?avatar=flow: no step label, no raw JSON, new saved copy; &avatar=debug shows the options JSON'); await ctx.close()
}
await flowPage()
// 18+ (LOOPBACK): the confirmation panel is required and accessible; a peer hello with an under-18, missing or invalid
// bracket is refused (a valid one is accepted, so the harness itself is proven); a stored under-18 profile is sent back
// through Birthday + the 18+ confirmation on the next load
async function ageGate() {
  const k = await page('Kim', 'woman', 'men', 27, 'sam')
  const ui = await k.evaluate(() => { const i = document.querySelector('[data-t=adult]'), r = i.getBoundingClientRect(), tg = document.querySelector('[data-t=adult-box]').getBoundingClientRect(), card = document.querySelector('[data-t=adult-card]')
    return { role: i.getAttribute('role'), req: i.required, lab: document.getElementById(i.getAttribute('aria-labelledby'))?.textContent, desc: document.getElementById(i.getAttribute('aria-describedby'))?.textContent,
      hidden: r.width <= 1, toggle: tg.width >= 40, panel: card.tagName === 'LABEL' && card.classList.contains('card') && card.classList.contains('fx'), checked: i.checked } })
  if (ui.role !== 'switch' || !ui.req || ui.lab !== "I'm 18 or over" || !/adults only/.test(ui.desc) || !ui.hidden || !ui.toggle || !ui.panel || !ui.checked) throw '18+ confirmation ' + JSON.stringify(ui)
  await k.$eval('[data-t=adult]', e => e.click()); if (!(await k.$eval('[data-t=start]', e => e.disabled))) throw 'start enabled without 18+ confirmation'
  await k.focus('[data-t=adult]'); await k.keyboard.press('Space'); await sleep(100); if (await k.$eval('[data-t=start]', e => e.disabled)) throw 'Space did not confirm 18+'
  log('18+ confirmation: card panel + pixel toggle (role=switch, required, labelled + described), Continue disabled until confirmed, Space confirms', JSON.stringify(ui))
  await click(k, '[data-t=start]'); await k.waitForFunction(() => /\w{6}/.test(document.querySelector('[data-t=code]')?.textContent.replace(/\W/g, '') || ''), { timeout: 20000 })
  const code = (await k.$eval('[data-t=code]', e => e.textContent)).replace(/[^a-z0-9]/gi, '').toLowerCase()
  const ev = wrap(await shared.newPage()); await ev.goto(new globalThis.URL('../', BASE).href, { waitUntil: 'domcontentloaded' })
  const hello = (p) => ev.evaluate((to, p) => new Promise(ok => { const bc = new BroadcastChannel('pd-loopback'), cid = Math.random().toString(36).slice(2, 10)
    const done = v => { bc.close(); ok(v) }; setTimeout(() => done('timeout'), 12000)
    bc.onmessage = ({ data: m }) => { if (m.cid !== cid) return
      if (m.k === 'ack') setTimeout(() => bc.postMessage({ k: 'data', cid, side: false, d: { t: 'hello', p } }), 300)
      else if (m.k === 'data' && m.side === true) done(m.d?.t) }
    bc.postMessage({ k: 'conn', to, from: 'pd-agetest', cid }) }), 'pd-' + code, p)
  const base = { name: 'Eve', min: 18, max: 70, iam: 'man', seek: 'women', uid: 'agetest-' + Date.now() }
  const cases = [['under-18 bracket', { ...base, br: [16, 17] }], ['missing bracket', { ...base }], ['invalid bracket', { ...base, br: [18, 30] }], ['bracket not numbers', { ...base, br: ['18', '24'] }], ['range below 18', { ...base, br: [18, 24], min: 16 }], ['no profile', undefined]]
  for (const [n, p] of cases) { const r = await hello(p); if (r !== 'no') throw `hello with ${n} was not refused: ${r}` }
  const okr = await hello({ ...base, br: [18, 24] }); if (okr !== 'ok') throw 'valid 18+ hello was refused: ' + okr
  log('hello validation: under-18 / missing / invalid / non-numeric bracket, range below 18 and no profile all get "no"; a valid 18–24 hello gets "ok"')
  await ev.close()
  // restore gate: make the stored profile 16 and reload
  const y16 = new Date().getFullYear() - 16
  await k.evaluate(y => { const p = JSON.parse(sessionStorage.getItem('pd.profile')); p.by = y; sessionStorage.setItem('pd.profile', JSON.stringify(p)) }, y16)
  await k.reload({ waitUntil: 'networkidle0' }); await t(k, '[data-t=recheck]')
  { const r = await k.evaluate(() => ({ step: document.querySelector('.app.flow')?.dataset.step, next: document.querySelector('[data-t=next]').disabled, lobby: !!document.querySelector('[data-t=find]'), month: document.querySelectorAll('[data-t^=month-][aria-checked=true]').length }))
    if (r.step !== '4' || !r.next || r.lobby || r.month) throw 'under-18 stored profile not sent back to Birthday ' + JSON.stringify(r) }
  await pickBday(k, new Date().getFullYear() - 27, 1); await click(k, '[data-t=next]'); await t(k, '[data-t=start]')
  { const r = await k.evaluate(() => ({ adult: document.querySelector('[data-t=adult]').checked, start: document.querySelector('[data-t=start]').disabled, seek: document.querySelector('input[name=seek]:checked')?.value }))
    if (r.adult || !r.start || r.seek !== 'men') throw 'restore: 18+ confirmation not required again ' + JSON.stringify(r) }
  await k.$eval('[data-t=adult]', e => e.click()); await click(k, '[data-t=start]'); await t(k, '[data-t=find]')
  const by = await k.evaluate(() => JSON.parse(sessionStorage.getItem('pd.profile')).by); if (by !== new Date().getFullYear() - 27) throw 'restore: birthday not re-saved ' + by
  log('stored under-18 profile: next load opens Birthday (month re-pick, Continue blocked), then requires the 18+ confirmation again before the lobby')
  await k.close()
}
if (LB) await ageGate()
await browser.close(); console.log('ALL OK')
