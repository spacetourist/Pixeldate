// Walk-cycle port check: src/world/walk.ts composeDir vs GD's kit_dir.py art, pixel-exact.
//   every sample 00..11 x down/up/left/right x frames 0..3   vs fixtures/walk/sheet-NN.png (96x128, rows = dirs, cols = frames)
//   every sample x direction, 'stand'                          vs fixtures/walk/stand.json (sha256 of kit_dir output)
//   every sample x direction, 'sit'                            vs fixtures/walk/sit-sheet.png (288x128, rows = dirs, cols = samples)
//   down 'stand'                                               vs fixtures/walk/sample-NN.png (kit.py compose = today's front art)
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readPng } from './png.mjs'
import { composeDir, DIRS, footX, SIT_CHAIR, SIT_D, WALK_FRAME_MS, PIANO_DX, PIANO_DY, PIANO_FRAME_MS } from '../../src/world/walk.ts'
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
// sit pose: GD's sit-sheet.png, rows = down/up/left/right, columns = the 12 samples
const sit = readPng(readFileSync(new URL('sit-sheet.png', F)))
if (sit.w !== 288 || sit.h !== 128) fail(`sit sheet is ${sit.w}x${sit.h}`)
if (JSON.stringify(manifest.sit?.rows) !== JSON.stringify(DIRS)) fail('sit rows differ from DIRS')
for (let s = 0; s < 12; s++) DIRS.forEach((d, r) => {
  const want = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) want.set(sit.data.subarray(((r * H + y) * 288 + s * W) * 4, ((r * H + y) * 288 + s * W + W) * 4), y * W * 4)
  const k = diff(composeDir(SAMPLES[s], d, 'sit'), want); n++; if (k) fail(`sample ${s} ${d} sit: ${k} px differ`)
})
const sc = manifest.sit?.chair?.sprite_top_left_from_chair_tile; n++
if (JSON.stringify(sc) !== JSON.stringify({ 'chair-left-seat': [...SIT_CHAIR.leftSeat], 'chair-right-seat': [...SIT_CHAIR.rightSeat] }) || manifest.sit.upper_body_drop !== SIT_D) fail('sit chair offsets / drop differ from manifest')
// piano pose: GD's piano-sheet.png (kit_piano.py), rows = frame 0/1, columns = the 12 samples
const pia = readPng(readFileSync(new URL('piano-sheet.png', F)))
if (pia.w !== 288 || pia.h !== 64) fail(`piano sheet is ${pia.w}x${pia.h}`)
for (let s = 0; s < 12; s++) for (const f of [0, 1]) {
  const want = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) want.set(pia.data.subarray(((f * H + y) * 288 + s * W) * 4, ((f * H + y) * 288 + s * W + W) * 4), y * W * 4)
  const k = diff(composeDir(SAMPLES[s], 'up', f ? 'piano1' : 'piano0'), want); n++; if (k) fail(`sample ${s} piano frame ${f}: ${k} px differ`)
}
// duet pose: GD's duet-sheet.png (kit_duet.py), rows = bass f0, bass f1, melody f0, melody f1; columns = the 12 samples
const duo = readPng(readFileSync(new URL('duet-sheet.png', F)))
if (duo.w !== 288 || duo.h !== 128) fail(`duet sheet is ${duo.w}x${duo.h}`)
for (let s = 0; s < 12; s++) ['bass0', 'bass1', 'melody0', 'melody1'].forEach((fr, r) => {
  const want = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) want.set(duo.data.subarray(((r * H + y) * 288 + s * W) * 4, ((r * H + y) * 288 + s * W + W) * 4), y * W * 4)
  const k = diff(composeDir(SAMPLES[s], 'up', fr), want); n++; if (k) fail(`sample ${s} duet ${fr}: ${k} px differ`)
})
if (PIANO_DX !== 4 || PIANO_DY !== -21 || PIANO_FRAME_MS !== 220) fail('piano placement / frame time')
// sofa sit: GD's sofa-sit-body.png / sofa-sit-legs.png (kit_dir.compose_sofa), 14 columns per sofa-sit-layers.json
const sofaJ = JSON.parse(readFileSync(new URL('sofa-sit-layers.json', F))), sofaDef = JSON.parse(readFileSync(new URL('sofa-defaults.json', F)))
const sofaCfg = c => c === 'default-woman' ? sofaDef.woman : c === 'default-man' ? sofaDef.man : SAMPLES[+c.slice(7)]
for (const [layer, frame] of [['body', 'sofaBody'], ['legs', 'sofaLegs']]) {
  const sh = readPng(readFileSync(new URL(sofaJ.layers[layer], F))), cw = sofaJ.cols.length * W
  if (sh.w !== cw || sh.h !== H) fail(`sofa ${layer} sheet is ${sh.w}x${sh.h}`)
  sofaJ.cols.forEach((c, i) => {
    const want = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) want.set(sh.data.subarray((y * cw + i * W) * 4, (y * cw + i * W + W) * 4), y * W * 4)
    const k = diff(composeDir(sofaCfg(c), 'down', frame), want); n++; if (k) fail(`${c} sofa ${layer}: ${k} px differ`)
  })
}
// feet anchor: the mirrored right view's feet sit 1px off; anchoring each direction on its feet lines them up
const a = DIRS.map(d => footX(composeDir(SAMPLES[0], d, 'stand'))); n++
if (!(a[3] - a[2] >= 1)) fail('expected the mirrored right view to be offset: ' + a)
if (WALK_FRAME_MS !== 160) fail('frame time')
console.log(bad ? `walk: ${bad} FAIL of ${n}` : `walk: ${n} checks OK (12 samples x 4 dirs x 4 frames + stand + sit + piano + sofa body/legs, pixel-exact vs kit_dir.py)`)
process.exit(bad ? 1 : 0)
