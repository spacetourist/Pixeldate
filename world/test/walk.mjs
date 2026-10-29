// Walk-cycle port check: src/world/walk.ts composeDir vs GD's kit_dir.py art, pixel-exact.
//   every sample 00..11 x down/up/left/right x frames 0..3   vs fixtures/walk/sheet-NN.png (96x128, rows = dirs, cols = frames)
//   every sample x direction, 'stand'                          vs fixtures/walk/stand.json (sha256 of kit_dir output)
//   down 'stand'                                               vs fixtures/walk/sample-NN.png (kit.py compose = today's front art)
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readPng } from './png.mjs'
import { composeDir, DIRS, footX, WALK_FRAME_MS } from '../../src/world/walk.ts'
import { SAMPLES } from '../../src/avatar/kit/kit.gen.ts'
const F = new URL('./fixtures/walk/', import.meta.url), W = 24, H = 32
const stand = JSON.parse(readFileSync(new URL('stand.json', F))).stand, manifest = JSON.parse(readFileSync(new URL('manifest.json', F)))
let bad = 0, n = 0
const diff = (a, b) => { let k = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) k++; return k }
const fail = (m) => { bad++; console.log('FAIL', m) }
if (manifest.sheets.length !== 12 || SAMPLES.length !== 12) fail('expected 12 samples')
for (let s = 0; s < 12; s++) {
  if (JSON.stringify(manifest.sheets[s].config) !== JSON.stringify(SAMPLES[s])) fail(`sample ${s} config differs from manifest`)
  const sheet = readPng(readFileSync(new URL(`sheet-${String(s).padStart(2, '0')}.png`, F)))
  if (sheet.w !== 96 || sheet.h !== 128) fail(`sheet ${s} is ${sheet.w}x${sheet.h}`)
  DIRS.forEach((d, r) => {
    for (let f = 0; f < 4; f++) {
      const want = new Uint8ClampedArray(W * H * 4)
      for (let y = 0; y < H; y++) want.set(sheet.data.subarray(((r * H + y) * 96 + f * W) * 4, ((r * H + y) * 96 + f * W + W) * 4), y * W * 4)
      const k = diff(composeDir(SAMPLES[s], d, f), want); n++; if (k) fail(`sample ${s} ${d} frame ${f}: ${k} px differ`)
    }
    const h = createHash('sha256').update(composeDir(SAMPLES[s], d, 'stand')).digest('hex'); n++
    if (h !== stand[s][d]) fail(`sample ${s} ${d} stand hash`)
  })
  const front = readPng(readFileSync(new URL(`sample-${String(s).padStart(2, '0')}.png`, F))), k = diff(composeDir(SAMPLES[s], 'down', 'stand'), front.data); n++
  if (k) fail(`sample ${s} front stand vs kit.py sample: ${k} px differ`)
}
// feet anchor: the mirrored right view's feet sit 1px off; anchoring each direction on its feet lines them up
const a = DIRS.map(d => footX(composeDir(SAMPLES[0], d, 'stand'))); n++
if (!(a[3] - a[2] >= 1)) fail('expected the mirrored right view to be offset: ' + a)
if (WALK_FRAME_MS !== 160) fail('frame time')
console.log(bad ? `walk: ${bad} FAIL of ${n}` : `walk: ${n} checks OK (12 samples x 4 dirs x 4 frames + stand, pixel-exact vs kit_dir.py)`)
process.exit(bad ? 1 : 0)
