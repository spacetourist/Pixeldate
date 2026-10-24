import puppeteer from 'puppeteer-core'
const LB = !!process.env.LOOPBACK
const URL = (process.env.URL || 'http://localhost:4173/Pixeldate/app/') + (LB ? '?loopback&dev=1' : '?dev=1')
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
  p.on('dialog', d => { dialogs++; d.accept() }); p.on('pageerror', e => console.log('  PAGEERR', name, e.message))
  step('goto ' + name); await p.goto(URL, { waitUntil: 'networkidle0' }); step('loaded'); await p.waitForFunction(() => !document.querySelector('[data-t=splash]'), { timeout: 10000 })
  if (name === 'Sam') await shotV(p, 'v3.6-signup-empty-412')
  // R2: the signup is a 4-step split (You · Your photo · Birthday · Who you'd like to meet); each step has its own Continue
  await p.type('[data-t=name]', name); await p.click(`[data-t=iam-${iam}]`)
  if (!(await p.$eval(`[data-t=iam-${iam}] input`, e => e.checked)) || (await p.$$('[data-t^=iam-].on')).length !== 1) throw 'iam radio state'
  await p.click('[data-t=next]')
  await p.waitForSelector('[data-t=add-selfie]'); if (!(await p.$eval('[data-t=next]', e => e.disabled))) throw 'photo step continues without a photo'
  await (await p.$('[data-t=gallery]')).uploadFile(`/workspace/pixeldate/test/fixtures/${face}.jpg`)
  await p.waitForSelector('[data-t=reveal-skip]:not(.hid)', { timeout: 10000 }); await p.click('[data-t=reveal-skip]') // skip the ladder's first pass
  await p.waitForSelector('.rv-acts:not(.hid) [data-t=photo-confirm]')
  await p.waitForSelector('[data-t=mini-5] img'); if ((await p.$$('[data-t=minis] img')).length !== 5) throw '5 minis missing'
  if (name === 'Sam') { await p.click('[data-t=mini-3]'); await p.waitForSelector('[data-t=viewer]'); const w = await p.$eval('[data-t=viewer] img', e => e.naturalWidth); if (w !== 32) throw 'viewer not 32 blocks: ' + w
    await shotV(p, 'v3.6-viewer-412', false); await p.click('[aria-label="Next level"]'); if (!(await p.$eval('[data-t=viewer-name]', e => e.textContent)).includes('LV 4')) throw 'viewer next'
    await p.click('[data-t=viewer-close]'); await sleep(200); if (await p.$('[data-t=viewer]')) throw 'viewer did not close'; log('5 minis; viewer opens at 32 blocks, next works, X closes') }
  await p.click('[data-t=photo-confirm]'); await p.waitForSelector('[data-t=bday]')
  if (name === 'Sam') { // under-18 block: born this month next year-boundary -> 17
    const now = new Date(), m = now.getMonth() + 2
    if (m <= 12) { await pickBday(p, now.getFullYear() - 18, m); await p.waitForSelector('[data-t=under18]')
      if (!(await p.$eval('[data-t=next]', e => e.disabled))) throw 'under-18 not blocked'; log('under-18 birthday blocks Continue and shows the message') }
    await shotV(p, 'v3.9-birthday-under18-412', true) }
  await pickBday(p, new Date().getFullYear() - age, 1)
  if (await p.$('[data-t=under18]')) throw 'under18 shown for adult'
  if (name === 'Sam') { const r = await p.$eval('[data-t=bday-readout]', e => e.textContent); if (!r.includes("You're " + age) || !r.includes('Winter-born') || !r.includes('25–29')) throw 'readout ' + r; log('birthday readout:', r) }
  await p.click('[data-t=next]'); await p.waitForSelector('[data-t=start]')
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
{ const st = () => a.evaluate(() => ({ c: document.querySelector('[data-t=adult]').checked, svg: !!document.querySelector('[data-t=adult-box] svg'), btn: !document.querySelector('[data-t=start]').disabled }))
  const lab = async () => { const r = await a.evaluate(() => { const b = document.querySelector('label.tick').getBoundingClientRect(); return [b.right - 30, b.top + b.height / 2] }); await a.mouse.click(...r) }
  const box = async () => { const r = await a.evaluate(() => { const b = document.querySelector('[data-t=adult-box]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2] }); await a.mouse.click(...r) }
  await a.$eval('label.tick', e => e.scrollIntoView({ block: 'center' })); await sleep(200)
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
const nameA = await b.$eval('.plate', e => e.textContent); log('B sees', nameA); if (await b.$('[data-t=season-badge]')) throw 'season shown at Stranger'; if (!nameA.includes('Sam, 25–29')) throw 'bracket not shown'
{ const th = await b.evaluate(() => window.__pdThem); const bad = ['age', 'by', 'bm'].filter(k => k in th); if (bad.length || JSON.stringify(th).includes(String(new Date().getFullYear() - 29))) throw 'birthday leaked: ' + JSON.stringify(th); log('peer received only the bracket:', JSON.stringify(th.br), 'keys', Object.keys(th).join(',')) }
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
log('level-up event on both:', await a.$eval('[data-t=lvup-name]', e => e.textContent), '/', await b.$eval('[data-t=lvup-name]', e => e.textContent))
for (const p of [a, b]) await p.click('[data-t=lvup-close]'); await sleep(500)
log('after both tapped:', await a.$eval('.chip', e => e.textContent), '/', await b.$eval('.chip', e => e.textContent), 'photo widths', await pw(a), await pw(b))
if (await pw(a) !== 16) throw 'not 16'
await tab(b, 'profile'); await t(b, '[data-t=season-badge]'); log('season badge at Spark:', await b.$eval('[data-t=season-badge]', e => e.textContent))
await b.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 }); await sleep(300); await clean(b); await shot(b, 'v3.9-match-bracket-412'); await b.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
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
await browser.close(); console.log('ALL OK')
