// GD's Direction A card pack (locked 2026-11-05) → public/art/cards-a/, copied byte-for-byte (no recolouring:
// hearts/diamonds #D32F2F, clubs/spades #1A1A1A as drawn). svg/ = 52 vector faces (240x336 viewBox), png/ = the 240x336
// rasters (the @2x of the 120x168 display size) as a fallback, back-{120,240,360}.png = the pixel back. node tools/card-pack-a.mjs
import fs from 'node:fs'
const SRC = '/workspace/design/pixeldate/world/games-lounge/card-restart/direction-a-pack/', OUT = new URL('../public/art/cards-a/', import.meta.url).pathname
fs.rmSync(OUT, { recursive: true, force: true }); for (const d of ['svg', 'png']) fs.mkdirSync(OUT + d, { recursive: true })
const R = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
for (const s of 'HDCS') for (const r of R) { fs.copyFileSync(SRC + `svg/card-${r}${s}.svg`, OUT + `svg/card-${r}${s}.svg`); fs.copyFileSync(SRC + `card-${r}${s}.png`, OUT + `png/card-${r}${s}.png`) }
for (const w of [120, 240, 360]) fs.copyFileSync(SRC + `scales/${w}/card-back.png`, OUT + `back-${w}.png`)
console.log(fs.readdirSync(OUT + 'svg').length, 'svg', fs.readdirSync(OUT + 'png').length, 'png')
