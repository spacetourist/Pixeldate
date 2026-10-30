/* 'Enter the café' on the home screen (lobby), only on a device that holds a café invite. GD's interim style; every
   spec GD may change sits in CAFE_BTN below (and the matching .cafe-btn rules in styles/screens.css read these as
   CSS vars), so GD's final icon and specs drop in here without touching the lobby. */
const B = import.meta.env.BASE_URL
export const CAFE_BTN = {
  label: 'Enter the café',
  fill: '#281D52', hover: '#33276A', edge: '#05020F', edgeW: '2px', text: 'var(--text, #FFF6EC)',
  // interim pixel coffee cup (8x7 art px, 1 unit = 1 px, drawn at s=3), butter; GD's icon replaces w / h / path
  icon: { w: 8, h: 7, s: 3, color: 'var(--c-butter, #FFD84D)', path: 'M2 0h1v1h-1zM4 0h1v1h-1zM1 1h1v1h-1zM3 1h1v1h-1zM0 2h6v1h-6zM0 3h8v1h-8zM0 4h6v1h-6zM7 4h1v1h-1zM0 5h7v1h-7zM1 6h4v1h-4z' },
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
export function CafeButton({ href = CAFE_URL }: { href?: string }) {
  const { icon: I } = CAFE_BTN
  return <a className="btn fx btn--secondary btn--block cafe-btn" data-t="cafe" href={href}
    style={{ ['--cafe-fill' as any]: CAFE_BTN.fill, ['--cafe-hover' as any]: CAFE_BTN.hover, ['--cafe-edge' as any]: CAFE_BTN.edge, ['--cafe-edge-w' as any]: CAFE_BTN.edgeW, ['--cafe-text' as any]: CAFE_BTN.text }}>
    <svg className="ico pix" data-t="cafe-icon" width={I.w * I.s} height={I.h * I.s} viewBox={`0 0 ${I.w} ${I.h}`} shapeRendering="crispEdges" aria-hidden="true"><path d={I.path} fill={I.color} /></svg>
    {CAFE_BTN.label}
  </a>
}
