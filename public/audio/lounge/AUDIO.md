# Pixeldate Games Lounge sounds (pd_lounge_v01): Web Audio notes

Mono, 48 kHz. Use the `.ogg` files (Opus) where the browser supports them, which includes Chrome Android. Use the `.m4a` files (AAC) on iPhone/Safari, where Opus-in-Ogg decoding is not reliable on older iOS versions.
`manifest.json` maps each sound id to its takes (file stems), `durationSec`, a `gain` hint (linear, for a per-sound GainNode), `loop`, and `category` (sfx / stinger / bed).
Loudness: one-shots peak at -18 LUFS momentary or lower, with true peak at -2 dBTP or lower. The bed is about -30 LUFS integrated. The gain hints then sit everything quietly under voice and video chat (the bed hint is 0.35).

```js
const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
const ext = new Audio().canPlayType('audio/ogg; codecs=opus') ? '.ogg' : '.m4a';
const man = await (await fetch('/audio/lounge/manifest.json')).json();
const buf = {};
await Promise.all(Object.values(man.sounds).flatMap(s => s.takes.map(async t => {
  buf[t] = await ctx.decodeAudioData(await (await fetch(`/audio/lounge/${t}${ext}`)).arrayBuffer());
})));

// Unlock on the first user gesture (iOS needs this, and needs it inside the handler)
const unlock = () => { ctx.resume(); const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(); };
addEventListener('pointerdown', unlock, { once: true, capture: true });

const sfxBus = ctx.createGain(); sfxBus.connect(ctx.destination);
const bedBus = ctx.createGain(); bedBus.connect(ctx.destination);

// Rotate takes so the same take never plays twice in a row
const last = {};
function play(id, { vol = 1, detune = 0 } = {}) {
  const s = man.sounds[id]; let t = s.takes;
  if (t.length > 1) t = t.filter(x => x !== last[id]);
  const take = t[Math.floor(Math.random() * t.length)]; last[id] = take;
  const src = ctx.createBufferSource(); src.buffer = buf[take];
  src.detune.value = detune;              // optional ±30 cents on card/chip sfx only, never on stingers (they are in F major)
  const g = ctx.createGain(); g.gain.value = s.gain * vol;
  src.connect(g).connect(sfxBus); src.start();
}

// Bed: seamless crossfade loop. Set loopEnd explicitly so AAC encoder padding is never looped.
let bed;
function startBed() {
  const b = buf.loungeBed;
  bed = ctx.createBufferSource(); bed.buffer = b; bed.loop = true;
  bed.loopStart = 0; bed.loopEnd = man.sounds.loungeBed.durationSec[0];
  bed.connect(bedBus);
  bedBus.gain.setValueAtTime(0, ctx.currentTime);
  bedBus.gain.linearRampToValueAtTime(man.sounds.loungeBed.gain, ctx.currentTime + 2);
  bed.start(0, Math.random() * 20);      // random start offset so two players don't hear identical beds
}
// Duck the bed (and soften sfx) while call audio is live, e.g. when a remote voice-activity flag is set
function duck(on) {
  const t = ctx.currentTime;
  bedBus.gain.setTargetAtTime(on ? man.sounds.loungeBed.gain * 0.35 : man.sounds.loungeBed.gain, t, on ? 0.08 : 0.6);
  sfxBus.gain.setTargetAtTime(on ? 0.7 : 1, t, 0.1);
}
```

Tips
- Dealing several cards: call `play('cardDeal')` every 120–180 ms. Rotation and a small detune keep it from sounding like a machine gun.
- Stingers (`snapWin`, `bj*`, `gameStart`, `levelUp`) share the F-major key of the café `duetMatch` stinger, so they can follow it without clashing. Don't play two stingers at once.
- On a blackjack, play `bjBlackjack` instead of `bjWin`, not on top of it. When chips come back, play `chipCollect` about 300 ms after the stinger.
- If the bed stops when the tab is hidden, `ctx.resume()` on `visibilitychange`.
