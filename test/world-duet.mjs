// Pixeldate World · 2c duets e2e: Start duet, invite sheet + card, seat pill, secret pick with previews, In tune / offer / Level up /
// coin flip, count-in, playing (players, listeners, tags), both seated, Play solo instead. Shots → shots/world-piano-duet-v1/ at 390 + 1440.
import puppeteer from 'puppeteer-core'
process.env.WORLD_PORT = '18797'; process.env.WORLD_URL = 'ws://127.0.0.1:18797'; process.env.WORLD_STALE_MS = '3000'
await import('../world/dev/server.ts')
const { Bot, profile, sleep } = await import('../world/test/lib.mjs')
const { SAMPLES } = await import('../src/avatar/kit/kit.gen.ts')
const APP = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
const WQ0 = '?world=cafe&loopback&ws=ws://127.0.0.1:18797&invite=dev-invite-1&auto=1'
const OUT = '/workspace/pixeldate/shots/world-piano-duet-v1/'
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
  const uid = 'du-' + tag + '-' + Date.now().toString(36)
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
    if (on) { await tapAt(p, x, y); if (await until(there, Math.min(9000, ms - (Date.now() - t0)))) return true; continue }   // a tap lost under a closing panel: tap again
    const cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2, dx = x - cx, dy = y - cy, k = Math.min((c.width / 2 - m) / Math.abs(dx || 1e-9), (c.height / 2 - m) / Math.abs(dy || 1e-9))
    // an edge point can land on furniture (the server ignores taps on solid tiles): step closer to the middle until one moves us
    const m0 = await meEnt(p)
    for (const f of [1, 0.8, 0.6, 0.4, 0.25]) { await tapAt(p, cx + dx * k * f, cy + dy * k * f); if (await until(async () => { const e = await meEnt(p); return Math.abs(e.x - m0.x) + Math.abs(e.y - m0.y) > 0.05 }, 700, 100)) break }
    let last = null; await until(async () => { const e = await meEnt(p); const still = last && Math.abs(e.x - last.x) < 0.01 && Math.abs(e.y - last.y) < 0.01; last = e; return still }, 4000, 250)
  }
  return there()
}
const tapPerson = async (p, name) => { const e = await entBy(p, name); const [x, y] = await p.evaluate(id => window.__world.css(id), e.id); await tapAt(p, x, y) }


