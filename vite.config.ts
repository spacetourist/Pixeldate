import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import prefsCss from './tools/prefs-css.js'
import earlyChunks from './tools/early-chunks.js'
import audio from './tools/audio.js'
import { fileURLToPath } from 'node:url'
// two pages: static landing at /Pixeldate/, the app at /Pixeldate/app/
export default defineConfig({ base: '/Pixeldate/', plugins: [react(), earlyChunks(), audio()],
  // PixiJS v8 by module path (src/world/pixi.ts): the café needs sprites only, and the package root pulls in every
  // extension (text, graphics, filters, accessibility, assets...) as side effects
  resolve: { alias: { 'pixi-lib': fileURLToPath(new URL('./node_modules/pixi.js/lib', import.meta.url)) } }, css: { postcss: { plugins: [prefsCss()] } },
  // the pixel-gender atlas (3.6 KB) stays a fingerprinted file, fetched only when a character card renders, instead of a
  // base64 copy inside the render-blocking CSS
  build: { assetsInlineLimit: (f: string) => /pixel-gender-atlas/.test(f) ? false : undefined, rollupOptions: { input: { main: 'index.html', app: 'app/index.html' } } } })
