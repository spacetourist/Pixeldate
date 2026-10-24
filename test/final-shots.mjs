// FINAL screenshot set: re-runs the R1-R5 harnesses against the current build, then copies one shot per screen to
// shots/final-<screen>-{p390,d1440}.png. usage: [URL=...] node test/final-shots.mjs   (vite preview running)
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
const D = '/workspace/pixeldate/shots/'
if (!process.env.SKIP_RUN) for (const r of [1, 2, 3, 4, 5]) { console.log(`-- r${r}-shots`); execFileSync('node', [`test/r${r}-shots.mjs`], { stdio: 'inherit', cwd: '/workspace/pixeldate' }) }
const MAP = {
  landing: 'r4-landing', 'signup-1-name': 'r2-02-signup-name', 'signup-2-photo': 'r2-03-signup-photo', 'signup-3-birthday': 'r2-05-signup-birthday',
  'signup-4-meet': 'r2-06-signup-meet', ladder: 'r2-04-signup-ladder', lobby: 'r4-lobby', finding: 'r4-finding',
  'chat-stage': 'r1-chat-stage', 'chat-compact': 'r1-chat-compact', 'level-up': 'r3-levelup-settled', reveal: 'r3-reveal-mid',
  'reveal-full': 'r3-reveal-full', call: 'r3-call-in', matches: 'r5-matches', profile: 'r5-profile', settings: 'r5-settings', toast: 'r4-notice-left',
}
let miss = 0
for (const [k, v] of Object.entries(MAP)) for (const vp of ['p390', 'd1440']) {
  const src = `${D}${v}-${vp}.png`; if (!existsSync(src)) { console.log('MISSING', src); miss++; continue }
  copyFileSync(src, `${D}final-${k}-${vp}.png`) }
console.log(miss ? `final: ${miss} missing` : `final: ${Object.keys(MAP).length * 2} shots`)
