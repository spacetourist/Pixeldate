// Wandering bots for load and for screenshots.  node world/test/bots.mjs [N=8] [seconds=60] [room=cafe-1]
// Uses WORLD_URL (default ws://127.0.0.1:8787). Bots join, walk to random floor tiles, sit at tables, and chat now and then.
import { Bot, profile, sleep } from './lib.mjs'
import { W, H, walkable, TABLES } from '../shared/map.ts'
const LINES = ['hi!', 'love the lamps in here', 'anyone into climbing?', 'first time here', 'what are you reading?', 'coffee or tea?', 'nice jacket', 'this playlist though']
export async function runBots(n, { room = 'cafe-1', chat = true, sit = true, names } = {}) {
  const bots = []
  for (let i = 0; i < n; i++) { const b = new Bot(profile({ name: names?.[i] ?? 'Bot' + (i + 1), iam: i % 2 ? 'man' : 'woman', seek: 'everyone' }), { room }); await b.connect(); bots.push(b) }
  let live = true
  const loop = async b => {
    while (live && b.closed == null) {
      if (sit && Math.random() < 0.15) { const t = TABLES[Math.floor(Math.random() * TABLES.length)], s = t.seats[Math.floor(Math.random() * 2)]; b.send({ t: 'go', x: s[0], y: s[1] }) }
      else { let x, y; do { x = Math.floor(Math.random() * W); y = Math.floor(Math.random() * H) } while (!walkable(x, y)); b.send({ t: 'go', x, y }) }
      if (chat && Math.random() < 0.25) b.send({ t: 'say', text: LINES[Math.floor(Math.random() * LINES.length)] })
      await sleep(2000 + Math.random() * 5000)
    }
  }
  bots.forEach(loop)
  return { bots, stop() { live = false; bots.forEach(b => b.close()) } }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [n = 8, secs = 60, room = 'cafe-1'] = process.argv.slice(2)
  const r = await runBots(+n, { room }); console.log(`${r.bots.length} bots in`, [...new Set(r.bots.map(b => b.inst))].join(', '))
  await sleep(+secs * 1000); r.stop(); process.exit(0)
}
