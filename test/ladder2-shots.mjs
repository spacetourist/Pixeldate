// ladder-snappy harness: measures the signup ladder's first pass, captures p390 shots and a screen recording.
// Walks the real signup (no mocks) with the design pack's Kofi selfie (copied to /tmp, never into public/).
// usage: [URL=...] node test/ladder2-shots.mjs   (vite preview must be running on :4173; ffmpeg on PATH for the mp4)
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const URL = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
const PHOTO = '/tmp/r2-kofi.webp'; copyFileSync('/workspace/design/pixeldate/player-two/assets/photos/kofi-full.webp', PHOTO)
const SH = '/workspace/pixeldate/shots/', W = 390, H = 844, VID = '/tmp/ladder2-vid'

async function toPhoto(ctx, q = '') {
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message))
  await p.goto(URL + q); await p.waitForFunction(() => !document.querySelector('[data-t=splash]'), null, { timeout: 15000 })
  await p.fill('[data-t=name]', 'Kofi'); await p.click('[data-t=iam-man]'); await p.click('[data-t=next]'); await p.waitForSelector('[data-t=add-selfie]')
  await p.evaluate(() => document.fonts.ready); await p.mouse.move(1, 1)
  return p
}
const marks = p => p.evaluate(() => Object.fromEntries(['ladder:start', 'ladder:ctas', 'ladder:still'].map(n => [n, performance.getEntriesByName(n)[0]?.startTime])))

const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const ctxOpt = { viewport: { width: W, height: H }, deviceScaleFactor: 1 }

// 1 · measured first pass (3 runs, real rAF timing) + the end hold with Replay
const runs = []
for (let k = 0; k < 3; k++) {
  const ctx = await b.newContext({ ...ctxOpt, reducedMotion: 'no-preference' }), p = await toPhoto(ctx)
  const t0 = Date.now(); await p.setInputFiles('[data-t=gallery]', PHOTO)
  await p.waitForSelector('.rv-acts:not(.hid) [data-t=photo-confirm]'); const wall = Date.now() - t0
  await p.waitForFunction(() => performance.getEntriesByName('ladder:still').length, null, { timeout: 6000 })
  const m = await marks(p); runs.push({ ctas: m['ladder:ctas'] - m['ladder:start'], still: m['ladder:still'] - m['ladder:start'], uploadToCtasWall: wall })
  if (k === 0) {
    await p.waitForTimeout(400); await p.screenshot({ path: SH + 'ladder2-end-replay-p390.png' }); console.log('shot', SH + 'ladder2-end-replay-p390.png')
    // Replay re-runs the pass: check the hero is mid-pass again ~1.2 s after the tap, and that it stops again
    await p.evaluate(() => performance.clearMarks()); await p.click('[data-t=ladder-replay]'); await p.waitForTimeout(1200)
    const chip = await p.$eval('[data-t=ladder-chip]', e => e.textContent); console.log('replay +1.2 s chip:', chip)
    await p.waitForFunction(() => performance.getEntriesByName('ladder:still').length, null, { timeout: 6000 })
    const r = await marks(p); console.log('replay start→still', Math.round(r['ladder:still'] - r['ladder:start']), 'ms')
  }
  await ctx.close()
}
console.log('first pass (ms):', runs.map(r => `start→CTAs ${Math.round(r.ctas)}, start→still ${Math.round(r.still)}, upload→CTAs wall ${r.uploadToCtasWall}`).join(' | '))

// 2 · mid-pass ~1.2 s (frozen via ?revealt so the frame is deterministic: LV 2 holding, 2 thumbs in, no CTAs)
{ const ctx = await b.newContext({ ...ctxOpt, reducedMotion: 'no-preference' }), p = await toPhoto(ctx, '?revealt=1200')
  await p.setInputFiles('[data-t=gallery]', PHOTO); await p.waitForSelector('[data-t=mini-2] img'); await p.waitForTimeout(500)
  await p.screenshot({ path: SH + 'ladder2-mid-1200ms-p390.png' }); console.log('shot', SH + 'ladder2-mid-1200ms-p390.png'); await ctx.close() }

// 3 · reduced motion (unchanged path: static LV 1, tap a level, CTAs at once)
{ const ctx = await b.newContext({ ...ctxOpt, reducedMotion: 'reduce' }), p = await toPhoto(ctx)
  await p.setInputFiles('[data-t=gallery]', PHOTO); await p.waitForSelector('.rv-acts:not(.hid) [data-t=photo-confirm]'); await p.waitForTimeout(600)
  if (await p.$('[data-t=ladder-replay]')) throw 'Replay should not show under reduced motion'
  await p.screenshot({ path: SH + 'ladder2-reduced-p390.png' }); console.log('shot', SH + 'ladder2-reduced-p390.png'); await ctx.close() }

// 4 · screen recording of the first pass at 390×844, trimmed to ≈3.5 s from the upload
rmSync(VID, { recursive: true, force: true }); mkdirSync(VID)
{ const ctx = await b.newContext({ ...ctxOpt, reducedMotion: 'no-preference', recordVideo: { dir: VID, size: { width: W, height: H } } })
  const tc = Date.now(), p = await toPhoto(ctx); await p.waitForTimeout(300)
  const tu = Date.now(); await p.setInputFiles('[data-t=gallery]', PHOTO); await p.waitForTimeout(3900); await ctx.close()
  const f = VID + '/' + readdirSync(VID).find(n => n.endsWith('.webm')), ss = Math.max(0, (tu - tc) / 1000 - .15).toFixed(2)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss, '-i', f, '-t', '3.5', '-vf', `scale=${W}:${H}:flags=neighbor,fps=30`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', SH + 'ladder2-p390.mp4'])
  console.log('video', SH + 'ladder2-p390.mp4', 'from', f, 'ss', ss) }
await b.close()
