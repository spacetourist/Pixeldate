import { useEffect, useRef, useState } from 'react'
import type { MediaConnection } from 'peerjs'
import { LEVELS, METER, VERSION } from './config'
import { localDeck, cardById, type QuestionSource } from './deck'
import { pixelatePhoto, loadImage, animateReveal } from './pixel'
import { PixelCam } from './video'
import { Net, block, store, type Profile, type Gender, type Seek, type Match } from './net'

const B = import.meta.env.BASE_URL
const deck: QuestionSource = localDeck
const Ic = ({ n, s = 16 }: { n: string; s?: number }) => <i className="ic" style={{ width: s * 2, height: s * 2, WebkitMaskImage: `url(${B}px/icons/${s}/${n}.svg)`, maskImage: `url(${B}px/icons/${s}/${n}.svg)` }} />
const uid = () => { let u = store.getItem('pd-uid'); if (!u) { u = crypto.randomUUID(); store.setItem('pd-uid', u) } return u }
type Msg = { from: 'me' | 'them' | 'sys'; text?: string; card?: string }
type Ans = Record<string, { me?: string; them?: string }>

function Meter({ level, pct }: { level: number; pct: number }) {
  return <div className="px-meter">{LEVELS.map((_, i) => i + 1 < level || level === 5 ? <i key={i} className="is-full" /> : i + 1 === level ? <i key={i} style={{ ['--f' as any]: Math.floor(pct / 10) }} /> : <i key={i} />)}</div>
}

function Onboard({ onDone }: { onDone: (p: Profile, photo: string) => void }) {
  const [name, setName] = useState(''); const [photo, setPhoto] = useState(''); const [adult, setAdult] = useState(false)
  const [iam, setIam] = useState<Gender>('man'); const [seek, setSeek] = useState<Seek>('everyone')
  const [age, setAge] = useState(30); const [min, setMin] = useState(18); const [max, setMax] = useState(99)
  const [cam, setCam] = useState<MediaStream | null>(null); const vid = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (cam && vid.current) { vid.current.srcObject = cam; vid.current.play() } }, [cam])
  const snap = () => { const v = vid.current!, c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d')!.drawImage(v, 0, 0); setPhoto(c.toDataURL('image/jpeg', .9)); cam!.getTracks().forEach(t => t.stop()); setCam(null) }
  const file = (f?: File) => { if (f) { const r = new FileReader(); r.onload = () => setPhoto(String(r.result)); r.readAsDataURL(f) } }
  const ok = name.trim() && photo && adult && age >= 18 && min <= max
  return <div className="screen scroll">
    <header className="bar"><img src={`${B}px/logo/logo-2.svg`} alt="pixeldate" /><span className="ver">{VERSION}</span></header>
    <div className="px-frame px-card pad">
      <p className="px-text">Get to know someone before you see them. Photos start as 8 blocks and sharpen as you get closer.</p>
    </div>
    <label className="px-label lab">NAME</label>
    <input className="px-frame px-input fld" value={name} maxLength={20} onChange={e => setName(e.target.value)} placeholder="Your first name" data-t="name" />
    <label className="px-label lab">PHOTO</label>
    <div className="photo-row">
      <div className="thumb">{cam ? <video ref={vid} muted playsInline /> : photo ? <img src={photo} /> : <Ic n="matches" />}</div>
      <div className="col">
        {cam ? <button className="px-frame px-btn-small" onClick={snap}>SNAP</button>
          : <button className="px-frame px-btn-ghost" onClick={async () => { try { setCam(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })) } catch { alert('No camera') } }}>CAMERA</button>}
        <label className="px-frame px-btn-ghost">GALLERY<input type="file" accept="image/*" hidden onChange={e => file(e.target.files?.[0])} /></label>
      </div>
    </div>
    <div className="faces">{['sam', 'alex', 'robin'].map(f => <img key={f} data-t={'face-' + f} src={`${B}faces/${f}.jpg`} onClick={() => setPhoto(`${B}faces/${f}.jpg`)} className={photo.endsWith(f + '.jpg') ? 'on' : ''} />)}<span className="px-label">DEMO FACES</span></div>
    <div className="grid2">
      <div><label className="px-label lab">I AM</label>
        <select className="px-frame px-input fld" value={iam} onChange={e => setIam(e.target.value as Gender)} data-t="iam"><option value="man">A man</option><option value="woman">A woman</option></select></div>
      <div><label className="px-label lab">MY AGE</label>
        <input className="px-frame px-input fld" type="number" min={18} max={99} value={age} onChange={e => setAge(+e.target.value)} data-t="age" /></div>
    </div>
    <label className="px-label lab">I'D LIKE TO MEET</label>
    <select className="px-frame px-input fld" value={seek} onChange={e => setSeek(e.target.value as Seek)} data-t="seek"><option value="men">Men</option><option value="women">Women</option><option value="everyone">Everyone</option></select>
    <label className="px-label lab">AGED</label>
    <div className="grid2">
      <input className="px-frame px-input fld" type="number" min={18} max={99} value={min} onChange={e => setMin(+e.target.value)} data-t="min" />
      <input className="px-frame px-input fld" type="number" min={18} max={99} value={max} onChange={e => setMax(+e.target.value)} data-t="max" />
    </div>
    <label className="tick px-text"><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} data-t="adult" /> I am 18 or over</label>
    <button className="px-frame px-btn" disabled={!ok} data-t="start" onClick={() => onDone({ name: name.trim(), age, min, max, iam, seek, uid: uid() }, photo)}><span className="px-btn__label">Continue</span></button>
    <p className="px-label note">DEMO, TEST WITH PEOPLE YOU KNOW</p>
  </div>
}

