// Pixeldate World · voice emotes e2e: GD's tray + effect art (shots → shots/world-emotes-v1/). Run: node test/world-emote.mjs
import puppeteer from 'puppeteer-core'
process.env.WORLD_PORT = '18797'; process.env.WORLD_URL = 'ws://127.0.0.1:18797'; process.env.WORLD_STALE_MS = '3000'
await import('../world/dev/server.ts')
const { Bot, profile, sleep } = await import('../world/test/lib.mjs')
const { SAMPLES } = await import('../src/avatar/kit/kit.gen.ts')
const { gainAt, panAt } = await import('../world/shared/piano.ts')
const EFX = JSON.parse((await import('node:fs')).readFileSync('src/world/art/emotes/effects/effects.json', 'utf8'))
const { EMOTES, setOf, DEFAULT_SET, TAKES, nextTake, EMOTE_COOLDOWN_MS } = await import('../world/shared/emote.ts')
const APP = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
const WQ0 = '?world=cafe&loopback&ws=ws://127.0.0.1:18797&invite=dev-invite-1&auto=1'
const OUT = '/workspace/pixeldate/shots/world-emotes-v1/'
const fs = await import('node:fs'); fs.mkdirSync(OUT, { recursive: true })
let bad = 0, n = 0
const ok = (c, m) => { n++; if (c) console.log('✔', m); else { bad++; console.log('✘ FAIL', m) } }
const until = async (f, ms = 6000, step = 60) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f(); if (v) return v; await sleep(step) } return null }

// ── units
ok(setOf(undefined) === 'female' && DEFAULT_SET === 'female', 'default set (no "I am") is female')
ok(setOf('man') === 'male' && setOf('woman') === 'female', 'set follows "I am"')
ok(EMOTES.join() === 'giggle,sigh,groan,aww,gasp', 'five emotes')
{ let last, rep = 0; for (let i = 0; i < 500; i++) { const t = nextTake('male', 'sigh', last, Math.random); if (t === last) rep++; last = t } ok(rep === 0, 'nextTake never repeats (500 draws)') }
for (const s of ['female', 'male']) for (const e of EMOTES) for (const t of TAKES[s][e]) for (const x of ['ogg', 'm4a']) if (!fs.existsSync(`audio/emotes/${t}.${x}`)) ok(false, 'missing audio/emotes/' + t + '.' + x)
ok(fs.existsSync('audio/emotes/duetMatch_1.ogg') && fs.existsSync('audio/emotes/duetMiss_1.m4a'), 'every take + duet stingers exist as ogg and m4a')

