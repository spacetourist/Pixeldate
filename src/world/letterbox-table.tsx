/* Full-screen Letterbox. Loaded only when someone sits at that desk.
   Tiles: swap .lb-tile in letterbox-table.css. The lounge desk is paintLetterbox(). */
import { useEffect, useState } from 'react'
import './bj-table.css'
import './letterbox-table.css'
import { CHIPS_NAME } from '../../world/shared/chips.ts'
export type Mark = 'correct' | 'present' | 'absent'
export interface LbGuess { w: string; marks: Mark[] }
export interface LbSeat { id: number; choice: 'race' | 'pick' | ''; chose: boolean; locked: boolean; bet: number; n: number; solved: number; done: boolean; away: boolean; seat: number }
export interface LbGame { on: true; g: 'letterbox'; tb: number; seq: number; now: number; me: number; phase: 'mode' | 'bet' | 'set' | 'play' | 'over'
  mode: 'race' | 'pick' | ''; choice: 'race' | 'pick' | ''; guesses: LbGuess[]; opp: { marks: Mark[]; w: string }[]
  left: number; bet: number; locked: boolean; held: boolean; reveal: string; set: string; solved: number; done: boolean
  winner: number | null; last: { k: string; who: number }; ps: LbSeat[] }
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const CHIP_FILL: Record<number, string> = { 1: '#FFF1C1', 5: '#FF6F59', 25: '#FFD84D', 100: '#48E5C2' }
function Tile({ ch, mark }: { ch: string; mark?: string }) {
  return <span className={'lb-tile' + (mark && mark !== 'empty' ? ' ' + mark : '')} data-t="lb-tile" data-mark={mark || 'empty'}>{ch}</span>
}
function Grid({ rows, draft }: { rows: { w: string; marks?: Mark[] }[]; draft?: string }) {
  const cells = rows.map((r, i) => <div className="lb-row" key={i} data-t="lb-row">{[0, 1, 2, 3, 4].map(k => <Tile key={k} ch={r.w[k] || ''} mark={r.marks?.[k]} />)}</div>)
  const blanks = []
  for (let i = rows.length; i < 6; i++) {
    const d = i === rows.length ? (draft || '') : ''
    blanks.push(<div className="lb-row" key={'e' + i} data-t="lb-row">{[0, 1, 2, 3, 4].map(k => <Tile key={k} ch={d[k] || ''} />)}</div>)
  }
  return <div className="lb-board" data-t="lb-board">{cells}{blanks}</div>
}

