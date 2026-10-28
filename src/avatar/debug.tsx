/* ?avatar=debug : spike debug view for pixel-avatar detection. Lazy chunk; not part of the app's normal load. */
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { analysePhoto, preload, type Result, type LoadInfo, type Mode } from './index'
const MODE: Mode = new URLSearchParams(location.search).get('seg') === 'full' ? 'full' : 'lite'
;(window as any).__pdAvatar = { analysePhoto, preload }

const COL: [number, number, number, number][] = [[0, 0, 0, 0], [255, 0, 200, 150], [255, 170, 0, 130], [255, 230, 0, 150], [0, 160, 255, 120], [0, 255, 120, 160]]
const NAMES = ['background', 'hair', 'body skin', 'face skin', 'clothes', 'others']
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32], [0, 2], [0, 5], [2, 7], [5, 8], [9, 10]]
const FIELDS = ['skin', 'hair', 'top', 'bottom', 'legs', 'shoes'] as const

function draw(c: HTMLCanvasElement, img: ImageBitmap, r: Result, showMask: boolean) {
  const { w, h } = r.size; c.width = w; c.height = h
  const x = c.getContext('2d')!; x.drawImage(img, 0, 0, w, h)
  if (r.ok && showMask) for (const m of [...r.masks].reverse()) {
    const id = new ImageData(m.w, m.h)
    for (let i = 0; i < m.data.length; i++) { const k = COL[m.data[i]] ?? COL[0]; id.data.set(k, i * 4) }
    const t = document.createElement('canvas'); t.width = m.w; t.height = m.h; t.getContext('2d')!.putImageData(id, 0, 0)
    x.drawImage(t, m.x0, m.y0, m.w, m.h)
    x.strokeStyle = m.name === 'head' ? '#ff0' : '#0ff'; x.lineWidth = 2; x.setLineDash([6, 4]); x.strokeRect(m.x0, m.y0, m.w, m.h); x.setLineDash([])
  }
  const L = r.landmarks; if (!L) return
  const s = Math.max(2, w / 300)
  x.lineWidth = s; x.strokeStyle = '#fff'
  for (const [a, b] of BONES) { x.beginPath(); x.moveTo(L[a].x * w, L[a].y * h); x.lineTo(L[b].x * w, L[b].y * h); x.stroke() }
  L.forEach(p => { x.fillStyle = (p.visibility ?? 1) >= 0.5 ? '#0f0' : '#f00'; x.beginPath(); x.arc(p.x * w, p.y * h, s * 1.6, 0, 7); x.fill() })
}

