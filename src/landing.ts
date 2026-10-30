// The only script on the static landing: the café backdrop behind the hero (src/backdrop.ts). Loaded as a module, so it
// runs after parsing; the inline fit in index.html has already sized the poster for the first paint.
import { startBackdrop } from './backdrop'
const root = document.querySelector<HTMLElement>('.ld-hero .pd-bd')
if (root) startBackdrop(root, { portrait: 0.25, landscape: 1 })
