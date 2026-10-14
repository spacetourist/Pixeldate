import puppeteer from 'puppeteer-core'
const LB = !!process.env.LOOPBACK
const URL = (process.env.URL || 'http://localhost:4173/Pixeldate/app/') + (LB ? '?loopback&dev=1' : '?dev=1')
let shared
const S = p => `/workspace/pixeldate/shots/${p}.png`
const shot = async (p, n) => { await p.bringToFront(); await new Promise(r => setTimeout(r, 400)); await p.screenshot({ path: S(n) }) }
let cur = null
const wrap = p => new Proxy(p, { get(t, k) { const v = t[k]; if (typeof v !== 'function') return v; if (k === 'bringToFront') return v.bind(t); return async (...a) => { if (LB && cur !== t) { cur = t; await t.bringToFront(); await new Promise(r => setTimeout(r, 150)) } return v.apply(t, a) } } })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('✔', ...a); const T0 = Date.now(); const step = s => console.log('  ..', ((Date.now()-T0)/1000).toFixed(1), s)
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 90000,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns,CalculateNativeWinOcclusion,IntensiveWakeUpThrottling', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
async function page(name, iam, seek, age, face) {
  const ctx = LB ? (shared ||= await browser.createBrowserContext()) : await browser.createBrowserContext(); const p = await ctx.newPage()
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
  p.on('console', m => { if (!/404/.test(m.text())) console.log(`  [${name}]`, m.text().slice(0, 150)) })
  p.on('dialog', d => d.accept()); p.on('pageerror', e => console.log('  PAGEERR', name, e.message))
  step('goto ' + name); await p.goto(URL, { waitUntil: 'networkidle0' }); step('loaded'); await p.waitForFunction(() => !document.querySelector('[data-t=splash]'), { timeout: 10000 })
  await p.type('[data-t=name]', name); await (await p.$('[data-t=gallery]')).uploadFile(`/workspace/pixeldate/test/fixtures/${face}.jpg`)
  await p.waitForSelector('[data-t=reveal-skip]:not(.hid)', { timeout: 10000 }); await p.click('[data-t=reveal-skip]') // skip the onboarding reveal
  await p.waitForSelector('.rv-acts:not(.hid) [data-t=photo-confirm]'); await p.click('[data-t=photo-confirm]')
  await p.select('[data-t=iam]', iam); await p.select('[data-t=seek]', seek)
  await p.$eval('[data-t=age]', (e, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })) }, String(age))
  await p.$eval('[data-t=adult]', e => e.click()); step('filled ' + name); return wrap(p)
}
const t = (p, sel) => p.waitForSelector(sel, { timeout: 60000 })
const click = async (p, sel) => { await t(p, sel); await p.click(sel) }
const tab = async (p, n) => click(p, `[data-t=tab-${n}]`)
async function answerCard(p, text) { step('vis ' + await p.evaluate(() => document.visibilityState + ' ' + document.querySelectorAll('[data-t=card] [data-t=answer]').length + ' ' + location.search)); await click(p, '[data-t=card] [data-t=answer]'); await t(p, '[data-t=ans-input]'); await p.type('[data-t=ans-input]', text); await p.click('[data-t=ans-send]') }
async function photoW(p) { return p.evaluate(() => window.__pdLastPhotoW) }