function Debug() {
  const [r, setR] = useState<Result | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState('loading models…')
  const [load, setLoad] = useState<LoadInfo | null>(null), [mask, setMask] = useState(true), [name, setName] = useState('')
  const cv = useRef<HTMLCanvasElement>(null), bm = useRef<ImageBitmap | null>(null)
  useEffect(() => { const t = performance.now(); preload(MODE).then(l => { setLoad({ ...l, ms: { ...l.ms, coldFromPage: performance.now() - t } }); setBusy('') }, e => { setErr(String(e)); setBusy('') }) }, [])
  useEffect(() => { if (r && bm.current && cv.current) draw(cv.current, bm.current, r, mask) }, [r, mask])
  useEffect(() => { const d = document.documentElement.dataset; d.avatar = busy ? 'busy' : err ? 'error' : r ? 'done' : 'ready'; (window as any).__avatarDebug = { r, load, err } }, [busy, err, r, load])
  const pick = async (f: File | undefined) => {
    if (!f) return
    setName(f.name); setErr(''); setR(null); setBusy('analysing…')
    try { const t = performance.now(); bm.current = await createImageBitmap(f, { imageOrientation: 'from-image' }); const res = await analysePhoto(f, MODE); res.ms.roundTrip = Math.round(performance.now() - t); setR(res) }
    catch (e) { setErr(String(e)) } finally { setBusy('') }
  }
  const d = r?.ok ? r.descriptor : null
  const fmt = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k}: ${Math.round(v)} ms`).join('  ·  ')
  return <div style={{ font: '14px/1.4 system-ui, sans-serif', color: '#eee', background: '#151225', minHeight: '100vh', padding: 16, boxSizing: 'border-box' }}>
    <h1 style={{ font: '600 18px system-ui', margin: '0 0 8px' }}>Pixel avatar · detection debug</h1>
    <p style={{ margin: '0 0 8px', opacity: 0.7 }}>On-device only: MediaPipe pose (lite) + {MODE === 'lite' ? 'selfie + hair segmenters + skin colour (lite)' : 'multiclass selfie segmentation (full)'}, self-hosted. ?seg=full for the multiclass model. The photo never leaves this page.</p>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <input id="avatar-file" type="file" accept="image/*" onChange={e => pick(e.target.files?.[0])} />
      <label><input type="checkbox" checked={mask} onChange={e => setMask(e.target.checked)} /> mask overlay</label>
      <span id="avatar-status">{busy || (err ? 'error' : r ? (r.ok ? 'ok' : 'rejected') : 'ready')} {name && `· ${name}`} {r?.where && `· ${r.where}`}</span>
    </div>
    {load && <p id="avatar-load" style={{ fontSize: 12, opacity: 0.8 }}>cold load · {fmt(load.ms)} · models {Object.entries(load.bytes).map(([k, v]) => `${k} ${(v / 1e6).toFixed(1)} MB`).join(', ')}</p>}
    {err && <p style={{ color: '#f66' }}>{err}</p>}
    {r && !r.ok && <p id="avatar-error" style={{ color: '#ffb000', fontSize: 16 }}><b>{r.error.message}</b> · {r.error.code}: {r.error.detail}</p>}
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 8 }}>
      <canvas ref={cv} style={{ maxWidth: 'min(100%, 520px)', maxHeight: '80vh', background: '#000', display: r ? 'block' : 'none' }} />
      {r && <div style={{ flex: '1 1 360px', minWidth: 300 }}>
        {d && <div id="avatar-swatches" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {FIELDS.map(k => { const c = d.colours[k]; const v = c.value
            return <div key={k} style={{ textAlign: 'center', fontSize: 11 }}>
              <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #fff4' }}>
                <div title="raw" style={{ width: 32, height: 40, background: v?.raw ?? 'repeating-linear-gradient(45deg,#333 0 4px,#555 4px 8px)' }} />
                <div title="snapped" style={{ width: 32, height: 40, background: v?.hex ?? '#222' }} /></div>
              {k}<br />{v ? `${v.raw} → ${v.name}` : 'n/a'}<br />ΔE {v?.dE ?? '-'} · c {c.confidence}</div> })}
        </div>}
        {d && <p id="avatar-parts" style={{ margin: '4px 0' }}>{(['build', 'hairLength', 'hairVolume', 'lowerBody', 'sleeve', 'glasses'] as const).map(k =>
          <span key={k} style={{ marginRight: 12 }}>{k} <b>{String(d[k].value)}</b> ({d[k].confidence})</span>)}</p>}
        <p id="avatar-timings" style={{ fontSize: 12, opacity: 0.85 }}>{fmt(r.ms)}</p>
        <div style={{ fontSize: 11, display: 'flex', gap: 8, flexWrap: 'wrap' }}>{NAMES.map((n, i) => <span key={n}><i style={{ display: 'inline-block', width: 10, height: 10, background: `rgba(${COL[i].slice(0, 3)},${i ? 1 : 0.2})` }} /> {n}</span>)}</div>
        <pre id="avatar-json" style={{ fontSize: 11, background: '#0008', padding: 8, overflow: 'auto', maxHeight: '60vh' }}>{JSON.stringify(d ?? (r.ok ? null : r.error), null, 1)}</pre>
      </div>}
    </div>
  </div>
}
export function mount(el: HTMLElement) {
  if (/[?&]avatar=flow/.test(location.search)) void import('./flow/flow').then(m => m.mount(el))
  else createRoot(el).render(<Debug />)
}
