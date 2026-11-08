import type { Register, EngineInterface } from 'claude-code'

const LOG = '<scratch>/log.jsonl'

let chain: Promise<void> = Promise.resolve()
function log($: EngineInterface, ev: string, data: Record<string, unknown> = {}) {
  chain = chain.then(() => logNow($, ev, data)).catch(() => {})
  return chain
}
async function logNow($: EngineInterface, ev: string, data: Record<string, unknown> = {}) {
  let prev = ''
  try { prev = (await $.fs.read(LOG)) as string } catch {}
  const usage = await $.session.usage().catch(() => null)
  const row = { model: await $.session.model(), cwd: await $.session.cwd(), t: await $.clock.now(), ev, sid: await $.session.id(), pct: usage?.context.percent ?? null, tokens: usage?.context.tokens ?? null, window: usage?.context.window ?? null, ...data }
  await $.fs.write(LOG, prev + JSON.stringify(row) + '\n')
}

let blocked = false
let rotated = false

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'srspike', description: 'Arm the relay spike' })
    await log($, 'session.start', { isInteractive: e.isInteractive, surface: e.surface })
    return next(e)
  })

  on('command.run', { command: 'srspike' }, async $ => {
    await $.store.set('armed', 1)
    await $.store.set('blockonce', 1)
    await log($, 'armed')
    return { text: 'relay-spike armed' }
  })

  on('classic.Stop', async ($, e, next) => {
    await log($, 'classic.Stop', { permission_mode: (e as { permission_mode?: string }).permission_mode, stop_hook_active: e.stop_hook_active, background_tasks: e.background_tasks ?? null })
    if (!blocked) {
      blocked = true
      return { block: 'SessionRelay spike: before stopping, reply with the single word GAMMA.' }
    }
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    await log($, 'classic.SessionStart', { source: e.source, hookSid: e.session_id })
    const r = await next(e)
    if (e.source === 'clear') return { ...r, additionalContext: [...(r.additionalContext ?? []), 'SPIKE-CONTEXT: the secret word is DELTA.'] }
    return r
  })

  on('session.end', async ($, e, next) => {
    await log($, 'session.end', { reason: e.reason, endingSid: e.sessionId })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await log($, 'session.measure')
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    await log($, 'session.compact', { trigger: (e as { trigger?: string }).trigger })
    return { skip: 'relay-spike: compaction skipped while a managed task is active' }
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) return r
    await log($, 'turn.complete', { reason: e.reason, text: r.text.slice(0, 300) })
    if (!rotated) {
      rotated = true
      $.clock.after(300, () => {
        void (async () => {
          const before = await $.session.id()
          const git = await $.process.run(['git', 'status', '--porcelain=v1', '--branch']).catch(err => ({ exitCode: -1, stdout: String(err), stderr: '' }))
          await log($, 'git', { exitCode: git.exitCode, stdout: git.stdout.slice(0, 200) })
          try {
            const res = await $.command.run({ command: 'clear', args: '' })
            await log($, 'clear.resolved', { before, text: res.text ?? null })
          } catch (err) {
            await log($, 'clear.rejected', { before, err: String(err) })
            return
          }
          try {
            const sub = await $.prompt.submit({ text: 'SessionRelay spike continuation. Reply starting with BETA. Then answer: (1) Quote any earlier user or assistant messages you can see in this conversation, or say NONE. (2) What secret word appears in your context, if any? (3) Name up to two MCP tools (mcp__*) you can call, or NONE. Keep it to 4 lines.' })
            await log($, 'submit.resolved', { sub: JSON.stringify(sub).slice(0, 300) })
          } catch (err) {
            await log($, 'submit.rejected', { err: String(err) })
          }
        })()
      })
    }
    return r
  })
}
