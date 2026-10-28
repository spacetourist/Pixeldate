// v0.4 Pixel You in the app: signup step 3, the skip path, You › Profile character row, the Edit entry, and the
// match HUD card with their character (mock partner). usage: [ONLY=match] node test/v04-shots.mjs   (vite preview running)
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs'
import { mkdirSync } from 'node:fs'
import { open, cfg } from './r1-shots.mjs'
const URL = process.env.URL || 'http://localhost:4173/Pixeldate/app/'
const DIR = '/workspace/pixeldate/shots/avatar-v04/'; mkdirSync(DIR, { recursive: true })
const SIZES = [['390x844', 390, 844], ['1440x900', 1440, 900]]
const ME_PAV = JSON.stringify({ v: 1, build: 'regular', hair: 'crop', top: 'jacket', bottom: 'jeans', shoes: 'trainers', beard: 'none', acc: 'cap', face: 'a', skin: 'olive', hairc: 'soft-black', topc: 'navy', bottomc: 'navy', shoec: 'black', tights: null, accc: 'white' })
const THEM_PAV = JSON.stringify({ v: 1, build: 'slim', hair: 'afro', top: 'dress', bottom: 'trousers', shoes: 'trainers', beard: 'none', acc: 'none', face: 'a', skin: 'deep', hairc: 'black', topc: 'white', bottomc: 'white', shoec: 'mustard', tights: null })
const out = [], ONLY = process.env.ONLY // e.g. ONLY=match re-shoots just the match card
const shot = async (p, n) => { await p.waitForTimeout(400); const f = DIR + n + '.png'; await p.screenshot({ path: f }); out.push(f); console.log('shot', f) }
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
for (const [sz, w, h] of SIZES) {
  if (!ONLY) { // real signup (no mock): steps 1-2, then step 3 "Your character", skip -> Birthday, Back -> build by hand -> saved
    const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' }), p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message))
    await p.goto(URL); await p.waitForSelector('[data-t=name]'); await p.fill('[data-t=name]', 'Kofi'); await p.click('[data-t=iam-man]'); await p.click('[data-t=next]')
    await p.setInputFiles('[data-t=gallery]', '/workspace/pixeldate/test/fixtures/sam.jpg'); await p.waitForSelector('.rv-acts:not(.hid) [data-t=photo-confirm]', { timeout: 15000 })
    await p.click('[data-t=photo-confirm]'); await p.waitForSelector('[data-t=av-flow] [data-t=av-hand]', { timeout: 15000 }); await shot(p, `signup-step3-${sz}`)
    await p.click('[data-t=av-skip]'); await p.waitForSelector('[data-t=bday]'); await shot(p, `signup-skip-birthday-${sz}`)
    await p.click('[data-t=back]'); await p.waitForSelector('[data-t=av-hand]'); await p.click('[data-t=av-hand]'); await p.waitForSelector('[data-t=av-looks]'); await shot(p, `signup-build-${sz}`)
    await p.click('[data-t=av-looks]'); await p.waitForSelector('[data-t=av-continue]'); await shot(p, `signup-saved-${sz}`); await ctx.close()
  }
  if (!ONLY) { // You › Profile with the character row, then the Edit entry (flow opened with "Tweak my current character")
    const p = await open(b, w, h, { scene: 'lobby', page: 'profile', me: { ...cfg().me, pav: ME_PAV } })
    await p.waitForSelector('[data-t=you-char][data-drawn]', { timeout: 15000 }); await p.locator('[data-t=you-char-row]').scrollIntoViewIfNeeded(); await shot(p, `you-profile-character-${sz}`)
    await p.click('[data-t=edit-avatar]'); await p.waitForSelector('[data-t=av-current]'); await shot(p, `edit-entry-${sz}`)
    await p.click('[data-t=av-current]'); await p.waitForSelector('[data-t=av-looks]'); await shot(p, `edit-tweak-${sz}`); await p.context().close()
  }
  if (!ONLY) { const p = await open(b, w, h, { scene: 'lobby', page: 'profile' }); await p.waitForSelector('[data-t=edit-avatar]'); await p.locator('[data-t=you-char-row]').scrollIntoViewIfNeeded(); await shot(p, `you-profile-no-character-${sz}`); await p.context().close() }
  { // match HUD: their character card (LV < 5), drawn from them.pav
    const p = await open(b, w, h, { them: { ...cfg().them, pav: THEM_PAV } }); await p.waitForSelector('[data-t=their-char][data-drawn]', { timeout: 15000 }); await shot(p, `match-their-character-${sz}`); await p.context().close()
  }
}
await b.close()
