/** AE's lounge sound pack, wired per its AUDIO.md: WebAudio, Opus .ogg with .m4a fallback, rotating takes (never the same
    take twice in a row), the loungeBed loop ducked under call audio, unlocked on the first tap. Loaded lazily with the lounge,
    and only when LOUNGE_AUDIO (flags.ts) is on. */
type Snd = { takes: string[]; durationSec: number[]; gain: number; loop: boolean; category: string }
const BASE = import.meta.env.BASE_URL + 'audio/lounge/'
let ctx: AudioContext | null = null, sfx: GainNode, bed: GainNode, man: Record<string, Snd> = {}, ready: Promise<void> | null = null
const buf: Record<string, AudioBuffer> = {}, lastTake: Record<string, number> = {}
let bedSrc: AudioBufferSourceNode | null = null, ducked = false, stingerUntil = 0

export function load() {
  if (ready) { ctx!.resume().then(startBed); return ready }
  ctx = new AudioContext({ latencyHint: 'interactive' })
  sfx = ctx.createGain(); bed = ctx.createGain(); sfx.connect(ctx.destination); bed.connect(ctx.destination); bed.gain.value = 0
  const ext = new Audio().canPlayType('audio/ogg; codecs=opus') ? '.ogg' : '.m4a'
  const unlock = () => { ctx!.resume(); startBed() }
  addEventListener('pointerdown', unlock, { once: true, capture: true })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ctx?.resume() })
  ready = (async () => {
    man = (await (await fetch(BASE + 'manifest.json')).json()).sounds
    await Promise.all(Object.values(man).flatMap(s => s.takes).map(async t => {
      try { buf[t] = await ctx!.decodeAudioData(await (await fetch(BASE + t + ext)).arrayBuffer()) } catch { /* a missing take just stays quiet */ }
    }))
    if (ctx!.state === 'running') startBed()
  })()
  return ready
}

export function play(id: string, delay = 0) {
  const s = man[id]; if (!ctx || !s || ctx.state !== 'running') return
  if (s.category === 'stinger') { const now = performance.now(); if (now < stingerUntil) return; stingerUntil = now + s.durationSec[0] * 1000 }
  let i = 0
  if (s.takes.length > 1) { do i = Math.floor(Math.random() * s.takes.length); while (i === lastTake[id]) }
  lastTake[id] = i
  const b = buf[s.takes[i]]; if (!b) return
  const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = b; g.gain.value = s.gain
  if (/^(card|chip)/.test(id)) src.detune.value = (Math.random() * 2 - 1) * 30
  src.connect(g).connect(sfx); src.start(ctx.currentTime + delay / 1000)
}

function startBed() {
  const s = man.loungeBed, b = s && buf[s.takes[0]]; if (!ctx || !b || bedSrc) return
  bedSrc = ctx.createBufferSource(); bedSrc.buffer = b; bedSrc.loop = true; bedSrc.loopEnd = s.durationSec[0]
  bedSrc.connect(bed); bedSrc.start(0, Math.random() * s.durationSec[0])
  bed.gain.setValueAtTime(0, ctx.currentTime); bed.gain.linearRampToValueAtTime(0.35 * (ducked ? 0.35 : 1), ctx.currentTime + 2)
}

/** under call audio: the bed to 0.35x and sfx to 0.7 */
export function duck(on: boolean) {
  ducked = on; if (!ctx) return
  const t = ctx.currentTime
  bed.gain.cancelScheduledValues(t); bed.gain.linearRampToValueAtTime(bedSrc ? 0.35 * (on ? 0.35 : 1) : 0, t + 0.3)
  sfx.gain.cancelScheduledValues(t); sfx.gain.linearRampToValueAtTime(on ? 0.7 : 1, t + 0.3)
}

export function stop() { bedSrc?.stop(); bedSrc = null; ctx?.suspend() }

type V = { g: string; seq: number; last?: { k: string }; winner: unknown; phase?: string; hand?: unknown[]; res?: string | null; pile?: unknown[] } | null
/** game events from two successive game views */
export function onGame(a: V, b: V) {
  if (!b) { if (a) play('cardGather'); return }
  if (!a || a.g !== b.g) { play('gameStart'); play('cardShuffle', 400); return }
  if (b.seq === a.seq) return
  const k = b.last?.k
  if (b.g === 'snap') {
    if (k === 'flip') play('cardFlip'); else if (k === 'snap') play('snapSlap'); else if (k === 'false') play('snapFalse')
    if (b.winner !== null && a.winner === null) play('snapWin')
  } else if (b.g === 'blackjack') {
    const dealt = a.phase !== 'play' && b.phase === 'play'
    if (dealt) { play('chipPlace'); for (let i = 0; i < 4; i++) play('cardDeal', 150 + i * 150) }
    else if (k === 'hit') { play('bjHit'); play('cardDeal', 80) } else if (k === 'stand' || k === 'auto') play('bjStand')
    if (b.res && b.res !== a.res || (b.res && b.phase === 'bet' && a.phase !== 'bet')) {
      const st = b.res === 'bj' ? 'bjBlackjack' : b.res === 'win' ? 'bjWin' : b.res === 'push' ? 'bjPush' : b.res === 'bust' ? 'bjBust' : null
      if (st) play(st, dealt ? 800 : 200)
      if (b.res === 'win' || b.res === 'bj' || b.res === 'push') play('chipCollect', (dealt ? 800 : 200) + 300)
    }
  }
}
