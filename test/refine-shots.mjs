// Refine reveal checkpoint shots + videos (finding loop, level-up). Re-run against live with
//   URL=https://<host>/Pixeldate/app/ node test/refine-shots.mjs
// SET=checkpoint captures only: finding mid + sharp at 390 and 1440, one level-up mid (390, 2->3) and the ringing
// call screen at 390 (bright + dim step of the pd-ring blink). Default SET=all adds every still, fallback and video.
// Finding stills use ?capture (a virtual clock driven through window.__rr.frame) so they are frame-exact;
// level-up stills and all videos are real time on the mock partner (src/mock.ts via window.__pdMock).
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { cfg } from './r1-shots.mjs'
const URL = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
const OUT = '/workspace/pixeldate/shots/refine/', VT = OUT + '.vtmp/'
const SIZES = [[390, 844], [1440, 900]], ALL = (process.env.SET || 'all') !== 'checkpoint', SEED = process.env.SEED || '20261025'
const FF = existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : readdirSync(process.env.HOME + '/.cache/ms-playwright').filter(d => d.startsWith('ffmpeg')).map(d => `${process.env.HOME}/.cache/ms-playwright/${d}/ffmpeg-linux`)[0]
mkdirSync(OUT, { recursive: true }); const made = []
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function open(w, h, c, { q = '', motion = 'no-preference', video = false, transparency = null, init = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 800 ? 2 : 1, reducedMotion: motion, ...(video ? { recordVideo: { dir: VT, size: { width: w, height: h } } } : {}) })
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message))
  if (transparency) { const s = await ctx.newCDPSession(p); await s.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: transparency }] }) }
  await p.addInitScript(([c, init]) => { window.__pdMock = c; window.__pdRevealLog = []; window.__pdRecv = []; try { localStorage.setItem('pd.view', c.view) } catch {}; if (init) Object.assign(window, init) }, [c, init])
  await p.goto(URL + q); await p.waitForFunction(() => window.__pdMockReady, null, { timeout: 30000 }); await p.evaluate(() => document.fonts.ready)
  return p
}
const snap = async (p, n) => { await p.screenshot({ path: OUT + n + '.png' }); made.push(OUT + n + '.png') }
async function mp4(p, n, keepFrom = 0) {
  const v = p.video(); await p.context().close(); const src = await v.path(), dst = OUT + n + '.mp4'
  execFileSync(FF, ['-y', '-loglevel', 'error', '-ss', String(keepFrom / 1000), '-i', src, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', dst])
  made.push(dst)
}
// drive the virtual clock to `to` ms in 1/60 s steps (the capture api waits for the next image when it needs it)
const drive = (p, from, to) => p.evaluate(async ([a, z]) => { for (let ms = a; ms <= z; ms += 1000 / 60) await window.__rr.frame(ms); await window.__rr.frame(z) }, [from, to])

for (const [w, h] of SIZES) {
  const tag = `${w}x${h}`
  // ── finding loop stills (SPEC: intro 380 ms, dur 4600, xfade 360, caption pops at hold start, 260 ms) ──
  { const p = await open(w, h, cfg({ scene: 'finding' }), { q: `?capture=1&seed=${SEED}` }); await p.waitForFunction(() => window.__rr); await p.evaluate(() => window.__rr.ready)
    let t = 0; for (const [ms, n] of [[200, 'start-block'], [470, 'first-split'], [2500, 'mid-refine'], [4600 + 360 + 420, 'sharp-caption']]) { if (!ALL && !/mid|sharp/.test(n)) continue; await drive(p, t, ms); t = ms; await sleep(60); await snap(p, `finding-${n}-${tag}`) }
    console.log(tag, 'finding', await p.evaluate(() => ({ mode: window.__rr.mode, img: window.__rr.stats.shown, cap: document.querySelector('.rr-cap').textContent })))
    await p.context().close() }
  // ── reduced motion finding: 8 -> 16 -> 32 -> sharp (950 ms per level, 300 ms snapshot fades, sharp holds 1700) ──
  { const p = await open(w, h, cfg({ scene: 'finding' }), { q: `?capture=1&seed=${SEED}`, motion: 'reduce' }); await p.waitForFunction(() => window.__rr); await p.evaluate(() => window.__rr.ready)
    if (!ALL) { await p.context().close() } else { let t = 0; for (const [ms, n] of [[800, '8'], [1750, '16'], [2700, '32'], [3300, 'sharp-caption']]) { await drive(p, t, ms); t = ms; await sleep(60); await snap(p, `rm-finding-${n}-${tag}`) }
    await p.context().close() } }
  // ── level-up stills, stage view: 390 shows 2->3 (16 -> 32 blocks), 1440 shows 4->5 (64 blocks -> the received photo) ──
  const from = w < 800 ? 2 : 4
  if (ALL || w < 800) { const p = await open(w, h, cfg({ level: from, pct: 100, tab: 'profile', view: 'stage' })); await sleep(1200)
    await p.evaluate(f => window.__pdMockApi.raise(f), from); const t0 = Date.now()
    for (const [ms, n] of [[250, 'before'], [1050, 'mid'], [2900, 'after']]) { if (!ALL && n !== 'mid') continue; await sleep(ms - (Date.now() - t0)); await snap(p, `levelup-${from}to${from + 1}-${n}-${tag}`) }
    console.log(tag, 'level', await p.evaluate(() => window.__pdRevealLog.map(l => ({ from: l.from, to: l.to, mode: l.mode, prep: l.prep, lo: l.lo, maxD: l.maxD }))))
    await p.context().close() }
  // ── reduced-motion level-up (compact view: stepped old -> new, 300 ms snapshot fade, no pops) ──
  if (ALL) { const p = await open(w, h, cfg({ level: 2, pct: 100, tab: 'profile', view: 'compact' }), { motion: 'reduce' }); await sleep(1200)
    await p.evaluate(() => window.__pdMockApi.raise(2)); const t0 = Date.now()
    for (const [ms, n] of [[250, 'before'], [560, 'mid'], [1600, 'after']]) { await sleep(ms - (Date.now() - t0)); await snap(p, `rm-levelup-compact-2to3-${n}-${tag}`) }
    await p.context().close() }
}
// ── ringing call screen (390): .callui .ringing .av steps opacity 1 -> .35 every 0.6 s (unchanged from main) ──
{ const p = await open(390, 844, cfg({ level: 3, pct: 40, tab: 'call' })); await sleep(400)
  await p.evaluate(() => window.__pdMockApi.setRing({ dir: 'out', kind: 'video' })); await p.waitForSelector('.callui .ringing .av'); await sleep(500)
  const a = await p.evaluate(() => { const e = document.querySelector('.callui .ringing .av'), c = getComputedStyle(e); return `${c.animationName} ${c.animationDuration} ${c.animationTimingFunction} ${c.animationIterationCount}` })
  for (const [t, n] of [[300, 'bright'], [900, 'dim']]) { await p.evaluate(t => document.getAnimations().forEach(x => { x.pause(); x.currentTime = t }), t); await sleep(120); await snap(p, `call-ringing-${n}-390x844`) }
  console.log('ringing avatar animation:', a); await p.context().close() }
if (ALL) {
// ── fallbacks + reduced transparency (390) ──
{ const p = await open(390, 844, cfg({ scene: 'finding' }), { q: `?capture=1&seed=${SEED}&rr=2d` }); await p.waitForFunction(() => window.__rr); await p.evaluate(() => window.__rr.ready); await drive(p, 0, 2500); await snap(p, 'fallback-2d-finding-mid-390x844'); console.log('2d', await p.evaluate(() => window.__rr.mode)); await p.context().close() }
{ const p = await open(390, 844, cfg({ scene: 'finding' }), { init: { __pdRR: 'static' } }); await p.waitForSelector('.rr[data-rr=static] img:not([hidden])'); await sleep(400); await snap(p, 'fallback-static-finding-390x844'); await p.context().close() }
{ const p = await open(390, 844, cfg({ scene: 'finding' }), { q: `?capture=1&seed=${SEED}`, transparency: 'reduce' }); await p.waitForFunction(() => window.__rr); await p.evaluate(() => window.__rr.ready); await drive(p, 0, 2500)
  console.log('reduced transparency: scan', await p.evaluate(() => getComputedStyle(document.querySelector('.rr-scan')).display)); await snap(p, 'rt-finding-mid-390x844'); await p.context().close() }
// ── videos (real time): finding loop, 2+ images (~16.5 s), and a level-up on the mock partner ──
for (const [w, h] of SIZES) {
  const tag = `${w}x${h}`
  { const p = await open(w, h, cfg({ scene: 'finding' }), { q: `?seed=${SEED}`, video: true }); await p.waitForFunction(() => window.__rr); await p.evaluate(() => window.__rr.ready); const t0 = Date.now()
    await p.waitForFunction(() => window.__rr.stats.shown.length >= 3, null, { timeout: 60000 }); await sleep(800); const shown = await p.evaluate(() => window.__rr.stats.shown); await mp4(p, `finding-loop-${tag}`, 300); console.log(tag, 'loop video', shown, ((Date.now() - t0) / 1000).toFixed(1) + ' s') }
  const from = w < 800 ? 2 : 4
  { const p = await open(w, h, cfg({ level: from, pct: 100, tab: 'profile', view: 'stage' }), { video: true }); await sleep(1500); await p.evaluate(f => window.__pdMockApi.raise(f), from); await sleep(3600); await mp4(p, `levelup-${from}to${from + 1}-${tag}`, 900) }
}
}
rmSync(VT, { recursive: true, force: true }); await b.close()
console.log(made.join('\n'))
