// GD's sharp card pack (games-lounge/src/assets/svg): copies the A/10/J/Q/K faces and builds 2-9 from each suit's 10
// (same layout, the rank text swapped), so all 52 faces are GD's vector art. node tools/card-svgs.mjs
import fs from 'node:fs'
const SRC = '/workspace/design/pixeldate/world/games-lounge/src/assets/svg/', OUT = new URL('../src/world/art/cards-svg/', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })
for (const s of 'SHDC') {
  for (const r of ['A', '10', 'J', 'Q', 'K']) fs.copyFileSync(SRC + `card-${r}${s}.svg`, OUT + `card-${r}${s}.svg`)
  const ten = fs.readFileSync(SRC + `card-10${s}.svg`, 'utf8')
  for (let r = 2; r <= 9; r++) fs.writeFileSync(OUT + `card-${r}${s}.svg`, ten.replace(/>10</g, `>${r}<`).replace(/letter-spacing="-0.5"/g, '').replace('card-10' + s, `card-${r}${s}`))
}
console.log(fs.readdirSync(OUT).length, 'faces')
