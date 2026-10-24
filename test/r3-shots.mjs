// R3 screenshot harness: moments (combo, level-up, ready, reveal, full reveal) and the call screens, driven by the
// mock partner (src/mock.ts). Motion shots run with prefers-reduced-motion: no-preference and are timed against
// motion/*.png; the partner photo still arrives pixelated at the level (pixelatePhoto), so the shader only ever
// de-pixelates what the receiver is allowed. usage: [URL=...] node test/r3-shots.mjs   (vite preview must be running)
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { open } from './r1-shots.mjs'
const OUT = n => `/workspace/pixeldate/shots/r3-${n}.png`
const SIZES = [['p390', 390, 844], ['d1440', 1440, 900]]
const MOTION = { reducedMotion: 'no-preference' }
const api = (p, f, a) => p.evaluate(([f, a]) => window.__pdMockApi[f](...a), [f, a])
const stage = p => p.evaluate(() => ({ mode: window.__pdStage?.mode, blocks: Math.round(window.__pdStage?.blocks || 0) }))
const log = []
const shot = async (p, n, extra = '') => { const s = await stage(p); await p.screenshot({ path: OUT(n) }); log.push(`${OUT(n)}  stage=${s.mode} blocks=${s.blocks} ${extra}`); console.log('shot', OUT(n), s.mode, s.blocks, extra) }
// partner taps, we tap: the real level-up path (raise -> photo request -> pixelated photo back -> Stage.show)
const levelUp = async (p, from) => { const t0 = await p.evaluate(() => performance.now()); await api(p, 'raise', [from]); return t0 }
const at = async (p, t0, ms) => { const now = await p.evaluate(() => performance.now()); if (t0 + ms > now) await p.waitForTimeout(t0 + ms - now) }
// fake media for the in-call screens: the remote is a canvas stream of the photo we were sent (already pixelated
// at this level by the partner), the local preview is our own photo; no getUserMedia, no WebRTC
const fakeCall = (p, kind) => p.evaluate(kind => {
  const mk = (img, bl) => { const c = document.createElement('canvas'); c.width = 360; c.height = 480; const x = c.getContext('2d'); x.imageSmoothingEnabled = false
    const t = document.createElement('canvas'); const s = bl || img.naturalWidth; t.width = s; t.height = Math.round(s * 4 / 3); t.getContext('2d').drawImage(img, 0, 0, t.width, t.height)
    const draw = () => x.drawImage(t, 0, 0, c.width, c.height); draw(); setInterval(draw, 100); return c.captureStream(10) }
  const them = window.__pdStage.cur; const me = new Image(); me.src = window.__pdMock.mePhoto
  // like PixelCam: `stream` is the raw (sharp) camera, `out` is a canvas exactly `blocks` px wide; the PiP must show `out`
  const exact = (img, bl) => { const t = document.createElement('canvas'); t.width = bl; t.height = Math.round(bl * 4 / 3); const x = t.getContext('2d'); const d = () => x.drawImage(img, 0, 0, t.width, t.height); d(); setInterval(d, 100); return t.captureStream(10) }
  return new Promise(r => me.onload = () => { const out = exact(me, window.__pdLevelBlocks || 32), raw = mk(me); const ac = new AudioContext(); const au = ac.createMediaStreamDestination().stream.getAudioTracks()[0]; out.addTrack(au)
    window.__pdMockApi.setCall({ kind, cam: { stream: raw, out, stop() {}, setLevel() {} }, mc: { close() {} }, remote: mk(them) }); r() })
}, kind)

