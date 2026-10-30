// Pixeldate World v05 e2e (real Chrome, built app on vite preview :4173, Node dev world server, ?loopback for the call):
//   1 "here" count = the people in the room; a dead socket (no close frame) is pruned by the keepalive
//   2 Pixel You: a woman with no character gets GD's woman start look; a customised character is never overridden
//   3 private table chat: only the two seated see it (filtered); everyone else gets GD's typing strip over the table
//   4 the card: own answers, hidden until both answered, revealed together; 5-card meter per level (server-kept); level up
//   5 crisp integer-scaled Char portraits + the 64 pt header photo
//   6 Start call: locked until Level 3 · Crush, then both tap (decline / cancel / both) → the call in the café + couple heart
// shots → shots/world-cafe-v05/<state>-390.png / -1440.png      Run: node test/world-v05.mjs
import puppeteer from 'puppeteer-core'
process.env.WORLD_PORT = '18794'; process.env.WORLD_URL = 'ws://127.0.0.1:18794'; process.env.WORLD_STALE_MS = '3000'
await import('../world/dev/server.ts')
const { Bot, profile, sleep } = await import('../world/test/lib.mjs')
const { SAMPLES } = await import('../src/avatar/kit/kit.gen.ts')
const APP = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
const WQ = '?world=cafe&loopback&ws=ws://127.0.0.1:18794&invite=dev-invite-1&auto=1'
const OUT = '/workspace/pixeldate/shots/world-cafe-v05/'
let bad = 0, n = 0
const ok = (c, m) => { n++; if (c) console.log('✔', m); else { bad++; console.log('✘ FAIL', m) } }
const { createHash } = await import('node:crypto')
const until = async (f, ms = 6000, step = 60) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f(); if (v) return v; await sleep(step) } return null }
await sleep(300)

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 90000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-features=CalculateNativeWinOcclusion', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const PHONE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const ctx = await browser.createBrowserContext()   // one context: ?loopback keeps each tab's profile in its own sessionStorage, and FakePeer links the tabs
async function player(tag, vp, name, extra = {}) {
  const p = await ctx.newPage(); await p.setViewport(vp); p.tag = tag; p.sz = vp.width; p.touch = !!vp.hasTouch
  p.on('pageerror', e => { bad++; console.log('  PAGEERR', tag, e.message) }); p.on('console', m => { if (m.type() === 'error' && !/404|WebSocket/.test(m.text())) console.log(`  [${tag}]`, m.text().slice(0, 160)) })
  await p.evaluateOnNewDocument(() => { window.__gum = 0; const md = navigator.mediaDevices; if (md) { const g = md.getUserMedia.bind(md); md.getUserMedia = c => { window.__gum++; return g(c) } } })
  const uid = 'v05-' + tag + '-' + Date.now().toString(36)
  const prof = { name, age: 32, by: 1994, bm: 3, min: 26, max: 38, iam: 'man', seek: 'women', adult: true, uid, ...extra }
  await p.goto(APP + '?loopback&blank', { waitUntil: 'domcontentloaded' })
  await p.evaluate(async (pr, uid) => {
    sessionStorage.setItem('pd-uid', uid); sessionStorage.setItem('pd.profile', pr)
    const c = new OffscreenCanvas(240, 320), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 240, 320); gr.addColorStop(0, '#FF6F91'); gr.addColorStop(1, '#3D2C8D'); g.fillStyle = gr; g.fillRect(0, 0, 240, 320)
    g.fillStyle = '#FFE0C2'; g.beginPath(); g.arc(120, 130, 60, 0, 7); g.fill(); g.fillStyle = '#2A2150'; g.fillRect(40, 220, 160, 100)
    const b = await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 }), url = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b) })
    await new Promise((res, rej) => { const r = indexedDB.open('pixeldate-' + uid, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onerror = rej
      r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(url, 'photo'); t.oncomplete = () => { r.result.close(); res() } } })
  }, JSON.stringify(prof), uid)
  await p.goto(APP + WQ, { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-t=w-room]', { timeout: 20000 })
  p.prof = prof; return p
}
const shot = async (p, name) => { await sleep(400); await p.screenshot({ path: `${OUT}${name}-${p.sz}.png` }); console.log('  📷', `${name}-${p.sz}.png`) }
const st = p => p.evaluate(() => window.__world?.state())
const meEnt = async p => { const s = await st(p); return s?.ents.find(e => e.id === s.me) }
const entBy = async (p, name) => (await st(p))?.ents.find(e => e.name === name)
const front = async p => { if (front.cur !== p) { await p.bringToFront(); front.cur = p; await sleep(120) } }   // the tabs share a window (loopback); only the front one gets input
const tapAt = async (p, x, y) => { await front(p); return p.touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y) }
const press = async (p, sel) => { await front(p); return p.touch ? p.tap(sel) : p.click(sel) }
const typeIn = async (p, sel, t) => { await front(p); await p.type(sel, t) }
const count = p => p.$eval('[data-t=w-count]', e => +e.dataset.n).catch(() => -1)
const walkTo = async (p, tx, ty, ms = 15000) => {
  const there = async () => { const m = await meEnt(p); return m && Math.abs(m.x - tx - 0.5) < 0.6 && Math.abs(m.y - ty - 0.5) < 0.6 }
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await there()) return true
    const c = await p.$eval('[data-t=w-canvas]', c => c.getBoundingClientRect().toJSON()), [x, y] = await p.evaluate((a, b) => window.__world.tileCss(a, b), tx, ty)
    const m = 28, on = x > c.left + m && x < c.right - m && y > c.top + m && y < c.bottom - m
    if (on) { await tapAt(p, x, y); return !!(await until(there, ms - (Date.now() - t0))) }
    const cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2, dx = x - cx, dy = y - cy, k = Math.min((c.width / 2 - m) / Math.abs(dx || 1e-9), (c.height / 2 - m) / Math.abs(dy || 1e-9))
    await tapAt(p, cx + dx * k, cy + dy * k)
    let last = null; await until(async () => { const e = await meEnt(p); const still = last && Math.abs(e.x - last.x) < 0.01 && Math.abs(e.y - last.y) < 0.01; last = e; return still }, 4000, 250)
  }
  return there()
}
const tapPerson = async (p, name) => { const e = await entBy(p, name); const [x, y] = await p.evaluate(id => window.__world.css(id), e.id); await tapAt(p, x, y) }

