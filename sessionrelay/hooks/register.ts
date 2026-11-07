// Wires engine events to the adapter; no logic here (02 §3).
import type { EngineInterface, Register } from 'claude-code'
import { chooseCommandName, FALLBACK, PRIMARY, relay } from '../src/adapter/commands.ts'
import { runtime, type Options } from '../src/adapter/runtime.ts'

async function answer($: EngineInterface, opts: Options, args: string) {
  try { return { text: await relay(await runtime($, opts), args) } } catch (err) {
    return { text: `SessionRelay could not answer: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}` }
  }
}

export const register: Register = (on, options) => {
  const opts: Options = { stateDir: typeof options.stateDir === 'string' && options.stateDir ? options.stateDir : undefined }
  // Which name this process registered; rebuilt by session.start after a reload.
  let commandName: typeof PRIMARY | typeof FALLBACK | null = null

  on('session.start', async ($, e, next) => {
    const rt = await runtime($, opts, true)
    commandName = chooseCommandName(await $.command.list())
    await $.command.register({ name: commandName, description: 'SessionRelay: status and help (session continuity)', argumentHint: 'status | help' })
    if (commandName === FALLBACK) $.ui.toast('/relay is taken by another command, so SessionRelay uses /sessionrelay.')
    if (rt.probe.mode !== 'full' && rt.probe.message) {
      $.ui.status(rt.probe.mode === 'unsupported' ? `off: needs ${rt.probe.missing[0]}` : 'assisted mode')
      $.ui.toast(rt.probe.message)
    }
    return next(e)
  })

  on('command.run', { command: 'relay' }, async ($, e, next) => (commandName === PRIMARY ? answer($, opts, e.args) : next(e)))
    .catch(($, e, next) => (next.called ? next(e) : { text: 'SessionRelay could not answer (internal error).' }))
  on('command.run', { command: 'sessionrelay' }, async ($, e, next) => (commandName === FALLBACK ? answer($, opts, e.args) : next(e)))
    .catch(($, e, next) => (next.called ? next(e) : { text: 'SessionRelay could not answer (internal error).' }))

  // Subscribed now, forwarded unchanged until the stories that use them (M2-M5).
  on('session.measure', ($, e, next) => next(e))
  on('tool.call', ($, e, next) => next(e))
  on('turn.complete', ($, e, next) => next(e))
  on('session.end', ($, e, next) => next(e))
  on('session.compact', ($, e, next) => next(e))
  on('prompt.submit', ($, e, next) => next(e))
  on('classic.Stop', ($, e, next) => next(e))
  on('classic.StopFailure', ($, e, next) => next(e))
  on('classic.SessionStart', ($, e, next) => next(e))
}
