// prod relay check: fetch /turn with the invite (read from file, never printed), then an RTCPeerConnection with
// iceTransportPolicy 'relay' must gather a relay candidate. Prints only counts / candidate types.
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
const inv = readFileSync(new URL('../.secrets/world-invite.txt', import.meta.url), 'utf8').trim()
const URLT = process.env.TURN_URL ?? 'https://pixeldate-world.pixeldate.workers.dev/turn'
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await b.newPage(); await p.goto('https://example.com')
const r = await p.evaluate(async (u, inv) => {
  const res = await fetch(u + '?p=relaycheck-' + Date.now().toString(36), { headers: { 'x-pd-invite': inv } }); const j = await res.json()
  const out = { status: res.status, turn: j.turn, ttl: j.ttl, why: j.why, servers: (j.iceServers || []).length, port53: (j.iceServers || []).flatMap(s => [].concat(s.urls)).some(u => /:53(\?|$)/.test(u)), urls: (j.iceServers || []).flatMap(s => [].concat(s.urls)).map(u => u.replace(/^(\w+):[^:?]+/, '$1:host')), types: [] }
  if (!j.turn) return out
  const pc = new RTCPeerConnection({ iceServers: j.iceServers, iceTransportPolicy: 'relay' }); pc.createDataChannel('x')
  await pc.setLocalDescription(await pc.createOffer())
  await new Promise(ok => { pc.onicecandidate = e => { if (!e.candidate) ok(); else out.types.push(e.candidate.type + '/' + e.candidate.protocol) }; setTimeout(ok, 10000) })
  pc.close(); return out
}, URLT, inv)
console.log(JSON.stringify(r))
await b.close()
const ok = r.status === 200 && r.turn && r.types.some(t => t.startsWith('relay')) && !r.port53
console.log(ok ? 'relay check: OK' : 'relay check: FAIL'); process.exit(ok ? 0 : 1)
