// Ringing call avatar (.callui .ringing .av) parity check between two builds, e.g. main vs a branch:
//   A=http://localhost:4174/Pixeldate/app/ B=http://localhost:4173/Pixeldate/app/ node test/ring-compare.mjs
// Compares the computed CSS animation (name, effective keyframes, duration, timing, iterations) and timed screenshots
// (all document animations paused at the same currentTime) at 390x844, ring out + ring in. Exit 1 on any difference.
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { mkdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { cfg } from './r1-shots.mjs'
const A = process.env.A || 'http://localhost:4174/Pixeldate/app/', B = process.env.B || 'http://localhost:4173/Pixeldate/app/'
const OUT = process.env.OUT || '/workspace/pixeldate/shots/refine/ring-compare/'; mkdirSync(OUT, { recursive: true })
const TIMES = [0, 300, 650, 900, 1150]
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
async function grab(url, tag) {
  const res = {}
  for (const dir of ['out', 'in']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' })
    const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', tag, e.message))
    await p.addInitScript(c => { window.__pdMock = c; try { localStorage.setItem('pd.view', c.view) } catch {} }, cfg({ level: 3, pct: 40, tab: 'call' }))
    await p.goto(url); await p.waitForFunction(() => window.__pdMockReady, null, { timeout: 30000 }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600)
    await p.evaluate(d => window.__pdMockApi.setRing({ dir: d, kind: 'video' }), dir); await p.waitForSelector('.ringing .av'); await p.waitForTimeout(500)
    res[dir] = await p.evaluate(() => [...document.querySelectorAll('.ringing .av')].map(e => { const cs = getComputedStyle(e), a = e.getAnimations()[0]
      return { inCallui: !!e.closest('.callui'), name: cs.animationName, duration: cs.animationDuration, timing: cs.animationTimingFunction, iter: cs.animationIterationCount, delay: cs.animationDelay,
        keyframes: a ? a.effect.getKeyframes().map(k => ({ offset: k.offset, opacity: k.opacity, transform: k.transform, easing: k.easing })) : null } }))
    res[dir].shots = []
    for (const t of TIMES) { await p.evaluate(t => document.getAnimations().forEach(a => { a.pause(); a.currentTime = t }), t); await p.waitForTimeout(120)
      const f = `${OUT}ring-${dir}-t${t}-${tag}.png`; await p.screenshot({ path: f }); res[dir].shots.push(f)
      res[dir].rect ||= await p.evaluate(() => { const r = document.querySelector('.ringing').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(v => Math.round(v * 2)) })
      res[dir]['op' + t] = await p.evaluate(() => [...document.querySelectorAll('.ringing .av')].map(e => getComputedStyle(e).opacity + '|' + getComputedStyle(e).transform).join()) }
    await ctx.close()
  }
  return res
}
const ra = await grab(A, 'main'), rb = await grab(B, 'branch'); await b.close()
let bad = 0
for (const dir of ['out', 'in']) {
  const strip = r => JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'shots')))
  const sa = strip(ra[dir]), sb = strip(rb[dir]); console.log(`ring-${dir} computed animation (rect ${ra[dir].rect})`, sa === sb ? 'MATCH' : 'DIFF'); console.log('  main  ', sa); if (sa !== sb) { console.log('  branch', sb); bad++ }
  for (let i = 0; i < TIMES.length; i++) {
    const fa = ra[dir].shots[i], fb = rb[dir].shots[i]
    // exact match on the ringing avatar box; the full frame is reported with its max channel delta (the photo stage has
    // ±2-level GPU/rAF noise even main-vs-main, so the full frame passes at <=2)
    const py = `import warnings;warnings.filterwarnings('ignore')
from PIL import Image, ImageChops
a=Image.open('${fa}').convert('RGB');b=Image.open('${fb}').convert('RGB');r=${JSON.stringify(ra[dir].rect)}
d=ImageChops.difference(a.crop(r),b.crop(r));D=ImageChops.difference(a,b)
print(sum(1 for p in d.getdata() if p!=(0,0,0)), max(x[1] for x in D.getextrema()))`
    const [n, full] = execFileSync('python3', ['-c', py]).toString().trim().split(' ')
    const ok = n === '0' && +full <= 2; console.log(`  t=${TIMES[i]}ms ringing-box differing px: ${n} · full-frame max channel delta: ${full}`, ok ? 'MATCH' : 'DIFF'); if (!ok) bad++
  }
}
console.log(bad ? 'RING DIFF' : 'RING MATCH'); process.exit(bad ? 1 : 0)