const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
for (const [sz, w, h] of SIZES) {
  // 12 · combo: both answered L2Q1, meter 80 -> 100, settled after 1100 ms
  { const p = await open(b, w, h, { level: 2, pct: 80, tab: 'chat' }, MOTION)
    await api(p, 'setAns', [{ L1Q4: { me: 'Beach, but I would hike for a good view.', them: 'Mountains, always.' }, L2Q1: { me: 'The first song of the morning.', them: 'Whatever my sister put on, loudly.' } }])
    await api(p, 'setPct', [100]); await api(p, 'setEvt', [{ id: 'L2Q1', kind: 'pair', from: 80 }])
    await p.waitForTimeout(1300); await shot(p, `combo-${sz}`); await p.context().close() }
  // 13 · level-up 2 -> 3: mid (blocks tweening, ~900 ms) and settled (after 2000 ms)
  { const p = await open(b, w, h, { level: 2, pct: 100, tab: 'chat' }, MOTION)
    const t0 = await levelUp(p, 2); await at(p, t0, 900); await shot(p, `levelup-mid-${sz}`, '(t=900ms)')
    await at(p, t0, 2200); await shot(p, `levelup-settled-${sz}`, '(t=2200ms)'); await p.context().close() }
  // 14 · ready: we tapped, waiting for them
  { const p = await open(b, w, h, { level: 2, pct: 100, tab: 'chat' }, MOTION)
    await api(p, 'setTaps', [{ me: true, them: false }]); await api(p, 'setReadyOpen', [true]); await p.waitForTimeout(700); await shot(p, `ready-waiting-${sz}`); await p.context().close() }
  // 15 · full reveal 4 -> 5: mid-shader (1100 ms, a motion/reveal.png frame) and settled (after 2400 ms)
  { const p = await open(b, w, h, { level: 4, pct: 100, tab: 'chat' }, MOTION)
    const t0 = await levelUp(p, 4); await at(p, t0, 1100); await shot(p, `reveal-mid-${sz}`, '(t=1100ms)')
    await at(p, t0, 2700); await shot(p, `reveal-full-${sz}`, '(t=2700ms)'); await p.context().close() }
  // call request (ring out), 19 incoming, 19b in-call, 19c camera unavailable, call ended
  { const p = await open(b, w, h, { level: 3, pct: 40, tab: 'call' }, MOTION)
    await api(p, 'setRing', [{ dir: 'out', kind: 'video' }]); await p.waitForTimeout(500); await shot(p, `call-request-${sz}`)
    await api(p, 'setRing', [{ dir: 'in', kind: 'video' }]); await p.waitForTimeout(500); await shot(p, `call-incoming-${sz}`)
    await api(p, 'setRing', [null]); await fakeCall(p, 'video'); await p.waitForTimeout(1600); await shot(p, `call-in-${sz}`)
    console.log('  pip', JSON.stringify(await p.evaluate(() => { const v = document.querySelector('[data-t=pip-video]'); return v && { w: v.videoWidth, h: v.videoHeight, css: Math.round(v.getBoundingClientRect().width), rendering: getComputedStyle(v).imageRendering, label: v.getAttribute('aria-label') } })))
    await api(p, 'setCamErr', ['cam']); await p.waitForTimeout(400); await shot(p, `call-camera-unavailable-${sz}`)
    await p.click('[data-t=hangup]'); await api(p, 'setEnded', [{ kind: 'video', secs: 272 }]); await p.waitForTimeout(400); await shot(p, `call-ended-${sz}`); await p.context().close() }
}
// Canvas 2D fallback (no WebGL2) mid level-up, and the reduced-motion (static) full reveal
{ const p = await open(b, 390, 844, { level: 2, pct: 100, tab: 'chat' }, MOTION); await p.evaluate(() => { window.__pdNoGL = true; window.__pdMockApi.setView('compact') }); await p.waitForTimeout(300); await api(p, 'setView', ['stage']); await p.waitForTimeout(300)
  const t0 = await levelUp(p, 2); await at(p, t0, 900); await shot(p, 'levelup-mid-2d-p390', '(no WebGL2, t=900ms)'); await p.context().close() }
for (const [sz, w, h] of SIZES) {
  const p = await open(b, w, h, { level: 4, pct: 100, tab: 'chat' }); const rm = await p.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const t0 = await levelUp(p, 4); await at(p, t0, 150); await shot(p, `reveal-reduced-motion-mid-${sz}`, `(reduce=${rm}, t=150ms)`)
  await at(p, t0, 900); await shot(p, `reveal-reduced-motion-${sz}`, `(reduce=${rm}, t=900ms)`); await p.context().close()
}
await b.close()
console.log('\n' + log.join('\n'))
