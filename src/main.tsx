import { lazy, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Signup from './signup/Signup'
import type { Profile } from './net'
import { applyPrefs, savedProfile, saveProfile, loadPhoto, logOut } from './prefs'
import { AGE_TOP, ageFrom } from './signup/shared'
import './styles/index.css'
// R5: the app's own Reduce motion / Solid panels settings apply before the first paint
applyPrefs()
// The signup is the first paint; lobby + match load after it (prefetched on idle by Signup).
// keyboard modality for focus rings (tokens.css): navigation keys turn rings on, any pointer input turns them off
const KBD = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'Enter', ' ', 'Home', 'End', 'PageUp', 'PageDown'])
addEventListener('keydown', e => { if (KBD.has(e.key)) document.documentElement.dataset.kbd = '' }, true)
addEventListener('pointerdown', () => { delete document.documentElement.dataset.kbd }, true)
// R4 perf: the mock match view used to load main -> App -> mock -> first paint, one round trip each. The mock harness
// now fetches App and mock in parallel (App's own import('./mock') then resolves from cache).
const mock = !!(window as any).__pdMock
// R5: a returning user goes straight to the lobby (profile in storage, photo in IndexedDB, both on this device only)
const saved = mock ? null : savedProfile<Profile>()
// R5 perf: when the app (not the signup) is the first paint, wait for its chunk before the first render. Rendering
// <Suspense fallback={null}> first and revealing App later made React hold the reveal >= 300 ms after the fallback.
// A mock deep link into Matches / You / Settings fetches that chunk in the same parallel wave.
type AppT = typeof import('./App').default
let AppC: AppT | null = null
const loadApp = () => import('./App').then(m => { AppC = m.default; return m })
const App = lazy(() => loadApp().then(m => ({ default: m.default })))
const boot: Promise<unknown> | null = mock ? Promise.all([loadApp().then(m => (window as any).__pdMock.page ? m.loadPages() : null), import('./mock')])
  : saved ? loadApp() : null
function Root() {
  const [done, setDone] = useState<{ p: Profile; photo: string } | null>(null)
  const [restoring, setRestoring] = useState(!!saved)
  useEffect(() => { if (!saved) return
    loadPhoto().then(ph => { if (ph && saved.bm) setDone({ p: { ...saved, age: Math.min(ageFrom(saved.by, saved.bm), AGE_TOP) }, photo: ph }); else void logOut() }).finally(() => setRestoring(false)) }, [])
  if (done || mock) { const A = AppC ?? App; return <Suspense fallback={null}><A initial={done ?? undefined} /></Suspense> }
  if (restoring) return null
  return <Signup onDone={(p, photo) => { void saveProfile(p, photo); setDone({ p, photo }) }} />
}
const render = () => createRoot(document.getElementById('root')!).render(<Root />)
// pixel-avatar: ?avatar=debug (detection debug view) and ?avatar=flow (v0.1 screens, not wired into signup yet) enter
// through the same lazy chunk (avatar/debug routes flow onwards), so the app's initial JS stays as it was
if (/[?&]avatar=(debug|flow)/.test(location.search)) void import('./avatar/debug').then(m => m.mount(document.getElementById('root')!))
else if (boot) boot.then(render, render); else render()
