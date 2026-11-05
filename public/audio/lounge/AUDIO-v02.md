# Pixeldate Games Lounge sounds (pd_lounge_v02): Web Audio notes

Add-on pack for café chat invites and the lounge-table arrival. Mono, 48 kHz. Use the `.ogg` files (Opus) where the browser supports them, which includes Chrome Android. Use the `.m4a` files (AAC) on iPhone/Safari.
`manifest.json` maps each sound id to its takes (file stems), `durationSec`, a `gain` hint (linear, for a per-sound GainNode), `loop`, and `category` (sfx / stinger).
Loudness: one-shots peak at -18 LUFS momentary or lower (decline is softer at about -20), with true peak at -2 dBTP or lower. Gain hints sit everything quietly under voice and video chat.

This pack is meant to sit alongside `pd_lounge_v01` (cards, chips, blackjack, `loungeBed`) and the café piano / ambience. Keys stay in **F major** so invite stingers can follow a `duetMatch` without clashing.

```js
const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
const ext = new Audio().canPlayType('audio/ogg; codecs=opus') ? '.ogg' : '.m4a';
const man = await (await fetch('/audio/lounge/manifest.json')).json(); // merge v01+v02 or load both
const buf = {};
await Promise.all(Object.values(man.sounds).flatMap(s => s.takes.map(async t => {
  buf[t] = await ctx.decodeAudioData(await (await fetch(`/audio/lounge/${t}${ext}`)).arrayBuffer());
})));

const sfxBus = ctx.createGain(); sfxBus.connect(ctx.destination);

const last = {};
function play(id, { vol = 1 } = {}) {
  const s = man.sounds[id]; let t = s.takes;
  if (t.length > 1) t = t.filter(x => x !== last[id]);
  const take = t[Math.floor(Math.random() * t.length)]; last[id] = take;
  const src = ctx.createBufferSource(); src.buffer = buf[take];
  const g = ctx.createGain(); g.gain.value = s.gain * vol;
  src.connect(g).connect(sfxBus); src.start();
}

// Invites in café chat
// play('inviteChime')   when a "Play a game?" invite arrives
// play('inviteAccept')  when the invite is accepted
// play('inviteDecline') when it is gently declined (soft, non-negative)
// play('teleport')      when both players appear together at a lounge table
```

## Doorway crossfade (café ↔ lounge)

The café and the lounge are becoming one continuous space joined by an archway. Do **not** hard-cut the café piano/ambience when the player steps through: crossfade it with `loungeBed` (from `pd_lounge_v01`) based on the player's distance from the archway.

Recommendation (equal-power, ~3 tiles):

```js
// d = 0 at the café side of the arch, 1 at the lounge side (clamp over ~3 tiles)
function doorwayMix(d) {
  d = Math.max(0, Math.min(1, d));
  const cafeGain = Math.cos(d * Math.PI * 0.5);   // 1 → 0
  const loungeGain = Math.sin(d * Math.PI * 0.5); // 0 → 1
  cafeBus.gain.setTargetAtTime(cafeGain * cafeBedGain, ctx.currentTime, 0.05);
  // loungeBed's packaged gain hint is 0.35 — keep that as the fully-in-lounge level
  bedBus.gain.setTargetAtTime(loungeGain * 0.35, ctx.currentTime, 0.05);
}
```

Notes
- Equal-power (`cos`/`sin`) keeps the summed energy flat across the doorway so the room doesn't dip or boom in the middle of the arch.
- About **3 tiles** of blend is enough to feel continuous without the lounge murmur leaking deep into the café.
- Keep ducking the bed under live call audio the same way as in v01 (`duckUnderCallGain` / bed × 0.35 while voice is active).
- No new audio file is required for the doorway; it only needs the existing café bed and `loungeBed`.

Tips
- `inviteChime` has two takes — rotate so repeats in a busy chat don't twin.
- Don't stack `inviteAccept` on top of `inviteChime`; if the accept lands within ~200 ms of the chime, skip the chime tail or let accept replace it.
- `inviteDecline` is intentionally quieter and shorter so a soft "no thanks" never feels like an error buzzer.
- `teleport` is a stinger: don't overlap it with `gameStart` / `levelUp`.
- Stingers share the F-major key of the café `duetMatch` and the v01 win flourishes.
