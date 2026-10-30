// Pixeldate World · café e2e in real Chrome against the built app (vite preview :4173) and the Node dev world server.
//   phone  390x844 @3x, touch: tap-to-walk, tap a person, chat bar, simulated on-screen keyboard
//   desktop 1440x900 @1x, mouse + keys: click-to-walk, arrows/WASD, Enter to talk, Esc to close, camera follows
//   cross-device: both players in one room see each other move and swap a bubble
//   phone camera: 2 CSS px per art px, eased follow, clamped at the walls (no empty bands), coral arrows to off-screen hearts
//   GD v02 review: secondary Say while empty, night question card, merged arrows that keep off people
//   GD v03 finals: seated pose on the chair tiles, heart-bob / broken-heart, 4 upright edge arrows + ×n badges, 9-slice bubble
//   GD v04: dark Block, overlapping bubbles stack 2 art px apart with tails on their speakers, mint rim on mine, desktop side column
//   shots of every state at both sizes → shots/world-cafe-v04/     Run: node test/world-e2e.mjs   (FPS=1 adds the 40-player FPS run)
import puppeteer from 'puppeteer-core'
process.env.WORLD_PORT = '18793'; process.env.WORLD_URL = 'ws://127.0.0.1:18793'
const dev = await import('../world/dev/server.ts')
const { Bot, profile, sleep } = await import('../world/test/lib.mjs')
const { runBots } = await import('../world/test/bots.mjs')
const { SAMPLES } = await import('../src/avatar/kit/kit.gen.ts')
const { F_HEART, F_BROKEN, F_SIT } = await import('../world/shared/proto.ts')
const APP = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
const Q = '?world=cafe&ws=ws://127.0.0.1:18793'
const OUT = process.env.OUT || '/workspace/pixeldate/shots/world-cafe-v05/e2e/'
const { mkdirSync: mk } = await import('node:fs'); mk(OUT, { recursive: true })
let bad = 0, n = 0
// GD's bubble art, as the built CSS may carry it (a hashed file or, under Vite's inline limit, a data: URI)
const { readFileSync: rf } = await import('node:fs'), artIs = (css, f) => css.includes(f) || css.includes(rf(new URL(`../src/world/art/markers/${f}.png`, import.meta.url)).toString('base64'))
const ok = (c, m) => { n++; if (c) console.log('✔', m); else { bad++; console.log('✘ FAIL', m) } }
const until = async (f, ms = 6000, step = 60) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f(); if (v) return v; await sleep(step) } return null }
await sleep(300)

// ── the cast (server-side bots). Players are men seeking women, 30–34, wanting 26–38.
const W = (name, o = {}, i = 0) => new Bot(profile({ name, iam: 'woman', seek: 'men', br: [30, 34], min: 28, max: 40, pav: JSON.stringify({ v: 1, ...SAMPLES[i % 12] }), ...o }))
const cast = {
  mia: W('Mia', {}, 1), noor: W('Noor', {}, 3), jo: W('Jo', { seek: 'women' }, 5),
  ava: W('Ava', {}, 7), lea: W('Lea', {}, 9), zed: W('Zed', { iam: 'man', seek: 'everyone', br: [25, 29] }, 0), kit: W('Kit', { iam: 'man', seek: 'women' }, 2),
  rae: W('Rae', { br: [40, 49], min: 35, max: 55 }, 4), sol: W('Sol', { iam: 'man', seek: 'men' }, 6), una: W('Una', { seek: 'everyone', br: [25, 29], min: 22, max: 34 }, 8),
}
for (const b of Object.values(cast)) await b.connect()
// spread out from the door one by one (the doorway crowd would otherwise block itself); the marker trio stands near both players
const place = { sol: [20, 4], rae: [14, 5], una: [11, 6], kit: [16, 7], zed: [22, 6], ava: [9, 11], mia: [17, 11], noor: [13, 12], jo: [20, 12], lea: [26, 12] }
const at = (b, [x, y]) => { const e = b.self(); return e && Math.abs(e.x - x - 0.5) < 0.6 && Math.abs(e.y - y - 0.5) < 0.6 }
for (const [k, t] of Object.entries(place)) { cast[k].send({ t: 'go', x: t[0], y: t[1] }); await sleep(350) }
for (let i = 0; i < 3; i++) { const late = Object.entries(place).filter(([k, t]) => !at(cast[k], t)); if (!late.length) break; for (const [k, t] of late) cast[k].send({ t: 'go', x: t[0], y: t[1] }); await sleep(2500) }
{ const late = Object.entries(place).filter(([k, t]) => !at(cast[k], t)).map(([k]) => k); if (late.length) console.log('  (not at their spot yet:', late.join(', ') + ')') }
const idOf = (bot, name) => [...bot.pubs.values()].find(p => p.name === name)?.id

