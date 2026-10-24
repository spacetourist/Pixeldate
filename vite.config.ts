import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import prefsCss from './tools/prefs-css.js'
import earlyChunks from './tools/early-chunks.js'
// two pages: static landing at /Pixeldate/, the app at /Pixeldate/app/
export default defineConfig({ base: '/Pixeldate/', plugins: [react(), earlyChunks()], css: { postcss: { plugins: [prefsCss()] } },
  build: { rollupOptions: { input: { main: 'index.html', app: 'app/index.html' } } } })
