// Drop GD's café emote art into the build: copies from GD's folder (read-only) into src/world/art/emotes/, checking every
// size against world/emotes/README.md: icons 16/32/48 px (@1x/@2x/@3x), effect sheets (24·frames)×24 + their json.
//   node tools/import-emote-art.mjs [/workspace/design/pixeldate/world/emotes]
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
const SRC = process.argv[2] ?? '/workspace/design/pixeldate/world/emotes'
const OUT = new URL('../src/world/art/emotes/', import.meta.url).pathname
const IDS = ['giggle', 'sigh', 'groan', 'aww', 'gasp']
const size = f => { const b = readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)] }
const man = JSON.parse(readFileSync(`${SRC}/effects/effects.json`, 'utf8'))
let bad = 0; const take = (from, to, want) => { const s = size(from); if (s.join() !== want.join()) { bad++; console.log('SIZE', from, s, '≠', want); return } copyFileSync(from, to); console.log('copy', to.replace(OUT, ''), s.join('x')) }
for (const d of ['icons', 'effects']) mkdirSync(OUT + d, { recursive: true })
for (const id of [...IDS, 'smiley']) for (const [sfx, px] of [['', 16], ['@2x', 32], ['@3x', 48]]) take(`${SRC}/icons/${id}${sfx}.png`, `${OUT}icons/${id}${sfx}.png`, [px, px])
for (const id of IDS) { const m = man.emotes[id]; take(`${SRC}/effects/${id}.png`, `${OUT}effects/${id}.png`, [24 * m.frames, 24])
  if (m.frame_ms.length !== m.frames || m.frame_ms.reduce((a, b) => a + b, 0) !== m.duration_ms || m.duration_ms < 1200 || m.duration_ms > 1500) { bad++; console.log('TIMING', id) } }
copyFileSync(`${SRC}/effects/effects.json`, `${OUT}effects/effects.json`)
console.log(bad ? `${bad} problems` : 'emote art OK'); process.exit(bad ? 1 : 0)
