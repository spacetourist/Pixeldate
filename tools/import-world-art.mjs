// Drop GD's world markers into the café build: copies the 1x marker PNGs from GD's folder (read-only) into
// src/world/art/markers/, after checking each size against world/markers/README.md. Then rebuild (npx tsc -b && npx
// vite build). The @3x copies, the previews and the examples are GD's review files and are not copied.
//   node tools/import-world-art.mjs [/workspace/design/pixeldate/world/markers] [--dry]
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
const args = process.argv.slice(2), dry = args.includes('--dry')
const src = args.find(a => !a.startsWith('--')) ?? '/workspace/design/pixeldate/world/markers'
const OUT = new URL('../src/world/art/markers/', import.meta.url).pathname
const size = f => { const b = readFileSync(f); if (b.toString('latin1', 1, 4) !== 'PNG') return null; return [b.readUInt32BE(16), b.readUInt32BE(20)] }
/** file → [w, h] in art px (README.md) */
const SLOTS = {
  'heart.png': [9, 8], 'heart-bob.png': [18, 9], 'broken-heart.png': [9, 7],
  'edge-arrow.png': [24, 24], 'edge-arrow-left.png': [24, 24], 'edge-arrow-up.png': [24, 24], 'edge-arrow-down.png': [24, 24],
  'count-badges.png': [103, 9], 'speech-bubble-9slice.png': [12, 12], 'speech-bubble-tail.png': [9, 6],
}
let took = 0, bad = 0
for (const [n, want] of Object.entries(SLOTS)) {
  const f = join(src, n); if (!existsSync(f)) { bad++; console.log(`missing ${f}`); continue }
  const sz = size(f); if (!sz || sz[0] !== want[0] || sz[1] !== want[1]) { bad++; console.log(`skip ${f}: ${sz ? sz.join('x') : 'not a PNG'}, want ${want.join('x')}`); continue }
  took++; console.log(`${dry ? 'would copy' : 'copy'} ${n} (${sz.join('x')}) → src/world/art/markers/${n}`)
  if (!dry) { mkdirSync(OUT, { recursive: true }); copyFileSync(f, join(OUT, n)) }
}
console.log(`${took} marker file(s)${dry ? ' found' : ' copied'}, ${bad} missing or wrong size`); if (bad) process.exit(1)
