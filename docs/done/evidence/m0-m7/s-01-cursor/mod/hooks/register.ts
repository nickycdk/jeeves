import type { Register, EngineInterface } from 'claude-code'

// Serialised log writes (spike 01: naive read-modify-write lost lines).
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
  const row = { t: await $.clock.now(), ev, sid: await $.session.id(), pct: u?.context.percent ?? null, model: await $.session.model(), ...data }
  await $.fs.write(path, prev + JSON.stringify(row) + '\n')
}

let session = 1
let rotating = false
const status = ($: EngineInterface) => $.ui.status(`relay-spike: session ${session}${rotating ? ' (rotating…)' : ''}`)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'srspike', description: 'Rotate to a fresh conversation now (S-01 spike)' })
    status($)
    await log($, 'session.start', { surface: e.surface })
    return next(e)
  })

  on('command.run', { command: 'srspike' }, async $ => {
    if (rotating) return { text: 'relay-spike: rotation already queued' }
    rotating = true; status($)
    $.clock.after(500, () => {
      void (async () => {
        const before = await $.session.id()
        try { await $.command.run({ command: 'clear', args: '' }); await log($, 'clear.resolved', { before }) }
        catch (err) { await log($, 'clear.rejected', { err: String(err) }); rotating = false; status($); return }
        session++; rotating = false; status($)
        try {
          await $.prompt.submit({ text: 'SessionRelay spike continuation. Reply starting with BETA, then: (1) quote any earlier user or assistant messages you can see, or say NONE; (2) the secret word in your context, if any. Two lines.' })
          await log($, 'submit.resolved')
        } catch (err) { await log($, 'submit.rejected', { err: String(err) }) }
      })()
    })
    await log($, 'rotate.requested', { session })
    return { text: 'relay-spike: rotation queued' }
  })

  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    await log($, 'classic.SessionStart', { source: e.source })
    if (e.source === 'clear') return { ...r, additionalContext: [...(r.additionalContext ?? []), 'SPIKE-CONTEXT: the secret word is DELTA.'] }
    return r
  })

  on('classic.Stop', async ($, e, next) => {
    await log($, 'classic.Stop', { permission_mode: e.permission_mode, background_tasks: e.background_tasks ?? null })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await log($, 'session.end', { reason: e.reason })
    return next(e)
  })
}