// ── browser
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 90000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=CalculateNativeWinOcclusion', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const PHONE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
async function player(tag, vp, name, sample, extra = {}) {
  const ctx = await browser.createBrowserContext(), p = await ctx.newPage(); await p.setViewport(vp)
  p.on('pageerror', e => { bad++; console.log('  PAGEERR', tag, e.message) }); p.on('console', m => { if (m.type() === 'error' && !/404|WebSocket/.test(m.text())) console.log(`  [${tag}]`, m.text().slice(0, 160)) })
  const prof = { name, age: 32, by: 1994, bm: 3, min: 26, max: 38, iam: 'man', seek: 'women', uid: 'e2e-' + tag + '-' + Date.now().toString(36), pav: JSON.stringify({ v: 1, ...SAMPLES[sample] }), ...extra }
  await p.evaluateOnNewDocument(pr => { if (!localStorage.getItem('pd.profile')) localStorage.setItem('pd.profile', pr) }, JSON.stringify(prof))
  p.tag = tag; p.prof = prof; p.sz = vp.width; return p
}
const shot = async (p, name) => { await sleep(350); await p.screenshot({ path: `${OUT}${name}-${p.sz}.png` }); console.log('  📷', `${name}-${p.sz}.png`) }
const st = p => p.evaluate(() => window.__world?.state())
const meEnt = async p => { const s = await st(p); return s?.ents.find(e => e.id === s.me) }
const entBy = async (p, name) => (await st(p))?.ents.find(e => e.name === name)
const tapAt = (p, x, y) => p.touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y)
const tapTile = async (p, tx, ty) => { const [x, y] = await p.evaluate((a, b) => window.__world.tileCss(a, b), tx, ty); await tapAt(p, x, y) }
const tapPerson = async (p, name) => { const e = await entBy(p, name); const [x, y] = await p.evaluate(id => window.__world.css(id), e.id); const c = await p.$eval('[data-t=w-canvas]', c => c.getBoundingClientRect().toJSON()); if (x < c.left || x > c.right || y < c.top || y > c.bottom) console.log(`  ${p.tag}: ${name} is off camera at ${x | 0},${y | 0}`); await tapAt(p, x, y) }
// tap-to-walk the way a person would: tap the tile if it is on screen, otherwise tap toward it at the screen edge and go again
// (the phone shows ~12 tiles across, so far tiles take a couple of hops)
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
// every bubble on screen: box (tail included), tail column and tip vs its speaker's head (r.tip), all in art px
const bubbleGeo = p => p.evaluate(() => { const W = window.__world, u = W.r.k / W.r.dpr, o = document.querySelector('.w-over').getBoundingClientRect()
  return [...document.querySelectorAll('[data-t=bubble]')].filter(e => e.style.visibility !== 'hidden').map(e => { const r = e.getBoundingClientRect(), tip = W.r.tip(+e.dataset.id), tx = parseFloat(e.style.getPropertyValue('--tx'))
    return { id: +e.dataset.id, text: e.textContent, mine: e.classList.contains('mine'), l: (r.left - o.left) / u, t: (r.top - o.top) / u, w: r.width / u, H: r.height / u + 4, col: (r.left - o.left + tx) / u, tipX: tip && tip[0] / u, tipY: tip && tip[1] / u, lift: +e.dataset.lift } }) })
const stackReport = bs => { const g = 2, e = 0.02, near = [], bad = []
  for (const a of bs) for (const b of bs) if (a !== b && a.l < b.l + b.w + g - e && b.l < a.l + a.w + g - e && a.t < b.t) { const gap = b.t - (a.t + a.H); near.push(gap); if (gap < g - e) bad.push(`${a.text}/${b.text} gap ${gap.toFixed(2)}`) }
  const tails = bs.filter(b => b.tipX == null || Math.abs(b.col - b.tipX) > e || b.t + b.H > b.tipY + e || (!b.lift && Math.abs(b.t + b.H - b.tipY) > e)).map(b => b.text)
  return { near, bad, tails, lifted: bs.filter(b => b.lift > 0).length, tight: near.filter(x => Math.abs(x - g) < e).length } }
// farthest any pixel in a screenshot clip strays from colour c (max channel difference)
const maxOff = async (p, clip, c) => { const b = await p.screenshot({ clip, encoding: 'base64' })
  return p.evaluate(async (b, c) => { const i = new Image(); i.src = 'data:image/png;base64,' + b; await i.decode(); const g = new OffscreenCanvas(i.width, i.height).getContext('2d'); g.drawImage(i, 0, 0)
    const d = g.getImageData(0, 0, i.width, i.height).data; let m = 0; for (let k = 0; k < d.length; k += 4) m = Math.max(m, Math.abs(d[k] - c[0]), Math.abs(d[k + 1] - c[1]), Math.abs(d[k + 2] - c[2])); return m }, b, c) }
const press = (p, sel) => p.touch ? p.tap(sel) : p.click(sel)
const said = new Map() // per player: say timestamps, to stay inside 3 per 15 s
async function sayUI(p, text, viaEnter) {
  const ts = said.get(p) || []; while (ts.length >= 3 && Date.now() - ts[ts.length - 3] < 15500) await sleep(250); ts.push(Date.now()); said.set(p, ts)
  if (viaEnter) { await p.keyboard.press('Enter'); await p.keyboard.type(text); await p.keyboard.press('Enter') }
  else { await press(p, '[data-t=w-input]'); await p.type('[data-t=w-input]', text); await press(p, '[data-t=w-send]') }
}

