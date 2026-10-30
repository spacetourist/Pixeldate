# Pixeldate v0.1

A lean playable demo of a dating app where you get to know someone before you see them. Photos and video start as
8 blocks across and sharpen as two people get closer. Tap **Find someone** and you are paired at random, with no browsing.

Live (one site): **https://pixeldate-world.pixeldate.workers.dev/Pixeldate/app/**. The Cloudflare Worker `pixeldate-world`
serves the app, the landing (`/Pixeldate/`), every asset, the café WebSocket (`/parties/area/cafe-N`) and `/turn`. `/` and
`/Pixeldate` redirect to the app and keep the query string.

The old https://spacetourist.github.io/Pixeldate/ is now only a hand-off page (`handoff/`, built by `tools/build-handoff.mjs`).
On each device's first visit it packs that device's data (every `pd.*` / `pd-*` localStorage key and the IndexedDB photo, the
photo re-encoded to at most about 240 kB) into the URL fragment. It then sends you to the same path and query on workers.dev.
The new site imports that data once (`src/movein.ts`):
- it only fills keys that are missing there;
- it merges the blocked lists as a union;
- the photo comes only together with a missing profile;
- it clears the fragment and shows "Your profile moved here".

After that first hand-off (flag `pd.moved`) the old site just redirects. Test: `npm run build && node test/movein-e2e.mjs`.

### Deploy
One path: push to `main`. `.github/workflows/deploy.yml` runs `tools/deploy.sh`, which builds into `deploy/site/Pixeldate`
with `VITE_WORLD_URL=wss://pixeldate-world.pixeldate.workers.dev` (no TURN key in the bundle) and runs
`wrangler deploy -c world/wrangler.live.toml`. It then publishes the hand-off page to GitHub Pages.

The repo secrets are `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The token is the account token "pixeldate-world CI deploy
(GitHub Actions)", limited to Workers Scripts Read/Write and Account Settings Read on this account. To deploy by hand from a
machine with a token, run `CLOUDFLARE_ACCOUNT_ID=… tools/deploy.sh`. Worker secrets (`INVITES`, `TURN_KEY_*`,
`CF_ANALYTICS_TOKEN`) live on Cloudflare, not in CI.

## Rules
- Levels (blocks across): 1 Stranger (8), 2 Spark (16), 3 Crush (32), 4 Close (64), 5 Crystal clear (full).
- **The sender pixelates.** Photos are block-averaged on the sender's device to exactly N px wide and re-sent on each level change.
  Video runs through a WebGL pixelation shader on a canvas that is only N×4 px wide; `canvas.captureStream()` is the call track.
  The clear camera feed never leaves the phone, and you see your own clear preview.
- Meter: time together plus +20% per card both people answer (`METER` in `src/config.ts`). Full meter unlocks Reveal more; the level rises only when both tap. Either person can lower the level for both.
- Question deck: 8 per level behind the `QuestionSource` interface in `src/deck.ts`, so an AI source can replace it.
- Matching filters: I am / I'd like to meet / my age / age range. Both people must fit each other.

## Matching (no backend)
Uses PeerJS's free public cloud server. Waiting players claim a well-known id `pixeldate-lobby-<iam>-<seek>-<n>`;
searchers knock on every compatible slot at once, exchange profiles (ages, filters, a random local id) over the data channel,
and the first compatible pair connects personal peer to personal peer, then the waiter frees the slot. Skip ends the match and
searches again; Block also stores the other person's random id in localStorage so they never match again in this browser.
**Join with a code** connects two people directly as a backup.

## Known limits
- Only the default public STUN servers are used. Some networks (symmetric NAT, many mobile carriers, corporate Wi-Fi) will need a **TURN server** later.
- The public PeerJS server is shared, rate-limited and has no uptime guarantee. A busy lobby needs a real backend.
- Profiles and filters are self-declared; there is no moderation or age verification. Demo: test with people you know.

## Develop
```sh
npm i && npm run dev
npm run build && npx vite preview --port 4173
LOOPBACK=1 node test/e2e.mjs            # two-page flow; ?loopback swaps PeerJS for a BroadcastChannel stand-in
LOOPBACK=1 node test/e2e.mjs incompat   # incompatible genders never match
LOOPBACK=1 node test/e2e.mjs incompat age
node test/e2e.mjs                       # the same flow over real WebRTC (needs a network that allows it)
```
Design: Pixeldate "Player Two" (design repo `pixeldate/player-two`). Fonts: Bricolage Grotesque and Jersey 15, both OFL (see `public/fonts/LICENSE`).
