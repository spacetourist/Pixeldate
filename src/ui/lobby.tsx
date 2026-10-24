import { useMemo } from 'react'
import { LEVELS } from '../config'
import { AGE_TOP } from '../signup/shared'
import { bracketLabel, bracketOf, type Profile } from '../net'
import { Icon, Av, LV_DESC, LV_COLOR, AV_BLOCKS, coarse } from './parts'
import { Toasts } from './toast'

const B = import.meta.env.BASE_URL
/** "k7q2px" -> "K7Q·2PX" (display only; joining accepts either form). */
export const fmtCode = (c: string) => c ? (c.slice(0, 3) + '·' + c.slice(3)).toUpperCase() : ''
const seekLabel = (p: Profile) => `${p.seek === 'everyone' ? 'Everyone' : p.seek === 'women' ? 'Women' : 'Men'} · ${p.min}–${p.max >= AGE_TOP ? AGE_TOP + '+' : p.max}`

/** 07 lobby and 08 finding: app shell (top bar on phone, rail from 768), lobby art, card, and the side panel from 1200. */
export function Lobby({ me, photo, code, finding, joinCode, setJoinCode, onFind, onCancel, onJoin, joining, onNav, onCall }: {
  me: Profile; photo: HTMLImageElement | null; code: string; finding: boolean; joinCode: string; setJoinCode(s: string): void
  onFind(): void; onCancel(): void; onJoin(): void; joining: boolean; onNav(p: 'matches' | 'profile' | 'settings'): void; onCall(): void
}) {
  // small avatars follow the spec 4 coarse rule (<= 64px); the side panel shows your own photo at each level
  const avs = useMemo(() => AV_BLOCKS.map(b => coarse(photo ?? undefined, b)), [photo])
  const chip = <span className="chip chip--edge"><Icon n="heart" c="var(--c-coral)" />{seekLabel(me)}</span>
  return <div className="app"><div className="shell shell--lobby" data-t="lobby" data-screen={finding ? 'finding' : 'lobby'}>
    <nav className="rail" aria-label="Sections">
      <span className="logo" aria-hidden="true"><Icon n="heart" c="var(--c-coral)" s={5} /></span>
      <span className="ri on" aria-current="page"><Icon n="heart" c="var(--cta)" s={3} />Match</span>
      <button className="ri" data-t="rail-call" onClick={onCall}><Icon n="call" s={3} />Call</button>
      <span className="sp" style={{ flex: 1 }} />
      <button className="ri" data-t="rail-you" onClick={() => onNav('profile')}><Icon n="user" s={3} />You</button>
      <button className="ri" data-t="rail-settings" onClick={() => onNav('settings')}><Icon n="gear" s={3} />Settings</button>
    </nav>
    <header className="stop"><span className="logo" style={{ ['--logo' as any]: '28px' }}><Icon n="heart" c="var(--c-coral)" s={3} /><span>pixel<b>date</b></span></span>
      <button className="btn btn--ghost btn--icon btn--sm fx" aria-label="You" data-t="top-profile" onClick={() => onNav('profile')}><Icon n="user" c="var(--text)" s={2} /></button>
      <button className="btn btn--ghost btn--icon btn--sm fx" aria-label="Settings" data-t="top-settings" onClick={() => onNav('settings')}><Icon n="gear" c="var(--text)" s={2} /></button></header>
    <div className="bgart" aria-hidden="true"><picture><source media="(min-width: 768px)" srcSet={`${B}art/landing-hero-wide.webp`} /><img src={`${B}art/lobby-bg-640.webp`} width={1280} height={720} alt="" /></picture></div>
    <main className="smain">
      <Toasts where="page" />
      {finding
        ? <section className="lobbycard fx finding" aria-labelledby="pd-find-h">
          <div className="radar" data-t="finding" aria-hidden="true"><i /><i /><i />
            <Av src={avs[0]} level={1} size={64} />
            <span className="dot" style={{ left: 18, top: 60 }} /><span className="dot" style={{ right: 30, top: 24, background: 'var(--cta)' }} /><span className="dot" style={{ right: 8, bottom: 70, background: 'var(--c-coral)' }} /></div>
          <h1 className="px" id="pd-find-h">Finding someone…</h1>
          <p className="lede" role="status">Hang tight. As soon as someone is free, you'll both start as Strangers.</p>
          {chip}
          <button className="btn btn--secondary fx btn--block" data-t="cancel" onClick={onCancel}>Cancel</button>
        </section>
        : <section className="lobbycard fx" aria-labelledby="pd-hi">
          <div className="who"><Av src={avs[0]} level={1} size={64} /><div className="label">Starting as a Stranger · {LEVELS[0].blocks} blocks</div>
            <button className="btn fx btn--ghost btn--sm tomatches" data-t="to-matches" onClick={() => onNav('matches')}><Icon n="heart" c="var(--c-coral)" />Your matches</button></div>
          <h1 className="px" id="pd-hi">Hi {me.name}, ready to meet?</h1>
          <div className="chips">{chip}<span className="chip chip--edge">You · {bracketLabel(bracketOf(Math.min(me.age, 70)))}</span></div>
          <button className="btn fx btn--lg btn--block" data-t="find" disabled={!code} onClick={onFind}><Icon n="search" c="var(--edge)" s={3} />{code ? 'Find someone' : 'Connecting…'}</button>
          <div className="hr" />
          <form onSubmit={e => { e.preventDefault(); onJoin() }}>
            <label className="fl" htmlFor="pd-code">Meeting a friend?</label>
            <div className="codeblk"><span className="field fx"><input id="pd-code" value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="Friend's code" autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="go" data-t="joincode" /></span>
              <button className="btn fx btn--secondary" data-t="join" disabled={joining || !code || !joinCode.trim()}>{joining ? 'Joining…' : 'Join'}</button></div>
            <p className="help">Your code: <span className="mycode" data-t="code">{code ? fmtCode(code) : '…'}</span></p>
          </form>
          <p className="label safe">18+ · Skip or block anytime</p>
        </section>}
      <aside className="sidepanel" aria-label="Five levels to crystal clear">
        <div className="eyebrow"><Icon n="eye" c="var(--cta)" />Five levels to crystal clear</div>
        {LEVELS.map((L, i) => <div className="mrow fx" key={i}><Av src={avs[i]} level={i + 1} size={48} />
          <div><div className="nm" style={{ color: LV_COLOR(i + 1) }}>LV {i + 1} · {L.name}</div><div className="sub">{LV_DESC[i]}</div></div></div>)}
      </aside>
    </main>
  </div></div>
}
