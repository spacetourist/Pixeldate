// Round-trip and tick-jitter probe for the world server.
//   node world/test/lag-probe.mjs [base]
// base is http(s)://host (default the local dev server) or wss://host. Prints RTT p50/p95 and, when a socket answers ping, tick-gap p50/p95.
const base = process.argv[2] || 'http://127.0.0.1:8787'
const httpBase = base.replace(/^ws/, 'http')
const wsBase = base.replace(/^http/, 'ws')
const N = 40
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p / 100 * s.length) - 1))] }
const round = n => n == null ? null : Math.round(n * 10) / 10

const rtt = []
let path = '/ping'
{ const probe = await fetch(httpBase + '/ping', { cache: 'no-store' }).catch(() => null); if (probe && probe.status === 404) path = '/health' }
for (let i = 0; i < N; i++) {
  const t0 = performance.now()
  const res = await fetch(httpBase + path, { cache: 'no-store' }).catch(e => ({ ok: false, status: 0, err: e.message }))
  const ms = performance.now() - t0
  if (!res.ok) { console.log(JSON.stringify({ http: 'fail', status: res.status, err: res.err, url: httpBase + path })); break }
  rtt.push(ms)
}
const wsRtt = [], gaps = []
await new Promise(resolve => {
  let n = 0, done = false
  const finish = () => { if (!done) { done = true; try { ws.close() } catch {} resolve() } }
  let ws
  try { ws = new WebSocket(wsBase + '/parties/area/cafe-1') } catch (e) { console.log(JSON.stringify({ ws: 'fail', err: String(e) })); return resolve() }
  const timer = setTimeout(finish, 8000)
  ws.onopen = () => { const send = () => { if (ws.readyState !== 1 || n >= N) return; ws.send(JSON.stringify({ t: 'ping', n: performance.now() })); n++ } ; send(); ws._iv = setInterval(send, 120) }
  ws.onmessage = e => {
    if (typeof e.data !== 'string') return
    const m = JSON.parse(e.data); if (m.t !== 'pong') return
    wsRtt.push(performance.now() - m.n)
    if (typeof m.p50 === 'number') gaps.push(m.p50)
    if (wsRtt.length >= 20 && typeof m.p95 === 'number') { clearTimeout(timer); clearInterval(ws._iv); finish() }
  }
  ws.onerror = () => { clearTimeout(timer); finish() }
  ws.onclose = () => { clearTimeout(timer); finish() }
})
const out = {
  url: httpBase,
  httpPath: path,
  samples: rtt.length,
  rtt: { p50: round(pct(rtt, 50)), p95: round(pct(rtt, 95)), min: round(Math.min(...rtt)), max: round(Math.max(...rtt)) },
  wsSamples: wsRtt.length,
  wsRtt: wsRtt.length ? { p50: round(pct(wsRtt, 50)), p95: round(pct(wsRtt, 95)) } : null,
  tick: gaps.length ? { p50: round(pct(gaps, 50)), p95: round(pct(gaps, 95)), expectMs: 100 } : null,
}
console.log(JSON.stringify(out, null, 2))
process.exit(rtt.length ? 0 : 1)
