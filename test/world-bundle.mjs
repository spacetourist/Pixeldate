// Initial JS of the app page (entry module + everything it imports statically, i.e. what loads before any lazy chunk),
// gzip -9, and a check that no Pixeldate World code is in it.   node test/world-bundle.mjs [distDir=dist]
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, dirname } from 'node:path'
const dist = process.argv[2] || 'dist'
const MARK = [/parties\/area/, /Pixeldate World/, /WALK_FRAME_MS|composeDir|w-bubble|world=cafe\b.*mount/]
function initial(html, page) {
  const out = new Set(), todo = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g), ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map(m => join(dist, m[1].replace(/^\/Pixeldate\//, '')))
  while (todo.length) { const f = todo.pop(); if (out.has(f)) continue; out.add(f); const s = readFileSync(f, 'utf8')
    for (const m of s.matchAll(/(?:^|[;}\n])\s*import\s*(?:[^'"()]*?from\s*)?["'](\.\.?\/[^"']+\.js)["']/g)) todo.push(join(dirname(f), m[1])) }
  return [...out]
}
let total = 0
for (const page of ['index.html', 'app/index.html']) {
  const files = initial(readFileSync(join(dist, page), 'utf8'), page); let gz = 0; const hits = []
  for (const f of files) { const s = readFileSync(f); gz += gzipSync(s, { level: 9 }).length; for (const re of MARK) if (re.test(s.toString()) && !/world=cafe/.test(re.source)) hits.push(f.split('/').pop() + ' ~ ' + re.source) }
  console.log(`${page.padEnd(15)} initial JS ${(gz / 1024).toFixed(2)} KB gz  (${files.map(f => f.split('/').pop()).join(', ')})${hits.length ? '  WORLD CODE: ' + hits.join('; ') : '  no world code'}`)
  if (page === 'app/index.html') total = gz; if (hits.length) process.exitCode = 1
}
console.log(JSON.stringify({ appInitialGz: total }))
