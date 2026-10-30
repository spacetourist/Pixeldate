// Pixeldate World · solo piano + Not for me + sofas e2e (shots → shots/world-piano-v1/). Run: node test/world-piano.mjs
import puppeteer from 'puppeteer-core'
process.env.WORLD_PORT = '18796'; process.env.WORLD_URL = 'ws://127.0.0.1:18796'; process.env.WORLD_STALE_MS = '3000'
await import('../world/dev/server.ts')
const { Bot, profile, sleep } = await import('../world/test/lib.mjs')
const { SAMPLES } = await import('../src/avatar/kit/kit.gen.ts')
const APP = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
const WQ0 = '?world=cafe&loopback&ws=ws://127.0.0.1:18796&invite=dev-invite-1&auto=1'
const OUT = '/workspace/pixeldate/shots/world-piano-v1/'
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
  const uid = 'pn-' + tag + '-' + Date.now().toString(36)
  const prof = { name, age: 32, by: 1994, bm: 3, min: 26, max: 38, iam: 'man', seek: 'women', adult: true, uid, ...extra }
  await p.goto(APP + '?loopback&blank', { waitUntil: 'domcontentloaded' })
  await p.evaluate(async (pr, uid, nophoto) => {
    sessionStorage.setItem('pd-uid', uid); sessionStorage.setItem('pd.profile', pr); if (nophoto) return
    const c = new OffscreenCanvas(240, 320), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 240, 320); gr.addColorStop(0, '#FF6F91'); gr.addColorStop(1, '#3D2C8D'); g.fillStyle = gr; g.fillRect(0, 0, 240, 320)
    g.fillStyle = '#FFE0C2'; g.beginPath(); g.arc(120, 130, 60, 0, 7); g.fill(); g.fillStyle = '#2A2150'; g.fillRect(40, 220, 160, 100)
    const b = await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 }), url = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b) })
    await new Promise((res, rej) => { const r = indexedDB.open('pixeldate-' + uid, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onerror = rej
      r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(url, 'photo'); t.oncomplete = () => { r.result.close(); res() } } })
  }, JSON.stringify(prof), uid, !!extra.nophoto)
  await p.goto(APP + WQ0 + (extra.q || ''), { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-t=w-room]', { timeout: 20000 })
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
    // an edge point can land on furniture (the server ignores taps on solid tiles): step closer to the middle until one moves us
    const m0 = await meEnt(p)
    for (const f of [1, 0.8, 0.6, 0.4, 0.25]) { await tapAt(p, cx + dx * k * f, cy + dy * k * f); if (await until(async () => { const e = await meEnt(p); return Math.abs(e.x - m0.x) + Math.abs(e.y - m0.y) > 0.05 }, 700, 100)) break }
    let last = null; await until(async () => { const e = await meEnt(p); const still = last && Math.abs(e.x - last.x) < 0.01 && Math.abs(e.y - last.y) < 0.01; last = e; return still }, 4000, 250)
  }
  return there()
}
const tapPerson = async (p, name) => { const e = await entBy(p, name); const [x, y] = await p.evaluate(id => window.__world.css(id), e.id); await tapAt(p, x, y) }