const { PIANO_SEAT } = await import('../world/shared/piano.ts')
const { DUETS, BASS_SEAT, MELODY_SEAT } = await import('../world/shared/duet.ts')
const { TABLES } = await import('../world/shared/map.ts')
const pav = i => JSON.stringify({ v: 1, ...SAMPLES[i] })
const x = (p, sel) => p.$(sel)
const dz = (p, k) => p.evaluate(k => { const v = window.__world.duet[k]; return typeof v === 'function' ? v() : v }, k)
const dv = (p, f, ms = 20000) => until(async () => { const v = await dz(p, 'v'); return v && f(v) && v }, ms, 80)
const send = (p, m) => p.evaluate(m => window.__world.net.send(m), m)
const meId = async p => (await st(p)).me
const tap = async (p, sel, ms = 8000) => { const ok1 = await until(() => p.$(sel), ms); if (!ok1) { console.log('  missing', sel, 'on', p.tag); return false } await press(p, sel); return true }
const audioReq = new Map(); const watchAudio = p => { audioReq.set(p.tag, []); p.on('request', r => { if (/\/audio\//.test(r.url())) audioReq.get(p.tag).push(r.url().split('/audio/')[1]) }) }
// a date at a table, driven by the protocol (the table UI has its own e2e): 5 cards → Level 2 · Spark, then both say yes to the date
const tapeCards = p => p.evaluate(() => { window.__cards = []; window.__world.net.ws.addEventListener('message', e => { try { const m = JSON.parse(e.data); if (m.t === 'card') window.__cards.push(m) } catch {} }) })
const lastCard = p => p.evaluate(() => window.__cards.at(-1) ?? null)
async function date(a, b, ti) {
  const tb = TABLES[ti]; await tapeCards(a); await tapeCards(b)
  ok(await walkTo(a, ...tb.seats[0], 25000), `${a.tag}: at table ${ti}`); ok(await walkTo(b, ...tb.seats[1], 25000), `${b.tag}: at table ${ti}`)
  ok(!!(await until(async () => (await lastCard(a))?.q, 10000)), 'a card')
  for (let i = 0; i < 5; i++) { const c = await lastCard(a); if (c.rev) { await send(a, { t: 'next' }); await until(async () => { const d = await lastCard(a); return d && !d.rev && d.n === c.n }, 5000) }
    const n = (await lastCard(a)).n; await send(a, { t: 'ans', text: 'answer ' + i }); await send(b, { t: 'ans', text: 'reply ' + i })
    await until(async () => { const d = await lastCard(a); return d?.rev && d.n === n + 1 }, 5000) }
  ok((await lastCard(a)).lv === 2, `${a.tag}+${b.tag}: Level 2 at the table`)
  await send(a, { t: 'date', yes: true }); await send(b, { t: 'date', yes: true })
  ok(!!(await until(async () => { const d = await lastCard(a); return d?.date?.me && d?.date?.them }, 5000)), 'on a date')
  await send(a, { t: 'heart', id: await meId(b) }); await send(b, { t: 'heart', id: await meId(a) }); await sleep(400)
}
const seatOf = async p => { const m = await meEnt(p); return m && [Math.floor(m.x), Math.floor(m.y)] }
const noDup = async p => ok(await p.$$eval('[data-t=w-duet],[data-t=w-duet-pick],[data-t=w-duet-res],[data-t=w-piano]', e => e.length) <= 1, `${p.tag}: one panel at a time`)

// ── people: round 1 Ann (1440) is Bass and Ben (390) Melody; round 2 Dee (390) is Bass and Eve (1440) Melody; Cal (1440) and Fay (390) listen
const ann = await player('ann', DESK, 'Ann', { iam: 'woman', seek: 'men', pav: pav(3) }); watchAudio(ann)
const ben = await player('ben', PHONE, 'Ben', { pav: pav(10) }); watchAudio(ben)
const cal = await player('cal', DESK, 'Cal', { pav: pav(5) }); watchAudio(cal)
const fay = await player('fay', PHONE, 'Fay', { iam: 'woman', seek: 'men', pav: pav(1) }); watchAudio(fay)
await date(ann, ben, 0)

async function round(B, M, L1, L2, r) {
  // B (Bass) walks to the bench, picks a duet in the picker, Start duet → mock B
  ok(await walkTo(B, PIANO_SEAT[0], PIANO_SEAT[1], 30000), `${B.tag}: at the piano`)
  ok(!!(await until(() => x(B, '[data-t=w-duets-h]'), 6000)), 'picker: a Duets section')
  { const ids = await B.$$eval('[data-t=w-duet-song]', es => es.map(e => e.dataset.id)); ok(JSON.stringify(ids) === JSON.stringify(DUETS.map(d => d.id)), `picker: ${ids.length} duets in order`) }
  const song = DUETS[r].id
  await press(B, `[data-t=w-duet-song][data-id="${song}"]`); ok(!!(await until(() => x(B, '[data-t=w-duet-start]'), 3000)), 'picker: a duet row → Start duet')
  await shot(B, '01-picker-duet')
  await press(B, '[data-t=w-duet-start]')
  let v = await dv(B, v => v.me === 'bass' && v.ph === 'wait'); ok(!!v && v.song === song, `B: waiting as Bass for ${song}`)
  ok(!!(await until(async () => JSON.stringify(await seatOf(B)) === JSON.stringify([...BASS_SEAT]), 4000)), 'B: on the left seat')
  ok(!!(await until(() => B.$('[data-t=w-duet-status][data-ph=wait]'), 3000)), 'mock B: Waiting for a partner…'); await noDup(B)
  await shot(B, '02-waiting')
  // everyone near sees the open-seat marker + the mint Sit beside me pill
  for (const L of [L1, L2]) { await front(L); ok(!!(await until(() => L.$eval('[data-t=w-sit-beside]', e => !e.hidden).catch(() => false), 5000)), `${L.tag}: Sit beside me pill`)
    ok(!!(await until(async () => (await dz(L, 'r'))?.seatOpen >= 0, 3000)), `${L.tag}: open-seat marker drawn`) }
  ok(!(await dz(L1, 'v')).song, 'listeners: no song while waiting')
  await shot(L1, '03-seat-open'); await shot(L2, '03-seat-open')
  // E: the invite sheet (only hearts for you, Sat with you first)
  await tap(B, '[data-t=w-duet-invite]'); ok(!!(await until(() => B.$('[data-t=w-inv-row]'), 5000)), 'mock E: the invite sheet lists M')
  { const rows = await B.$$eval('[data-t=w-inv-row]', es => es.map(e => +e.dataset.id)); ok(rows.length === 1 && rows[0] === await meId(M), `invite sheet: only ${M.tag} (${rows})`) }
  ok(/Sat with you/.test(await B.$eval('[data-t=w-inv-sheet]', e => e.textContent)), 'invite sheet: Sat with you')
  await shot(B, '04-invite-sheet')
  await press(B, '[data-t=w-inv-btn]'); ok(!!(await until(async () => !(await x(B, '[data-t=w-inv-sheet]')), 3000)), 'the sheet closes after Invite')
  ok(!!(await until(() => B.$('[data-t=w-duet-seat][data-state=invited]'), 4000)), 'mock G: invited seat with countdown')
  await shot(B, '05-invite-sent')
  ok(!!(await until(() => M.$('[data-t=w-inv-card]'), 5000)), 'mock F: the invite card for M')
  ok(/invites you to a duet/.test(await M.$eval('[data-t=w-inv-card]', e => e.textContent)), 'invite card copy')
  await shot(M, '06-invite-card')
  if (r === 1) {   // round 2: No thanks → B is told; then M taps the Sit beside me pill instead
    await press(M, '[data-t=w-inv-no]'); ok(!!(await until(() => B.evaluate(() => /can.t play right now/.test(document.body.innerText)), 4000)), 'declined: B is told "M can\'t play right now"')
    ok(!!(await until(async () => !(await x(M, '[data-t=w-inv-card]')), 3000)), 'the card goes')
    await front(M); ok(!!(await until(() => M.$eval('[data-t=w-sit-beside]', e => !e.hidden).catch(() => false), 4000)), 'M sees the pill')
    await shot(B, '05b-declined')
    ok(await walkTo(M, 37, 21, 25000), 'M near the bench'); await front(M); await sleep(300)
    await press(M, '[data-t=w-sit-beside]')
  } else await press(M, '[data-t=w-inv-join]')
  v = await dv(M, v => v.me === 'melody' && v.ph === 'pick', 30000); ok(!!v, 'M sat as Melody → the secret pick')
  ok(JSON.stringify(await seatOf(M)) === JSON.stringify([...MELODY_SEAT]), 'M on the right seat')
  // I: the secret pick + previews
  for (const p of [B, M]) ok(!!(await until(() => p.$('[data-t=w-duet-pick]'), 5000)), `${p.tag}: mock I`)
  ok(await B.$$eval('[data-t=w-pick-card]', e => e.length) === DUETS.length, 'pick: 4 cards')
  await shot(B, '07-pick'); await shot(M, '07-pick')
  await press(M, `[data-t=w-pv][data-id="${DUETS[2].id}"]`)
  ok(!!(await until(async () => (await dz(M, 'pv')) === DUETS[2].id, 5000)), 'preview: plays on M only'); ok(!(await dz(B, 'pv')), 'preview: not on B')
  ok(!(await dz(M, 'v')).pick.mine, 'preview: does not pick')
  ok(!!(await until(() => M.$('[data-t=w-pv-label]'), 3000)), 'preview: Previewing label'); await sleep(600)
  ok(audioReq.get(M.tag).some(u => /duets\/preview_/.test(u)), 'preview: its file loaded')
  await shot(M, '08-preview')
  await press(M, `[data-t=w-pv][data-id="${DUETS[3].id}"]`); ok(!!(await until(async () => (await dz(M, 'pv')) === DUETS[3].id, 4000)), 'preview: one at a time (switches)')
  // first pick: B picks; M sees "Picked", never which
  await press(B, `[data-t=w-pick-card][data-id="${song}"]`); ok(!!(await until(() => M.$('[data-t=w-pick-them][data-done="1"]'), 4000)), 'pick: M sees B picked')
  ok(!(await M.evaluate(() => window.__world.duet.v().pick.mine)) && !(await M.evaluate(() => JSON.stringify(window.__world.duet.v().pick))).includes(song), "pick: B's card never shows to M")
  await shot(B, '09-picked')
  // match → J′ offer (on a date, Level 2), both yes → L Level up
  await press(M, `[data-t=w-pick-card][data-id="${song}"]`)
  ok(!!(await until(() => B.$('[data-t=w-duet-res][data-k=offer]'), 6000)), "mock J′: In tune! + the offer")
  ok(!(await dz(M, 'pv')), 'preview: stops when the pick screen closes')
  ok(audioReq.get(B.tag).some(u => /duetMatch_1/.test(u)), 'stinger: duetMatch_1')
  await shot(B, '10-offer'); await shot(M, '10-offer')
  await press(B, '[data-t=w-offer-yes]'); ok(!!(await until(() => B.$('[data-t=w-offer-wait]'), 3000)), 'offer: Waiting for M'); await shot(B, '11-offer-wait')
  await press(M, '[data-t=w-offer-yes]'); ok(!!(await until(() => B.$('[data-t=w-duet-res][data-k=levelup]'), 4000)), 'mock L: Level up!')
  ok((await B.$eval('[data-t=w-res-lv]', e => +e.dataset.lv)) === 3, 'Level 2 → 3'); await shot(B, '12-levelup'); await shot(M, '12-levelup')
  // D: the count-in; then playing (players + listeners)
  ok(!!(await until(() => B.$('[data-t=w-duet-status][data-ph=count]'), 12000)), 'mock D: starting in N'); await shot(B, '13-countin'); await shot(M, '13-countin')
  await front(L1); ok(!!(await until(async () => (await dz(L1, 'r'))?.count, 4000)), 'count-in sprite over the bench')
  ok(!!(await until(() => B.$('[data-t=w-duet][data-ph=play]'), 12000)), 'playing: players'); await sleep(800)
  { await front(B); const g = await dz(B, 'gains'), pos = await dz(B, 'pos'); ok(pos > 0, `stems playing (pos ${pos?.toFixed?.(2)})`); console.log('  gains', JSON.stringify(g)) }
  ok(audioReq.get(M.tag).some(u => new RegExp(song + '_melody').test(u)) && audioReq.get(B.tag).some(u => new RegExp(song + '_bass').test(u)), 'stems: both parts loaded')
  await shot(B, '14-playing'); await shot(M, '14-playing')
  for (const L of [L1, L2]) { await front(L); ok(!!(await until(() => L.$('[data-t=w-duet-card]'), 5000)), `${L.tag}: mock C listener card`)
    ok(!!(await until(() => L.$$eval('[data-t=w-duet-tag]', es => es.filter(e => !e.hidden).length === 2), 3000)), `${L.tag}: Bass / Melody tags under the bench`)
    ok(/duet/.test(await L.$eval('[data-t=w-np]', e => e.textContent).catch(() => '')), `${L.tag}: Now playing · duet`)
    await shot(L, '15-listener') }
  // mid-song: M stands up → the song plays on for B with the right seat empty; then B stands up → the duet is over for everyone
  await tap(M, '[data-t=w-duet-stand]'); ok(!!(await dv(L1, v => v.gone?.includes('melody') && v.ph === 'play', 6000)), 'M stands mid-song: the song plays on')
  await shot(B, '15b-partner-left')
  await tap(B, '[data-t=w-duet-stand]'); ok(!!(await until(async () => !(await dz(L1, 'v')), 6000)), 'B stands too: the duet is over')
  ok(!!(await until(async () => !(await x(L1, '[data-t=w-duet-card]')) && !(await x(L1, '[data-t=w-np]')), 4000)), 'listeners: card and chip gone')
  // again: B starts, M sits beside via the pill (no invite)
  ok(await walkTo(B, PIANO_SEAT[0], PIANO_SEAT[1], 30000), 'B back at the piano'); await tap(B, `[data-t=w-duet-song][data-id="${song}"]`); await tap(B, '[data-t=w-duet-start]')
  await dv(B, v => v.me === 'bass' && v.ph === 'wait')
  ok(await walkTo(M, 37, 21, 25000), 'M near the bench'); await front(M); ok(!!(await until(() => M.$eval('[data-t=w-sit-beside]', e => !e.hidden).catch(() => false), 5000)), 'M sees the pill')
  await press(M, '[data-t=w-sit-beside]'); ok(!!(await dv(M, v => v.me === 'melody' && v.ph === 'pick', 20000)), 'pill → sat as Melody → pick')
  // K: a miss → the coin flip (no offer)
  await until(() => B.$('[data-t=w-pick-card]')); await press(B, `[data-t=w-pick-card][data-id="${DUETS[0].id}"]`); await sleep(200); await until(() => M.$('[data-t=w-pick-card]')); await press(M, `[data-t=w-pick-card][data-id="${DUETS[1].id}"]`)
  ok(!!(await until(() => B.$('[data-t=w-duet-res][data-k=miss]'), 5000)), 'mock K: So close!'); await shot(B, '17-coin-flip'); await shot(M, '17-coin-flip')
  ok(!!(await until(() => B.$('[data-t=w-duet-res][data-flip="0"]'), 5000)), 'K: lands on one card'); await shot(B, '18-coin-landed'); await shot(M, '18-coin-landed')
  ok(audioReq.get(B.tag).some(u => /duetMiss_1/.test(u)), 'stinger: duetMiss_1')
  await dv(B, v => v.ph === 'count', 10000); await send(B, { t: 'dcancel' }); ok(!!(await dv(B, v => v.ph === 'both', 5000)), 'cancel in the count-in → both seated')
  ok(!!(await until(() => B.$('[data-t=w-duet-again]'), 3000)), 'both seated: Play a duet'); await shot(B, '16-both'); await shot(M, '16-both')
  // J: a plain match (today's offer is used) → In tune!, then the count-in
  await press(B, '[data-t=w-duet-again]'); await dv(M, v => v.ph === 'pick'); await until(() => M.$('[data-t=w-pick-card]')); await front(B); await until(() => B.$(`[data-t=w-pick-card][data-id="${DUETS[2].id}"]`), 8000)
  await press(B, `[data-t=w-pick-card][data-id="${DUETS[2].id}"]`); await sleep(200); await press(M, `[data-t=w-pick-card][data-id="${DUETS[2].id}"]`)
  ok(!!(await until(() => B.$('[data-t=w-duet-res][data-k=match]'), 5000)), 'mock J: In tune! (no offer the second time today)'); await shot(B, '19-in-tune'); await shot(M, '19-in-tune')
  await dv(B, v => v.ph === 'count', 10000); await send(B, { t: 'dcancel' }); await dv(B, v => v.ph === 'both')
  // M stands up → B waits again; Play solo instead → H (the mix at the middle seat)
  await tap(M, '[data-t=w-duet-stand]'); ok(!!(await dv(B, v => v.ph === 'wait' && !v.melody, 6000)), 'M stood up → B waits again')
  await tap(B, '[data-t=w-duet-solo]'); ok(!!(await until(() => B.$('[data-t=w-duet-solo-panel]'), 6000)), 'mock H: Playing both parts')
  ok(!!(await until(async () => JSON.stringify(await seatOf(B)) === JSON.stringify([...PIANO_SEAT]), 4000)), 'solo: the middle seat')
  await sleep(800); await shot(B, '20-solo')
  for (const L of [L1, L2]) { await front(L); ok(!!(await until(async () => /both parts/.test(await L.$eval('[data-t=w-np]', e => e.textContent).catch(() => '')), 5000)), `${L.tag}: chip · both parts`); await shot(L, '21-solo-listener') }
  await front(B); await until(() => B.$('[data-t=w-piano-stop]')); await B.$eval('[data-t=w-piano-stop]', e => e.click()); await sleep(200); await until(() => B.$('[data-t=w-piano-stand]')); await B.$eval('[data-t=w-piano-stand]', e => e.click()); await sleep(500)
  ok(!(await x(B, '[data-t=w-duet-solo-panel]')) && !(await x(B, '[data-t=w-piano]')), 'stand up: panels close')
  if (r === 0) await walkTo(M, 31, 22, 20000)
}
await round(ann, ben, cal, fay, 0)
const dee = await player('dee', PHONE, 'Dee', { pav: pav(8) }); watchAudio(dee)
const eve = await player('eve', DESK, 'Eve', { iam: 'woman', seek: 'men', pav: pav(6) }); watchAudio(eve)
await date(dee, eve, 1)
await walkTo(ann, 30, 17, 20000)
await round(dee, eve, cal, fay, 1)

console.log(`\nworld-duet: ${n - bad}/${n} ${bad ? 'FAIL' : 'OK'}`)
await browser.close(); process.exit(bad ? 1 : 0)
