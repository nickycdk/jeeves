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
  const row = { t: await $.clock.now(), ev, sid: await $.session.id(), pct: u?.context.percent ?? null, ...data }
  await $.fs.write(path, prev + JSON.stringify(row) + '\n')
}

let rotateNow = false
let rotated = false

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await log($, 'session.start', { surface: e.surface })
    return next(e)
  })

  on('classic.Stop', async ($, e, next) => {
    const agents = await $.agent.list().catch(err => String(err))
    const bg = e.background_tasks ?? null
    const crons = e.session_crons ?? null
    const running = Array.isArray(agents) ? agents.filter(a => a.status === 'running').length : -1
    const safe = Array.isArray(bg) && bg.length === 0 && Array.isArray(crons) && crons.length === 0 && running === 0
    await log($, 'classic.Stop', { stop_hook_active: e.stop_hook_active, background_tasks: bg, session_crons: crons, agents, safe })
    if (!rotated) {
      if (safe && (await $.store.get('sawBusy'))) rotateNow = true
      if (!safe) await $.store.set('sawBusy', 1)
      await log($, safe ? 'boundary.safe' : 'boundary.defer', { rotateNow })
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) { await log($, 'turn.complete.sub', { reason: e.reason, agentId: e.agentId }); return r }
    await log($, 'turn.complete', { reason: e.reason, text: r.text.slice(0, 200) })
    if (rotateNow && !rotated) {
      rotated = true
      $.clock.after(300, () => {
        void (async () => {
          const before = await $.session.id()
          try { await $.command.run({ command: 'clear', args: '' }); await log($, 'clear.resolved', { before }) }
          catch (err) { await log($, 'clear.rejected', { err: String(err) }); return }
          try { await $.prompt.submit({ text: 'SessionRelay spike continuation. Reply with the single word BETA.' }); await log($, 'submit.resolved') }
          catch (err) { await log($, 'submit.rejected', { err: String(err) }) }
        })()
      })
    }
    return r
  })

  on('session.end', async ($, e, next) => {
    await log($, 'session.end', { reason: e.reason })
    return next(e)
  })
}
