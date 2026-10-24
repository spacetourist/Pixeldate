// Minimal static server for dist/ under /Pixeldate/ with gzip, like GitHub Pages (vite preview serves uncompressed).
// usage: node test/serve-gz.mjs [port=4174]
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { extname, join, normalize } from 'node:path'
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }
const port = +(process.argv[2] || 4174), root = new URL('../dist/', import.meta.url).pathname
createServer(async (q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname)
  if (!p.startsWith('/Pixeldate/')) { r.writeHead(404).end(); return }
  p = normalize(join(root, p.slice('/Pixeldate/'.length))); if (!p.startsWith(root)) { r.writeHead(403).end(); return }
  try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html') } catch { r.writeHead(404).end(); return }
  try { let body = await readFile(p); const t = T[extname(p)] || 'application/octet-stream', h = { 'content-type': t, 'cache-control': 'no-cache' }
    if (/text|javascript|json|svg|manifest/.test(t) && /gzip/.test(q.headers['accept-encoding'] || '')) { body = gzipSync(body); h['content-encoding'] = 'gzip' }
    r.writeHead(200, h).end(body) } catch { r.writeHead(404).end() }
}).listen(port, () => console.log(`gz server on http://localhost:${port}/Pixeldate/`))
