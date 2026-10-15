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
async function shotV(p, n, full = true) { await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 }); await sleep(250); await p.screenshot({ path: S(n), fullPage: full }); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }) }
const setR = (p, sel, v) => p.$eval(sel, (e, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })) }, String(v))
async function page(name, iam, seek, age, face) {
  const ctx = LB ? (shared ||= await browser.createBrowserContext()) : await browser.createBrowserContext(); const p = await ctx.newPage()
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
  p.on('console', m => { if (!/404/.test(m.text())) console.log(`  [${name}]`, m.text().slice(0, 150)) })
  p.on('dialog', d => d.accept()); p.on('pageerror', e => console.log('  PAGEERR', name, e.message))
  step('goto ' + name); await p.goto(URL, { waitUntil: 'networkidle0' }); step('loaded'); await p.waitForFunction(() => !document.querySelector('[data-t=splash]'), { timeout: 10000 })
  if (name === 'Sam') await shotV(p, 'v3.6-signup-empty-412')
  await p.type('[data-t=name]', name); await (await p.$('[data-t=gallery]')).uploadFile(`/workspace/pixeldate/test/fixtures/${face}.jpg`)
  await p.waitForSelector('[data-t=reveal-skip]:not(.hid)', { timeout: 10000 }); await p.click('[data-t=reveal-skip]') // skip the onboarding reveal
  await p.waitForSelector('.rv-acts:not(.hid) [data-t=photo-confirm]'); await p.click('[data-t=photo-confirm]')
  await p.click(`[data-t=iam-${iam}]`); await p.click(`[data-t=seek-${seek}]`)
  await p.waitForSelector('[data-t=mini-5] img'); if ((await p.$$('[data-t=minis] img')).length !== 5) throw '5 minis missing'
  if (!(await p.$eval(`[data-t=iam-${iam}] input`, e => e.checked)) || (await p.$$('[data-t^=iam-].on')).length !== 1) throw 'iam radio state'
  await p.$eval('[data-t=age]', (e, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })) }, String(age))
  await p.$eval('[data-t=adult]', e => e.click())
  if (name === 'Sam') { await shotV(p, 'v3.6-signup-filled-412'); await p.click('[data-t=mini-3]'); await p.waitForSelector('[data-t=viewer]'); const w = await p.$eval('[data-t=viewer] img', e => e.naturalWidth); if (w !== 32) throw 'viewer not 32 blocks: ' + w
    await shotV(p, 'v3.6-viewer-412', false); await p.click('[aria-label="Next level"]'); if (!(await p.$eval('[data-t=viewer-name]', e => e.textContent)).includes('LV 4')) throw 'viewer next'
    await p.click('[data-t=viewer-close]'); await sleep(200); if (await p.$('[data-t=viewer]')) throw 'viewer did not close'; log('5 minis; viewer opens at 32 blocks, next works, X closes') }
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
  if (AGE) { console.log('  age case: Ann (woman, 30) wants men 25-30; Ben (man, 41) wants everyone 18-99'); await a.$eval('[data-t=max]', e => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, '30'); e.dispatchEvent(new Event('input', { bubbles: true })) }) }
  for (const p of [a, b]) { await click(p, '[data-t=start]'); await t(p, '[data-t=code]'); await sleep(1000) }
  await a.click('[data-t=find]'); await sleep(1500); await b.click('[data-t=find]'); for (let i = 0; i < 10; i++) { await a.evaluate(() => 1); await sleep(1000); await b.evaluate(() => 1); await sleep(1000) }
  const matched = (await a.$('[data-t=their-photo]')) || (await b.$('[data-t=their-photo]'))
  console.log(matched ? '✘ incompatible pair matched' : '✔ incompatible pair did not match in 25 s'); await browser.close(); process.exit(matched ? 1 : 0)
}
// compatible: woman 29 seeking men 25-40 and man 31 seeking everyone 18-99
const a = await page('Sam', 'woman', 'men', 29, 'sam'), b = await page('Alex', 'man', 'women', 31, 'alex')
await setR(a, '[data-t=min]', 25); await setR(a, '[data-t=max]', 40)
{ const v = await a.$eval('[data-t=range-val]', e => e.textContent); if (v !== '25 – 40') throw 'range ' + v
  await setR(a, '[data-t=min]', 50); if (await a.$eval('[data-t=range-val]', e => e.textContent) !== '40 – 40') throw 'thumbs crossed'; await setR(a, '[data-t=min]', 25)
  if (await b.$eval('[data-t=range-val]', e => e.textContent) !== '18 – 70+') throw 'default range'; log('age range slider: 25 – 40, thumbs cannot cross, default 18 – 70+') }
