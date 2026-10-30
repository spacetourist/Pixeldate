# World art

Everything here is GD's, copied from `/workspace/design/pixeldate/world/` (read-only; never edit it there).

| file | from | used for |
| --- | --- | --- |
| `cafe-map-landscape.png` | `world/` | the café, 40x24 tiles of 16 px, chairs and tables included |
| `glow-*.png` | `world/` | additive light pools (render.ts `GLOW`) |
| `markers/heart-bob.png` | `world/markers/` | heart over someone who hearted you, two 9x9 frames, 400 ms each, at (sx+7, sy−10) |
| `markers/heart.png` | `world/markers/` | the still heart (reduced motion), at (sx+7, sy−9) |
| `markers/broken-heart.png` | `world/markers/` | someone who passed on you, at (sx+7, sy−8) |
| `markers/edge-arrow.png`, `-left`, `-up`, `-down` | `world/markers/` | off-screen heart arrows, one per screen edge, drawn upright (no rotation); tip 2 px inside the edge |
| `markers/count-badges.png` | `world/markers/` | ×2…×9 (11 px each at x = 0, 11 … 77) and ×9+ (15 px at 88) on a merged arrow; right/down (0,0), left (13,0), up (0,15) |
| `markers/speech-bubble-9slice.png`, `-tail.png` | `world/markers/` | the chat bubble (world.css `border-image`, 4 px slices, tail tip 2 px above the head) |

(sx, sy) is the 24x32 sprite cell's top-left. Seated: add 3 (`SIT_D`) to every y.

Re-import after GD re-exports the markers: `node tools/import-world-art.mjs [--dry]` (sizes are checked against
`world/markers/README.md`), then rebuild.

Seated people are not art files: the sit pose is `composeDir(look, dir, 'sit')` in `walk.ts`, a pixel-exact port of
`pixel-avatar/tools/kit_dir.py` (checked against `sit-sheet.png` by `world/test/walk.mjs`), so custom looks sit too.
The sprite's top-left is the chair tile (16x32, top on the back-rest row) + (−2, −10) on a left seat (sitter faces
right) or (−6, −10) on a right seat (sitter faces left).
