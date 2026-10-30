// Pixeldate World · voice emotes e2e (shots → shots/world-piano-duet-v1/emote-*). Run: node test/world-emote.mjs
import puppeteer from 'puppeteer-core'
process.env.WORLD_PORT = '18797'; process.env.WORLD_URL = 'ws://127.0.0.1:18797'; process.env.WORLD_STALE_MS = '3000'
await import('../world/dev/server.ts')
const { Bot, profile, sleep } = await import('../world/test/lib.mjs')
const { SAMPLES } = await import('../src/avatar/kit/kit.gen.ts')
const { gainAt, panAt } = await import('../world/shared/piano.ts')
const { EMOTES, setOf, DEFAULT_SET, TAKES, nextTake, EMOTE_COOLDOWN_MS } = await import('../world/shared/emote.ts')
const APP = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
const WQ0 = '?world=cafe&loopback&ws=ws://127.0.0.1:18797&invite=dev-invite-1&auto=1'
const OUT = '/workspace/pixeldate/shots/world-piano-duet-v1/'
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
// the phone folds the tray behind one button (it closes again after an emote)
const emo = async (p, e) => { if (p.touch && !(await p.$('[data-t=w-emotes]'))) { await press(p, '[data-t=w-emote-toggle]'); await p.waitForSelector('[data-t=w-emotes]', { timeout: 2000 }) } return press(p, `[data-t=w-emote][data-e=${e}]`) }
const em = (p, k) => p.evaluate(k => window.__world.emote[k](), k)
const st = p => p.evaluate(() => window.__world?.state())
const meEnt = async p => { const s = await st(p); return s?.ents.find(e => e.id === s.me) }

const ann = await player('ann', DESK, 'Ann', { iam: 'woman', pav: JSON.stringify({ v: 1, ...SAMPLES[3] }) })
const ben = await player('ben', PHONE, 'Ben', { pav: JSON.stringify({ v: 1, ...SAMPLES[10] }) })
await sleep(1200)
ok(ann.reqs.length + ben.reqs.length === 0, 'lazy: no emote audio fetched on joining')
ok(await ann.$$eval('[data-t=w-emote]', b => b.map(x => x.dataset.e).join()) === EMOTES.join(), 'tray: five emote buttons (placeholder art)')
{ const t = await ben.$eval('[data-t=w-emote-toggle]', e => e.getBoundingClientRect().toJSON()).catch(() => null)
  ok(t && !(await ben.$('[data-t=w-emotes]')) && t.width <= 40 && t.height <= 40, `phone: the tray is folded behind one ${t?.width}×${t?.height} button`)
  await press(ben, '[data-t=w-emote-toggle]'); ok((await ben.$$eval('[data-t=w-emote]', b => b.length)) === 5 && (await ben.$eval('[data-t=w-emote-toggle]', e => e.getAttribute('aria-expanded'))) === 'true', 'phone: tapping it opens the five emotes')
  await shot(ben, 'emote-tray-open'); await press(ben, '[data-t=w-emote-toggle]'); ok(!(await ben.$('[data-t=w-emotes]')), 'phone: tapping again folds it'); await shot(ben, 'emote-tray-folded') }
// a bot far across the room
// Ben taps the floor once (unlocks his audio: browsers need a gesture)
await front(ben); { const c = await ben.$eval('[data-t=w-canvas]', c => c.getBoundingClientRect().toJSON()); await ben.touchscreen.tap(c.left + c.width / 2 + 30, c.top + c.height / 2) }
await sleep(1500)
const far = new Bot(profile({ name: 'Far', iam: 'woman' }), { room: 'cafe-1' }); await far.connect(); far.send({ t: 'go', x: 3, y: 12 }); await sleep(4000)