// ── one full pass per device: gate → café → bubble → filtered → person menu → report → table card → block
async function flow(p, o) {
  const L = p.tag
  // gate: refused without a valid invite, Enter disabled without 18+
  await p.goto(APP + Q + '&invite=nope', { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-t=w-gate]')
  ok(await p.$eval('[data-t=w-enter]', b => b.disabled), `${L}: Enter disabled until 18+ is ticked`)
  await shot(p, '01-gate')
  await press(p, '[data-t=w-adult]'); await press(p, '[data-t=w-enter]')
  ok(await until(() => p.$('[data-t=w-refused]')), `${L}: bad invite refused`); await shot(p, '02-refused')
  await p.$eval('[data-t=w-invite]', e => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })) })
  await p.type('[data-t=w-invite]', 'dev-invite-1'); await press(p, '[data-t=w-enter]')
  ok(await until(() => p.$('[data-t=w-room]'), 6000), `${L}: joined with invite + 18+`)
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('pd.profile')).adult === true), `${L}: 18+ saved on the profile`)
  await until(async () => { const s = await st(p); return s?.ents.length >= 11 && s.gl }, 8000)  // renderer init is async (Pixi picks a backend)
  const s0 = await st(p)
  ok(s0.layout === o.layout && (await p.$eval('[data-t=w-room]', e => e.dataset.layout)) === o.layout, `${L}: layout ${s0.layout}`)
  ok(Number.isInteger(s0.k) && s0.k >= 1, `${L}: integer pixel scale k=${s0.k} (dpr ${o.dpr})`)
  const cv = await p.$eval('[data-t=w-canvas]', c => ({ w: c.width, h: c.height, cw: c.getBoundingClientRect().width, ch: c.getBoundingClientRect().height }))
  ok(Math.abs(cv.cw * o.dpr - cv.w) < 1.01 && Math.abs(cv.ch * o.dpr - cv.h) < 1.01, `${L}: canvas backing store = css x dpr (${cv.w}x${cv.h}), no browser resampling`)
  ok(s0.gl === 'webgl', `${L}: PixiJS v8 renderer (${s0.gl})`)
  const [MW, MH] = s0.map
  ok(MW === 640 && MH === 384, `${L}: one shared 40x24 café (${MW}x${MH} art px)`)
  ok(s0.vw <= MW + 1e-6 && s0.vh <= MH + 1e-6, `${L}: view ${s0.vw.toFixed(1)}x${s0.vh.toFixed(1)} art px never bigger than the room (no empty bands)`)
  if (o.layout === 'phone') ok(s0.k / o.dpr === 2 && Math.abs(s0.vw / 16 - 12.2) < 0.3, `${L}: 2x scale, ${(s0.vw / 16).toFixed(1)} tiles across at 390`)
  else { const side = await p.$eval('.w-side, [data-t=w-say]', e => e.getBoundingClientRect().left); ok(side > 1000, `${L}: chat bar down the side (x=${side})`); ok(s0.vw < MW && s0.vh < MH, `${L}: camera view ${s0.vw.toFixed(0)}x${s0.vh.toFixed(0)} smaller than the map, so it follows`) }
  const sb = await p.$eval('[data-t=w-say]', e => e.getBoundingClientRect().toJSON()); ok(sb.bottom <= o.h + 0.5, `${L}: chat bar on screen (bottom ${sb.bottom.toFixed(0)})`)
  // Say: the #281D52 secondary style while the input is empty, primary butter once there is text
  const sendBg = () => p.$eval('[data-t=w-send]', b => [b.disabled, getComputedStyle(b).backgroundColor, getComputedStyle(b).color, getComputedStyle(b).opacity])
  { const [dis, bg, fg, op] = await sendBg(); ok(dis && bg === 'rgb(40, 29, 82)' && fg === 'rgb(164, 156, 194)' && op === '1', `${L}: Say disabled while empty, secondary #281D52 (${bg}, text ${fg})`) }
  await shot(p, '15-say-disabled')
  await p.type('[data-t=w-input]', 'hi')
  { const [dis, bg] = await sendBg(); ok(!dis && bg === 'rgb(255, 216, 77)', `${L}: Say back to primary butter with text (${bg})`) }
  await p.$eval('[data-t=w-input]', e => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })); e.blur() })

  // walk: phone taps, desktop clicks; then desktop keys
  const before = await st(p)
  let lag = 0; const lagT = setInterval(async () => { const s = await st(p).catch(() => null); if (s) lag = Math.max(lag, Math.hypot(s.cam[0] - s.camT[0], s.cam[1] - s.camT[1])) }, 50)
  ok(await walkTo(p, o.stand[0], o.stand[1]), `${L}: ${p.touch ? 'tap' : 'click'}-to-walk reached tile ${o.stand}`)
  clearInterval(lagT); await sleep(900)
  { const s = await st(p); ok(lag > 0.5 && Math.hypot(s.cam[0] - s.camT[0], s.cam[1] - s.camT[1]) < 0.1, `${L}: camera eases after me (lagged up to ${lag.toFixed(1)} px, settled on target)`) }
  if (o.layout === 'desk') {
    const camA = (await st(p)).cam
    const m0 = await meEnt(p); await p.keyboard.down('ArrowLeft'); await sleep(900); await p.keyboard.up('ArrowLeft'); await sleep(300); const m1 = await meEnt(p)
    ok(m1.x < m0.x - 1.5, `${L}: ArrowLeft walks (${m0.x.toFixed(1)} → ${m1.x.toFixed(1)})`)
    await p.keyboard.down('w'); await sleep(700); await p.keyboard.up('w'); await sleep(300); const m2 = await meEnt(p)
    ok(m2.y < m1.y - 1, `${L}: W walks up (${m1.y.toFixed(1)} → ${m2.y.toFixed(1)})`)
    await p.keyboard.down('d'); await sleep(900); await p.keyboard.up('d'); await p.keyboard.down('s'); await sleep(700); await p.keyboard.up('s'); await sleep(300)
    const camB = (await st(p)).cam; ok(camA.join() !== camB.join() || camA.join() !== before.cam.join(), `${L}: camera follows (${before.cam} → ${camA} → ${camB})`)
    await walkTo(p, o.stand[0], o.stand[1])
  }
  // markers, per viewer: Mia heart, Noor broken (she passed on me), Jo nothing
  const meId = (await st(p)).me
  await until(() => idOf(cast.noor, p.prof.name)); cast.noor.send({ t: 'pass', id: idOf(cast.noor, p.prof.name) })
  ok(await until(async () => ((await entBy(p, 'Mia'))?.f & F_HEART), 4000), `${L}: coral heart over Mia (compatible both ways, not met)`)
  ok(await until(async () => ((await entBy(p, 'Noor'))?.f & F_BROKEN), 4000), `${L}: broken heart over Noor (passed on me)`)
  const jo = await entBy(p, 'Jo'); ok(jo && !(jo.f & (F_HEART | F_BROKEN)), `${L}: nothing over Jo (not compatible)`)
  const noorSees = cast.noor.ents.get(idOf(cast.noor, p.prof.name)); ok(noorSees && !(noorSees.f & (F_HEART | F_BROKEN)), `${L}: Noor sees no marker over me (she passed)`)
  // off-screen hearts: walk to the left wall; Mia and Lea (hearts) are out of view to the right, within 30° of each other,
  // so they share one arrow with a ×2 tag. The desktop sees further, so Mia steps over beside Lea first.
  if (o.layout === 'desk') { cast.mia.send({ t: 'go', x: 29, y: 12 }); await until(() => at(cast.mia, [29, 12]), 8000) }
  {
    await walkTo(p, ...o.arrowAt); await sleep(900)
    const mia = await entBy(p, 'Mia'), lea = await entBy(p, 'Lea'), s = await st(p), a = s.arrows.find(x => x.ids.includes(mia.id))
    const u = s.k / s.dpr, gap = a ? s.css[0] / u - (a.x / u + 10) : -1   // arrow centre → tip column is +10 art px
    ok(a && a.dir === 'right' && gap >= 3 - 1e-6 && gap < 4, `${L}: right-edge arrow (GD's edge-arrow) points to Mia off screen, tip 2 art px inside the edge (${a ? `${a.x.toFixed(0)},${a.y.toFixed(0)} ${a.dir}, gap ${gap.toFixed(2)}` : 'none'})`)
    ok(a && a.n === 2 && a.ids.includes(lea.id) && s.arrows.filter(x => x.dir === 'right').length === 1, `${L}: Mia and Lea share one arrow with ×${a?.n} (${s.arrows.length} arrow(s): ${s.arrows.map(x => `${x.dir} ×${x.n}`).join(', ')})`)
    ok(a && a.badge === 'x2' && s.arrows.every(x => x.badge === (x.n > 1 ? (x.n > 9 ? 'x9+' : 'x' + x.n) : '')), `${L}: merged arrow wears the ×2 count badge (${a?.badge})`)
    ok(s.arrows.every(x => x.ids.every(id => s.ents.find(e => e.id === id)?.f & F_HEART)), `${L}: arrows only for people with a heart`)
    ok(s.arrows.every(x => !x.cover), `${L}: no arrow covers a person at the edge`)
    { const want = { heart: [9, 8], 'heart-bob': [18, 9], 'broken-heart': [9, 7], 'edge-arrow': [24, 24], 'edge-arrow-left': [24, 24], 'edge-arrow-up': [24, 24], 'edge-arrow-down': [24, 24], 'count-badges': [103, 9] }
      ok(Object.entries(want).every(([f, wh]) => s.art?.[f]?.join() === wh.join()), `${L}: GD's final marker files loaded at their README sizes (${JSON.stringify(s.art)})`) }
    await shot(p, '13-arrows-x2')
  }
  if (o.layout === 'desk') { cast.mia.send({ t: 'go', x: 17, y: 11 }); await until(() => at(cast.mia, [17, 11]), 8000); await walkTo(p, o.stand[0], o.stand[1], 15000); await sleep(900) }
  if (o.layout === 'phone') {
    // walls: bottom-left corner, the camera stops at the room edge and shows nothing outside it
    await walkTo(p, ...o.wallAt); await sleep(1000)
    const w = await st(p)
    ok(w.cam[0] === 0 && Math.abs(w.cam[1] - (MH - w.vh)) < 0.01, `${L}: camera clamped at the walls (cam ${w.cam.map(v => v.toFixed(1))}, view ${w.vw.toFixed(0)}x${w.vh.toFixed(0)} of ${MW}x${MH})`)
    await shot(p, '14-wall')
    await walkTo(p, o.stand[0], o.stand[1], 15000); await sleep(900)
  }
  await shot(p, '03-cafe')
  console.log('  cast on screen:', JSON.stringify(await p.evaluate(() => window.__world.state().ents.map(e => [e.name, e.f, ...(window.__world.css(e.id) || []).map(Math.round)]))))

  // bubbles: someone else's, then mine
  cast.mia.send({ t: 'say', text: 'love the lamps in here' }); cast.jo.send({ t: 'say', text: 'first time here?' })
  ok(await until(() => p.$$eval('[data-t=bubble]', es => es.some(e => e.textContent === 'love the lamps in here'))), `${L}: Mia's bubble shows over her`)
  await sleep(200)
  { const b = await p.evaluate(() => { const W = window.__world, e = [...document.querySelectorAll('[data-t=bubble]')].find(e => e.textContent === 'love the lamps in here'), cs = getComputedStyle(e), r = e.getBoundingClientRect(), o = e.parentElement.getBoundingClientRect()
      const t = getComputedStyle(e, '::after'), u = W.r.k / W.r.dpr, tip = W.r.tip(+e.dataset.id)
      return { src: cs.borderImageSource, sl: cs.borderImageSlice, col: cs.color, w: r.width / u, h: r.height / u, tail: t.backgroundImage, tw: parseFloat(t.width) / u, tipY: tip && (tip[1] - (r.bottom - o.top)) / u, tipX: tip && (tip[0] - (r.left - o.left)) / u, lift: +e.dataset.lift || 0, kids: e.children.length } })
    ok(artIs(b.src, 'speech-bubble-9slice') && /^4 fill$/.test(b.sl) && b.col === 'rgb(255, 241, 193)', `${L}: bubble is GD's 9-slice (slice ${b.sl}), cream text (${b.col})`)
    ok(Math.abs(b.w - Math.round(b.w)) < 0.02 && Math.abs(b.h - Math.round(b.h)) < 0.02 && b.w >= 12 && b.h >= 12, `${L}: bubble box snapped to whole art px (${b.w.toFixed(2)}x${b.h.toFixed(2)})`)
    ok(artIs(b.tail, 'speech-bubble-tail') && Math.abs(b.tw - 9) < 0.02 && Math.abs(b.tipY - 4 - b.lift) < 0.02 && b.tipX >= 4 - 0.02, `${L}: tail tip 2 art px above her head, plus ${b.lift} if stacked (tail ${b.tw.toFixed(1)} wide, tip ${b.tipY?.toFixed(2)} below the box, column ${b.tipX?.toFixed(1)})`)
    ok(b.kids === 0, `${L}: bubble text is plain text (no markup)`) }
  const myLine = o.layout === 'phone' ? 'anyone into climbing?' : 'coffee or tea?'
  await sayUI(p, myLine, o.layout === 'desk')
  ok(await until(() => p.$$eval('[data-t=bubble].mine', es => es.some(e => e.textContent === 'coffee or tea?' || e.textContent === 'anyone into climbing?'))), `${L}: my bubble shows (${o.layout === 'desk' ? 'Enter → type → Enter' : 'tap input, type, Say'})`)
  ok(await until(() => cast.mia.events.some(e => e.t === 'say' && e.id === idOf(cast.mia, p.prof.name) && e.text === myLine)), `${L}: Mia heard me`)
  await sleep(250)
  { const bs = await bubbleGeo(p), S = stackReport(bs)
    ok(bs.length >= 3 && !S.bad.length, `${L}: no two bubbles closer than 2 art px (${bs.length} bubbles${S.bad.length ? '; ' + S.bad.join(', ') : ''})`)
    ok(S.lifted >= 1 && S.tight >= 1, `${L}: overlapping bubbles stack upward, exactly 2 art px apart (${S.lifted} nudged, gaps ${S.near.map(x => x.toFixed(1)).join(' ')})`)
    ok(!S.tails.length, `${L}: every tail sits on its own speaker's head column and points down at them (${S.tails.join(', ') || 'all ' + bs.length})`) }
  { const m = await p.$$eval('[data-t=bubble]', es => es.map(e => ({ mine: e.classList.contains('mine'), b: getComputedStyle(e).borderImageSource, t: getComputedStyle(e, '::after').backgroundImage })))
    const mine = m.find(x => x.mine), other = m.find(x => !x.mine)
    ok(mine && artIs(mine.b, 'speech-bubble-9slice-mine') && artIs(mine.t, 'speech-bubble-tail-mine') && other && artIs(other.b, 'speech-bubble-9slice') && !artIs(other.b, 'speech-bubble-9slice-mine'), `${L}: my bubble has the 1 px mint rim (GD's 9-slice + tail with the rim in #48E5C2), others keep #4A3886`)
    if (mine) { const rim = await p.evaluate(() => { const e = document.querySelector('[data-t=bubble].mine'), r = e.getBoundingClientRect(), u = window.__world.r.k / window.__world.r.dpr; return [r.left, r.top, r.width, r.height, u] })
      const [x, y, w, h, u] = rim, png = await p.screenshot({ clip: { x, y, width: w, height: h }, encoding: 'base64' }), px = await p.evaluate(async (b, u) => { const i = new Image(); i.src = 'data:image/png;base64,' + b; await i.decode(); const c = new OffscreenCanvas(i.width, i.height), g = c.getContext('2d'); g.drawImage(i, 0, 0); const d = g.getImageData(Math.round(6 * u * devicePixelRatio), Math.round(1.5 * u * devicePixelRatio), 1, 1).data; return [...d].slice(0, 3) }, png, u)
      ok(px.join() === '72,229,194', `${L}: the rim pixel on screen is mint (${px})`)
      await p.screenshot({ path: `${OUT}18-own-bubble-${p.sz}.png`, clip: { x: Math.max(0, x - 30), y: Math.max(0, y - 30), width: w + 60, height: h + 80 } }); console.log('  📷', `18-own-bubble-${p.sz}.png`) } }
  await shot(p, '04-bubble')
  if (o.layout === 'desk') { await p.keyboard.press('Escape'); ok(await p.evaluate(() => document.activeElement?.dataset?.t !== 'w-input'), `${L}: Esc leaves the chat input`) }
  // filtered: the sender sees it held; nobody else gets it
  const bad1 = o.layout === 'phone' ? 'text me on 07700 900123' : 'add me @sam_k on insta'
  const heardBefore = cast.mia.events.length
  await sayUI(p, bad1, o.layout === 'desk')
  ok(await until(() => p.$$eval('[data-t=bubble].held', es => es.some(e => e.textContent.includes('07700') || e.textContent.includes('@sam_k')))), `${L}: filtered bubble held for me`)
  ok(await until(() => p.$eval('[data-t=w-note]', e => /Not sent/.test(e.textContent)).catch(() => false)), `${L}: "not sent" note`)
  await shot(p, '05-filtered'); await sleep(400)
  ok(!cast.mia.events.slice(heardBefore).some(e => e.t === 'say' && /07700|sam_k/.test(e.text)) && !cast.jo.events.some(e => e.t === 'say' && /07700|sam_k/.test(e.text)), `${L}: nobody else got the filtered text`)
  if (o.layout === 'desk') await p.keyboard.press('Escape')

  // person menu: name, bracket, Heart/Pass/Report/Block
  await tapPerson(p, 'Kit' === o.reportee ? 'Kit' : o.reportee)
  ok(await until(() => p.$('[data-t=w-person]')), `${L}: ${p.touch ? 'tap' : 'click'} a person opens their card`)
  const pn = await p.$eval('[data-t=w-person]', e => e.textContent); ok(pn.includes(o.reportee) && /\d\d–\d\d/.test(pn), `${L}: card shows name + bracket ("${pn.slice(0, 40)}")`)
  ok(!/\b(2[0-9]|3[0-9]) years|seek|women|men\b/i.test(pn), `${L}: card shows no age, prefs or wishes`)
  { const bt = await p.$$eval('[data-t=w-person] .w-acts .w-btn', es => es.map(e => ({ t: e.dataset.t, bg: getComputedStyle(e).backgroundColor, c: getComputedStyle(e).color })))
    const blk = bt.find(b => b.t === 'w-block'), hrt = bt.find(b => b.t === 'w-heart'), dark = ['rgb(40, 29, 82)', 'rgb(30, 22, 64)']
    ok(blk && blk.bg === 'rgb(40, 29, 82)' && blk.c === 'rgb(255, 111, 89)', `${L}: Block is the dark #281D52 button with coral text (${blk?.bg}, ${blk?.c})`)
    ok(hrt && hrt.bg === 'rgb(255, 111, 89)' && bt.filter(b => b !== hrt).every(b => dark.includes(b.bg)), `${L}: Heart is the only loud button (${bt.map(b => b.t.slice(2) + ' ' + b.bg).join(', ')})`) }
  await shot(p, '06-person')
  if (o.layout === 'desk') {
    // a burst of chat so the log has to scroll (2 lines from each person, inside 3 per 15 s)
    const lines = ['the oat latte is great', 'anyone here before?', 'nice lamps', 'is the music on?', 'first time for me', 'hello all', 'which table is free?', 'I like the rug', 'love this place', 'cosy in here']
    const who = ['mia', 'noor', 'jo', 'ava', 'lea', 'zed', 'kit', 'rae', 'sol', 'una']
    for (const r of [0, 1]) { for (const [i, k] of who.entries()) { cast[k].send({ t: 'say', text: `${lines[(i + r * 3) % 10]}${r ? ' :)' : ''}` }); await sleep(60) } await sleep(400) }
    await until(() => p.$$eval('[data-t=w-log] li', es => es.length >= 22), 6000); await sleep(400)
    const c = await p.evaluate(() => { const q = s => document.querySelector(s), R = s => q(s)?.getBoundingClientRect().toJSON(), side = q('[data-t=w-side]'), ol = q('[data-t=w-log] ol')
      return { side: R('[data-t=w-side]'), person: R('[data-t=w-person]'), log: R('[data-t=w-log]'), bar: R('[data-t=w-say]'), help: R('[data-t=w-help]'), cred: R('[data-t=w-credit-help]'), hf: parseFloat(getComputedStyle(q('[data-t=w-help]')).fontSize),
        sideOver: side.scrollHeight - side.clientHeight, oy: getComputedStyle(ol).overflowY, sh: ol.scrollHeight, ch: ol.clientHeight, st: ol.scrollTop,
        items: [...ol.querySelectorAll('li')].map(li => [li.querySelector('b')?.textContent, li.querySelector('span')?.textContent, li.dataset.mine === '1']) } })
    ok(c.person && Math.abs(c.person.top - c.side.top - 14) < 2.5, `${L}: person panel pinned at the top of the side column (${(c.person?.top - c.side.top).toFixed(0)} px down)`)
    ok(c.person && c.log.top >= c.person.bottom && c.bar.top >= c.log.bottom && c.help.top >= c.bar.bottom && (!c.cred || c.cred.top >= c.help.bottom) && Math.abs(c.side.bottom - (c.cred ?? c.help).bottom - 14) < 2.5 && c.sideOver <= 0, `${L}: then the chat log, the bar, the help panel and the piano credit at the bottom; nothing spills out of the column`)
    ok(c.hf <= 12 && c.help.height < 60, `${L}: help is a small panel (${c.hf}px text, ${c.help.height.toFixed(0)} px tall)`)
    ok(c.oy === 'auto' && c.sh > c.ch + 20 && c.st + c.ch >= c.sh - 2, `${L}: chat log scrolls and stays on the newest line (${c.items.length} lines, ${c.sh} of ${c.ch} px, at the bottom)`)
    ok(c.items.some(([n, t, m]) => n === 'Mia' && t === 'love the lamps in here' && !m) && c.items.some(([n, t, m]) => n === 'You' && t === myLine && m), `${L}: log has names + text, my own line marked "You"`)
    ok(!c.items.some(([, t]) => /07700|sam_k/.test(t || '')), `${L}: filtered text never reaches the log`)
    { const S = stackReport(await bubbleGeo(p)); ok(!S.bad.length && !S.tails.length && S.lifted >= 1, `${L}: the burst stacks too: no overlaps, tails on their speakers (${S.lifted} nudged${S.bad.length ? '; ' + S.bad.join(', ') : ''}${S.tails.length ? '; bad tails ' + S.tails.join(', ') : ''})`) }
    // GD v04 polish: the top 12px of the log fades into the panel (a mask on the scroller, so no overlay), and a half-scrolled line no longer clips hard
    { const f = await p.evaluate(() => { const ol = document.querySelector('[data-t=w-log] ol'), cs = getComputedStyle(ol), r = ol.getBoundingClientRect(), st = ol.scrollTop
        ol.scrollTop = 0; const first = ol.firstElementChild.getBoundingClientRect().top - r.top; ol.scrollTop = st
        const hit = [4, 10].map(dy => ol.contains(document.elementFromPoint(r.left + r.width / 2, r.top + dy)))
        return { m: cs.maskImage || cs.webkitMaskImage, pe: cs.pointerEvents, first, hit, panel: getComputedStyle(ol.parentElement).backgroundColor } })
      ok(/linear-gradient/.test(f.m) && /(transparent|rgba\(0, 0, 0, 0\)) 0(px)?/.test(f.m) && /12px/.test(f.m) && f.pe !== 'none', `${L}: chat log top 12px fades out (mask-image ${f.m})`)
      ok(f.hit.every(Boolean) && f.first >= 11.5, `${L}: the fade doesn't cover the log: the top strip is still the log itself (clicks/scroll reach it), first line sits clear of it at rest (${f.first.toFixed(0)} px)`)
      const box = await p.evaluate(() => { const ol = document.querySelector('[data-t=w-log] ol'), r = ol.getBoundingClientRect(), max = ol.scrollHeight - ol.clientHeight
        ol.scrollTop = 0; const offs = [...ol.children].map(li => li.getBoundingClientRect().top - r.top + 6).filter(d => d > 12 && d <= max)
        ol.scrollTop = offs[offs.length - 1] ?? max   // the lowest line that can still be half-scrolled past the top edge (the log may be short of a full screen)
        return { x: r.left + 12, y: r.top, width: r.width - 24, height: 2, sec: ol.parentElement.getBoundingClientRect().toJSON() } })
      await sleep(150); const panel = f.panel.match(/\d+/g).map(Number), clip = { x: box.x, y: box.y, width: box.width, height: box.height }
      const faded = await maxOff(p, clip, panel)
      await p.evaluate(() => { const s = document.querySelector('[data-t=w-log] ol').style; s.maskImage = s.webkitMaskImage = 'none' }); await sleep(100)
      const hard = await maxOff(p, clip, panel)
      await p.evaluate(() => { const s = document.querySelector('[data-t=w-log] ol').style; s.maskImage = s.webkitMaskImage = '' }); await sleep(100)
      ok(hard > 60 && faded <= hard / 4, `${L}: a half-scrolled line no longer clips hard at the top: the top 2 px rows are within ${faded} of the panel colour (${hard} without the fade)`)
      await p.screenshot({ path: `${OUT}19-log-fade-1440.png`, clip: { x: box.sec.x - 8, y: box.sec.y - 8, width: box.sec.width + 16, height: 150 } }); console.log('  📷', '19-log-fade-1440.png')
      const before = await p.$eval('[data-t=w-log] ol', e => e.scrollTop); await p.mouse.move(box.x + 40, box.y + 5); await p.mouse.wheel({ deltaY: -120 }); await sleep(250)
      const after = await p.$eval('[data-t=w-log] ol', e => e.scrollTop)
      ok(after < before, `${L}: the wheel over the faded strip still scrolls the log (${before} → ${after})`)
      await p.$eval('[data-t=w-log] ol', e => { e.scrollTop = e.scrollHeight }); await sleep(150) }
    await shot(p, '17-stacked-bubbles')
    await p.screenshot({ path: `${OUT}16-side-column-${p.sz}.png`, clip: { x: c.side.left, y: 0, width: c.side.width, height: 900 } }); console.log('  📷', `16-side-column-${p.sz}.png`)
  }
  await press(p, '[data-t=w-report]'); await p.waitForSelector('[data-t=w-reasons]'); await shot(p, '07-report')
  const nRep = dev.reports.length; await press(p, '[data-t=w-why-rude]')
  ok(await until(() => dev.reports.length > nRep), `${L}: report stored`)
  const rep = dev.reports.at(-1); ok(rep.by === p.prof.uid && rep.why === 'rude' && rep.at > 0 && rep.ctx && Array.isArray(rep.ctx.where), `${L}: report has time, reason and context`)
  if (o.layout === 'desk') { await tapPerson(p, o.reportee); await p.waitForSelector('[data-t=w-person]'); await p.keyboard.press('Escape'); ok(await until(async () => !(await p.$('[data-t=w-person]'))), `${L}: Esc closes the person card`) }

  // table for two: I take a seat, a bot takes the other; same card for both
  const [mine, theirs] = o.table
  ok(await walkTo(p, mine[0], mine[1], 15000), `${L}: walked to seat ${mine}`)
  cast[o.partner].send({ t: 'go', x: theirs[0], y: theirs[1] })
  ok(await until(() => p.$('[data-t=w-card]'), 15000), `${L}: shared question card appears`)
  const q = await p.$eval('[data-t=w-q]', e => e.textContent), bc = await until(() => cast[o.partner].last('card')?.q)
  ok(bc && bc.text === q, `${L}: ${cast[o.partner].p.name} got the same card ("${q.slice(0, 40)}…")`)
  ok(((await meEnt(p)).f & F_SIT), `${L}: I'm sitting`)
  await until(async () => ((await entBy(p, cast[o.partner].p.name))?.f & F_SIT), 8000); await sleep(300)
  for (const [who, t] of [['me', mine], [cast[o.partner].p.name, theirs]]) {
    const v = await p.evaluate((who, t) => { const W = window.__world, s = W.state(), e = who === 'me' ? s.ents.find(e => e.id === s.me) : s.ents.find(e => e.name === who), x = W.r.ents.get(e.id)
      return x && { sit: x.sit, dx: x.sx - t[0] * 16, dy: x.sy - (t[1] - 1) * 16, d: e.d ?? null } }, who, t)
    const want = t[0] < (t === mine ? theirs : mine)[0] ? -2 : -6   // left seat faces right: -2; right seat faces left: -6
    ok(v && v.sit && v.dy === -10 && v.dx === want, `${L}: ${who} drawn seated on GD's chair tile (sprite at chair ${v?.dx},${v?.dy}, want ${want},-10)`)
  }
  { const c = await p.$eval('[data-t=w-card]', e => { const g = (q, k) => getComputedStyle(e.querySelector(q) || e)[k], cs = getComputedStyle(e)
      return { bg: cs.backgroundColor, bw: cs.borderTopWidth, bc: cs.borderTopColor, with: document.querySelector('[data-t=w-with]')?.textContent, wf: getComputedStyle(document.querySelector('[data-t=w-with]') || e).fontFamily, q: g('[data-t=w-q]', 'color'), nb: g('[data-t=w-next]', 'backgroundColor') } })
    const name = cast[o.partner].p.name
    ok(c.bg === 'rgb(30, 22, 64)' && c.bw === '2px' && c.bc === 'rgb(255, 216, 77)', `${L}: card is a #1E1640 panel with a 2px butter border (${c.bg}, ${c.bw} ${c.bc})`)
    ok(c.with === name && /Jersey 15/.test(c.wf), `${L}: "${c.with}" in Jersey 15`)
    ok(c.q === 'rgb(255, 246, 236)', `${L}: question in cream (${c.q})`) }
  await shot(p, '08-card')
  // v05: Next card only once you've both answered; then X stands you up (the room chat comes back)
  await p.type('[data-t=w-ans-input]', 'e2e answer'); await press(p, '[data-t=w-ans-send]'); cast[o.partner].send({ t: 'ans', text: 'bot answer' })
  ok(await until(() => p.$('[data-t=w-next]'), 6000), `${L}: both answered, Next card shows`)
  { const nb = await p.$eval('[data-t=w-next]', e => getComputedStyle(e).backgroundColor); ok(nb === 'rgb(255, 216, 77)', `${L}: Next card is a butter button (${nb})`) }
  await press(p, '[data-t=w-next]'); ok(await until(async () => (await p.$eval('[data-t=w-q]', e => e.textContent)) !== q), `${L}: Next card`)
  await press(p, '[data-t=w-stand]'); ok(await until(async () => !(await p.$('[data-t=w-card]')) && !!(await p.$('[data-t=w-say]')), 8000), `${L}: X stands up, the room chat bar is back`)

  // block: both disappear for each other
  await tapPerson(p, o.blockee); await p.waitForSelector('[data-t=w-person]'); await press(p, '[data-t=w-block]'); await p.waitForSelector('[data-t=w-confirm]'); await shot(p, '09-block')
  const bk = cast[o.blockee.toLowerCase()]; await press(p, '[data-t=w-block-yes]')
  ok(await until(async () => !(await entBy(p, o.blockee))), `${L}: ${o.blockee} gone for me`)
  ok(await until(() => !bk.ents.has(meId) && !bk.pubs.has(meId)), `${L}: I'm gone for ${o.blockee}`)
  await shot(p, '10-blocked')
  return meId
}