// ── the people: Sam (phone, customised), Mia (desktop, a woman with no character yet), Kit (phone) + Ola (desktop) nearby
const sam = await player('sam', PHONE, 'Sam', { pav: JSON.stringify({ v: 1, ...SAMPLES[10] }) })
const mia = await player('mia', DESK, 'Mia', { iam: 'woman', seek: 'men' })
const kit = await player('kit', PHONE, 'Kit')
const ola = await player('ola', DESK, 'Ola', { iam: 'woman', seek: 'men', pav: JSON.stringify({ v: 1, ...SAMPLES[3] }) })
const all = [sam, mia, kit, ola]

// 1 ── count
ok(await until(async () => (await Promise.all(all.map(count))).every(c => c === 4), 8000), `count: everyone reads "4 here" with 4 people in (${(await Promise.all(all.map(count))).join(',')})`)
{ const z = new Bot(profile({ name: 'Zoe', iam: 'woman', seek: 'men', br: [30, 34], min: 28, max: 40 })); await z.connect(); console.log('  zed inst', z.inst, 'sees', z.ents.size, '· sam inst', (await st(sam)).inst)
  ok(await until(async () => (await count(sam)) === 5), 'count: a 5th person joins → 5 here')
  z.zombie()   // the socket stays open but goes silent (a phone that lost signal / a tab killed without a close frame)
  const t0 = Date.now(); ok(await until(async () => (await count(sam)) === 4, 12000, 200), `count: the silent socket is pruned → back to 4 here (${((Date.now() - t0) / 1000).toFixed(1)} s, stale after 3 s in this test)`)
  const s = await st(sam); ok(s.ents.length === 4 && (await count(sam)) === s.ents.length, `count: the number equals the people drawn (${s.ents.length})`)
  try { z.ws.terminate?.() ?? z.ws.close() } catch {} }
await shot(sam, 'v05-01-count'); await shot(mia, 'v05-01-count')

// 2 ── Pixel You start looks
{ const pubs = await sam.evaluate(() => [...window.__world.net.pubs.values()].map(p => ({ name: p.name, pav: p.pav })))
  const pv = nm => { try { return JSON.parse(pubs.find(p => p.name === nm)?.pav || 'null') } catch { return null } }
  const m = pv('Mia'), s = pv('Sam'), o = pv('Ola'), k = pv('Kit')
  ok(m && m.top === 'dress' && m.hair === 'wavy' && m.topc === 'violet' && m.shoes === 'flats', `female default: Mia (woman, no character) gets GD's woman start look (${m?.hair} hair, ${m?.topc} ${m?.top}, ${m?.shoes})`)
  ok(k && k.top === 'tee' && k.topc === 'mint' && k.hair === 'crop', `male default: Kit (man, no character) gets GD's man start look (${k?.hair}, ${k?.topc} ${k?.top})`)
  const same = (a, b) => Object.keys(b).every(x => x === 'v' || a?.[x] === b[x])
  ok(same(s, SAMPLES[10]) && same(o, SAMPLES[3]), "customised: Sam's and Ola's own characters are kept as they made them (not replaced by a start look)") }