await sleep(300)
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 90000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const PHONE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const ctx = await browser.createBrowserContext()
async function player(tag, vp, name, extra = {}) {
  const p = await ctx.newPage(); await p.setViewport(vp); p.tag = tag; p.sz = vp.width; p.touch = !!vp.hasTouch; p.reqs = []
  p.on('pageerror', e => { bad++; console.log('  PAGEERR', tag, e.message) }); p.on('request', r => { if (/\/audio\//.test(r.url())) p.reqs.push(r.url()) })
  const uid = 'em-' + tag + '-' + Date.now().toString(36)
  const prof = { name, age: 32, by: 1994, bm: 3, min: 26, max: 38, iam: 'man', seek: 'everyone', adult: true, uid, ...extra }
  await p.goto(APP + '?loopback&blank', { waitUntil: 'domcontentloaded' })
  await p.evaluate((pr, uid) => { sessionStorage.setItem('pd-uid', uid); sessionStorage.setItem('pd.profile', pr) }, JSON.stringify(prof), uid)
  await p.goto(APP + WQ0, { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-t=w-room]', { timeout: 20000 })
  return p
}
const front = async p => { if (front.cur !== p) { await p.bringToFront(); front.cur = p; await sleep(120) } }
const press = async (p, sel) => { await front(p); return p.touch ? p.tap(sel) : p.click(sel) }
const shot = async (p, name) => { await front(p); await sleep(400); await p.screenshot({ path: `${OUT}${name}-${p.sz}.png` }); console.log('  📷', `${name}-${p.sz}.png`) }
const emo = async (p, e) => { if (!(await p.$('[data-t=w-emotes]'))) { await press(p, '[data-t=w-emote-toggle]'); await p.waitForSelector('[data-t=w-emotes]', { timeout: 2000 }) } return press(p, `[data-t=w-emote][data-e=${e}]`) }
const em = (p, k) => p.evaluate(k => window.__world.emote[k](), k)
const st = p => p.evaluate(() => window.__world?.state())
const meEnt = async p => { const s = await st(p); return s?.ents.find(e => e.id === s.me) }
const fx = async p => { await front(p); return p.evaluate(() => window.__world.emoteFx()) }
const box = (p, sel) => p.$eval(sel, e => { const r = e.getBoundingClientRect(), s = e.closest('[data-t=w-room]').querySelector('.w-stage').getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height, b: s.bottom - r.bottom, py: r.top } }).catch(() => null)
const trayState = p => p.$$eval('[data-t=w-emote]', l => l.map(b => ({ e: b.dataset.e, cd: b.classList.contains('cd'), on: b.classList.contains('on'), dis: b.getAttribute('aria-disabled') === 'true', w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height,
  img: b.querySelector('img').dataset.art, nw: b.querySelector('img').naturalWidth, iw: b.querySelector('img').getBoundingClientRect().width })))
const pOf = p => p.$eval('[data-t=w-emotes]', e => +getComputedStyle(e).getPropertyValue('--p')).catch(() => -1)
const shotQ = async (p, name) => { await front(p); await sleep(60); await p.screenshot({ path: `${OUT}${name}-${p.sz}.png` }); console.log('  📷', `${name}-${p.sz}.png`) }

// ── effect art: GD's sheets, sizes and timings (README)
ok(Object.keys(EFX.emotes).join() === EMOTES.join(), 'effects.json covers the five emotes')
const ann = await player('ann', DESK, 'Ann', { iam: 'woman', pav: JSON.stringify({ v: 1, ...SAMPLES[3] }) })
const ben = await player('ben', PHONE, 'Ben', { pav: JSON.stringify({ v: 1, ...SAMPLES[10] }) })
await sleep(1200)
{ const art = (await st(ann)).art; ok(EMOTES.every(e => art['emote-' + e]?.join() === [24 * EFX.emotes[e].frames, 24].join()), 'effect sheets load at (24·frames)×24: ' + EMOTES.map(e => art['emote-' + e]?.join('x')).join(' ')) }
ok(ann.reqs.length + ben.reqs.length === 0, 'lazy: no emote audio fetched on joining')

// ── tray: desktop opens by default at (8, 820) over the map; phone folds by default next to ♪
{ const t = await trayState(ann), s = await box(ann, '[data-t=w-emotes]')
  ok(t.map(x => x.e).join() === EMOTES.join() && t.every(x => x.w === 52 && x.h === 56), 'desk: the open tray has five 52×56 buttons')
  ok(t.every(x => x.img === x.e + '@2x' && x.nw === 32 && x.iw === 32), `desk (DPR 1): 32 px icons from @2x: ${t[0].img} ${t[0].nw}`)
  ok(s && s.x === 8 && s.w === 329 && s.h === 68 && Math.abs(s.py - 820) <= 2, `desk: strip 329×68 (as GD's mock renders) at (8, ${s?.py}) on the page, bottom-left of the map (GD 8, 820): ${JSON.stringify(s)}`)
  ok(!(await ann.$('[data-t=w-sound]')), 'desk: no ♪ button (the piano card has its own mute)') }
{ const one = await box(ben, '[data-t=w-emote-toggle]'), note = await box(ben, '[data-t=w-sound]')
  ok(!(await ben.$('[data-t=w-emotes]')) && one && one.w === 36 && one.h === 36 && one.x === 50, `phone: folded by default to one 36×36 smiley at x ${one?.x}`)
  ok(note && note.w === 36 && note.h === 36 && note.x === 8 && note.y === one.y, `phone: ♪ 36×36 at x 8, smiley level with it (y ${note?.y}/${one?.y})`)
  ok(await ben.$eval('[data-t=w-emote-toggle] img', i => i.dataset.art === 'smiley@3x' && i.naturalWidth === 48 && i.getBoundingClientRect().width === 16), 'phone: smiley at 16 CSS px from @3x (DPR 3)')
  await shotQ(ben, 'tray-folded')
  await press(ben, '[data-t=w-emote-toggle]'); await ben.waitForSelector('[data-t=w-emotes]', { timeout: 2000 })
  const t = await trayState(ben), s = await box(ben, '[data-t=w-emotes]')
  ok(t.length === 5 && t.every(x => x.img === x.e + '@3x' && x.nw === 48 && x.iw === 32), 'phone: tap opens five buttons, 32 px icons from @3x')
  ok(s && s.x === 50 && s.w === 329 && s.y + s.h === note.y + note.h, `phone: strip right of ♪ (x ${s?.x}), bottom (with drop edge) on the ♪'s: ${s && s.y + s.h} vs ${note.y + note.h}`)
  await shotQ(ben, 'tray-open')
  await ben.reload({ waitUntil: 'networkidle0' }); await ben.waitForSelector('[data-t=w-room]', { timeout: 20000 }); await sleep(800)
  ok(!!(await ben.$('[data-t=w-emotes]')), 'phone: open/folded is remembered on the device (open after reload)')
  await press(ben, '.w-et-tray .fold'); ok(!(await ben.$('[data-t=w-emotes]')) && await ben.evaluate(() => localStorage.getItem('pd.emoTray')) === 'fold', 'phone: × folds it again (remembered)')
  await press(ann, '.w-et-tray .fold'); ok(!!(await ann.$('.w-et-one.desk')), 'desk: × folds to the smiley'); await shotQ(ann, 'tray-folded'); await press(ann, '[data-t=w-emote-toggle]') }
{ await press(ben, '[data-t=w-sound]'); ok(await ben.evaluate(() => localStorage.getItem('pd.pianoMute')) === '1' && await ben.$eval('[data-t=w-sound]', b => b.getAttribute('aria-pressed')) === 'false' && await ben.evaluate(() => window.__world.piano.muted()), 'phone ♪: café sound off (the piano mute, remembered)')
  await press(ben, '[data-t=w-sound]'); ok(await ben.evaluate(() => localStorage.getItem('pd.pianoMute')) === '0' && !(await ben.evaluate(() => window.__world.piano.muted())), 'phone ♪: and on again') }

// ── the cast: everyone near sofa 0 so both screens see them
const { SOFAS } = await import('../world/shared/sofa.ts')
const walkTo = async (p, x, y) => { await p.evaluate((x, y) => window.__world.net.send({ t: 'go', x, y }), x, y); return until(async () => { const m = await meEnt(p); return m && Math.hypot(m.x - x - .5, m.y - y - .5) < .3 }, 15000) }
const far = new Bot(profile({ name: 'Far', iam: 'woman' }), { room: 'cafe-1' }); await far.connect(); far.send({ t: 'go', x: 3, y: 12 })
const stand = new Bot(profile({ name: 'Sto', iam: 'woman', br: [60, 999] }), { room: 'cafe-1' }); await stand.connect(); stand.send({ t: 'go', x: 30, y: 9 })
const sit = new Bot(profile({ name: 'Sia', iam: 'woman', br: [60, 999] }), { room: 'cafe-1' }); await sit.connect(); sit.send({ t: 'sofa', i: 0 })
const hrt = new Bot(profile({ name: 'Hana', iam: 'woman', br: [30, 34] }), { room: 'cafe-1' }); await hrt.connect(); hrt.send({ t: 'go', x: 34, y: 9 })
ok(!!(await walkTo(ann, 29, 11)) && !!(await walkTo(ben, 31, 11)), 'Ann and Ben walk over to the sofa')
await sit.wait(() => { const s = sit.self(); return s && (s.f & 8) }, 15000); await sleep(2500)
// Ben taps the floor once (unlocks his audio: browsers need a gesture)
await front(ben); { const c = await ben.$eval('[data-t=w-canvas]', c => c.getBoundingClientRect().toJSON()); await ben.touchscreen.tap(c.left + 20, c.top + 40) }
await walkTo(ben, 31, 11); await sleep(600)

// ── audio (kept): her own take at full gain, Ben with the piano falloff, the far bot told too
await emo(ann, 'giggle'); const tSend = Date.now()
const a1 = await until(async () => (await em(ann, 'played')).at(-1)); ok(a1 && /^emotes\/giggle_f[12]$/.test(a1.path) && a1.gain === 1 && a1.pan === 0, 'Ann (woman) hears her own giggle from the female set at full gain, centred: ' + a1?.path)
const b1 = await until(async () => (await em(ben, 'played')).at(-1)); const A = await meEnt(ann), B = await meEnt(ben)
const want = gainAt(Math.hypot(A.x - B.x, A.y - B.y)), wp = panAt(A.x - B.x)
ok(b1 && b1.path === a1.path && Math.abs(b1.gain - want) < 0.08 && Math.abs(b1.pan - wp) < 0.15, `Ben hears the same take with the piano falloff (gain ${b1?.gain?.toFixed(2)} ≈ ${want.toFixed(2)}, pan ${b1?.pan?.toFixed(2)} ≈ ${wp.toFixed(2)})`)
ok(await until(() => far.events.some(e => e.t === 'emote')), 'the far bot is told too (whole room)'); const fe = far.events.filter(e => e.t === 'emote'); ok(fe.length === 1 && fe[0].take === a1.path.slice(7), 'one event, same take')
ok(ann.reqs.some(u => /\/audio\/emotes\/giggle_f[12]\.ogg$/.test(u)), 'fetched as .ogg from audio/emotes/ on demand')
// ── the effect: GD's sheet over Ann on both screens, standing anchor; heart-marked anchor on Ben's (he sees her heart)
{ const me = (await st(ann)).me
  const fa = await until(async () => (await fx(ann)).find(f => f.id === me), 1000)
  { const f0 = fa?.f; await sleep(300); const f1 = (await fx(ann)).find(f => f.id === me)?.f; ok(f1 > f0, `frames advance by GD's frame_ms (${f0} → ${f1})`) }
  const fb = await until(async () => (await fx(ben)).find(f => f.id === me), 1000)
  ok(fa && fa.e === 'giggle' && fa.dx === 0 && fa.dy === -24, `effect over Ann on her screen at (sx, sy−24): ${JSON.stringify(fa)}`)
  const mk = await ben.evaluate(id => window.__world.couple().marks[id], me)
  ok(fb && fb.e === 'giggle' && (mk?.[1] ? fb.dy === -35 : fb.dy === -24), `…and on Ben's (heart marker ${mk?.[1] ? 'on → sy−35' : 'off → sy−24'}): ${JSON.stringify(fb)}`)
  const tray = await trayState(ann); ok(tray.every(x => x.cd && x.dis) && tray.filter(x => x.on).map(x => x.e).join() === 'giggle', 'cooldown: all five dimmed + untappable, the sent one keeps its ring')
  await front(ann); const p1 = await pOf(ann); await sleep(500); const p2 = await pOf(ann); ok(p1 > 0 && p2 > p1 && p2 < 1, `cooldown: the sweep runs (--p ${p1} → ${p2})`)
  await shotQ(ann, 'tray-cooldown')
  const nA = (await em(ann, 'played')).length; await press(ann, '[data-t=w-emote][data-e=sigh]'); await sleep(400); ok((await em(ann, 'played')).length === nA, 'cooldown: tapping a dimmed button sends nothing')
  // server-side: bypass the tray and send straight to the server inside the window
  await ann.evaluate(() => window.__world.net.send({ t: 'emote', e: 'sigh' }))
  ok(await until(() => ann.$eval('[data-t=w-note]', e => /One at a time/.test(e.textContent)).catch(() => false), 2000), 'server cooldown: a raw send inside 3 s is refused')
  await sleep(500); ok((await em(ben, 'played')).length === 1 && far.events.filter(e => e.t === 'emote').length === 1, 'server cooldown: dropped, nobody hears it')
  await until(async () => !(await fx(ann)).length, 2500); ok(!(await fx(ann)).find(f => f.id === me) && Date.now() - tSend < EFX.emotes.giggle.duration_ms + 1600, 'effect: one-shot, gone after its run')
  const late = new Bot(profile({ name: 'Late' }), { room: 'cafe-1' }); await late.connect(); await sleep(400); ok(!late.events.some(e => e.t === 'emote'), 'late joiners get no replay'); late.close()
  await until(async () => !(await trayState(ann)).some(x => x.cd), 3000); ok(Date.now() - tSend >= EMOTE_COOLDOWN_MS - 100 && !(await trayState(ann)).some(x => x.cd), `cooldown ends after 3 s (${Date.now() - tSend} ms)`) }
await shotQ(ben, 'tray-cooldown-pre'); { await emo(ben, 'aww'); await sleep(1100); await shotQ(ben, 'tray-cooldown'); fs.rmSync(`${OUT}tray-cooldown-pre-390.png`) }
await sleep(EMOTE_COOLDOWN_MS); await press(ben, '.w-et-tray .fold')
await shotQ(ann, 'tray-open')

// ── each emote over a standing, a seated and a heart-marked character (both screens), anchors checked
const ids = { stand: stand.me, sit: sit.me, hrt: hrt.me }
for (const e of EMOTES) for (const p of [ann, ben]) {
  await sleep(EMOTE_COOLDOWN_MS + 150); for (const b of [stand, sit, hrt]) b.send({ t: 'emote', e })
  const all = await until(async () => { const f = await fx(p); return Object.values(ids).every(id => f.some(x => x.id === id && x.e === e)) && f }, 2500)
  if (!all) console.log('  debug', e, p.tag, JSON.stringify(await fx(p)), JSON.stringify(ids), JSON.stringify([stand, sit, hrt].map(b => b.events.filter(x => x.t === 'emote').slice(-3))), JSON.stringify([stand, sit, hrt].map(b => b.text.filter(x => /emote/.test(typeof x === 'string' ? x : JSON.stringify(x))).slice(-2))))
  await sleep(Math.round(EFX.emotes[e].duration_ms * .3)); await shotQ(p, 'emote-' + e)
  const g = id => all && all.find(x => x.id === id), mk = await p.evaluate(() => window.__world.couple().marks)
  ok(g(ids.stand)?.dy === -24 && g(ids.sit)?.dy === -21 && g(ids.hrt)?.dy === -35 && mk[ids.hrt]?.[1] && !mk[ids.stand]?.[1] && !mk[ids.sit]?.[1],
    `${e} on ${p.tag}'s screen: standing sy−24, seated sy−21, heart-marked sy−35 (${['stand', 'sit', 'hrt'].map(k => g(ids[k])?.dy).join('/')})`)
}
// a speech bubble wins the head slot: the emote goes above the bubble
{ await sleep(EMOTE_COOLDOWN_MS + 150); stand.send({ t: 'say', text: 'hello there' }); await sleep(500); stand.send({ t: 'emote', e: 'gasp' })
  const g = await until(async () => { const x = (await fx(ann)).find(x => x.id === stand.me); return x && x.dy < -24 && x }, 1500)
  const bt = await ann.evaluate(id => { const r = window.__world.r, x = r.ents.get(id); return [r.bubbleTop.get(id), x?.sy] }, stand.me)
  ok(g && bt[0] !== undefined && bt[1] + g.dy + 24 <= bt[0] && g.dy < -24, `with a bubble up the emote sits above it (emote bottom ${bt[1] + (g?.dy ?? 0) + 24} ≤ bubble top ${bt[0]?.toFixed(1)})`)
  await shotQ(ann, 'emote-over-bubble') }
// Ben (man) → male set
await emo(ben, 'gasp')
const b2 = await until(async () => (await em(ann, 'played')).find(x => /gasp_m/.test(x.path))); ok(b2 && /^emotes\/gasp_m[12]$/.test(b2.path), 'Ben (man) gasps from the male set: ' + b2?.path)
// mute: the piano mute (remembered) silences emotes, which go through its master
await ben.evaluate(() => localStorage.setItem('pd.pianoMute', '1')); await ben.reload({ waitUntil: 'networkidle0' }); await ben.waitForSelector('[data-t=w-room]', { timeout: 20000 })
await sleep(1500); await emo(ben, 'aww'); await sleep(EMOTE_COOLDOWN_MS + 100); await emo(ann, 'aww')
const b3 = await until(async () => (await em(ben, 'played')).find(x => /aww_f/.test(x.path)), 3000)
ok(b3 && (await em(ben, 'master')) === 0, 'mute: a muted listener\'s emotes play into a silent master (gain 0)')
await ben.evaluate(() => { localStorage.setItem('pd.pianoMute', '0'); localStorage.removeItem('pd.emoTray') })
for (const b of [stand, sit, hrt]) b.close()
for (const p of [ann, ben]) await p.close(); far.close(); await browser.close()
console.log(bad ? `\n${bad}/${n} FAILED` : `\nEMOTE e2e: ALL ${n} OK`)
process.exit(bad ? 1 : 0)
