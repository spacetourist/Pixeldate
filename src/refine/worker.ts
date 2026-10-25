import { run, transfers } from './work'
;(self as any).onmessage = async (e: MessageEvent) => {
  const { id, job } = e.data
  try { const o = await run(job); (self as any).postMessage({ id, o }, transfers(o)) }
  catch (err) { (self as any).postMessage({ id, err: String(err) }) }
}