for (const [p, t] of [[kit, [26, 12]], [ola, [20, 12]], [mia, [17, 11]]]) ok(await walkTo(p, ...t, 15000), `${p.tag}: walked to ${t}`)
const openPerson = async (p, name) => { for (let i = 0; i < 4; i++) { await tapPerson(p, name).catch(() => {}); if (await until(() => p.$eval('[data-t=w-person-name]', e => e.textContent).then(t => t.startsWith(name)).catch(() => false), 1500)) return true; await front(p); await p.keyboard.press('Escape'); await sleep(500) } return false }
ok(await walkTo(sam, 13, 12, 15000), 'sam: walked to 13,12'); await sleep(600)
ok(await openPerson(sam, 'Mia') && await openPerson(ola, 'Mia'), 'person card: Mia opens on both')
// 5 (part) ── crisp portraits
for (const p of [sam, ola]) {
  await until(() => p.$('[data-t=w-person] [data-t=w-portrait]'), 4000)
  const r = await p.evaluate(() => { const e = document.querySelector('[data-t=w-person] [data-t=w-portrait]'); if (!e) return null
    const b = e.getBoundingClientRect(), d = devicePixelRatio
    return { w: b.width, h: b.height, cw: e.width, ch: e.height, dpr: d, ir: getComputedStyle(e).imageRendering, x: b.left * d, y: b.top * d } })
  const kx = r ? (r.w * r.dpr) / 24 : NaN   // device px per art px (the character is 24x32 art px)
  if (r) r.ok = r.cw === r.w * r.dpr && r.ch === r.h * r.dpr
  ok(r && r.ok && Number.isInteger(+kx.toFixed(6)) && kx >= 1 && /pixelated|crisp/.test(r.ir) && Number.isInteger(+r.x.toFixed(3)) && Number.isInteger(+r.y.toFixed(3)), `portrait ${p.tag}: Mia's Pixel You drawn at a whole ${kx} device px per art px on whole device pixels (${r?.w}x${r?.h} CSS, canvas ${r?.cw}x${r?.ch}, ${r?.ir}, at ${r?.x},${r?.y})`)
}
await shot(sam, 'v05-02-female-default'); await shot(ola, 'v05-02-female-default')
for (const p of [sam, ola]) { await front(p); await p.keyboard.press('Escape'); await sleep(150) }

// seat Sam (phone) and Mia (desktop) at table 1; Kit and Ola stand nearby
await walkTo(ola, 22, 6, 12000); await walkTo(kit, 20, 4, 12000)
ok(await walkTo(sam, 2, 9, 20000), 'sam: walked to seat 2,9'); { const w = await walkTo(mia, 5, 9, 25000) || await walkTo(mia, 5, 9, 15000); if (!w) { await shot(mia, 'debug-walk'); console.log('  mia at', JSON.stringify(await meEnt(mia))) } ok(w, 'mia: walked to seat 5,9') }
ok(await until(() => sam.$('[data-t=w-card]'), 10000) && await until(() => mia.$('[data-t=w-card]'), 10000), 'table: both get the card panel')
for (const [p, t] of [[kit, [6, 11]], [ola, [7, 12]]]) if (!(await walkTo(p, ...t, 15000))) await walkTo(p, 9, 11, 15000)

// 5 ── header photo: 64 CSS px, whole device pixels, the other person's photo (or their Pixel You until it comes)
for (const p of [sam, mia]) {
  const ph = await until(() => p.evaluate(() => { const c = document.querySelector('[data-t=w-photo]'); if (!c) return null; const e = c.parentElement, b = c.getBoundingClientRect(), d = devicePixelRatio
    return c && getComputedStyle(c).display !== 'none' && c.width ? { w: b.width, h: b.height, cw: c.width, d, x: b.left * d, ph: !!e.querySelector('[data-t=w-photo-ph]'), ir: getComputedStyle(c).imageRendering } : null }), 8000)
  ok(ph && ph.w === 64 && ph.h === 64 && ph.cw === 64 * ph.d && !ph.ph && ph.ir === 'pixelated', `photo ${p.tag}: 64 pt header photo arrived, ${ph?.cw} canvas px = 64 × dpr ${ph?.d}, no placeholder (${JSON.stringify(ph)})`)
  const lv = await p.$eval('[data-t=w-lv]', e => e.textContent); ok(/^Level 1 Stranger\s*·\s*0\/5 to Spark$/.test(lv.trim()), `${p.tag}: header reads "${lv.trim()}"`)
}
await shot(sam, 'v05-03-seated'); await shot(mia, 'v05-03-seated-desk')
{ const d = await mia.evaluate(() => ({ hint: document.querySelector('[data-t=w-deskhint]')?.textContent, log: !!document.querySelector('[data-t=w-log]'), priv: !!document.querySelector('[data-t=w-priv]') }))
  ok(d.hint && /Esc or X to stand up/.test(d.hint) && !d.log && d.priv, `desk seated: the private chat replaces the room log ("${d.hint}")`) }

// 3 ── private chat
const raw = 'hey you, this is just for us', rude = 'what the fuck is this latte'
await press(sam, '[data-t=w-input]'); await typeIn(sam, '[data-t=w-input]', raw); await press(sam, '[data-t=w-send]')
ok(await until(() => mia.$$eval('[data-t=w-priv] li', (es, t) => es.some(e => e.textContent.includes(t)), raw)), 'private: Mia sees Sam\'s table line')
await front(kit); const murm = await until(() => kit.$('[data-t=w-murmur]'), 4000, 40); ok(!!murm, 'private: Kit (not at the table) gets the typing strip over the table')
{ const k = await kit.evaluate(t => ({ dom: document.body.innerText.includes(t), bub: [...document.querySelectorAll('[data-t=bubble]')].some(b => b.textContent.includes(t)), m: (() => { const e = document.querySelector('[data-t=w-murmur]'); return e && { txt: e.textContent, bg: getComputedStyle(e).backgroundImage.slice(0, 40) } })() }), raw)
  ok(!k.dom && !k.bub && k.m && k.m.txt === '' && /url/.test(k.m.bg), `private: Kit never sees the words, just GD's strip art (${JSON.stringify(k.m)})`) }