await emo(ann, 'giggle')
const a1 = await until(async () => (await em(ann, 'played')).at(-1)); ok(a1 && /^emotes\/giggle_f[12]$/.test(a1.path) && a1.gain === 1 && a1.pan === 0, 'Ann (woman) hears her own giggle from the female set at full gain, centred: ' + a1?.path)
const b1 = await until(async () => (await em(ben, 'played')).at(-1)); const A = await meEnt(ann), B = await meEnt(ben)
const want = gainAt(Math.hypot(A.x - B.x, A.y - B.y)), wp = panAt(A.x - B.x)
ok(b1 && b1.path === a1.path && Math.abs(b1.gain - want) < 0.08 && Math.abs(b1.pan - wp) < 0.15, `Ben hears the same take with the piano falloff (gain ${b1?.gain?.toFixed(2)} ≈ ${want.toFixed(2)}, pan ${b1?.pan?.toFixed(2)} ≈ ${wp.toFixed(2)})`)
const fe = far.events.filter(e => e.t === 'emote'); ok(fe.length === 1 && fe[0].take === a1.path.slice(7), 'the far bot is told too (public), same take')
ok(ann.reqs.some(u => /\/audio\/emotes\/giggle_f[12]\.ogg$/.test(u)), 'fetched as .ogg from audio/emotes/ on demand')
// cooldown: a second tap inside 1.5 s
await emo(ann, 'sigh')
ok(await until(() => ann.$eval('[data-t=w-note]', e => /One at a time/.test(e.textContent)).catch(() => false), 2000), 'cooldown: a second emote inside 1.5 s is refused (flash)')
await sleep(400); ok((await em(ben, 'played')).length === 1, 'cooldown: and Ben never hears it')
// placeholder effect over the one who emoted, on every screen
{ await sleep(EMOTE_COOLDOWN_MS + 100); await emo(ann, 'giggle'); const me = (await st(ann)).me, fx = p => p.$$eval('[data-t=w-emofx]', l => l.map(e => ({ id: +e.dataset.id, t: e.textContent, v: e.style.visibility }))) 
  const fa = await until(async () => { const f = await fx(ann); return f.length && f }, 1000) || [], fb = await until(async () => { const f = await ben.evaluate(() => window.__world.emoteFx()); return f.length && f }, 1000) || []
  ok(fa.length === 1 && fa[0].id === me && fa[0].t === 'hehe' && fb.length === 1 && fb[0].id === me && fb[0].e === 'giggle', `emote effect: a "${fa[0]?.t}" tag over Ann, on her screen and Ben's`)
  await sleep(1600); ok(!(await ann.$('[data-t=w-emofx]')), 'emote effect: gone after ~1.2 s') }
await shot(ann, 'emote'); await shot(ben, 'emote')
// rotation over the UI
const seen = (await em(ann, 'played')).map(x => x.path)
for (let i = 0; i < 3; i++) { await sleep(EMOTE_COOLDOWN_MS + 100); await emo(ann, 'giggle'); await until(async () => (await em(ann, 'played')).length === seen.length + 1, 3000); seen.push((await em(ann, 'played')).at(-1).path) }
ok(seen.every((t, i) => !i || t !== seen[i - 1]), 'rotation: never the same take twice in a row: ' + seen.join(' '))
// Ben (man) → male set
await sleep(EMOTE_COOLDOWN_MS + 100); await emo(ben, 'gasp')
const b2 = await until(async () => (await em(ann, 'played')).find(x => /gasp/.test(x.path))); ok(b2 && /^emotes\/gasp_m[12]$/.test(b2.path), 'Ben (man) gasps from the male set: ' + b2?.path)
// mute: the piano mute (remembered) silences emotes, which go through its master
await ben.evaluate(() => localStorage.setItem('pd.pianoMute', '1')); await ben.reload({ waitUntil: 'networkidle0' }); await ben.waitForSelector('[data-t=w-room]', { timeout: 20000 })
await sleep(1500); await emo(ben, 'aww'); await sleep(EMOTE_COOLDOWN_MS + 100); await emo(ann, 'aww')
const b3 = await until(async () => (await em(ben, 'played')).find(x => /aww_f/.test(x.path)), 3000)
ok(b3 && (await em(ben, 'master')) === 0, 'mute: a muted listener\'s emotes play into a silent master (gain 0)')
await ben.evaluate(() => localStorage.setItem('pd.pianoMute', '0'))
for (const p of [ann, ben]) await p.close(); far.close(); await browser.close()
console.log(bad ? `\n${bad}/${n} FAILED` : `\nEMOTE e2e: ALL ${n} OK`)
process.exit(bad ? 1 : 0)
