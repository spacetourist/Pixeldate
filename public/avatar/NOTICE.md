# pixel-avatar detection assets (self-hosted, no CDN at runtime)

Loaded only by the lazy `src/avatar/` module (debug view `?avatar=debug` for now). Nothing here is in the initial JS.

| file | source | licence |
|---|---|---|
| wasm/vision_wasm_module_internal.{js,wasm} | npm `@mediapipe/tasks-vision` (same version as package.json), `wasm/` | Apache-2.0 |
| models/pose_landmarker_lite.task | storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest | Apache-2.0 |
| models/selfie_multiclass_256x256.tflite | storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest | Apache-2.0 |

When bumping `@mediapipe/tasks-vision`, re-copy the two wasm files from `node_modules/@mediapipe/tasks-vision/wasm/`
(the JS API and the WASM must match). ~37 MB raw / ~24 MB gzip in total: consider Git LFS or a fetch script before merging.