await kit.screenshot({ path: OUT + 'v05-04-private-others-390.png' }); console.log('  📷 v05-04-private-others-390.png')
await press(sam, '[data-t=w-input]'); await typeIn(sam, '[data-t=w-input]', 'and another one'); await press(sam, '[data-t=w-send]')
await front(ola); ok(!!(await until(() => ola.$('[data-t=w-murmur]'), 4000, 40)), 'private: Ola gets the typing strip too')
await ola.screenshot({ path: OUT + 'v05-04-private-others-1440.png' }); console.log('  📷 v05-04-private-others-1440.png')
await sleep(1200); await press(mia, '[data-t=w-input]'); await typeIn(mia, '[data-t=w-input]', rude); await mia.keyboard.press('Enter')
const err = await until(() => mia.evaluate(() => document.querySelector('[data-t=w-note]')?.textContent || ''), 3000); await sleep(800)
const got = await sam.$$eval('[data-t=w-priv] li', es => es.map(e => e.textContent).find(t => /latte/.test(t)) || null)
ok(!got && !!err, `private: the table chat goes through the same filter: the rude line never reaches Sam, Mia is told ("${err}")`)
await shot(sam, 'v05-04-private-chat'); await shot(mia, 'v05-04-private-chat')

// 4 ── the card
const q1 = await sam.$eval('[data-t=w-q]', e => e.textContent)
ok(q1 === await mia.$eval('[data-t=w-q]', e => e.textContent), `card: same question for both ("${q1.slice(0, 40)}…")`)
await typeIn(sam, '[data-t=w-ans-input]', 'Sunday mornings at the market'); await press(sam, '[data-t=w-ans-send]')
ok(await until(() => sam.$('[data-t=w-hid]')), 'card a: my answer shows with "Hidden from Mia"')
{ const h = await sam.$eval('[data-t=w-hid]', e => e.textContent), th = await sam.$eval('[data-t=w-them]', e => e.textContent)
  ok(/Hidden from Mia/.test(h) && /Mia is thinking/.test(th), `card a: "${h.trim()}", "${th.trim()}"`)
  const mt = await until(() => mia.$eval('[data-t=w-them]', e => e.textContent).catch(() => '')); ok(/Sam has answered/.test(mt) && !(await mia.evaluate(() => document.body.innerText.includes('Sunday mornings'))), `card b: Mia sees "${mt.trim()}" but not the words`) }
await shot(sam, 'v05-05a-answered'); await shot(mia, 'v05-05b-they-answered')
await typeIn(mia, '[data-t=w-ans-input]', 'Rainy days with a good book'); await mia.keyboard.press('Enter')
ok(await until(() => sam.$('[data-t=w-done]')) && await until(() => mia.$('[data-t=w-done]')), 'card c: both revealed together with the "Ticked off" stamp')
for (const p of [sam, mia]) { const r = await p.evaluate(() => ({ a: document.querySelector('[data-t=w-rev-mine]')?.textContent, b: document.querySelector('[data-t=w-rev-theirs]')?.textContent, seg: document.querySelector('[data-t=w-card]')?.dataset.seg ?? document.querySelector('[data-seg]')?.dataset.seg, plus: document.querySelector('[data-t=w-plus]')?.textContent, nw: !!document.querySelector('[data-t=w-seg-new]'), bc: getComputedStyle(document.querySelector('[data-t=w-card]')).borderTopColor, lv: document.querySelector('[data-t=w-lv]')?.textContent }))
  ok(r.a && r.b && r.plus === '+1' && r.nw && /1\/5/.test(r.lv), `card c ${p.tag}: both answers, mint border ${r.bc}, "+1", new segment lit, "${r.lv.trim()}"`) }
await shot(sam, 'v05-05c-revealed'); await shot(mia, 'v05-05c-revealed')
// 6 (part) ── locked call
for (const p of [sam, mia]) { const c = await p.evaluate(() => ({ s: document.querySelector('[data-t=w-callrow]')?.dataset.call, dis: document.querySelector('[data-t=w-call]')?.disabled, why: document.querySelector('[data-t=w-call-lock]')?.textContent }))
  ok(c.s === 'locked' && c.dis && /Video unlocks at Level 3 · Crush/.test(c.why), `call locked ${p.tag}: Start call greyed, "${c.why?.trim()}"`) }
await sam.evaluate(() => document.querySelector('[data-t=w-callrow]')?.scrollIntoView({ block: 'end' })); await shot(sam, 'v05-06a-call-locked'); await shot(mia, 'v05-06a-call-locked')
// play on to Level 3: 4 more cards → Level up!, then 5 more → Crush
const play = async (k, at) => { for (let i = 0; i < k; i++) {
  await press(sam, '[data-t=w-next]'); await until(async () => !(await sam.$('[data-t=w-done]')) && !!(await sam.$('[data-t=w-ans-input]')) && !!(await mia.$('[data-t=w-ans-input]')), 6000)
  await typeIn(sam, '[data-t=w-ans-input]', 'mine ' + i); await press(sam, '[data-t=w-ans-send]'); await typeIn(mia, '[data-t=w-ans-input]', 'theirs ' + i); await mia.keyboard.press('Enter')
  await until(() => sam.$('[data-t=w-done]'), 6000); if (at) await at(i) } }
await play(4)
{ const r = await sam.evaluate(() => ({ plus: document.querySelector('[data-t=w-plus]')?.textContent, lv: document.querySelector('[data-t=w-lv]')?.textContent }))
  ok(r.plus === 'Level up!' && /^Level 2 Spark\s*·\s*0\/5 to Crush/.test(r.lv.trim()), `level up: "${r.plus}", "${r.lv.trim()}"`) }
