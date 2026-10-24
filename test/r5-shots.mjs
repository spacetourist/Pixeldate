// R5 screenshot harness: Matches (09) empty + populated, You (16), Settings (17), the delete confirm and the
// blocked list. History / blocked people are seeded into this device's storage by the mock (src/mock.ts seed).
// usage: [URL=...] node test/r5-shots.mjs   (vite preview running)
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { readFileSync } from 'node:fs'
import { open } from './r1-shots.mjs'
const PH = '/workspace/design/pixeldate/player-two/assets/photos/'
const du = f => 'data:image/webp;base64,' + readFileSync(PH + f).toString('base64')
const OUT = n => `/workspace/pixeldate/shots/r5-${n}.png`
const SIZES = [['p390', 390, 844], ['d1440', 1440, 900]]
export const SEED = { history: [
  { uid: 'h-juno', name: 'Juno', br: [30, 34], lv: 3, how: 'moved', ago: 90, avPhoto: du('juno-full.webp') },
  { uid: 'h-ines', name: 'Ines', br: [25, 29], lv: 1, how: 'left', ago: 60 * 24 * 3, avPhoto: du('ines-full.webp') }],
  blocked: [{ uid: 'b-theo', name: 'Theo', br: [30, 34], ago: 60 * 24 * 2, avPhoto: du('theo-full.webp') }] }
const settle = p => p.waitForTimeout(500)
const shot = async (p, n) => { await p.screenshot({ path: OUT(n) }); console.log('shot', OUT(n)) }
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
for (const [sz, w, h] of SIZES) {
  { const p = await open(b, w, h, { scene: 'lobby', page: 'matches' }); await settle(p); await shot(p, `matches-empty-${sz}`); await p.context().close() }
  { const p = await open(b, w, h, { page: 'matches', seed: SEED }); await settle(p); await shot(p, `matches-${sz}`); await p.context().close() }
  { const p = await open(b, w, h, { page: 'profile' }); await settle(p); await shot(p, `profile-${sz}`); await p.context().close() }
  { const p = await open(b, w, h, { scene: 'lobby', page: 'settings', seed: SEED }); await settle(p); await shot(p, `settings-${sz}`)
    await p.locator('[data-t=blocked-row]').first().scrollIntoViewIfNeeded(); await settle(p); await shot(p, `blocked-${sz}`)
    await p.click('[data-t=delete]'); await settle(p); await shot(p, `delete-confirm-${sz}`); await p.context().close() }
}
await b.close()
