import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import prefsCss from './tools/prefs-css.js'
import earlyChunks from './tools/early-chunks.js'
// two pages: static landing at /Pixeldate/, the app at /Pixeldate/app/
export default defineConfig({ base: '/Pixeldate/', plugins: [react(), earlyChunks()], css: { postcss: { plugins: [prefsCss()] } },
  // the pixel-gender atlas (3.6 KB) stays a fingerprinted file, fetched only when a character card renders, instead of a
  // base64 copy inside the render-blocking CSS
  build: { assetsInlineLimit: (f: string) => /pixel-gender-atlas/.test(f) ? false : undefined, rollupOptions: { input: { main: 'index.html', app: 'app/index.html' } } } })