await shot(sam, 'v05-07-level-up'); await shot(mia, 'v05-07-level-up')
// the mirror: Mia (desktop) answers first, so the answered/hidden + thinking states are shot at 1440 and the "has answered" one at 390
await press(sam, '[data-t=w-next]'); await until(async () => !(await sam.$('[data-t=w-done]')) && !!(await mia.$('[data-t=w-ans-input]')), 6000)
await typeIn(mia, '[data-t=w-ans-input]', 'Getting the window seat on the bus'); await mia.keyboard.press('Enter')
ok(await until(() => mia.$('[data-t=w-hid]')), 'card a (desk): Mia\'s answer shows with "Hidden from Sam"')
{ const h = await mia.$eval('[data-t=w-hid]', e => e.textContent), th = await mia.$eval('[data-t=w-them]', e => e.textContent), st = await until(() => sam.$eval('[data-t=w-them]', e => e.textContent).catch(() => ''))
  ok(/Hidden from Sam/.test(h) && /Sam is thinking/.test(th) && /Mia has answered/.test(st) && !(await sam.evaluate(() => document.body.innerText.includes('window seat'))), `card a/b mirrored: "${h.trim()}", "${th.trim()}" / Sam sees "${st.trim()}"`) }
await shot(mia, 'v05-05a-answered'); await shot(sam, 'v05-05b-they-answered')
await typeIn(sam, '[data-t=w-ans-input]', 'A dog noticing me on the street'); await press(sam, '[data-t=w-ans-send]'); await until(() => sam.$('[data-t=w-done]'), 6000)
await play(4)
ok(/^Level 3 Crush/.test((await sam.$eval('[data-t=w-lv]', e => e.textContent)).trim()), 'level 3: Crush after 10 cards')
// 7 ── pair levels are app-wide: what the café table reached is in each phone's app pair store (src/pairlv.ts), keyed by a tag, not the uid
const tagOf = uid => createHash('sha256').update('pd-pair:' + uid).digest('hex').slice(0, 32)
const plv = (p, q) => p.evaluate(t => JSON.parse(sessionStorage.getItem('pd.pairlv') || '{}')[t] ?? null, tagOf(q.prof.uid))
const store2 = async () => [await plv(sam, mia), await plv(mia, sam)]
{ const r = await until(async () => { const [a, b] = await store2(); return a?.lv === 3 && b?.lv === 3 && [a, b] }, 4000)
  const raw = await sam.evaluate(() => sessionStorage.getItem('pd.pairlv') || '')
  ok(r && !r[0].drop && !raw.includes(mia.prof.uid), `pair store: the café level is in both phones' app store (Sam→Mia ${JSON.stringify(r?.[0])}, Mia→Sam ${JSON.stringify(r?.[1])}), keyed by tag, no raw uid`) }
// 6 ── Start call
for (const p of [sam, mia]) { const c = await p.evaluate(() => ({ s: document.querySelector('[data-t=w-callrow]')?.dataset.call, bg: getComputedStyle(document.querySelector('[data-t=w-call]')).backgroundColor, t: document.querySelector('[data-t=w-callrow]')?.textContent }))
  ok(c.s === 'open' && /both tap/.test(c.t), `call open ${p.tag}: coral Start call (${c.bg}), "The call starts when you both tap."`) }
