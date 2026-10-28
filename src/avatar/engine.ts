/* MediaPipe pipeline. Runs inside the avatar Worker (or on the main thread as a fallback). Only fetches our own
   self-hosted WASM + models from `base`; the photo is decoded and analysed locally and never sent anywhere.
   Two segmentation routes (SPEC v0.1 download budget):
     lite (default): selfie_segmenter + hair_segmenter + skin colour  -> ~21.3 MB total incl. WASM + pose
     full (fallback): selfie_multiclass_256x256                       -> ~36.9 MB total                */
import { FilesetResolver, PoseLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision'
import { crops, describe, gate, type Lm, type Mask } from './descriptor'
import { liteMask, skinModel } from './lite'
import type { Result, LoadInfo, Mode, Progress } from './types'
import PINS from './assets.json'

const MAX = 1024 // analysis resolution (long side)
const WASM = 'wasm/vision_wasm_module_internal.wasm', LOADER = 'wasm/vision_wasm_module_internal.js', POSE = 'models/pose_landmarker_lite.task'
export const FILES: Record<Mode, string[]> = {
  lite: [LOADER, WASM, POSE, 'models/selfie_segmenter.tflite', 'models/hair_segmenter.tflite'],
  full: [LOADER, WASM, POSE, 'models/selfie_multiclass_256x256.tflite'],
}
const size = (f: string) => (PINS as Record<string, { size: number }>)[f]?.size ?? 0
export const totalBytes = (m: Mode) => FILES[m].reduce((s, f) => s + size(f), 0)

type Tasks = { info: LoadInfo; seg?: ImageSegmenter; person?: ImageSegmenter; hair?: ImageSegmenter }
const ready: Partial<Record<Mode, Promise<Tasks>>> = {}
let pose: PoseLandmarker | null = null, factory: unknown, wasmUrl: string | null = null
const arm = () => { (globalThis as any).ModuleFactory = factory }

/* MediaPipe tasks-vision ships a usage logger that POSTs to odml.pa.googleapis.com/v1/log (task type, timings;
   no image data, but still a call home we promised not to make). Block it: inside the avatar Worker every
   off-origin fetch is refused; on the main-thread fallback only Google's logging endpoint is, so the app is untouched. */
const blocked: string[] = []
function lockNetwork() {
  const g = globalThis as any, f = g.fetch as typeof fetch & { __pdGuard?: boolean }
  if (!f || f.__pdGuard) return
  const inWorker = typeof document === 'undefined'
  const guard: any = (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href)
    if (inWorker ? u.origin !== location.origin : /(^|\.)googleapis\.com$/.test(u.hostname) && /\/log\b/.test(u.pathname)) {
      blocked.push(u.origin + u.pathname); return Promise.reject(new TypeError('pixel-avatar: off-origin request blocked'))
    }
    return f(input, init)
  }
  guard.__pdGuard = true; g.fetch = guard
}
export const blockedRequests = () => blocked.slice()

/** Streamed fetch that reports bytes as they arrive (sizes come from the pins: Content-Length lies under gzip). */
async function fetchBytes(base: string, file: string, tick: (n: number) => void) {
  const t = performance.now(), r = await fetch(base + file)
  if (!r.ok || !r.body) throw new Error(`avatar asset ${file}: HTTP ${r.status}`)
  const parts: Uint8Array[] = [], rd = r.body.getReader(); let n = 0
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; tick(value.length) }
  const b = new Uint8Array(n); let o = 0; for (const p of parts) { b.set(p, o); o += p.length }
  return { b, ms: performance.now() - t }
}