const phone = await player('phone', PHONE, 'Sam', 10); phone.touch = true
const desk = await player('desk', DESK, 'Alex', 11)
const T0 = Date.now()
const phoneId = await flow(phone, { layout: 'phone', dpr: 3, h: 844, stand: [15, 10], arrowAt: [1, 12], wallAt: [2, 22], reportee: 'Kit', table: [[2, 9], [5, 9]], partner: 'ava', blockee: 'Una' })
// phone keyboard: headless Chrome has no soft keyboard, so shrink the viewport the way one would and check the bar stays put
await press(phone, '[data-t=w-input]'); await phone.setViewport({ ...PHONE, height: 844 - 336 }); await sleep(600)
{ const b = await phone.$eval('[data-t=w-say]', e => e.getBoundingClientRect().toJSON()), c = await phone.$eval('[data-t=w-canvas]', e => e.getBoundingClientRect().toJSON())
  ok(b.bottom <= 508.5 && b.top > 300 && c.height > 120, `phone: with a 336 px keyboard the chat bar sits just above it (bar ${b.top.toFixed(0)}–${b.bottom.toFixed(0)}, café ${c.height.toFixed(0)} px tall)`)
  await phone.type('[data-t=w-input]', 'typing with the keyboard up'); await shot(phone, '11-keyboard') }
