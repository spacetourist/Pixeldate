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
const App = lazy(() => { if (mock) import('./mock'); return import('./App') })
// R5: a returning user goes straight to the lobby (profile in storage, photo in IndexedDB, both on this device only)
const saved = mock ? null : savedProfile<Profile>()
if (saved) void import('./App')
function Root() {
  const [done, setDone] = useState<{ p: Profile; photo: string } | null>(null)
  const [restoring, setRestoring] = useState(!!saved)
  useEffect(() => { if (!saved) return
    loadPhoto().then(ph => { if (ph && saved.bm) setDone({ p: { ...saved, age: Math.min(ageFrom(saved.by, saved.bm), AGE_TOP) }, photo: ph }); else void logOut() }).finally(() => setRestoring(false)) }, [])
  if (done || mock) return <Suspense fallback={null}><App initial={done ?? undefined} /></Suspense>
  if (restoring) return null
  return <Signup onDone={(p, photo) => { void saveProfile(p, photo); setDone({ p, photo }) }} />
}
createRoot(document.getElementById('root')!).render(<Root />)