await sam.evaluate(() => document.querySelector('[data-t=w-callrow]')?.scrollIntoView({ block: 'end' })); await shot(sam, 'v05-06b-call-open'); await shot(mia, 'v05-06b-call-open')
const callSt = p => p.$eval('[data-t=w-callrow]', e => e.dataset.call).catch(() => '')
// decline
await press(sam, '[data-t=w-call]'); ok(await until(async () => (await callSt(sam)) === 'out' && (await callSt(mia)) === 'in'), 'call: Sam taps → waiting for Mia; Mia sees the request')
{ const t = await sam.$eval('[data-t=w-callrow]', e => e.textContent); ok(/Waiting for Mia/.test(t) && /You tapped/.test(t) && /Mia hasn.t yet/.test(t) && !!(await sam.$('[data-t=w-call-cancel]')), `call waiting: "${t.replace(/\s+/g, ' ').trim().slice(0, 90)}"`) }
await sam.evaluate(() => document.querySelector('[data-t=w-callrow]')?.scrollIntoView({ block: 'end' })); await shot(sam, 'v05-06c-call-waiting'); await shot(mia, 'v05-06c-call-asked')
await press(mia, '[data-t=w-call-no]'); ok(await until(async () => (await callSt(sam)) === 'open' && (await callSt(mia)) === 'open'), 'call: Mia says Not now → both back to Start call')
// cancel
await sleep(500); await press(sam, '[data-t=w-call]'); const re = await until(async () => (await callSt(sam)) === 'out' && (await callSt(mia)) === 'in'); if (!re) { await shot(sam, 'debug-recall'); console.log('  sam/mia', await callSt(sam), await callSt(mia)) }
await press(sam, '[data-t=w-call-cancel]')
ok(await until(async () => (await callSt(sam)) === 'open' && (await callSt(mia)) === 'open'), 'call: Sam cancels → Mia\'s request goes away')
ok((await sam.evaluate(() => window.__gum)) === 0 && (await mia.evaluate(() => window.__gum)) === 0, 'call: nobody has touched the camera yet')
// the mirror: Mia (desktop) taps first → her waiting state at 1440, Sam's request at 390; she cancels
await until(async () => !(await mia.$('[data-t=w-note]')) && !(await sam.$('[data-t=w-note]')), 6000); await press(mia, '[data-t=w-call]'); ok(await until(async () => (await callSt(mia)) === 'out' && (await callSt(sam)) === 'in'), 'call mirrored: Mia taps → waiting for Sam; Sam sees the request')
{ const t = await mia.$eval('[data-t=w-callrow]', e => e.textContent); ok(/Waiting for Sam/.test(t) && /You tapped/.test(t) && /Sam hasn.t yet/.test(t), `call waiting (desk): "${t.replace(/\s+/g, ' ').trim().slice(0, 90)}"`) }
await sam.evaluate(() => document.querySelector('[data-t=w-callrow]')?.scrollIntoView({ block: 'end' })); await shot(mia, 'v05-06c-call-waiting'); await shot(sam, 'v05-06c-call-asked')
await press(mia, '[data-t=w-call-cancel]'); ok(await until(async () => (await callSt(sam)) === 'open' && (await callSt(mia)) === 'open'), 'call mirrored: Mia cancels → back to Start call on both')
await sleep(500)
// both tap → the call starts IN the café (GD couple/README): both keep their seats; the room sees the couple heart
await press(sam, '[data-t=w-call]'); await until(async () => (await callSt(mia)) === 'in'); await press(mia, '[data-t=w-call-yes]')
const cp = p => p.evaluate(() => window.__world.couple())
const onCall = p => until(() => p.evaluate(() => !!document.querySelector('[data-t=w-room]') && document.querySelector('[data-t=w-oncall]')?.dataset.up === '1'), 20000, 200)
const [a, b] = await Promise.all([onCall(sam), onCall(mia)])
ok(a && b, 'call: both tapped → the video call opens in the café, both still seated')
{ const [x, y] = [await cp(sam), await cp(mia)]; ok(x.call?.up && y.call?.up && x.call.host !== y.call.host && x.call.lv === 3 && y.call.lv === 3, `call: one host, one guest, both pixelated at the pair's level 3 (${JSON.stringify([x.call, y.call])})`) }
ok((await sam.evaluate(() => window.__gum)) >= 1 && (await mia.evaluate(() => window.__gum)) >= 1, 'call: the camera is opened only now')
{ const t = await sam.$eval('[data-t=w-oncall]', e => e.textContent); ok(/On call \d\d:\d\d/.test(t) && /Only you two see and hear this/.test(t) && /Mia/.test(t) && /You/.test(t) && /Mute/.test(t) && /Camera/.test(t) && /End call/.test(t), `call panel: "${t.replace(/\s+/g, ' ').trim().slice(0, 120)}"`) }
{ const v = await sam.$eval('[data-t=w-oc-remote]', e => ({ w: e.videoWidth, live: !!e.srcObject })); ok(v.live && v.w > 0, `call panel: the partner's (pixelated) video plays (${JSON.stringify(v)})`) }
for (const p of [sam, mia]) { const sw = await p.$eval('[data-t=w-show-sw]', e => ({ on: e.getAttribute('aria-checked'), off: e.classList.contains('off'), t: e.closest('[data-t=w-show]').textContent }))
  ok(sw.on === 'true' && !sw.off && /Show our heart in the café/.test(sw.t) && /Either of you can turn it off/.test(sw.t), `heart switch (${p.tag}): on by default`) }
ok(!(await sam.$('[data-t=w-card]')) && !(await sam.$('[data-t=w-priv]')), 'call panel: the card and private chat give way to the call')
const tb0 = (await cp(sam)).hearts
const heartAt = async (p, want) => { await front(p); return !!(await until(async () => { const c = await cp(p); return want ? c.hearts.length === 1 && !!c.on[c.hearts[0]] : !c.hearts.length && !Object.keys(c.on).length }, 6000)) }
ok(tb0.length === 1, `heart: the pair's table (${JSON.stringify(tb0)}) has a heart on Sam's screen`)
for (const p of [mia, kit, ola]) ok(await heartAt(p, true), `heart: ${p.tag} sees the heart over the table (frames ${JSON.stringify((await cp(p)).on)})`)
// GD fix: while the pair's couple heart shows, a viewer's private markers over those two are hidden; others' stay; back after
const marks = async (p, hushed) => { await front(p); let last = null
  const r = await until(async () => { const v = await p.evaluate(() => { const s = window.__world.state(), m = window.__world.couple().marks
      return s.ents.filter(e => e.id !== s.me).map(e => ({ n: e.name, f: !!m[e.id]?.[0], on: !!m[e.id]?.[1] })) }); last = v
    const pair = v.filter(e => e.n === 'Sam' || e.n === 'Mia'), rest = v.filter(e => e.n !== 'Sam' && e.n !== 'Mia')
    return pair.every(e => e.on === (e.f && !hushed)) && rest.every(e => e.on === e.f) ? { pair: pair.filter(e => e.f).length, rest: rest.filter(e => e.f).length } : null }, 6000)
  return r ?? { bad: last } }
