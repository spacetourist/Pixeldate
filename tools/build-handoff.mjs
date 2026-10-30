// Builds the GitHub Pages hand-off site (handoff/handoff.js inlined) into dist-handoff/.
// HANDOFF_TARGET overrides the new site's origin (tests point it at a second local origin).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
const target = (process.env.HANDOFF_TARGET || 'https://pixeldate-world.pixeldate.workers.dev').replace(/\/$/, '')
const out = process.env.HANDOFF_OUT || new URL('../dist-handoff/', import.meta.url).pathname
const js = readFileSync(new URL('../handoff/handoff.js', import.meta.url), 'utf8').replace('__TARGET__', target)
const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><meta name="theme-color" content="#0C0722"><title>Pixeldate has moved</title>
<link rel="canonical" href="${target}/Pixeldate/app/"><link rel="icon" href="data:,">
<style>html,body{margin:0;height:100%;background:#0C0722;color:#FFF3E6;font:600 16px/1.4 system-ui,sans-serif}body{display:grid;place-items:center;text-align:center}a{color:#FF8FA3}</style>
<script>${js}</script></head>
<body><p>Pixeldate has moved to<br><a href="${target}/Pixeldate/app/">${target.replace(/^https?:\/\//, '')}</a></p></body></html>
`
rmSync(out, { recursive: true, force: true }); mkdirSync(out + 'app', { recursive: true })
for (const f of ['index.html', 'app/index.html', '404.html']) writeFileSync(out + f, html)
console.log('handoff ->', out, 'target', target)
