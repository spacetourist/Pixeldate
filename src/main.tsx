import { lazy, Suspense, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Signup from './signup/Signup'
import { Splash } from './Splash'
import type { Profile } from './net'
import './styles/index.css'
// The signup is the first paint; lobby + match load after it (prefetched on idle by Signup).
// keyboard modality for focus rings (tokens.css): navigation keys turn rings on, any pointer input turns them off
const KBD = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'Enter', ' ', 'Home', 'End', 'PageUp', 'PageDown'])
addEventListener('keydown', e => { if (KBD.has(e.key)) document.documentElement.dataset.kbd = '' }, true)
addEventListener('pointerdown', () => { delete document.documentElement.dataset.kbd }, true)
// R4 perf: the mock match view used to load main -> App -> mock -> first paint, one round trip each. The mock harness
// now fetches App and mock in parallel (App's own import('./mock') then resolves from cache).
const App = lazy(() => { if ((window as any).__pdMock) import('./mock'); return import('./App') })
function Root() {
  const [done, setDone] = useState<{ p: Profile; photo: string } | null>(null)
  if (done || (window as any).__pdMock) return <Suspense fallback={null}><App initial={done ?? undefined} /></Suspense>
  return <><Signup onDone={(p, photo) => setDone({ p, photo })} />
    {/* pre-R2 boot splash keeps its legacy styles; the zero-size wrapper keeps it out of the flow */}
    <div className="legacy" style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, minHeight: 0 }}><Splash ready /></div></>
}
createRoot(document.getElementById('root')!).render(<Root />)