export default function LetterTable({ game, name, send, stand, desk, chips, onLeave }: { game: LbGame | null; name: (id: number) => string; send: (o: object) => void
  stand: () => void; desk: boolean; chips: number | null; onLeave?: () => void }) {
  const [ante, setAnte] = useState(0), [left, setLeft] = useState(false), [draft, setDraft] = useState(''), [, tick] = useState(0), [t0, setT0] = useState(() => performance.now())
  useEffect(() => { setT0(performance.now()) }, [game?.seq])
  useEffect(() => { setDraft('') }, [game?.phase, game?.guesses.length])
  useEffect(() => { const i = setInterval(() => tick(x => x + 1), 250); return () => clearInterval(i) }, [])
  const leave = () => { setLeft(true); onLeave?.(); send({ t: 'gquit' }); stand() }
  const typing = game?.phase === 'play' && !game.done || game?.phase === 'set'
  const push = (ch: string) => setDraft(d => (d.length >= 5 ? d : d + ch))
  const pop = () => setDraft(d => d.slice(0, -1))
  const submit = () => {
    if (!game || draft.length !== 5) return
    send({ t: 'gact', a: game.phase === 'set' ? 'set' : 'guess', w: draft })
  }
  useEffect(() => {
    if (!typing) return
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea') || e.repeat) return
      const c = e.key.toLowerCase()
      if (c === 'enter') { submit(); e.preventDefault(); e.stopPropagation(); return }
      if (c === 'backspace') { pop(); e.preventDefault(); e.stopPropagation(); return }
      if (/^[a-z]$/.test(c)) { push(c); e.preventDefault(); e.stopPropagation() }
    }
    addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true)
  })
  const turnLeft = game ? Math.max(0, game.left - (game.phase === 'play' ? performance.now() - t0 : 0)) : 0
  const them = game?.ps.find(p => p.id !== game.me)
  const status = !game ? 'Taking your seat…'
    : game.phase === 'over' ? (game.winner === game.me ? 'You win' : game.winner ? `${name(game.winner)} wins` : 'Draw')
    : game.phase === 'mode' ? (game.choice ? 'Waiting for them to pick the same mode' : 'Race, or pick a word for each other')
    : game.phase === 'bet' ? (game.locked ? 'In. Waiting for them' : 'Optional coins for the match')
    : game.phase === 'set' ? (game.held ? 'Word set. Waiting for them' : 'Type a word for them to guess')
    : game.done ? 'Waiting for them to finish' : `Your guess · ${Math.ceil(turnLeft / 1000)}s`
  if (left) return null
  const bet = game?.phase === 'bet' && !game.locked
  return <section className="bj-screen lb-screen" data-t="g-lb" data-seq={game?.seq ?? 0} data-phase={game?.phase ?? 'mode'} data-mode={game?.mode || undefined} aria-label="Letterbox">
    <header className="bj-top"><h2>Letterbox</h2><small>{game?.mode === 'pick' ? 'Pick for me' : game?.mode === 'race' ? 'Race' : 'for two'}</small>
      <button className="w-btn sm ghost bj-leave" data-t="lb-leave" onClick={leave}>Leave</button></header>
    <div className="bj-felt lb-felt" data-lb-art="placeholder">
      {game?.phase === 'over' && game.reveal && <p className="lb-who" data-t="lb-reveal">{game.mode === 'pick' ? `Their word was ${game.reveal}` : `The word was ${game.reveal}`}{game.set ? ` · you set ${game.set}` : ''}</p>}
      <div className="lb-boards">
        <div>
          <p className="lb-who">You</p>
          <Grid rows={game?.guesses ?? []} draft={typing ? draft : ''} />
        </div>
        <div data-t="lb-theirs">
          <p className="lb-who">{them ? name(them.id) : 'Waiting for someone'}</p>
          <Grid rows={(game?.opp ?? []).map(r => ({ w: r.w, marks: r.marks }))} />
        </div>
      </div>
    </div>
    <div className="bj-bar">
      <p className="bj-status" role="status" data-t="g-status">{status}{game?.last.k === 'differ' && game.phase === 'mode' ? ' · pick the same one' : ''}</p>
      {game?.phase === 'mode' && <div className="lb-modes">{(['race', 'pick'] as const).map(m =>
        <button key={m} className={'w-btn' + (game.choice === m ? ' on' : '')} data-t={'lb-mode-' + m} onClick={() => send({ t: 'gact', a: 'mode', w: m })}>{m === 'race' ? 'Race' : 'Pick for me'}</button>)}</div>}
      {bet && <div className="bj-antes" role="radiogroup" aria-label="Optional coins">{[0, 1, 5, 25, 100].map(v => v === 0
        ? <button key={0} type="button" className={'lb-free' + (ante === 0 ? ' on' : '')} data-t="lb-ante-0" onClick={() => setAnte(0)}>Free</button>
        : <button key={v} type="button" className={'bj-ante' + (ante === v ? ' on' : '')} data-t={'lb-ante-' + v} disabled={chips !== null && chips < v} onClick={() => setAnte(v)}><b style={{ color: CHIP_FILL[v] }}>{v}</b></button>)}</div>}
      {typing && <div className="lb-keys" data-t="lb-keys">{ROWS.map((row, i) => <div className="lb-keyrow" key={i}>
        {i === 2 && <button type="button" className="lb-key wide" data-t="lb-enter" onClick={submit}>Enter</button>}
        {[...row].map(ch => <button type="button" key={ch} className="lb-key" data-t="lb-key" data-k={ch} onClick={() => push(ch)}>{ch}</button>)}
        {i === 2 && <button type="button" className="lb-key wide" data-t="lb-del" onClick={pop}>Del</button>}
      </div>)}</div>}
      <p className="bj-note">{chips != null ? `${chips} ${CHIPS_NAME}` : CHIPS_NAME} · never cash</p>
      <div className="bj-btns">
        {game?.phase === 'over' ? <button className="w-btn bj-deal" data-t="lb-again" onClick={() => send({ t: 'gact', a: 'again' })} style={{ gridColumn: '1 / -1' }}>Play again</button>
          : bet ? <button className="w-btn bj-deal" data-t="lb-play" disabled={chips !== null && chips < ante} onClick={() => send({ t: 'gact', a: 'bet', ante })} style={{ gridColumn: '1 / -1' }}>{ante ? `Play for ${ante}` : 'Play free'}{desk && <kbd>D</kbd>}</button> : null}
      </div>
    </div>
  </section>
}
