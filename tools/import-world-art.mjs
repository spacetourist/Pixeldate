// Drop GD's world markers into the café build: copies the 1x marker PNGs from GD's folder (read-only) into
// src/world/art/markers/, after checking each size against world/markers/README.md. Then rebuild (npx tsc -b && npx
// vite build). The @3x copies, the previews and the examples are GD's review files and are not copied.
//   node tools/import-world-art.mjs [/workspace/design/pixeldate/world/markers] [--dry]
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { inflateSync, deflateSync } from 'node:zlib'
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
// your own bubble (GD v04): the same art with its 1 px rim #4A3886 recoloured mint #48E5C2 → *-mine.png
for (const n of ['speech-bubble-9slice', 'speech-bubble-tail']) {
  const f = join(src, n + '.png'); if (!existsSync(f)) continue
  const out = recolour(readFileSync(f), [0x4A, 0x38, 0x86], [0x48, 0xE5, 0xC2])
  console.log(`${dry ? 'would make' : 'make'} ${n}-mine.png (rim → mint)`); if (!dry) writeFileSync(join(OUT, n + '-mine.png'), out)
}
console.log(`${took} marker file(s)${dry ? ' found' : ' copied'}, ${bad} missing or wrong size`); if (bad) process.exit(1)

/** Minimal PNG recolour for GD's small marker files: 8-bit RGBA or RGB, non-interlaced, any filters in; filter 0 out. */
function recolour(buf, from, to) {
  let w = 0, h = 0, ct = 0, idat = []; const chunks = []
  for (let o = 8; o < buf.length;) { const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len)
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12] || (ct !== 6 && ct !== 2)) throw new Error('unsupported PNG') }
    if (type === 'IDAT') idat.push(d); else if (type !== 'IEND') chunks.push([type, d]); o += 12 + len }
  const bpp = ct === 6 ? 4 : 3, st = w * bpp, raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(st * h)
  for (let y = 0; y < h; y++) { const f = raw[y * (st + 1)], r = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1))
    for (let i = 0; i < st; i++) { const a = i >= bpp ? px[y * st + i - bpp] : 0, b = y ? px[(y - 1) * st + i] : 0, c = i >= bpp && y ? px[(y - 1) * st + i - bpp] : 0
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      px[y * st + i] = (r[i] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255 } }
  for (let i = 0; i < px.length; i += bpp) if (px[i] === from[0] && px[i + 1] === from[1] && px[i + 2] === from[2]) { px[i] = to[0]; px[i + 1] = to[1]; px[i + 2] = to[2] }
  const rows = Buffer.alloc((st + 1) * h); for (let y = 0; y < h; y++) px.copy(rows, y * (st + 1) + 1, y * st, (y + 1) * st)
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }
  const chunk = (type, d) => { const t = Buffer.from(type, 'latin1'), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(d.length); c.writeUInt32BE(crc(Buffer.concat([t, d]))); return Buffer.concat([l, t, d, c]) }
  return Buffer.concat([buf.subarray(0, 8), ...chunks.map(([t, d]) => chunk(t, d)), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}
