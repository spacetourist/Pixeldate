// The ping answers before join, and the tick interval clusters around 100 ms.
import assert from 'node:assert/strict'
process.env.WORLD_PORT = '18786'; process.env.WORLD_URL = 'ws://127.0.0.1:18786'
const dev = await import('../dev/server.ts'); await new Promise(r => setTimeout(r, 200))
const http = 'http://127.0.0.1:18786'
const ping = await fetch(http + '/ping'); assert.equal(ping.status, 200)
const body = await ping.json(); assert.equal(body.t, 'pong'); assert.equal(typeof body.now, 'number')
const ws = new WebSocket(process.env.WORLD_URL + '/parties/area/cafe-1')
const pongs = []
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
const ask = () => ws.send(JSON.stringify({ t: 'ping', n: performance.now() }))
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.t === 'pong') pongs.push(m) }
ask()
await new Promise(r => setTimeout(r, 1200))
for (let i = 0; i < 8; i++) { ask(); await new Promise(r => setTimeout(r, 150)) }
assert.ok(pongs.length >= 5, 'pongs ' + pongs.length)
const last = pongs.at(-1)
assert.equal(typeof last.now, 'number')
assert.ok(last.gaps >= 8, 'ticks recorded ' + last.gaps)
assert.ok(last.p50 > 70 && last.p50 < 160, 'tick p50 ' + last.p50)
assert.ok(last.p95 < 250, 'tick p95 ' + last.p95)
const rtt = pongs.map(m => performance.now() - m.n).filter(n => n > 0 && n < 1000)
assert.ok(rtt.length >= 5)
ws.close()
console.log('ok  ping', JSON.stringify({ rttP50: rtt.sort((a, b) => a - b)[Math.floor(rtt.length / 2)], tickP50: last.p50, tickP95: last.p95, gaps: last.gaps }))
dev.default?.close?.()
process.exit(0)
