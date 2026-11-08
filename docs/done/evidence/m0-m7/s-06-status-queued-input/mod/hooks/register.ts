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

const HELD_MSG = 'Held by SessionRelay — will be delivered to the fresh session'
const DELAY_MS = 8000
let rotating = false, rotations = 0, probed = false
let held: string[] = []

async function probe($: EngineInterface) {
  const env = {
    CLAUDE_PLUGIN_DATA: await $.env.get('CLAUDE_PLUGIN_DATA'),
    CLAUDE_PLUGIN_ROOT: await $.env.get('CLAUDE_PLUGIN_ROOT'),
    XDG_STATE_HOME: await $.env.get('XDG_STATE_HOME'),
    HOME: await $.env.get('HOME'),
  }
  const dir = await $.env.get('SRSPIKE_DIR')
  const run = async (argv: string[]) => {
    try { const r = await $.process.run(argv, { timeoutMs: 5000 }); return { argv: argv.join(' '), exitCode: r.exitCode, stderr: r.stderr.slice(0, 200) } }
    catch (err) { return { argv: argv.join(' '), error: String(err) } }
  }
  const ops = []
  ops.push(await run(['mkdir', `${dir}/lock.d`]))
  ops.push(await run(['mkdir', `${dir}/lock.d`])) // second mkdir must fail: the lock is held
  let writeOk: unknown = null
  try { await $.fs.write(`${dir}/nested/a/state.json.tmp-1`, '{"v":1}'); writeOk = true } catch (err) { writeOk = String(err) }
  ops.push(await run(['mv', '-f', `${dir}/nested/a/state.json.tmp-1`, `${dir}/nested/a/state.json`]))
  const moved = await $.fs.exists(`${dir}/nested/a/state.json`).catch(err => String(err))
  await log($, 'probe', { env, pluginRoot: $.plugin.root, writeOk, ops, moved })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.ui.status('SR-STATUS: relay spike monitoring 42%')
    if (!probed) { probed = true; await probe($) }
    await log($, 'session.start', { surface: e.surface })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const info = { origin: e.origin.kind, command: e.command ? JSON.stringify(e.command).slice(0, 80) : null, turnId: e.turnId ?? null, wait: e.wait, text: e.text.slice(0, 80), rotating }
    if (rotating && e.origin.kind === 'composer' && !e.command) {
      held.push(e.text)
      await log($, 'prompt.held', info)
      $.ui.toast(HELD_MSG)
      return { drop: HELD_MSG }
    }
    await log($, 'prompt.submit', info)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) return r
    await log($, 'turn.complete', { reason: e.reason, text: r.text.slice(0, 200) })
    if (!rotating && rotations < 2 && !r.text.includes('CONT-')) {
      rotating = true
      const n = ++rotations
      $.ui.status(`SR-STATUS: rotation ${n} queued`)
      await log($, 'rotation.queued', { n })
      $.clock.after(DELAY_MS, () => {
        void (async () => {
          await log($, 'clear.calling', { n })
          try { await $.command.run({ command: 'clear', args: '' }); await log($, 'clear.resolved', { n }) }
          catch (err) { await log($, 'clear.rejected', { err: String(err) }); rotating = false; return }
          const msgs = held.splice(0)
          const text = `SessionRelay spike continuation ${n}. Start your reply with CONT-${n}.` + (msgs.length ? ` Messages the user sent during rotation:\n${msgs.map(m => `- ${m}`).join('\n')}\nAnswer them.` : '')
          rotating = false
          $.ui.status('SR-STATUS: relay spike monitoring 3%')
          try { await $.prompt.submit({ text }); await log($, 'submit.resolved', { n, heldDelivered: msgs.length }) }
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
