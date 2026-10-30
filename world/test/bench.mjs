// Server numbers: tick time and bytes per client per second at N = 8, 20, 40 (in-process Node dev server).
process.env.WORLD_PORT = '18792'; process.env.WORLD_URL = 'ws://127.0.0.1:18792'
const dev = await import('../dev/server.ts'); await new Promise(r => setTimeout(r, 300))
const { runBots } = await import('./bots.mjs'); const { sleep } = await import('./lib.mjs')
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const out = {}
for (const n of [8, 20, 40]) {
  const r = await runBots(n); await sleep(2000)
  const b0 = r.bots.map(b => [b.binBytes || 0, b.textBytes || 0]); dev.tickMs.length = 0; const SECS = 10; await sleep(SECS * 1000)
  const bin = r.bots.map((b, i) => ((b.binBytes || 0) - b0[i][0]) / SECS), txt = r.bots.map((b, i) => ((b.textBytes || 0) - b0[i][1]) / SECS)
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length
  out[n] = { tickMeanMs: +avg(dev.tickMs).toFixed(3), tickP99Ms: +pct(dev.tickMs, 0.99).toFixed(3), tickMaxMs: +Math.max(...dev.tickMs).toFixed(3), ticks: dev.tickMs.length,
    binBytesPerClientPerS: Math.round(avg(bin)), textBytesPerClientPerS: Math.round(avg(txt)), totalKBps: +((avg(bin) + avg(txt)) * n / 1024).toFixed(1), insts: [...new Set(r.bots.map(b => b.inst))] }
  console.log(n, JSON.stringify(out[n])); r.stop(); await sleep(500)
}
const fs = await import('node:fs'); fs.mkdirSync(new URL('./.out/', import.meta.url), { recursive: true }); fs.writeFileSync(new URL('./.out/bench.json', import.meta.url), JSON.stringify(out, null, 1))
const ok = out[40].tickP99Ms < 5 && out[40].binBytesPerClientPerS < 4000; console.log(ok ? 'bench OK' : 'bench FAIL'); process.exit(ok ? 0 : 1)
