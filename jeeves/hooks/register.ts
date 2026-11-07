// Wires engine events to the adapter; no logic here (02 §3).
import type { CommandRunInput, EngineInterface, Register, Timer, ToolCallInput, ToolCallResult } from 'claude-code'
import type { ToolOutcome } from '../src/core/evidence.ts'
import { chooseCommandName, FALLBACK, PRIMARY, relay } from '../src/adapter/commands.ts'
import { runtime, type Options } from '../src/adapter/runtime.ts'
import { captureFirstPrompt, heartbeat, measure, nudgeIfWaiting, onFreshSession, onStop, onTurnComplete, onUserClear, recordTool, releaseOnExit, why } from '../src/adapter/task.ts'
import { HEARTBEAT_MS } from '../src/core/lock.ts'


async function answer($: EngineInterface, opts: Options, e: CommandRunInput) {
  try { return { text: await relay(await runtime($, opts), e.args, { userTyped: e.origin.kind === 'composer' }) } } catch (err) {
    return { text: `Jeeves could not answer: ${why(err)}` }
  }
}

/** How a tool call ended, for the ledger (read only; nothing here can change the call). */
function outcome(e: ToolCallInput, r: ToolCallResult): ToolOutcome {
  const { tool, tool_use_id: _id, agentId, requestMeta: _meta, ...args } = e as ToolCallInput & Record<string, unknown>
  const result = r.result as { backgroundTaskId?: unknown } | undefined
  return {
    tool, args, agentId, denied: r.deny !== undefined, isError: r.isError === true, text: r.text,
    backgrounded: typeof result?.backgroundTaskId === 'string',
  }
}

/** Never throws into the hook: a failure is logged and the event goes on unchanged. */
async function quietly($: EngineInterface, opts: Options, what: string, work: (rt: Awaited<ReturnType<typeof runtime>>) => Promise<unknown>) {
  try { await work(await runtime($, opts)) } catch (err) { $.ui.log(`jeeves: ${what} failed: ${why(err)}`, { to: 'debug' }) }
}

export const register: Register = (on, options) => {
  const opts: Options = { stateDir: typeof options.stateDir === 'string' && options.stateDir ? options.stateDir : undefined }
  // Which name this process registered; rebuilt by session.start after a reload.
  let commandName: typeof PRIMARY | typeof FALLBACK | null = null
  let beat: Timer | null = null
  // Whether a main-loop turn is open: engine state, not task state. Starts idle (a reload mid-turn at worst queues one nudge).
  let turnOpen = false

  on('session.start', async ($, e, next) => {
    const rt = await runtime($, opts, true)
    commandName = chooseCommandName(await $.command.list())
    await $.command.register({ name: commandName, description: 'Jeeves: keep a long task going across fresh conversations', argumentHint: 'on [goal] | off | pause | resume | threshold <n> | task | dod <text> | check <cmd> | status | help' })
    if (commandName === FALLBACK) $.ui.toast('/relay is taken by another command, so Jeeves uses /jeeves.')
    if (rt.probe.mode !== 'full' && rt.probe.message) {
      $.ui.status(rt.probe.mode === 'unsupported' ? `off: needs ${rt.probe.missing[0]}` : 'assisted mode')
      $.ui.toast(rt.probe.message)
    }
    beat?.cancel()
    beat = $.clock.every(HEARTBEAT_MS, () => void quietly($, opts, 'heartbeat', heartbeat))
    return next(e)
  })

  on('command.run', { command: 'relay' }, async ($, e, next) => (commandName === PRIMARY ? answer($, opts, e) : next(e)))
    .catch(($, e, next) => (next.called ? next(e) : { text: 'Jeeves could not answer (internal error).' }))
  on('command.run', { command: 'jeeves' }, async ($, e, next) => (commandName === FALLBACK ? answer($, opts, e) : next(e)))
    .catch(($, e, next) => (next.called ? next(e) : { text: 'Jeeves could not answer (internal error).' }))

  // ST-2.3: only a context change counts; rate-limit or cost changes never move the reading (AC-04).
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) await quietly($, opts, 'measure', async rt => {
      await measure(rt, e.context)
      // Q-10: a reading that crosses the threshold after the turn ended finds Claude idle (D-23).
      if (!turnOpen) await nudgeIfWaiting(rt)
    })
    return next(e)
  })
  // A user's /clear pauses the task (USER_CLEAR); any other end gives the lock up, state untouched.
  on('session.end', async ($, e, next) => {
    await quietly($, opts, 'session end', rt => (e.reason === 'clear' ? onUserClear(rt, e.sessionId) : releaseOnExit(rt, e.sessionId)))
    return next(e)
  })
  // ST-2.1: the person's first prompt after `/relay on` (no goal) is the task, byte for byte. Slash commands are not.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' && !e.command && !e.isMeta) await quietly($, opts, 'capture', rt => captureFirstPrompt(rt, e.text))
    return next(e)
  }).catch(($, e, next) => next(e))
  // Subscribed now, forwarded unchanged until the stories that use them (M3-M5).
  // ST-3.1: record after the tool answered; the write runs after the hook returns, so it never delays, changes or blocks the call.
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    void quietly($, opts, 'ledger', rt => recordTool(rt, outcome(e, r)))
    return r
  }).catch(($, e, next) => next(e))
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) turnOpen = true
    return next(e)
  })
  // ST-4.1: after the handover turn, /clear; an interrupt during a handover pauses; an idle request gets its nudge.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      turnOpen = false
      await quietly($, opts, 'turn end', rt => onTurnComplete(rt, e.isAborted ? 'aborted' : e.reason))
    }
    return next(e)
  })
  on('session.compact', ($, e, next) => next(e))
  // ST-3.3: the safe boundary (ADR-004). Another hook's block means the turn goes on: not a boundary.
  on('classic.Stop', async ($, e, next) => {
    const base = await next(e)
    if (e.agent_id !== undefined || base.block !== undefined) return base
    let block: string | null = null
    await quietly($, opts, 'stop', async rt => {
      block = await onStop(rt, { backgroundTasks: e.background_tasks?.length ?? 0, crons: e.session_crons ?? [], message: e.last_assistant_message ?? '' })
    })
    return block === null ? base : { ...base, block }
  }).catch(($, e, next) => next(e))
  on('classic.StopFailure', ($, e, next) => next(e))
  // ST-4.2: the fresh conversation of a rotation. ADR-003: the rotation is read and applied before next(e),
  // because $.command.run('clear') can resolve first.
  on('classic.SessionStart', async ($, e, next) => {
    let context: string | null = null
    if (e.source === 'clear') await quietly($, opts, 'fresh session', async rt => { context = await onFreshSession(rt, e.session_id) })
    const base = await next(e)
    return context === null ? base : { ...base, additionalContext: [...(base.additionalContext ?? []), context] }
  }).catch(($, e, next) => next(e))
}
