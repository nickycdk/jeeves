import type { Register, EngineInterface } from 'claude-code'

let chain: Promise<void> = Promise.resolve()
function log($: EngineInterface, ev: string, data: Record<string, unknown> = {}) {
  chain = chain.then(() => logNow($, ev, data)).catch(() => {})
  return chain
}
async function logNow($: EngineInterface, ev: string, data: Record<string, unknown>) {
  const path = await $.env.get('SRSPIKE_LOG')
  if (!path) return
  let prev = ''
  try { prev = (await $.fs.read(path)) as string } catch {}
  const u = await $.session.usage().catch(() => null)
  const row = { t: await $.clock.now(), ev, sid: await $.session.id(), pct: u?.context.percent ?? null, usd: u?.cost?.usd ?? null, ...data }
  await $.fs.write(path, prev + JSON.stringify(row) + '\n')
}

async function continuation($: EngineInterface, n: number) {
  const custom = await $.env.get('SRSPIKE_CONT1')
  if (n === 1 && custom) return custom
  if (n !== 1) return 'SessionRelay spike continuation. Reply with the single word PLANCHECK and nothing else.'
  const extra = await $.env.get('SRSPIKE_EXTRA')
  return `SessionRelay spike continuation. Do these in order, then report each result on its own line: (1) Read the file ${extra}/note.txt with the Read tool and quote its contents. (2) Run the Bash command \`date +%Y\`. (3) Use the CronList tool (load it with ToolSearch first if needed) and list scheduled tasks, or say NONE.`
}

let rotations = 0

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'srspike', description: 'Rotate now (spike)' })
    await log($, 'session.start', { surface: e.surface })
    return next(e)
  })

  on('command.run', { command: 'srspike' }, async $ => {
    const n = ++rotations
    $.clock.after(500, () => {
      void (async () => {
        const before = await $.session.id()
        try { await $.command.run({ command: 'clear', args: '' }); await log($, 'clear.resolved', { n, before }) }
        catch (err) { await log($, 'clear.rejected', { err: String(err) }); return }
        try { await $.prompt.submit({ text: await continuation($, n) }); await log($, 'submit.resolved', { n }) }
        catch (err) { await log($, 'submit.rejected', { err: String(err) }) }
      })()
    })
    await log($, 'rotate.requested', { n })
    return { text: `spike rotation ${n} queued` }
  })

  on('classic.Stop', async ($, e, next) => {
    await log($, 'classic.Stop', { permission_mode: e.permission_mode, session_crons: e.session_crons ?? null, background_tasks: e.background_tasks ?? null, last: (e.last_assistant_message ?? '').slice(0, 400) })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) await log($, 'tool', { tool: e.tool, deny: r.deny ?? null, isError: r.isError ?? null, text: (r.text ?? '').slice(0, 160) })
    return r
  })

  on('classic.SessionStart', async ($, e, next) => {
    await log($, 'classic.SessionStart', { source: e.source, permission_mode: (e as { permission_mode?: string }).permission_mode ?? null })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await log($, 'session.end', { reason: e.reason })
    return next(e)
  })
}
