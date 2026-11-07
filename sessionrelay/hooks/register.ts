// Wires engine events to the adapter; no logic here (02 §3).
import type { CommandRunInput, EngineInterface, Register, Timer } from 'claude-code'
import { chooseCommandName, FALLBACK, PRIMARY, relay } from '../src/adapter/commands.ts'
import { runtime, type Options } from '../src/adapter/runtime.ts'
import { captureFirstPrompt, heartbeat, measure } from '../src/adapter/task.ts'
import { HEARTBEAT_MS } from '../src/core/lock.ts'

const why = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 200)

async function answer($: EngineInterface, opts: Options, e: CommandRunInput) {
  try { return { text: await relay(await runtime($, opts), e.args, { userTyped: e.origin.kind === 'composer' }) } } catch (err) {
    return { text: `SessionRelay could not answer: ${why(err)}` }
  }
}

/** Never throws into the hook: a failure is logged and the event goes on unchanged. */
async function quietly($: EngineInterface, opts: Options, what: string, work: (rt: Awaited<ReturnType<typeof runtime>>) => Promise<unknown>) {
  const rt = await runtime($, opts)
  try { await work(rt) } catch (err) { rt.port.log(`sessionrelay: ${what} failed: ${why(err)}`) }
}

export const register: Register = (on, options) => {
  const opts: Options = { stateDir: typeof options.stateDir === 'string' && options.stateDir ? options.stateDir : undefined }
  // Which name this process registered; rebuilt by session.start after a reload.
  let commandName: typeof PRIMARY | typeof FALLBACK | null = null
  let beat: Timer | null = null

  on('session.start', async ($, e, next) => {
    const rt = await runtime($, opts, true)
    commandName = chooseCommandName(await $.command.list())
    await $.command.register({ name: commandName, description: 'SessionRelay: keep a long task going across fresh conversations', argumentHint: 'on [goal] | off | status | help' })
    if (commandName === FALLBACK) $.ui.toast('/relay is taken by another command, so SessionRelay uses /sessionrelay.')
    if (rt.probe.mode !== 'full' && rt.probe.message) {
      $.ui.status(rt.probe.mode === 'unsupported' ? `off: needs ${rt.probe.missing[0]}` : 'assisted mode')
      $.ui.toast(rt.probe.message)
    }
    beat?.cancel()
    beat = $.clock.every(HEARTBEAT_MS, () => void quietly($, opts, 'heartbeat', heartbeat))
    return next(e)
  })

  on('command.run', { command: 'relay' }, async ($, e, next) => (commandName === PRIMARY ? answer($, opts, e) : next(e)))
    .catch(($, e, next) => (next.called ? next(e) : { text: 'SessionRelay could not answer (internal error).' }))
  on('command.run', { command: 'sessionrelay' }, async ($, e, next) => (commandName === FALLBACK ? answer($, opts, e) : next(e)))
    .catch(($, e, next) => (next.called ? next(e) : { text: 'SessionRelay could not answer (internal error).' }))

  // Subscribed now, forwarded unchanged until the stories that use them (M2-M5).
  // ST-2.3: only a context change counts; rate-limit or cost changes never move the reading (AC-04).
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) await quietly($, opts, 'measure', rt => measure(rt, e.context))
    return next(e)
  })
  on('tool.call', ($, e, next) => next(e))
  on('turn.complete', ($, e, next) => next(e))
  on('session.end', ($, e, next) => next(e))
  on('session.compact', ($, e, next) => next(e))
  // ST-2.1: the person's first prompt after `/relay on` (no goal) is the task, byte for byte. Slash commands are not.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' && !e.command && !e.isMeta) await quietly($, opts, 'capture', rt => captureFirstPrompt(rt, e.text))
    return next(e)
  }).catch(($, e, next) => next(e))
  on('classic.Stop', ($, e, next) => next(e))
  on('classic.StopFailure', ($, e, next) => next(e))
  on('classic.SessionStart', ($, e, next) => next(e))
}
