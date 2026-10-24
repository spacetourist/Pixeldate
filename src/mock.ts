/* Test-only mocked partner for screenshots. Loaded (as its own chunk) only when a test harness injects
   window.__pdMock before the app boots; nothing here runs for real users and no mock photos ship in public/.
   The partner's photo still goes through pixelatePhoto() at the requested level and arrives via the normal
   'photo' message path, so the stage shows exactly what a real peer would send. */
import { pixelatePhoto, loadImage } from './pixel'
import { cardById } from './deck'
import type { Profile, PeerProfile } from './net'

export interface MockCfg {
  me: Profile; mePhoto: string
  them: PeerProfile; themPhoto: string
  level?: number; pct?: number; tab?: 'profile' | 'chat' | 'call'; view?: 'stage' | 'compact'
  season?: 'winter' | 'spring' | 'summer' | 'autumn'
  script?: 'chat' | 'empty'
  /** lobby (07) / finding (08) instead of a match; `them` is not needed */
  scene?: 'lobby' | 'finding'
}

export async function runMock(cfg: MockCfg, api: any) {
  if (cfg.scene) { await api.start(cfg.me, cfg.mePhoto); api.setCode('k7q2px'); api.setScreen(cfg.scene); ;(window as any).__pdMockApi = api; ;(window as any).__pdMockReady = true; return }
  const handlers: Record<string, ((d: any) => void)[]> = {}
  const emit = (ev: string, d?: any) => (handlers[ev] || []).forEach(f => f(d))
  const themImg = await loadImage(cfg.themPhoto)
  const conn = {
    on(ev: string, f: (d: any) => void) { (handlers[ev] ||= []).push(f) },
    off(ev: string, f: (d: any) => void) { handlers[ev] = (handlers[ev] || []).filter(x => x !== f) },
    close() {},
    send(d: any) {
      // the partner answers our level with their own photo, reduced on "their" side to that level only
      if (d?.t === 'photo') setTimeout(() => emit('data', { t: 'photo', level: d.level, data: pixelatePhoto(themImg, d.level) }), 30)
    },
  }
  ;(window as any).__pdMockApi = api
  await api.start(cfg.me, cfg.mePhoto)
  if (cfg.view) api.setView(cfg.view)
  api.beginMatch({ conn, them: cfg.them, peer: 'mock' })
  const level = cfg.level || 1
  if (level > 1) api.jump(level)
  if (cfg.season && level >= 2) emit('data', { t: 'season', s: cfg.season })
  if (cfg.script === 'chat') {
    const pair = 'L1Q4', cur = cardById(level === 1 ? 'L1Q1' : `L${level}Q1`)!
    api.setAns({ [pair]: { me: 'Beach, but I would hike for a good view.', them: 'Mountains, always.' }, [cur.id]: { me: 'The first song of the morning.' } })
    api.setCredited([pair])
    const n = cfg.them.name
    api.setMsgs([
      { from: 'them', text: 'Hi! Eight blocks and you still look friendly.' },
      { from: 'me', text: "Ha, I'm mostly a teal rectangle right now." },
      { from: 'sys', pair },
      { from: 'sys', text: 'Now at Spark · 16 blocks' },
      { from: 'them', text: 'Okay, I can see a smile now.' },
      { from: 'me', text: 'Same. New card is up, your turn?' },
      { from: 'sys', text: `You answered Q1 · waiting for ${n}` },
    ])
  }
  api.setPct(cfg.pct ?? 0)
  if (cfg.tab) api.setTab(cfg.tab)
  ;(window as any).__pdMockReady = true
}
