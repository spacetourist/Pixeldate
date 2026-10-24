import { lazy, Suspense, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Signup from './signup/Signup'
import { Splash } from './Splash'
import type { Profile } from './net'
import './styles/index.css'
// The signup is the first paint; lobby + match load after it (prefetched on idle by Signup).
const App = lazy(() => import('./App'))
function Root() {
  const [done, setDone] = useState<{ p: Profile; photo: string } | null>(null)
  if (done || (window as any).__pdMock) return <Suspense fallback={null}><App initial={done ?? undefined} /></Suspense>
  return <><Signup onDone={(p, photo) => setDone({ p, photo })} />
    {/* pre-R2 boot splash keeps its legacy styles; the zero-size wrapper keeps it out of the flow */}
    <div className="legacy" style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, minHeight: 0 }}><Splash ready /></div></>
}
createRoot(document.getElementById('root')!).render(<Root />)
