// R5 build step: the app's own Reduce motion / Solid panels settings behave exactly like the OS media queries.
// Every rule inside @media (prefers-reduced-motion:reduce) / (prefers-reduced-transparency:reduce) is copied out
// of the media query under html[data-motion=reduce] / html[data-solid]; rules inside
// (prefers-reduced-motion:no-preference) additionally require that the app setting is off. :where() keeps the
// specificity identical to the original rule, so the cascade is unchanged.
const KINDS = [
  [/prefers-reduced-motion:\s*reduce/, '[data-motion=reduce]', true],
  [/prefers-reduced-transparency:\s*reduce/, '[data-solid]', true],
  [/prefers-reduced-motion:\s*no-preference/, ':not([data-motion=reduce])', false],
]
const pre = (sel, a) => sel.split(',').map(s => { s = s.trim()
  if (/^:root\b/.test(s)) return `:root:where(${a})${s.slice(5)}`
  if (/^html\b/.test(s)) return `html:where(${a})${s.slice(4)}`
  return `:where(:root${a}) ${s}` }).join(',')
const fix = (node, a) => node.walkRules(r => { if (r.parent?.type === 'atrule' && /keyframes/.test(r.parent.name)) return; r.selector = pre(r.selector, a) })
export default function prefsCss() {
  return { postcssPlugin: 'pd-prefs', Once(root) {
    const todo = []
    root.walkAtRules('media', at => { const k = KINDS.find(([re]) => re.test(at.params)); if (k) todo.push([at, k]) })
    for (const [at, [, a, copy]] of todo) {
      if (!copy) { fix(at, a); continue }
      if (at.params.trim().replace(/[()\s]/g, '').split(/and/).length > 1) continue // compound query: leave to the OS
      const c = at.clone(); fix(c, a); at.after(c.nodes)
    }
  } }
}
prefsCss.postcss = true
