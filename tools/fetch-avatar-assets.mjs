#!/usr/bin/env node
// Pixel-avatar runtime assets (MediaPipe WASM + models) are NOT committed. This fetches them into public/avatar/ from
// the pins in src/avatar/assets.json (versioned URL + size + sha256) and refuses anything that doesn't match.
// WASM comes from the installed @mediapipe/tasks-vision package (already pinned by package-lock); models from Google's
// versioned model bucket at build time only — the app itself still serves every byte from our own origin.
// Runs as `prebuild`; a file already present with the right hash is skipped, so offline rebuilds work.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), pub = join(root, 'public', 'avatar')
const pins = JSON.parse(readFileSync(join(root, 'src', 'avatar', 'assets.json'), 'utf8'))
const sha = b => createHash('sha256').update(b).digest('hex')
let got = 0, kept = 0
for (const [file, p] of Object.entries(pins)) {
  const dest = join(pub, file)
  if (existsSync(dest) && sha(readFileSync(dest)) === p.sha256) { kept++; continue }
  let b
  if (p.src.startsWith('npm:')) b = readFileSync(join(root, 'node_modules', p.src.slice(4)))
  else { const r = await fetch(p.src); if (!r.ok) throw new Error(`${file}: HTTP ${r.status} from ${p.src}`); b = Buffer.from(await r.arrayBuffer()) }
  if (b.length !== p.size || sha(b) !== p.sha256) throw new Error(`${file}: size/sha256 mismatch (got ${b.length} B ${sha(b)}); refusing to ship it`)
  mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, b); got++
  console.log(`avatar asset ${file} ${(b.length / 1e6).toFixed(2)} MB ok`)
}
console.log(`avatar assets: ${got} fetched, ${kept} already present (sha256 verified)`)