await phone.$eval('[data-t=w-input]', e => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })); e.blur() })
await phone.setViewport(PHONE); await sleep(400)
const deskId = await flow(desk, { layout: 'desk', dpr: 1, h: 900, stand: [20, 10], arrowAt: [1, 12], reportee: 'Zed', table: [[18, 15], [21, 15]], partner: 'lea', blockee: 'Kit' })

// ── cross-device: same room, each sees the other move, bubbles both ways
ok((await st(phone)).inst === (await st(desk)).inst, `cross: phone and desktop in the same room (${(await st(phone)).inst})`)
const seen = async (p, id) => (await st(p)).ents.find(e => e.id === id)
ok(await seen(phone, deskId) && await seen(desk, phoneId), 'cross: each sees the other')
for (const p of [phone, desk]) { ok(await walkTo(p, ...(p === phone ? [10, 12] : [12, 13])), `cross: ${p.tag} walks over`); await sleep(200) }
{ const a = await seen(desk, phoneId); await phone.touchscreen.tap(...await phone.evaluate(() => window.__world.tileCss(8, 13)))
  ok(await until(async () => { const b = await seen(desk, phoneId); return b && Math.hypot(b.x - a.x, b.y - a.y) > 1 }, 6000), 'cross: desktop sees the phone player walk (touch)') }
{ const a = await seen(phone, deskId); await desk.keyboard.down('ArrowRight'); await sleep(700); await desk.keyboard.up('ArrowRight')
  ok(await until(async () => { const b = await seen(phone, deskId); return b && b.x > a.x + 1 }, 6000), 'cross: phone sees the desktop player walk (keys)') }
