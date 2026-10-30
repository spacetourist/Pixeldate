/* Lazy side doors that must not touch the app's initial JS: ?avatar=debug|flow (pixel-avatar tools) and ?world=cafe
   (Pixeldate World phase 1). main.tsx loads this one small chunk; it loads the real one. */
export async function mount(el: HTMLElement) {
  const m = /[?&]world=/.test(location.search) ? await import('./world/index') : await import('./avatar/debug')
  m.mount(el)
}
