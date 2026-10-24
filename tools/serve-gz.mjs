// Static server for dist/ under /Pixeldate/ with gzip, like GitHub Pages. Used for NET=4g perf runs (vite preview sends uncompressed files).
// usage: node tools/serve-gz.mjs [port=4174]
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, extname } from 'node:path'
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' }
const GZ = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest', '.txt'])
createServer((q, s) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname)
  if (!p.startsWith('/Pixeldate/')) { s.writeHead(404); return s.end() }
  let f = join('dist', p.slice(11)); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html')
  if (!existsSync(f)) { s.writeHead(404); return s.end() }
  const e = extname(f); let body = readFileSync(f); const h = { 'content-type': T[e] || 'application/octet-stream', 'cache-control': 'no-cache' }
  if (GZ.has(e) && /gzip/.test(q.headers['accept-encoding'] || '')) { body = gzipSync(body, { level: 9 }); h['content-encoding'] = 'gzip' }
  s.writeHead(200, h); s.end(body)
}).listen(+process.argv[2] || 4174)
