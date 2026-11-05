// GD's sharp card pack (games-lounge/src/assets/svg): copies the A/10/J/Q/K faces and builds 2-9 from each suit's 10
// (same layout, the rank text swapped), so all 52 faces are GD's vector art. node tools/card-svgs.mjs
import fs from 'node:fs'
const SRC = '/workspace/design/pixeldate/world/games-lounge/src/assets/svg/', OUT = new URL('../src/world/art/cards-svg/', import.meta.url).pathname
// traditional colours: hearts/diamonds red, clubs/spades black. GD's pack already uses them; this only fixes stray off-colours
const RED = '#D32F2F', BLACK = '#1A1A1A', KEEP = /^#(FFF1C1|FFFFFF|FFF)$/i
const tone = (svg, s) => svg.replace(/(fill|stroke)="(#[0-9a-fA-F]{3,6})"/g, (m, k, c) => {
  if (KEEP.test(c)) return m
  const h = c.length === 4 ? c.slice(1).split('').map(x => x + x).join('') : c.slice(1), [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  const red = r > 120 && r > g * 2.5 && r > b * 2.5, dark = 0.3 * r + 0.59 * g + 0.11 * b < 80
  return 'HD'.includes(s) ? (red || dark ? m : `${k}="${RED}"`) : (dark ? m : `${k}="${BLACK}"`)
})
fs.mkdirSync(OUT, { recursive: true })
for (const s of 'SHDC') {
  for (const r of ['A', '10', 'J', 'Q', 'K']) fs.writeFileSync(OUT + `card-${r}${s}.svg`, tone(fs.readFileSync(SRC + `card-${r}${s}.svg`, 'utf8'), s))
  const ten = tone(fs.readFileSync(SRC + `card-10${s}.svg`, 'utf8'), s)
  for (let r = 2; r <= 9; r++) fs.writeFileSync(OUT + `card-${r}${s}.svg`, ten.replace(/>10</g, `>${r}<`).replace(/letter-spacing="-0.5"/g, '').replace('card-10' + s, `card-${r}${s}`))
}
console.log(fs.readdirSync(OUT).length, 'faces')
