/* Pixel character select (GD pixel-gender SPEC §3): the "I am" / "I want to meet" radiogroup as big pixel-character cards.
   Native radios (arrows, Home/End, Space, "1 of 2" all from the browser); the art is aria-hidden, the visible label is the name.
   value null = nothing chosen (signup has no default). Styles: src/styles/pixel-gender.css. */
export type PgChar = 'man' | 'woman' | 'duo'
export function PixelPick<V extends string>({ name, value, opts, onChange, labelledby }: { name: string; value: V | null; opts: [V, string, PgChar][]; onChange: (v: V) => void; labelledby: string }) {
  return <div className={'pg' + (opts.length === 3 ? ' pg--3' : '')} role="radiogroup" aria-labelledby={labelledby} data-t={name + '-group'}>{opts.map(([v, l, c]) =>
    <label key={v} className={'pg-card' + (value === v ? ' on' : '')} data-c={c} data-t={name + '-' + v}>
      <input className="vh" type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
      <span className="pg-frame fx"><span className="pg-stage" aria-hidden="true"><span className="pg-floor" /><span className="pg-spr" /><span className="pg-heart" /></span>
        <span className="pg-lab">{l}</span></span></label>)}</div>
}
