// The Audio Engineer's café audio lives in repo audio/ (piano/*.ogg|m4a + manifest.json + AUDIO.md + LICENSES.md). It is
// never imported by any module, so it never touches a bundle or a preload: dev serves it at <base>audio/*, and the build
// copies it next to the pages (dist/audio/... → /Pixeldate/audio/...), fetched only when someone picks or plays a piece.
import { createReadStream, existsSync, statSync, cpSync } from 'node:fs'
import { join, resolve, extname, sep } from 'node:path'
const TYPES = { '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8' }
export default function audio() {
  const root = resolve('audio'); let base = '/', outDir = 'dist'
  return {
    name: 'pixeldate-audio',
    configResolved(c) { base = c.base; outDir = resolve(c.root, c.build.outDir) },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const u = (req.url || '').split('?')[0], pre = base + 'audio/'
        if (!u.startsWith(pre)) return next()
        const f = resolve(root, decodeURIComponent(u.slice(pre.length)))
        if (!f.startsWith(root + sep) || !existsSync(f) || !statSync(f).isFile()) return next()
        res.setHeader('Content-Type', TYPES[extname(f)] || 'application/octet-stream'); res.setHeader('Content-Length', statSync(f).size)
        createReadStream(f).pipe(res)
      })
    },
    closeBundle() { if (existsSync(root)) cpSync(root, join(outDir, 'audio'), { recursive: true }) },
  }
}