await sleep(500)
await sayUI(desk, 'hi from the big screen', true)
ok(await until(() => phone.$$eval('[data-t=bubble]', (es, id) => es.some(e => e.dataset.id === String(id) && e.textContent === 'hi from the big screen'), deskId)), 'cross: phone sees the desktop bubble')
await desk.keyboard.press('Escape'); await sayUI(phone, 'hello from my phone', false)
ok(await until(() => desk.$$eval('[data-t=bubble]', (es, id) => es.some(e => e.dataset.id === String(id) && e.textContent === 'hello from my phone'), phoneId)), 'cross: desktop sees the phone bubble')
await shot(phone, '12-cross'); await shot(desk, '12-cross')
// leaks in the browser: nothing the page got carries prefs, refusals or uids
for (const p of [phone, desk]) {
  const leak = await p.evaluate(() => { const n = window.__world.net, j = JSON.stringify([...n.pubs.values()]); return /uid|seek|"min"|"max"|iam|pass|refus|bot-/.test(j) ? j.slice(0, 200) : '' })
  ok(!leak, `${p.tag}: no prefs/uids/refusals in what the page holds ${leak}`)
}
console.log(`  flow time ${((Date.now() - T0) / 1000).toFixed(0)} s`)
await phone.browserContext().close(); await desk.browserContext().close()
for (const b of Object.values(cast)) b.close()