export default function App() {
  const [me, setMe] = useState<Profile | null>(null); const [photo, setPhoto] = useState<HTMLImageElement | null>(null)
  const net = useRef<Net | null>(null); const [code, setCode] = useState('')
  const [screen, setScreen] = useState<'onboard' | 'lobby' | 'finding' | 'match'>('onboard')
  const [notice, setNotice] = useState(''); const [joinCode, setJoinCode] = useState('')
  const [m, setM] = useState<Match | null>(null)
  const skip = useRef(new Set<string>())

  // match state
  const [level, setLevel] = useState(1); const [pct, setPct] = useState(0)
  const [taps, setTaps] = useState({ me: false, them: false }); const [ans, setAns] = useState<Ans>({})
  const [credited, setCredited] = useState<string[]>([]); const [msgs, setMsgs] = useState<Msg[]>([])
  const [tab, setTab] = useState<'profile' | 'chat' | 'call'>('profile'); const [draft, setDraft] = useState('')
  const [answering, setAnswering] = useState<string | null>(null)
  const theirImgs = useRef<Record<number, HTMLImageElement>>({}); const shown = useRef<HTMLImageElement | null>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const [call, setCall] = useState<{ cam: PixelCam; mc: MediaConnection; remote?: MediaStream } | null>(null)
  const st = useRef({ level, taps, pct, call, m }); st.current = { level, taps, pct, call, m }

  const send = (d: any) => { try { st.current.m?.conn.send(d) } catch {} }
  const sendPhoto = (l: number) => { if (photo) send({ t: 'photo', level: l, data: pixelatePhoto(photo, l) }) }

  const start = async (p: Profile, ph: string) => {
    setMe(p); setPhoto(await loadImage(ph)); setScreen('lobby')
    const n = new Net(p); net.current = n; await n.start(); setCode(n.code)
    n.onIncomingByCode = mm => beginMatch(mm)
    n.peer.on('call', async mc => {
      if (mc.peer !== st.current.m?.conn.peer) { mc.close(); return }
      const cam = await getCam(); if (!cam) { mc.close(); return }
      (window as any).__pdCam = cam; cam.setLevel(st.current.level); mc.answer(withAudio(cam)); hookCall(cam, mc); setTab('call')
    })
  }
  const getCam = async () => { try { return new PixelCam(await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: true })) } catch { alert('Camera unavailable'); return null } }
  const withAudio = (cam: PixelCam) => new MediaStream([...cam.out.getVideoTracks(), ...cam.stream.getAudioTracks()])
  const hookCall = (cam: PixelCam, mc: MediaConnection) => {
    setCall({ cam, mc }); mc.on('stream', s => setCall(c => c && { ...c, remote: s })); mc.on('close', () => endCall(false))
  }
  const startCall = async () => {
    const cam = await getCam(); if (!cam || !m) return; cam.setLevel(level); (window as any).__pdCam = cam
    hookCall(cam, net.current!.peer.call(m.conn.peer, withAudio(cam)))
  }
  const endCall = (tell = true) => { const c = st.current.call; if (!c) return; c.cam.stop(); c.mc.close(); setCall(null); if (tell) send({ t: 'endcall' }) }
  useEffect(() => { call?.cam.setLevel(level) }, [level, call])

  const find = async () => {
    setScreen('finding'); setNotice('')
    const mm = await net.current!.find(skip.current, s => console.log('[lobby]', s))
    if (mm) beginMatch(mm); else setScreen(s => s === 'finding' ? 'lobby' : s)
  }
  const doJoin = async () => {
    try { setNotice('Connecting…'); beginMatch(await net.current!.joinCode(joinCode)) } catch (e: any) { setNotice(e.message || 'Could not connect') }
  }
  const beginMatch = (mm: Match) => {
    theirImgs.current = {}; shown.current = null
    setLevel(1); setPct(0); setTaps({ me: false, them: false }); setAns({}); setCredited([]); setMsgs([]); setTab('profile'); setAnswering(null)
    setM(mm); setScreen('match')
    mm.conn.on('data', onData); mm.conn.on('close', () => leave('They left the match.'))
  }
  const leave = (why: string, again = false) => {
    endCall(false); const c = st.current.m; if (!c) return; st.current.m = null; setM(null)
    setTimeout(() => { try { c.conn.close() } catch {} }, 300); net.current!.busy = false
    setNotice(why); setScreen('lobby'); if (again) setTimeout(find, 50)
  }
  const doSkip = (blk = false) => { const t = st.current.m?.them; if (!t) return; if (blk) block(t.uid); skip.current.add(t.uid); send({ t: 'skip' }); leave(blk ? 'Blocked. Finding someone new.' : 'Skipped. Finding someone new.', true) }

  useEffect(() => { if (m) sendPhoto(level) }, [m, level])
  // meter: time together
  useEffect(() => { if (!m || level === 5) return; const t = setInterval(() => setPct(p => Math.min(100, p + METER.percentPerMinute / 60)), 1000); return () => clearInterval(t) }, [m, level])
  // card credit when BOTH answered
  useEffect(() => { for (const [id, a] of Object.entries(ans)) if (a.me && a.them && !credited.includes(id)) { setCredited(c => [...c, id]); setPct(p => Math.min(100, p + METER.cardBonus)); setMsgs(x => [...x, { from: 'sys', text: `${cardById(id)!.id.replace(/L\dQ/, 'Q')} ANSWERED +${METER.cardBonus}%` }]) } }, [ans])
  const raise = (from: number) => { setLevel(l => l === from && l < 5 ? l + 1 : l); setPct(0); setTaps({ me: false, them: false }) }
  useEffect(() => { if (taps.me && taps.them) raise(level) }, [taps])

  function onData(d: any) {
    const s = st.current
    switch (d?.t) {
      case 'chat': setMsgs(x => [...x, { from: 'them', text: d.text }]); break
      case 'card': setMsgs(x => [...x, { from: 'them', card: d.id }]); break
      case 'ans': setAns(a => ({ ...a, [d.id]: { ...a[d.id], them: d.text } })); break
      case 'tap': if (d.level === s.level) setTaps(t => ({ ...t, them: true })); break
      case 'drop': setLevel(d.level); setPct(0); setTaps({ me: false, them: false }); setMsgs(x => [...x, { from: 'sys', text: `${s.m?.them.name.toUpperCase()} LOWERED TO ${LEVELS[d.level - 1].name.toUpperCase()}` }]); break
      case 'photo': loadImage(d.data).then(img => { if (d.level === st.current.level) (window as any).__pd = { photoW: img.naturalWidth, photoH: img.naturalHeight }; theirImgs.current[d.level] = img; if (d.level === st.current.level) paint(img) }); break
      case 'skip': leave('They moved on. Finding someone new.', true); break
      case 'endcall': endCall(false); break
    }
  }
  const paint = (img: HTMLImageElement) => {
    const c = cv.current; if (!c) { shown.current = img; return }
    const prev = shown.current; shown.current = img
    if (prev && img.naturalWidth > prev.naturalWidth) animateReveal(c, prev, img); else animateReveal(c, null, img)
  }
  useEffect(() => { const i = theirImgs.current[level]; if (i) paint(i) }, [level])
  useEffect(() => { if (tab === 'profile' && shown.current && cv.current) animateReveal(cv.current, null, shown.current) }, [tab, screen])

  const used = new Set(Object.keys(ans).filter(k => ans[k].me && ans[k].them))
  const card = level < 6 ? deck.next(Math.min(level, 5), used) : null
  const answer = (id: string, text: string) => { setAns(a => ({ ...a, [id]: { ...a[id], me: text } })); send({ t: 'ans', id, text }); setAnswering(null) }
  const tapReveal = () => { if (pct < 100 || level === 5) return; setTaps(t => ({ ...t, me: true })); send({ t: 'tap', level }) }
  const drop = () => { if (level === 1) return; const l = level - 1; setLevel(l); setPct(0); setTaps({ me: false, them: false }); send({ t: 'drop', level: l }) }
  const chat = () => { if (!draft.trim()) return; send({ t: 'chat', text: draft }); setMsgs(x => [...x, { from: 'me', text: draft }]); setDraft('') }
  const dropCard = (id: string) => { send({ t: 'card', id }); setMsgs(x => [...x, { from: 'me', card: id }]); setTab('chat') }

  const remoteV = useRef<HTMLVideoElement>(null); const localV = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (remoteV.current && call?.remote) { remoteV.current.srcObject = call.remote; remoteV.current.play().catch(() => {}) } if (localV.current && call) { localV.current.srcObject = call.cam.stream; localV.current.play().catch(() => {}) } }, [call, tab])

  if (screen === 'onboard') return <div className="app px"><Onboard onDone={start} /></div>

  const Q = ({ id, inChat }: { id: string; inChat?: boolean; key?: any }) => {
    const q = cardById(id)!; const a = ans[id] || {}; const both = a.me && a.them
    return <div className={`px-frame px-card px-qcard qcard ${both ? 'px-card--hot' : ''}`} data-t="card" data-card={id}>
      <div className="px-qcard__top"><span className="px-frame px-tag">{LEVELS[q.level - 1].name.toUpperCase()} · Q{q.index}</span>
        <span className="px-qcard__meta"><Ic n="sparkle" s={8} />{both || q.level === 1 || q.level === 3 || q.level === 5 ? `+${METER.cardBonus}%` : `+${METER.cardBonus}% TOGETHER`}</span></div>
      <p className="px-qcard__q">{q.text}</p>
      {both && <p className="answers px-label">YOU: <b className="px-cream">{a.me}</b><br />{m?.them.name.toUpperCase()}: <b className="px-cream">{a.them}</b></p>}
      {answering === id ? <form className="ansrow" onSubmit={e => { e.preventDefault(); const v = (e.currentTarget.elements[0] as HTMLInputElement).value.trim(); if (v) answer(id, v) }}>
        <input className="px-frame px-input fld" autoFocus placeholder="Your answer" data-t="ans-input" /><button className="px-frame px-btn-small" data-t="ans-send">SEND</button></form>
        : <div className="px-qcard__foot">
          <span className={`dot ${a.them ? 'on' : ''}`} data-t="dot-them" /><span className={`dot me ${a.me ? 'on' : ''}`} data-t="dot-me" />
          <span className="px-label">{both ? 'BOTH ANSWERED' : a.them ? `${m?.them.name.toUpperCase()} ANSWERED` : a.me ? 'WAITING' : 'NEW CARD'}</span>
          {!a.me && <button className={`px-frame ${inChat ? 'px-btn-small' : 'px-btn-ghost'}`} data-t="answer" onClick={() => setAnswering(id)}>ANSWER</button>}
          {!inChat && a.me && !both && <button className="px-frame px-btn-ghost" onClick={() => dropCard(id)}>TO CHAT</button>}
        </div>}
    </div>
  }
  const lv = LEVELS[level - 1], nx = LEVELS[level]
  return <div className="app px">
    {screen !== 'match' ? <div className="screen">
      <header className="bar"><img src={`${B}px/logo/logo-2.svg`} alt="pixeldate" /><span className="ver">{VERSION}</span></header>
      {screen === 'finding' ? <div className="finding" data-t="finding">
        <div className="sprite" /><p className="px-label-b px-cream">FINDING SOMEONE…</p>
        <p className="px-label">{me!.seek === 'everyone' ? 'EVERYONE' : me!.seek.toUpperCase()} · {me!.min}–{me!.max}</p>
        <button className="px-frame px-btn-ghost" onClick={() => { net.current!.cancel(); setScreen('lobby') }}>CANCEL</button>
      </div> : <div className="lobby">
        <div className="px-frame px-card pad"><p className="px-text">Hi {me!.name}. Tap below and we'll pair you with someone at random. Everyone starts as a Stranger: 8 blocks.</p></div>
        {notice && <p className="px-label px-coral-l">{notice.toUpperCase()}</p>}
        <button className="px-frame px-btn big" data-t="find" disabled={!code} onClick={find}><Ic n="matches" /><span className="px-btn__label">{code ? 'Find someone' : 'Connecting…'}</span></button>
        <div className="px-frame px-card pad">
          <p className="px-label">JOIN WITH A CODE</p>
          <p className="px-text">Your code: <b className="px-coral" data-t="code">{code || '…'}</b></p>
          <div className="ansrow"><input className="px-frame px-input fld" value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="Friend's code" data-t="joincode" />
            <button className="px-frame px-btn-small" onClick={doJoin} data-t="join">JOIN</button></div>
        </div>
        <p className="px-label note">DEMO, TEST WITH PEOPLE YOU KNOW</p>
      </div>}
    </div> : <div className="screen">
      <header className="bar"><img src={`${B}px/logo/logo-2.svg`} alt="pixeldate" />
        <div className="acts"><button className="px-frame px-btn-ghost" data-t="skip" onClick={() => doSkip()}>SKIP</button>
          <button className="blockbtn" title="Block" data-t="block" onClick={() => confirm('Block and never match again?') && doSkip(true)}><Ic n="lock" s={8} /></button></div></header>
      <div className="body scroll">
        {tab === 'profile' && <>
          <div className="px-frame px-card prof">
            <div className="photo"><canvas ref={cv} width={480} height={480} data-t="their-photo" />
              <span className="px-frame px-chip chip"><Ic n="heart" s={8} /> LV {level} · {lv.name.toUpperCase()}</span>
              <div className="px-frame px-plate plate"><span className="px-title">{m!.them.name}, {m!.them.age}</span></div></div>
            <div className="meterrow">
              <div className="mtop"><b className="px-label-b px-cream">{lv.name.toUpperCase()}</b>{nx && <span className="px-label">{Math.floor(pct)}% TO <b className="px-coral">{nx.name.toUpperCase()}</b></span>}</div>
              <div className="mtop"><Meter level={level} pct={pct} /><button className="px-label linkbtn" data-t="drop" disabled={level === 1} onClick={drop}>LOWER LEVEL <Ic n="chevron" s={8} /></button></div>
            </div>
          </div>
          {card && Q({ id: card.id })}
          {taps.them && !taps.me && <p className="px-text px-coral-l hint"><Ic n="heart" s={8} /> {m!.them.name} has tapped. Your turn</p>}
          {taps.me && !taps.them && <p className="px-text px-muted hint">Waiting for {m!.them.name} to tap…</p>}
          {level < 5 && (pct >= 100
            ? <button className="px-frame px-btn" data-t="reveal" data-state="ready" onClick={tapReveal} disabled={taps.me}><Ic n="sparkle" /><span className="px-btn__label">Reveal more</span><span className="px-btn__meta lbl-ink">{nx?.name.toUpperCase()}</span></button>
            : <button className="px-frame px-btn px-btn--locked" data-t="reveal" data-state="locked"><Ic n="lock" /><span className="px-btn__label">Reveal more</span><span className="px-btn__meta">{Math.floor(pct)}%</span></button>)}
        </>}
        {tab === 'chat' && <div className="chat">
          {msgs.length === 0 && <p className="px-label">SAY HI TO {m!.them.name.toUpperCase()}. CARDS YOU DROP IN APPEAR HERE.</p>}
          {msgs.map((x, i) => x.from === 'sys' ? <p key={i} className="px-label sys">{x.text}</p>
            : x.card ? <div key={i}>{Q({ id: x.card, inChat: true })}</div> : <div key={i} className={`px-frame px-bubble ${x.from === 'me' ? 'px-bubble--me me' : ''} bub`} data-t={'msg-' + x.from}>{x.text}</div>)}
        </div>}
        {tab === 'call' && <div className="call">
          {call ? <>
            <div className="remote"><video ref={remoteV} playsInline data-t="remote-video" />{!call.remote && <p className="px-label">CONNECTING…</p>}
              <span className="px-frame px-chip chip">LV {level} · {lv.name.toUpperCase()}</span></div>
            <video ref={localV} className="self" muted playsInline />
            {card && Q({ id: card.id })}
            <button className="px-frame px-btn" onClick={() => endCall()}><span className="px-btn__label">End call</span></button>
          </> : <>
            <div className="px-frame px-card pad"><p className="px-text">Video is pixelated on your phone before it is sent. {m!.them.name} sees you at {lv.name}, you see your own clear preview.</p></div>
            <button className="px-frame px-btn" data-t="call" onClick={startCall}><Ic n="call" /><span className="px-btn__label">Start pixel call</span></button></>}
        </div>}
      </div>
      {tab === 'chat' && <form className="composer" onSubmit={e => { e.preventDefault(); chat() }}>
        <input className="px-frame px-input fld" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Message" data-t="chat-input" />
        <button className="px-frame px-iconbtn" data-t="chat-send"><Ic n="send" /></button></form>}
      <nav className="px-nav nav">
        {(['profile', 'chat', 'call'] as const).map(t => <a key={t} className={tab === t ? 'on' : ''} data-t={'tab-' + t} onClick={() => setTab(t)}><Ic n={t === 'profile' ? 'matches' : t} />{t === 'profile' ? 'MATCH' : t === 'chat' ? 'CHAT' : 'CALL'}</a>)}
      </nav>
    </div>}
  </div>
}