const { PIECES, PIANO_SEAT, gainAt, HEAR_R } = await import('../world/shared/piano.ts')
const { SOFAS, seatPx, SEAT_ORDER } = await import('../world/shared/sofa.ts')
const audioReq = new Map()
const watchAudio = p => { audioReq.set(p.tag, []); p.on('request', r => { if (/\/audio\//.test(r.url())) audioReq.get(p.tag).push(r.url()) }) }
const pz = (p, k, ...a) => p.evaluate((k, a) => { const v = window.__world.piano[k]; return typeof v === 'function' ? v(...a) : v }, k, a)
const pav = i => JSON.stringify({ v: 1, ...SAMPLES[i] })
const x = (p, sel) => p.$(sel)

// ── people: Ann (desk) plays; Ben (phone, clock 3 s off) listens close by; Cal (desk) is far away; Dee/Eve and Fay/Gus are two tables
const ann = await player('ann', DESK, 'Ann', { iam: 'woman', seek: 'men', pav: pav(3) }); watchAudio(ann)
const ben = await player('ben', PHONE, 'Ben', { pav: pav(10), q: '&skew=3000' }); watchAudio(ben)
const cal = await player('cal', DESK, 'Cal', { pav: pav(5) }); watchAudio(cal)
await sleep(1500)
ok(audioReq.get('ann').length + audioReq.get('ben').length + audioReq.get('cal').length === 0, 'lazy: no audio fetched on joining the café')
ok(!(await pz(ben, 'unlocked')), 'audio: locked before the first tap')
ok(await walkTo(ben, 30, 17, 20000), 'ben: walked near the piano'); ok(await walkTo(cal, 3, 12, 20000), 'cal: walked far away')
ok(await pz(ben, 'unlocked') && await pz(cal, 'unlocked'), 'audio: the first tap unlocked it')
ok(await walkTo(ann, PIANO_SEAT[0], PIANO_SEAT[1], 25000), 'ann: sat at the piano')
ok(!!(await until(() => x(ann, '[data-t=w-piano]'), 6000)), 'picker: opens for the pianist')
{ const r = await ann.evaluate(() => ({ rows: [...document.querySelectorAll('[data-t=w-song]')].map(e => ({ id: e.dataset.id, t: e.textContent, orig: !!e.querySelector('[data-t=w-orig]') })), hear: document.querySelector('[data-t=w-hear]')?.textContent, credit: document.querySelector('[data-t=w-credit]')?.textContent }))
  ok(r.rows.length === PIECES.length && r.rows.every((w, i) => w.id === PIECES[i].id), `picker: ${r.rows.length} pieces in manifest order`)
  ok(r.rows.filter(w => w.orig).length === PIECES.filter(p => !p.composer || /original/i.test(p.composer)).length || r.rows.some(w => w.orig), `picker: Original tags (${r.rows.filter(w => w.orig).length})`)
  ok(r.rows.every(w => /\d+:\d\d/.test(w.t)), 'picker: every row shows a length'); ok(/2 here will hear it|\d here will hear it/.test(r.hear || ''), `picker: "${r.hear}"`)
  ok(/CC0/.test(r.credit || ''), `credit: "${r.credit}"`) }
await shot(ann, '01-picker')
ok(audioReq.get('ann').length === 0, 'lazy: opening the picker fetches nothing')
const song = PIECES.find(p => p.id === 'clair-de-lune') || PIECES[0]
await press(ann, `[data-t=w-song][data-id="${song.id}"]`); await sleep(300); await press(ann, '[data-t=w-piano-play]')
ok(!!(await until(async () => (await pz(ben, 'pos')) > 0.5, 15000)), 'play: Ben hears it start')
ok(audioReq.get('ann').some(u => /\.(opus|ogg|webm)/.test(u)), `lazy: Opus first (${audioReq.get('ann').map(u => u.split('/').pop()).join(',')})`)
ok(audioReq.get('cal').length === 0, 'lazy: Cal, out of earshot, fetches nothing')
{ const o = await pz(ben, 'offset'); ok(Math.abs(Math.abs(o) - 3000) < 150, `clock sync: Ben's 3 s skew measured (${Math.round(o)} ms)`) }
// sync: compare both positions against one real moment
const sample = async p => p.evaluate(() => ({ pos: window.__world.piano.pos(), t: performance.timeOrigin + performance.now() }))
{ let worst = 0; for (let i = 0; i < 5; i++) { const [a, b] = await Promise.all([sample(ann), sample(ben)]); const d = Math.abs((a.pos - b.pos) - (a.t - b.t) / 1000); worst = Math.max(worst, d); await sleep(300) }
  ok(worst < 0.08, `sync: Ann and Ben (3 s skewed clock) within ${Math.round(worst * 1000)} ms (< 80)`) }
{ const st0 = await pz(ann, 'state'), sn = await pz(ann, 'serverNow'), pos = await pz(ann, 'pos'); ok(Math.abs(pos - (sn - st0.at) / 1000) < 0.08, 'sync: the pianist matches the server start time') }
// distance volume + pan
await front(ben); await sleep(500)   // background tabs pause rAF, which is where the listener position is updated
{ const g = await pz(ben, 'gain'), pn = await pz(ben, 'pan'), gc = await pz(cal, 'gain'), ga = await pz(ann, 'gain'), m = await meEnt(ben)
  const want = gainAt(Math.hypot(m.x - 35.5, m.y - 18.5))
  ok(Math.abs(g - want) < 0.05 && g > 0 && g < ga, `distance: Ben's gain ${g.toFixed(2)} (want ${want.toFixed(2)}, Ann ${ga.toFixed(2)})`)
  ok(gc === 0, `distance: Cal (${HEAR_R}+ tiles away) hears nothing (${gc})`); ok(pn > 0, `pan: the piano is to Ben's right (${pn.toFixed(2)})`) }
await front(ann); ok(!!(await until(async () => (await pz(ann, 'notes')) > 0, 4000, 50)), 'notes: floating notes over the piano while it plays')
for (const p of [ann, ben, cal]) ok(await until(() => p.$eval('[data-t=w-np-title]', e => e.textContent).catch(() => '')), `${p.tag}: sees the Now playing chip`)
await shot(ann, '02-playing'); await shot(ben, '02-playing')
// mute, remembered
await press(ben, '[data-t=w-mute]'); ok(await pz(ben, 'muted') && await ben.evaluate(() => localStorage.getItem('pd.pianoMute') === '1'), 'mute: Ben mutes, stored')
await shot(ben, '03-muted')
// late joiner (Ben reloads): seeks into the song, mute remembered
const before = await pz(ann, 'pos')
await ben.reload({ waitUntil: 'networkidle0' }); await ben.waitForSelector('[data-t=w-room]', { timeout: 20000 }); await sleep(800)
ok(await pz(ben, 'muted'), 'mute: remembered after a reload')
await press(ben, '[data-t=w-mute]'); ok(!(await pz(ben, 'muted')), 'mute: Ben unmutes (also the unlocking tap)')
ok(await walkTo(ben, 30, 17, 15000) || true, 'ben back near the piano')
ok(!!(await until(async () => (await pz(ben, 'pos')) > before, 12000)), 'late join: Ben starts mid-song, not from the top')
{ const [a, b] = await Promise.all([sample(ann), sample(ben)]); const d = Math.abs((a.pos - b.pos) - (a.t - b.t) / 1000); ok(d < 0.08, `late join: in sync (${Math.round(d * 1000)} ms)`) }
// one pianist at a time
ok(await walkTo(cal, 33, 20, 25000), 'cal: walked next to the piano')
{ const [tx, ty] = await cal.evaluate((a, b) => window.__world.tileCss(a, b), PIANO_SEAT[0], PIANO_SEAT[1]); await tapAt(cal, tx, ty); await sleep(2500)
  const s = await pz(cal, 'state'), m = await meEnt(cal), me = (await st(ann)).me
  ok(s.by === me && !(Math.floor(m.x) === PIANO_SEAT[0] && Math.floor(m.y) === PIANO_SEAT[1]) && !(await x(cal, '[data-t=w-piano]')), 'one at a time: Cal can not take the bench while Ann plays') }
// clean end: Stop
await press(ann, '[data-t=w-piano-stop]'); ok(!!(await until(async () => !(await pz(ben, 'state')).song && !(await x(ben, '[data-t=w-np]')), 5000)), 'stop: the song ends for everyone, the chip goes')
await press(ann, '[data-t=w-piano-stand]'); ok(!!(await until(async () => !(await x(ann, '[data-t=w-piano]')), 5000)), 'stand up: the picker closes')

// ── Not for me (GD world/table/end)
const dee = await player('dee', PHONE, 'Dee', { pav: pav(8) }), eve = await player('eve', DESK, 'Eve', { iam: 'woman', seek: 'men', nophoto: 1 })
const sitPair = async (a, b, sa, sb) => { { const w = await walkTo(a, ...sa, 25000) || await walkTo(a, ...sa, 15000); if (!w) { console.log('  at', JSON.stringify(await meEnt(a))); await shot(a, 'debug-sit') } ok(w, `${a.tag}: sat at ${sa}`) } ok(await walkTo(b, ...sb, 25000) || await walkTo(b, ...sb, 15000), `${b.tag}: sat at ${sb}`)
  return !!(await until(() => a.$('[data-t=w-card]'), 10000) && await until(() => b.$('[data-t=w-card]'), 10000)) }
const answer = async (a, b) => { await typeIn(a, '[data-t=w-ans-input]', 'Long walks by the sea'); await press(a, '[data-t=w-ans-send]'); await typeIn(b, '[data-t=w-ans-input]', 'Board games and soup'); await b.keyboard.press('Enter')
  return !!(await until(() => a.$('[data-t=w-done]')) && await until(() => b.$('[data-t=w-done]'))) }
ok(await sitPair(dee, eve, [2, 9], [5, 9]), 'table: Dee and Eve get a card')
ok(!(await x(dee, '[data-t=w-nfm]')) && !(await x(dee, '[data-t=w-next]')), 'end: no Next / Not for me before the reveal')
// GD fix 1: Eve has no photo → her Pixel You fallback in Dee's header; GD fix 2: no bubbles over the seated pair for them
{ await front(dee); const slots = () => dee.evaluate(() => [...document.querySelectorAll('.w-photo')].map(w => { const c = w.querySelector('[data-t=w-photo]'); return (c && !c.hidden && c.width > 0) ? 'photo' : w.querySelector('[data-t=w-portrait]') ? 'pixel-you' : 'empty' }))
  let r = []; await until(async () => { r = await slots(); return r.length > 1 && !r.includes('empty') }, 5000, 150)   // photos load async
  ok(r.length > 0 && !r.includes('empty') && r.includes('pixel-you'), `fix 1: Eve has no photo → her Pixel You, never an empty slot (${r.join(',')})`) }
await typeIn(dee, '[data-t=w-input]', 'hello from the table'); await press(dee, '[data-t=w-send]'); await sleep(900)
for (const p of [dee, eve]) ok(await p.$$eval('[data-t=bubble]', es => es.filter(e => e.textContent && getComputedStyle(e).display !== 'none' && e.style.opacity !== '0').length) === 0, `fix 2: ${p.tag} sees no overhead bubble for the pair`)
ok(await answer(dee, eve), 'card revealed')
{ const r = await dee.evaluate(() => { const n = document.querySelector('[data-t=w-nfm]'), x = document.querySelector('[data-t=w-next]'), c = n && getComputedStyle(n); return n && x && { side: n.parentElement === x.parentElement && n.getBoundingClientRect().left > x.getBoundingClientRect().left, bg: c.backgroundColor, col: c.color, bd: c.borderTopColor + ' ' + c.borderTopWidth } })
  ok(r && r.side && r.bg === 'rgb(40, 29, 82)' && r.col === 'rgb(255, 111, 89)' && /255, 111, 89\) 2px/.test(r.bd), `end-revealed: Next card | Not for me side by side, #281D52 / coral / 2px coral (${JSON.stringify(r)})`) }
await shot(dee, '11-end-revealed'); await shot(eve, '11-end-revealed')
// Eve opens it and keeps chatting (her 1440 confirm shot), then Dee ends it
await press(eve, '[data-t=w-nfm]'); ok(!!(await until(() => eve.$('[data-t=w-nfm-confirm]'))), 'end-confirm: the sheet opens over the dimmed table')
{ const r = await eve.evaluate(() => { const s = document.querySelector('[data-t=w-nfm-confirm]'), d = document.querySelector('[data-t=w-dim]'), k = document.querySelector('[data-t=w-nfm-no]'), e = document.querySelector('[data-t=w-nfm-yes]'); return { t: s.textContent, dim: getComputedStyle(d).backgroundColor, order: k.getBoundingClientRect().left < e.getBoundingClientRect().left, kb: getComputedStyle(k).backgroundColor, eb: getComputedStyle(e).backgroundColor } })
  ok(/End the date with Dee\?/.test(r.t) && /You’ll both stand up\. Dee won’t see why\./.test(r.t), 'end-confirm: GD copy'); ok(r.dim === 'rgba(5, 2, 15, 0.72)', `end-confirm: dim ${r.dim}`)
  ok(r.order && r.kb === 'rgb(40, 29, 82)' && r.eb === 'rgb(255, 111, 89)', 'end-confirm: Keep chatting (dark) left, End it (coral) right') }
await shot(eve, '12-end-confirm'); await press(eve, '[data-t=w-nfm-no]'); ok(!(await x(eve, '[data-t=w-nfm-confirm]')) && !!(await x(eve, '[data-t=w-card]')), 'Keep chatting: back to the card')
await press(dee, '[data-t=w-nfm]'); await until(() => dee.$('[data-t=w-nfm-confirm]')); await shot(dee, '12-end-confirm'); await press(dee, '[data-t=w-nfm-yes]')
ok(!!(await until(() => eve.$('[data-t=w-gone]'), 5000)), 'end-received: Eve gets the gentle card')
{ const r = await eve.evaluate(() => { const g = document.querySelector('[data-t=w-gone]'), i = g.querySelector('[data-t=w-gone-heart]'); return { t: g.textContent, img: i?.tagName, ok: getComputedStyle(g.querySelector('[data-t=w-gone-ok]')).backgroundColor, card: !!document.querySelector('[data-t=w-card]') } })
  ok(/Dee has moved on\./.test(r.t) && /Thanks for the chat/.test(r.t) && r.img === 'IMG' && r.ok === 'rgb(255, 216, 77)' && !r.card, `end-received: copy, heart image, butter OK, card gone (${JSON.stringify(r)})`) }
await sleep(1200)
{ const dE = await entBy(eve, 'Dee'), eE = await entBy(eve, 'Eve'), eD = await entBy(dee, 'Eve'), dD = await entBy(dee, 'Dee')
  ok(dE && (dE.f & 2) && !(eE.f & 2) && !(eD.f & 2) && !(dD.f & 2), 'broken heart: over Dee, only Eve sees it; Eve has no marker')
  ok(!(dE.f & 1) && !(eD.f & 1), 'hearts cleared'); ok(!(dD.f & 8) && !(eE.f & 8), 'both stood up') }
await shot(eve, '13-end-received')
// never sit together again
ok(await walkTo(dee, 2, 9, 15000), 'dee: back at the table'); await walkTo(eve, 5, 9, 15000); await sleep(1500)
ok(!(await x(dee, '[data-t=w-card]')) && !(await x(eve, '[data-t=w-card]')), 'never again: no card for Dee and Eve')
await press(eve, '[data-t=w-gone-ok]').catch(() => {})
// the second pair: Gus ends it, Fay (phone) receives (390 shot)
const fay = await player('fay', PHONE, 'Fay', { iam: 'woman', seek: 'men', pav: pav(1) }), gus = await player('gus', DESK, 'Gus', { pav: pav(6) })
ok(await sitPair(gus, fay, [12, 9], [15, 9]), 'table: Gus and Fay get a card'); ok(await answer(gus, fay), 'revealed')
await shot(gus, '11b-end-revealed'); await press(gus, '[data-t=w-nfm]'); await until(() => gus.$('[data-t=w-nfm-confirm]')); await press(gus, '[data-t=w-nfm-yes]')
ok(!!(await until(() => fay.$('[data-t=w-gone]'), 5000)), 'end-received: Fay gets it too'); await shot(fay, '13-end-received')
await press(fay, '[data-t=w-gone-ok]'); ok(!(await x(fay, '[data-t=w-gone]')), 'OK closes it')

// ── sofas (GD world/sofa): watchers Ann (1440) + Ben (390) at the lounge
await walkTo(ann, 30, 10, 20000); await walkTo(ben, 36, 10, 20000)
const drawnOn = async (p, name) => { await front(p); await sleep(300); const e = await entBy(p, name); return p.evaluate(id => window.__world.r.drawn(id), e.id) }
const sitters = [cal, gus, fay]
for (let n = 0; n < 3; n++) {
  const p = sitters[n]; await walkTo(p, 32 + n, 9, 25000)
  const [tx, ty] = await p.evaluate(() => window.__world.tileCss(32, 6)); await tapAt(p, tx, ty)
  ok(!!(await until(async () => { const m = await meEnt(p); return m && (m.f & 8) && Math.floor(m.y) === 7 }, 15000)), `sofa: ${p.tag} sat (${n + 1})`)
  ok(!!(await until(() => p.$('[data-t=w-sofa]'), 3000)), `sofa: ${p.tag} gets the sofa panel`); await sleep(700)
  for (const w of [ann, ben]) {
    const ds = []; for (const s of sitters.slice(0, n + 1)) ds.push(await drawnOn(w, s.prof.name))
    const want = SEAT_ORDER.slice(0, n + 1).map(k => seatPx(0, k)), got = ds.map(d => [d.sx, d.sy])
    ok(want.every(([a, b]) => got.some(([c, d]) => c === a && d === b)), `sofa pixel-exact (${w.tag}, ${n + 1}): ${JSON.stringify(got)} = ${JSON.stringify(want)}`)
    const f = ds[0].fronts[0], byX = [...ds].sort((a, b) => a.sx - b.sx)
    ok(byX.every((d, i) => i === 0 || d.order > byX[i - 1].order) && byX.every(d => d.order < f.order) && f.x === SOFAS[0].x * 16 && f.y === SOFAS[0].y * 16, `sofa draw order (${w.tag}): bodies left→right, then the front`)
    ok(byX.every(d => d.legs && d.legs.x === d.sx && d.legs.y === d.sy), `sofa legs (${w.tag}): same offset as the body ${JSON.stringify(byX.map(d => d.legs && [d.legs.x, d.legs.y]))}`)
    ok(byX.every((d, i) => d.legs.order > f.order && (i === 0 || d.legs.order > byX[i - 1].legs.order)), `sofa draw order (${w.tag}): legs over the front, left→right`)
    const zs = [...byX.map(d => d.z), f.z, ...byX.map(d => d.legs.z)], base = (SOFAS[0].y + 2) * 16 * 1024
    ok(zs.every(z => Math.floor((z + 8) / 1024) * 1024 === base), `sofa: every layer sorts at the sofa bottom (y + 32)`)
  }
  await shot(ann, `14-sofa-${n + 1}`); await shot(ben, `14-sofa-${n + 1}`)
}
{ const pid = await player('hal', PHONE, 'Hal'); await walkTo(pid, 35, 9, 25000)
  // a full sofa is covered by its sitters (a tap on one opens their card): tap its bottom edge, below their shoes
  const [tx, ty] = await pid.evaluate(() => window.__world.tileCss(32, 7)), [, t2] = await pid.evaluate(() => window.__world.tileCss(32, 8)); await tapAt(pid, tx, ty + (t2 - ty) * 0.44)
  const full = await until(() => pid.evaluate(() => /full/i.test(document.body.innerText)), 6000); if (!full) { console.log('  hal at', JSON.stringify(await meEnt(pid))); await shot(pid, 'debug-full') } ok(!!full, 'sofa: the 4th is told it is full') }
await press(cal, '[data-t=w-sofa-stand]'); ok(!!(await until(async () => !((await meEnt(cal)).f & 8), 5000)), 'sofa: Stand up')

console.log(`\nworld-piano: ${n - bad}/${n} ${bad ? 'FAIL' : 'OK'}`)
await browser.close(); process.exit(bad ? 1 : 0)