await shot(a, '01-onboarding')
{ const st = () => a.evaluate(() => ({ c: document.querySelector('[data-t=adult]').checked, svg: !!document.querySelector('[data-t=adult-box] svg'), btn: !document.querySelector('[data-t=start]').disabled }))
  const lab = async () => { const r = await a.evaluate(() => { const b = document.querySelector('label.tick').getBoundingClientRect(); return [b.right - 30, b.top + b.height / 2] }); await a.mouse.click(...r) }
  const box = async () => { const r = await a.evaluate(() => { const b = document.querySelector('[data-t=adult-box]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2] }); await a.mouse.click(...r) }
  const seq = [lab, lab, lab, box, box, lab, box, box, box]  // 9 taps, no waits: ends unchecked->checked toggles; initial checked
  for (const f of seq) await f()
  await sleep(100); const r = await st(); if (r.c !== r.svg || r.c !== r.btn || r.c !== false) throw 'tick desync ' + JSON.stringify(r)
  await box(); await sleep(50); const r2 = await st(); if (!r2.c || !r2.svg || !r2.btn) throw 'tick desync2 ' + JSON.stringify(r2)
  log('18+ tick: 10 rapid label/box taps, tick, input and Continue stay in sync')
  for (const [w, n] of [[412, 'v3.5-signup-412'], [360, 'v3.5-signup-360']]) { await a.setViewport({ width: w, height: 915, deviceScaleFactor: 2 }); await sleep(200); await a.screenshot({ path: S(n), fullPage: true }) }
  await a.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }) }
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
// Q1 via the pinned card on A while B is on the call tab
await tab(a, 'chat'); await tab(b, 'call')
await click(a, '[data-t=pinned-card] [data-t=answer]'); await a.type('[data-t=ans-input]', 'Toast and coffee'); await a.click('[data-t=ans-send]')
await t(b, '[data-t=ans-turn]'); if ((await b.content()).includes('Toast and coffee')) throw 'partner answer leaked before B answered'
log('B (on call tab) sees "your turn"; answer text not in the DOM')
const shotW412 = async (p, n) => { await p.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 }); await shot(p, n); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }) }
await shotW412(b, 'v3.4-their-turn-412')
if (!(await a.$eval('.chat', e => e.textContent)).includes('YOU ANSWERED Q1')) throw 'A chat log missing Q1'
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
await click(a, '[data-t=card] button.px-btn-ghost'); // TO CHAT
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
await b.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 }); await shot(b, 'v3.4-levelup-412'); await b.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
log('level-up event on both:', await a.$eval('[data-t=lvup-name]', e => e.textContent), '/', await b.$eval('[data-t=lvup-name]', e => e.textContent))
for (const p of [a, b]) await p.click('[data-t=lvup-close]'); await sleep(500)
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
for (const p of [a, b]) if (await p.$('[data-t=lvup]')) await p.click('[data-t=lvup-close]'); await sleep(300); await b.click('[data-t=skip]'); await sleep(2000); for (const p of [a, b]) step('after skip: ' + (await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 120))))
await t(a, '[data-t=finding]'); await t(b, '[data-t=finding]'); log('Skip ended match; both returned to lobby and auto-search for the next match')
await shot(b, '10-after-skip')
await browser.close(); console.log('ALL OK')
