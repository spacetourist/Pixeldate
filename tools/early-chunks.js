// R5 perf: a returning user (profile on this device) or a mock deep link needs the lazy App chunk at once, but the
// browser only learns its name after app.js has downloaded and run (one extra round trip, ~300 ms on slow 4G).
// This injects a tiny inline script into app/index.html that adds modulepreload hints for App (+ mock / pages
// for the test harness) only in those cases, so a first-time visitor's onboarding download is unchanged.
export default function earlyChunks() {
  return { name: 'pd-early-chunks', apply: 'build', transformIndexHtml: { order: 'post', handler(html, ctx) {
    if (!ctx.bundle || !/app[\\/]index\.html$/.test(ctx.filename)) return html
    const chunks = Object.values(ctx.bundle).filter(c => c.type === 'chunk'); const base = '/Pixeldate/'
    const files = re => { const c = chunks.find(c => c.facadeModuleId && re.test(c.facadeModuleId)); if (!c) return []
      const out = new Set(), walk = c => { if (out.has(c.fileName)) return; out.add(c.fileName); for (const css of c.viteMetadata?.importedCss || []) out.add(css)
        for (const i of c.imports) { const d = ctx.bundle[i]; if (d && d.type === 'chunk' && !d.isEntry) walk(d) } }
      walk(c); return [...out].map(f => base + f) }
    const L = { a: files(/src[\\/]App\.tsx$/), m: files(/src[\\/]mock\.ts$/), p: files(/src[\\/]ui[\\/]pages\.tsx$/) }
    const js = `(function(){var m=window.__pdMock,r,L=${JSON.stringify(L)};try{r=m||localStorage.getItem('pd.profile')||sessionStorage.getItem('pd.profile')}catch(e){}if(!r)return;var l=L.a;if(m){l=l.concat(L.m);if(m.page)l=l.concat(L.p)}l.forEach(function(h){var e=document.createElement('link');if(/\\.css$/.test(h)){e.rel='preload';e.as='style'}else e.rel='modulepreload';e.crossOrigin='';e.href=h;document.head.appendChild(e)})})()`
    return html.replace(/<script type="module"/, `<script>${js}</script>\n<script type="module"`) // first in <head>: an inline script after the stylesheet would wait for it
  } } }
}