const markCheck = async (hushed, why) => { const ms = [await marks(kit, hushed), await marks(ola, hushed)]
  ok(ms.every(m => !m.bad), `markers: ${why} (${JSON.stringify(ms)})`); return ms }
{ const ms = await markCheck(true, "the pair's private markers are hidden under the couple heart; everyone else's stay")
  ok(ms.reduce((a, m) => a + (m.pair ?? 0), 0) > 0, `markers: a bystander does have a private marker over the pair to hide (${JSON.stringify(ms)})`) }
// a bystander sees only the heart: no names, no text near the table
{ const t = await kit.evaluate(() => document.querySelector('.w-over')?.textContent ?? ''); ok(!/On call|Only you two|Show our heart/.test(t) && !(await kit.$('[data-t=w-oncall]')), 'heart: bystanders see no call text ("' + t.slice(0, 60) + '")') }
await walkTo(kit, 4, 12, 15000)
await sleep(700); await shot(sam, 'couple-call'); await shot(mia, 'couple-call'); await shot(kit, 'couple-cafe'); await shot(ola, 'couple-cafe')
for (const [p, n] of [[sam, 'couple-call'], [mia, 'couple-call'], [kit, 'couple-cafe'], [ola, 'couple-cafe']]) await p.screenshot({ path: `/workspace/pixeldate/shots/world-piano-duet-v1/${n}-${p.sz}.png` })
// either switch off hides it for everyone; on again shows it
await press(mia, '[data-t=w-show-sw]')
ok(await heartAt(kit, false) && await heartAt(sam, false), 'heart: Mia switches it off → gone for the room and for Sam')
await markCheck(false, 'switch off → the pair\'s private markers are back')
ok((await mia.$eval('[data-t=w-show-sw]', e => e.classList.contains('off') && e.getAttribute('aria-checked') === 'false')) && (await sam.$eval('[data-t=w-show-sw]', e => e.getAttribute('aria-checked'))) === 'true', 'heart switch: Mia\'s is off, Sam\'s stays his own')
await shot(mia, 'couple-call-off'); await mia.screenshot({ path: '/workspace/pixeldate/shots/world-piano-duet-v1/couple-call-off-1440.png' })
await press(mia, '[data-t=w-show-sw]'); ok(await heartAt(ola, true), 'heart: switched back on → shown again')
await markCheck(true, 'switched back on → hidden again')
// mute / camera
await press(sam, '[data-t=w-oc-mute]'); ok((await cp(sam)).call.muted && (await sam.$eval('[data-t=w-oc-mute]', e => e.getAttribute('aria-pressed'))) === 'true', 'call: Mute')
await press(sam, '[data-t=w-oc-mute]'); await press(sam, '[data-t=w-oc-cam]'); ok((await cp(sam)).call.camOff, 'call: Camera off'); await press(sam, '[data-t=w-oc-cam]')
// End call → heart gone at once, both back at the table
await press(sam, '[data-t=w-oc-end]')
ok(await until(async () => !(await sam.$('[data-t=w-oncall]')) && !(await mia.$('[data-t=w-oncall]')), 6000), 'call: Sam ends it → the call closes on both')
ok(await heartAt(kit, false) && await heartAt(mia, false), 'heart: gone when the call ends')
await markCheck(false, 'call ended → the markers are back')
ok(!!(await sam.$('[data-t=w-card]')) && !!(await mia.$('[data-t=w-card]')), 'call ended: both still seated, the card is back')
// a new call; standing up ends it and the heart
await sleep(500); await press(mia, '[data-t=w-call]'); await until(async () => (await callSt(sam)) === 'in'); await press(sam, '[data-t=w-call-yes]')
ok(await onCall(sam) && await onCall(mia) && await heartAt(kit, true), 'call again: heart back on (the switch defaults on each call)')
await markCheck(true, 'call again → hidden again')
await front(mia); await mia.keyboard.press('Escape')
ok(await heartAt(kit, false) && await until(async () => !(await sam.$('[data-t=w-oncall]')), 6000), 'heart: Mia stands up → call and heart end at once')
await markCheck(false, 'Mia stands up → the markers are back')
// the app's own video call is unchanged (a saved hand-off still opens it); the chat's level set there carries into the café
// one code for both (built per tab it differed whenever the loop crossed a millisecond: the old flake)
const hoCode = ('v05h' + Date.now().toString(36) + 'zzzzzzzz').slice(0, 12)
for (const p of [sam, mia]) await p.evaluate(m => sessionStorage.setItem('pd.handoff', JSON.stringify({ ...m, at: Date.now() })), { code: hoCode, host: p === sam, lv: 3 })
for (const p of [sam, mia]) await p.goto(APP + '?loopback', { waitUntil: 'domcontentloaded' })
const inApp = p => until(() => p.evaluate(() => !!document.querySelector('[data-t=call-chip]')), 25000, 250)
const [a2, b2] = await Promise.all([inApp(sam), inApp(mia)])
ok(a2 && b2, 'app: a hand-off still lands both in the app\'s video call')
if (!(a2 && b2)) for (const p of [sam, mia]) console.log('  app shows', p.tag, JSON.stringify(await p.evaluate(() => [location.href.replace(/invite=[^&]*/, 'invite=…'), document.body.innerText.slice(0, 300)])))
const chip = p => p.evaluate(() => [...document.querySelectorAll('.chip')].map(e => e.textContent).find(t => /LV \d/.test(t)) ?? '')
if (a2 && b2) {
  await sleep(1500); const [ca, cb] = [await chip(sam), await chip(mia)]
  ok(/LV 3/.test(ca) && /LV 3/.test(cb), `app chat: the pair is at the café's level in the app ("${ca.trim()}" / "${cb.trim()}")`)
  const [x, y] = await store2(); ok(x?.lv === 3 && y?.lv === 3, `app chat: after the chat's pair-level exchange both stores still read 3 (${JSON.stringify([x, y])})`)
  await front(sam); const dropped = await sam.evaluate(() => { const b = document.querySelector('[data-t=drop]'); if (!b) return false; b.click(); return true })
  if (!dropped) { await sam.evaluate(() => document.querySelector('[data-t=hangup]')?.click()); await sleep(800); await sam.evaluate(() => document.querySelector('[data-t=drop]')?.click()) }
  const d = await until(async () => { const [x, y] = await store2(); return x?.lv === 2 && y?.lv === 2 && [x, y] }, 6000)
  ok(d && d[0].drop && d[1].drop, `app chat: Sam lowered to Spark in the chat → both stores 2, marked set-in-chat (${JSON.stringify(d)})`)
}
// back to the café (a fresh sitting at the same table): the chat's level wins over the café's last 3
const STALE_WAIT = 3500
const sitAgain = async () => {
  for (const p of [sam, mia]) await p.goto('about:blank'); await sleep(STALE_WAIT)   // leave first, so last sitting's seats are free
  for (const p of [sam, mia]) { await p.goto(APP + WQ, { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-t=w-room]', { timeout: 20000 }); front.cur = null }
  // from the door, go down the aisle first: a long diagonal edge-tap can land on another table's chair and seat you there
  for (const p of [sam, mia]) { await walkTo(p, 20, 12, 15000); await walkTo(p, 9, 11, 15000) }
  const w1 = await walkTo(sam, 2, 9, 20000), w2 = await walkTo(mia, 5, 9, 25000) || await walkTo(mia, 5, 9, 15000)
  if (!w1 || !w2) { console.log('  sitAgain at', JSON.stringify(await meEnt(sam)), JSON.stringify(await meEnt(mia)), (await st(sam))?.ents.length); await sam.screenshot({ path: '/workspace/tmp/sitfail-sam.png' }); await mia.screenshot({ path: '/workspace/tmp/sitfail-mia.png' }) }
  return w1 && w2 && await until(() => sam.$('[data-t=w-card]'), 10000) && await until(() => mia.$('[data-t=w-card]'), 10000)
}
const lvText = p => p.$eval('[data-t=w-lv]', e => e.textContent.trim()).catch(() => '')
ok(await sitAgain(), 'café again: both sat at table 1')
{ const r = await until(async () => /^Level 2 Spark/.test(await lvText(sam)) && /^Level 2 Spark/.test(await lvText(mia)), 8000)
  ok(r, `café again: the level lowered in the app chat is carried into the café ("${await lvText(sam)}" / "${await lvText(mia)}")`)
  const s2 = await until(async () => { const [x, y] = await store2(); return x?.lv === 2 && !x.drop && y?.lv === 2 && !y.drop && [x, y] }, 6000)
  ok(s2, `café again: reconciled, stores 2 without the set-in-chat mark (${JSON.stringify(await store2())})`) }
// a HIGHER level reached in the app chat (stores written exactly as the chat writes them) is carried into the café
for (const p of [sam, mia]) await p.evaluate((t, at) => { const o = JSON.parse(sessionStorage.getItem('pd.pairlv') || '{}'); o[t] = { lv: 4, at, drop: 1 }; sessionStorage.setItem('pd.pairlv', JSON.stringify(o)) }, tagOf((p === sam ? mia : sam).prof.uid), Date.now())
ok(await sitAgain(), 'café, third sitting: both sat at table 1')
{ const r = await until(async () => /^Level 4 Close/.test(await lvText(sam)) && /^Level 4 Close/.test(await lvText(mia)), 8000)
  ok(r, `café: a higher chat level (4) is carried into the café ("${await lvText(sam)}" / "${await lvText(mia)}")`)
  const c = await sam.evaluate(() => document.querySelector('[data-t=w-callrow]')?.dataset.call); ok(c === 'open', 'café: at Close, Start call is open (' + c + ')') }
// one phone alone claiming more (an edited store) does not raise it
await sam.evaluate(t => { const o = JSON.parse(sessionStorage.getItem('pd.pairlv') || '{}'); o[t] = { lv: 5, at: Date.now() }; sessionStorage.setItem('pd.pairlv', JSON.stringify(o)) }, tagOf(mia.prof.uid))
ok(await sitAgain(), 'café, fourth sitting: both sat')
await sleep(1500); ok(/^Level 4 Close/.test(await lvText(sam)), `café: one phone claiming 5 alone leaves the pair at 4 ("${await lvText(sam)}")`)
{ const [x] = await store2(); ok(x?.lv === 4, `café: Sam's edited store is put back to the pair's level (${JSON.stringify(x)})`) }
await browser.close()
console.log(bad ? `world v05: ${bad} FAILED of ${n}` : `world v05: ALL ${n} OK`)
process.exit(bad ? 1 : 0)
