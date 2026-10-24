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
// split a selector list on top-level commas only (not inside :is()/:where()/:not())
const split = sel => { const out = []; let d = 0, cur = ''
  for (const ch of sel) { if (ch === '(') d++; else if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = '' } else cur += ch }
  return [...out, cur].map(x => x.trim()).filter(Boolean) }
// Inside @scope a selector without :scope gets an implicit ":scope " in front, so an html-level condition would have
// to be *inside* the scope root and never matches; spell the :scope out so the html condition sits above it.
const pre = (sel, a, scoped) => split(sel).map(s => {
  if (/^:root\b/.test(s)) return `:root:where(${a})${s.slice(5)}`
  if (/^html\b/.test(s)) return `html:where(${a})${s.slice(4)}`
  if (scoped && !/:scope|&/.test(s)) s = ':scope ' + s
  return `:where(:root${a}) ${s}` }).join(',')
const inScope = n => { for (let p = n.parent; p; p = p.parent) if (p.type === 'atrule' && p.name === 'scope') return true; return false }
const fix = (node, a, scoped) => node.walkRules(r => { if (r.parent?.type === 'atrule' && /keyframes/.test(r.parent.name)) return; r.selector = pre(r.selector, a, scoped) })
export default function prefsCss() {
  return { postcssPlugin: 'pd-prefs', Once(root) {
    const todo = []
    root.walkAtRules('media', at => { const k = KINDS.find(([re]) => re.test(at.params)); if (k) todo.push([at, k]) })
    for (const [at, [, a, copy]] of todo) {
      const scoped = inScope(at)
      if (!copy) { fix(at, a, scoped); continue }
      if (at.params.trim().replace(/[()\s]/g, '').split(/and/).length > 1) continue // compound query: leave to the OS
      const c = at.clone(); fix(c, a, scoped); at.after(c.nodes)
    }
  } }
}
prefsCss.postcss = true