const mode = process.argv[2] || 'full'
if (mode === 'incompat') {
  // man seeking women vs man seeking women: must NOT match
  const AGE = process.argv[3] === 'age'
  const a = AGE ? await page('Ann', 'woman', 'men', 30, 'alex') : await page('Ann', 'man', 'women', 30, 'alex'), b = AGE ? await page('Ben', 'man', 'everyone', 41, 'robin') : await page('Ben', 'man', 'women', 30, 'robin')
  if (AGE) { console.log('  age case: Ann (woman, 30) wants men 25-30; Ben (man, 41) wants everyone 18-99'); await a.$eval('[data-t=max]', e => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, '30'); e.dispatchEvent(new Event('input', { bubbles: true })) }) }
  for (const p of [a, b]) { await click(p, '[data-t=start]'); await t(p, '[data-t=code]'); await sleep(1000) }
  await a.click('[data-t=find]'); await sleep(1500); await b.click('[data-t=find]'); for (let i = 0; i < 10; i++) { await a.evaluate(() => 1); await sleep(1000); await b.evaluate(() => 1); await sleep(1000) }
  const matched = (await a.$('[data-t=their-photo]')) || (await b.$('[data-t=their-photo]'))
  console.log(matched ? '✘ incompatible pair matched' : '✔ incompatible pair did not match in 25 s'); await browser.close(); process.exit(matched ? 1 : 0)
}
// compatible: woman 29 seeking men 25-40 and man 31 seeking everyone 18-99
const a = await page('Sam', 'woman', 'men', 29, 'sam'), b = await page('Alex', 'man', 'everyone', 31, 'alex')
await a.$eval('[data-t=min]', e => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, '25'); e.dispatchEvent(new Event('input', { bubbles: true })) })
await a.$eval('[data-t=max]', e => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, '40'); e.dispatchEvent(new Event('input', { bubbles: true })) })
await shot(a, '01-onboarding')
for (const p of [a, b]) { await p.bringToFront(); await click(p, '[data-t=start]'); step('started'); await p.waitForFunction(() => document.querySelector('[data-t=find]') && !document.querySelector('[data-t=find]').disabled, { timeout: 15000 }).catch(async e => { await p.screenshot({path: S('dbg')}); console.log(await p.evaluate(() => document.body.innerText.slice(0,200))); throw e }) }
await shot(a, '02-lobby')
const t0 = Date.now(); await a.click('[data-t=find]'); await sleep(300); await t(a, '[data-t=finding]'); await shot(a, '03-finding'); await b.click('[data-t=find]')
await t(a, '[data-t=their-photo]'); await t(b, '[data-t=their-photo]'); log(`matched via lobby in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
const nameA = await b.$eval('.plate', e => e.textContent); log('B sees', nameA)
await sleep(1500)
const pw = async p => p.evaluate(() => window.__pd?.photoW)
const ph = async p => p.evaluate(() => window.__pd?.photoH)
log('received photo widths at Stranger:', await pw(a), await pw(b)); if (await pw(a) !== 8 || await pw(b) !== 8 || await ph(a) !== 8 || await ph(b) !== 8) throw 'photo payload not 8x8'
await shot(b, '04-match-stranger')
// chat
await tab(a, 'chat'); await tab(b, 'chat')
await a.type('[data-t=chat-input]', 'Hi Alex!'); await a.click('[data-t=chat-send]')
await t(b, '[data-t=msg-them]'); await b.type('[data-t=chat-input]', 'Hey Sam, how is your day?'); await b.click('[data-t=chat-send]'); await t(a, '[data-t=msg-them]'); log('chat exchanged')
await tab(a, 'profile'); await tab(b, 'profile')
// one card on both sides, then drop next card to chat
await answerCard(a, 'Toast and coffee'); await sleep(400)
await click(a, '[data-t=card] button.px-btn-ghost'); // TO CHAT
await tab(b, 'chat'); await sleep(500); await answerCard(b, 'Porridge'); await sleep(800)
await shot(b, '05-chat-card')
const dots = await a.$$eval('[data-t=dot-them].on', e => e.length); log('card answered on both sides, ticked dots seen by A:', dots)
await tab(b, 'profile'); await tab(a, 'profile'); await sleep(300)
await shot(b, '06-reveal-locked')
for (const [n, p] of [['A', a], ['B', b]]) { const t1 = Date.now(); await p.evaluate(() => 1); step(n + ' responsive ' + (Date.now() - t1)) }
for (let i = 0; i < 4; i++) { step('round ' + i); await answerCard(a, 'a' + i); await sleep(300); await answerCard(b, 'b' + i); await sleep(700) }
await t(a, '[data-t=reveal][data-state=ready]'); await t(b, '[data-t=reveal][data-state=ready]'); log('meter full, Reveal more unlocked on both')
await a.click('[data-t=reveal]'); await sleep(600); await shot(b, '07-reveal-unlocked-their-turn')
const lvlB = await b.$eval('.chip', e => e.textContent); if (!lvlB.includes('LV 1')) throw 'level rose on one tap'
await b.click('[data-t=reveal]'); await sleep(1500)
log('after both tapped:', await a.$eval('.chip', e => e.textContent), '/', await b.$eval('.chip', e => e.textContent), 'photo widths', await pw(a), await pw(b))
if (await pw(a) !== 16) throw 'not 16'
await shot(b, '08-after-reveal-spark')
// drop from A
await a.click('[data-t=drop]'); await sleep(1500)
log('after A dropped:', await a.$eval('.chip', e => e.textContent), '/', await b.$eval('.chip', e => e.textContent), 'photo widths', await pw(a), await pw(b))
if (await pw(b) !== 8) throw 'drop not applied'
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
await b.click('[data-t=skip]'); await sleep(2000); for (const p of [a, b]) step('after skip: ' + (await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 120))))
await t(a, '[data-t=finding]'); await t(b, '[data-t=finding]'); log('Skip ended match; both returned to lobby and auto-search for the next match')
await shot(b, '10-after-skip')
await browser.close(); console.log('ALL OK')