// ── FPS with 40 in the room (39 bots + the phone), raw Chrome numbers: unthrottled and CPU throttled 4x
if (process.env.FPS) {
  await sleep(1500)
  const crowd = await runBots(39, { room: 'cafe-1' })
  const p = await player('fps', PHONE, 'Fay', 4, { adult: true }); p.touch = true
  await p.goto(APP + Q + '&invite=dev-invite-1&auto=1', { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-t=w-room]')
  await until(async () => (await st(p))?.ents.length >= 40, 8000)
  const cdp = await p.createCDPSession(), res = {}
  for (const rate of [1, 4]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate }); await sleep(1500)
    const f = await p.evaluate(() => new Promise(r => { let k = 0; const t0 = performance.now(); const go = () => { k++; if (performance.now() - t0 < 5000) requestAnimationFrame(go); else r(k / ((performance.now() - t0) / 1000)) }; requestAnimationFrame(go) }))
    const s = await st(p); res['x' + rate] = { fps: +f.toFixed(1), ents: s.ents.length }; console.log(`  FPS at ${s.ents.length} players, CPU x${rate}: ${f.toFixed(1)}`)
  }
  const { writeFileSync, mkdirSync } = await import('node:fs'); mkdirSync('world/test/.out', { recursive: true }); writeFileSync('world/test/.out/fps.json', JSON.stringify(res, null, 1))
  ok(res.x1.ents === 40, 'fps: 40 players on screen')
  crowd.stop(); await p.browserContext().close()
}
await browser.close()
console.log(bad ? `world e2e: ${bad} FAILED of ${n}` : `world e2e: ALL ${n} OK`)
process.exit(bad ? 1 : 0)