export function load(base: string, mode: Mode = 'lite', onProgress?: (p: Progress) => void): Promise<LoadInfo> {
  lockNetwork()
  return (ready[mode] ??= (async (): Promise<Tasks> => {
    const t0 = performance.now(), total = totalBytes(mode)
    // bytes already on hand (WASM + pose shared with the other route) count as done
    let loaded = wasmUrl ? size(LOADER) + size(WASM) + (pose ? size(POSE) : 0) : 0
    const tick = (n: number, file: string) => { loaded += n; onProgress?.({ loaded: Math.min(loaded, total), total, file }) }
    tick(0, '')
    const ms: Record<string, number> = {}, bytes: Record<string, number> = {}
    const shared = (async () => {
      if (wasmUrl) return
      // We import the (ES module) WASM loader ourselves and hand MediaPipe an empty loader path. tasks-vision clears
      // self.ModuleFactory after every task it creates and a cached ES import never re-runs, so the next task would
      // fail with "ModuleFactory not set"; re-arming it before each create avoids that (module Worker + main thread).
      const t = performance.now(), [m, w] = await Promise.all([import(/* @vite-ignore */ base + LOADER), fetchBytes(base, WASM, n => tick(n, WASM))])
      tick(size(LOADER), LOADER)
      factory = m.default
      // our own streamed copy of the WASM (for the progress meter) as a same-origin blob: URL; each task compiles from it
      wasmUrl = URL.createObjectURL(new Blob([w.b as BlobPart], { type: 'application/wasm' })); ms.wasm = performance.now() - t; bytes.wasm = w.b.length
    })()
    const poseP = (async () => {
      if (pose) return null
      const r = await fetchBytes(base, POSE, n => tick(n, POSE)); ms.poseFetch = r.ms; bytes.pose = r.b.length; return r.b
    })()
    const segFiles = FILES[mode].slice(3)
    const segP = Promise.all(segFiles.map(async f => { const r = await fetchBytes(base, f, n => tick(n, f)); ms['fetch:' + f.replace(/.*\//, '')] = r.ms; bytes[f.replace(/.*\/|\.tflite/g, '')] = r.b.length; return r.b }))
    const [, pb, sb] = await Promise.all([shared, poseP, segP])
    ms.fetchAll = performance.now() - t0
    const fs = { wasmLoaderPath: '', wasmBinaryPath: wasmUrl! } as Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
    let t = performance.now()
    if (pb) { arm(); pose = await PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetBuffer: pb, delegate: 'CPU' }, runningMode: 'IMAGE', numPoses: 2 }); ms.poseInit = performance.now() - t; t = performance.now() }
    const mk = async (b: Uint8Array, conf: boolean) => { arm(); return ImageSegmenter.createFromOptions(fs, { baseOptions: { modelAssetBuffer: b, delegate: 'CPU' }, runningMode: 'IMAGE', outputCategoryMask: !conf, outputConfidenceMasks: conf }) }
    const out: Tasks = { info: { mode, ms, bytes, blocked: [] } }
    if (mode === 'full') out.seg = await mk(sb[0], false)
    else { out.person = await mk(sb[0], true); out.hair = await mk(sb[1], true) }
    ms.segInit = performance.now() - t; ms.total = performance.now() - t0
    onProgress?.({ loaded: total, total, file: '' })
    out.info.blocked = blocked.slice()
    return out
  })().catch(e => { delete ready[mode]; throw e })).then(t => ({ ...t.info, blocked: blocked.slice() }))
}

function canvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c
}
const resample = <T extends Uint8Array | Float32Array>(src: T, sw: number, sh: number, w: number, h: number, mk: (n: number) => T): T => {
  if (sw === w && sh === h) return src
  const d = mk(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = src[Math.floor(y * sh / h) * sw + Math.floor(x * sw / w)]; return d
}

export async function analyse(base: string, photo: Blob, mode: Mode = 'lite'): Promise<Result> {
  const info = await load(base, mode), T = await ready[mode]!
  const ms: Record<string, number> = {}
  let t = performance.now()
  const lap = (k: string) => { const n = performance.now(); ms[k] = Math.round((n - t) * 10) / 10; t = n }
  const bm0 = await createImageBitmap(photo, { imageOrientation: 'from-image' })
  const sc = Math.min(1, MAX / Math.max(bm0.width, bm0.height)), w = Math.round(bm0.width * sc), h = Math.round(bm0.height * sc)
  const cv = canvas(w, h), cx = cv.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D
  cx.drawImage(bm0, 0, 0, w, h); bm0.close()
  const px = cx.getImageData(0, 0, w, h)
  lap('decode')
  const pr = pose!.detect(cv as any)
  lap('pose')
  const lm = pr.landmarks[0] as Lm[] | undefined, world = pr.worldLandmarks[0] as Lm[] | undefined
  const sz = { w, h }
  const err = gate(pr.landmarks as Lm[][])
  if (err || !lm) return { ok: false, error: err!, landmarks: lm ?? null, poses: pr.landmarks.length, size: sz, ms, load: info, blocked: blocked.slice(), mode }
  const box = crops(lm, w, h), sk = mode === 'lite' ? skinModel(px.data, w, h, lm) : null
  const crop = (b: { x0: number; y0: number; w: number; h: number }) => { const c = canvas(b.w, b.h), x = c.getContext('2d') as OffscreenCanvasRenderingContext2D; x.putImageData(px, -b.x0, -b.y0); return c }
  const conf = (s: ImageSegmenter, c: OffscreenCanvas | HTMLCanvasElement, b: { w: number; h: number }) => {
    const r = s.segment(c as any), m = r.confidenceMasks!.at(-1)!   // last channel = foreground (person / hair)
    const d = resample(m.getAsFloat32Array().slice(), m.width, m.height, b.w, b.h, n => new Float32Array(n)); r.close(); return d
  }
  const segment = (name: string, b: { x0: number; y0: number; w: number; h: number }): Mask => {
    const c = crop(b)
    if (mode === 'lite') return liteMask(name, b, conf(T.person!, c, b), conf(T.hair!, c, b), px.data, w, lm, h, sk)
    const r = T.seg!.segment(c as any), m = r.categoryMask!
    // descriptor maths assumes mask px == image px; resample (nearest) if MediaPipe returned another size
    const data = resample(m.getAsUint8Array().slice(), m.width, m.height, b.w, b.h, n => new Uint8Array(n))
    r.close(); return { name, x0: b.x0, y0: b.y0, w: b.w, h: b.h, data }
  }
  const body = segment('body', box.body); lap('segBody')
  const head = segment('head', box.head); lap('segHead')
  const d = describe({ w, h, data: px.data }, lm, world, body, head)
  if (sk) d.metrics.skinRefN = sk.n
  lap('describe')
  return { ok: true, descriptor: d, landmarks: lm, size: sz, masks: [body, head], ms, load: info, blocked: blocked.slice(), mode }
}
