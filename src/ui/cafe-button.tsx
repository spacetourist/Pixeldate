/* 'Enter the café' on the home screen (lobby), only on a device that holds a café invite. GD's final spec (design
   world/landing README §6, mocks home-390/1440 + cafe-button.png): every value sits in CAFE_BTN, and the .btn.cafe rules
   in styles/screens.css read them as CSS vars, so a later tweak is a one-line change here. */
const B = import.meta.env.BASE_URL
export const CAFE_BTN = {
  label: 'Enter the café',
  fill: '#281D52', hover: '#33276A', edge: '#05020F', edgeW: '2px', minH: '54px',
  text: '#FFF1C1',   // cream label (Bricolage, --t-btn)
  inside: '#48E5C2', // mint "N inside" + 8 px dot with a 2 px #05020F ring
  // 10x10-grid pixel cup drawn at 20x20 (2 px per art px): cream cup + saucer, coral sleeve band, butter steam at 85 %
  icon: { size: 20, grid: 10, cup: '#FFF1C1', band: '#FF6F59', steam: '#FFD84D', steamOpacity: 0.85,
    steamPath: 'M2 0h1v1h-1zM3 1h1v1h-1zM2 2h1v1h-1zM5 0h1v1h-1zM6 1h1v1h-1zM5 2h1v1h-1z',
    cupPath: 'M1 3h6v4h-6zM2 7h4v1h-4zM7 4h2v1h-2zM8 5h1v1h-1zM7 6h2v1h-2zM0 8h9v1h-9z',
    bandPath: 'M1 4h6v1h-6z' },
}
/** The invite this device holds: pd.invite (saved by the café gate once it lets you in), or ?invite= on this URL,
    which is saved the same way so the button stays after the link is gone. */
export function cafeInvite(): string {
  try {
    const q = new URLSearchParams(location.search).get('invite')?.trim()
    if (q) localStorage.setItem('pd.invite', q)
    return localStorage.getItem('pd.invite')?.trim() || ''
  } catch { return '' }
}
export const CAFE_URL = `${B}app/?world=cafe`   // the app page (vite base /Pixeldate/ + app/)
/** inside: friends in the café right now; the mint dot shows only when it is 1 or more. */
export function CafeButton({ href = CAFE_URL, inside = 0 }: { href?: string, inside?: number }) {
  const { icon: I } = CAFE_BTN
  return <a className="btn fx btn--block cafe cafe-btn" data-t="cafe" href={href}
    style={{ ['--cafe-fill' as any]: CAFE_BTN.fill, ['--cafe-hover' as any]: CAFE_BTN.hover, ['--cafe-edge' as any]: CAFE_BTN.edge,
      ['--cafe-edge-w' as any]: CAFE_BTN.edgeW, ['--cafe-text' as any]: CAFE_BTN.text, ['--cafe-min-h' as any]: CAFE_BTN.minH, ['--cafe-inside' as any]: CAFE_BTN.inside }}>
    <svg className="ic" data-t="cafe-icon" width={I.size} height={I.size} viewBox={`0 0 ${I.grid} ${I.grid}`} shapeRendering="crispEdges" aria-hidden="true">
      <path d={I.steamPath} fill={I.steam} opacity={I.steamOpacity} /><path d={I.cupPath} fill={I.cup} /><path d={I.bandPath} fill={I.band} /></svg>
    <span className="lb">{CAFE_BTN.label}</span>
    {inside >= 1 && <span className="in" data-t="cafe-inside"><i className="dot" aria-hidden="true" />{inside} inside</span>}
  </a>
}
