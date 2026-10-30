#!/usr/bin/env bash
# Deploy the one Pixeldate site: build the app into deploy/site/Pixeldate (the Worker's static assets) and deploy the
# pixeldate-world Worker (café server + /turn + every page and asset) with world/wrangler.live.toml.
# CI runs this on push to main (.github/workflows/deploy.yml); from a box: CLOUDFLARE_ACCOUNT_ID=… tools/deploy.sh
# Needs CLOUDFLARE_API_TOKEN (Workers Scripts edit on the account) in the environment. Never prints it.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || { echo "CLOUDFLARE_API_TOKEN is not set" >&2; exit 1; }
node tools/fetch-avatar-assets.mjs
npx tsc -b
rm -rf deploy/site/Pixeldate
# no TURN key in the bundle: the app asks the Worker's /turn for short-lived credentials
VITE_WORLD_URL=wss://pixeldate-world.pixeldate.workers.dev npx vite build --outDir deploy/site/Pixeldate --emptyOutDir
test -f deploy/site/Pixeldate/app/index.html && test -f deploy/site/Pixeldate/index.html && test -f deploy/site/Pixeldate/audio/piano/clair-de-lune.ogg
echo "assets: $(find deploy/site -type f | wc -l) files"
cd world && npx wrangler deploy -c wrangler.live.toml 2>&1 | grep -v -i token
curl -fsS https://pixeldate-world.pixeldate.workers.dev/health && echo " ← /health"
