import type { Register, EngineInterface } from 'claude-code'
let chain: Promise<void> = Promise.resolve()
function log($: EngineInterface, ev: string, data: Record<string, unknown> = {}) {
  chain = chain.then(async () => {
    const path = await $.env.get('SRSPIKE_LOG'); if (!path) return
    let prev = ''; try { prev = (await $.fs.read(path)) as string } catch {}
    await $.fs.write(path, prev + JSON.stringify({ ev, ...data }) + '\n')
  }).catch(() => {})
  return chain
}
export const register: Register = on => {
  on('session.start', async ($, e, next) => { await log($, 'session.start'); return next(e) })
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (e.tool === 'Bash') await log($, 'bash', { command: (e as any).command, isError: r.isError ?? null, deny: r.deny ?? null, textLen: r.text?.length ?? null, text: r.text, result: typeof r.result === 'string' ? r.result.slice(0, 300) + '…' + r.result.slice(-300) : r.result && JSON.stringify(r.result).slice(0, 600) })
    return r
  })
}
