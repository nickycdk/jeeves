// Wires engine events to the adapter; no logic here (02 §3).
import type { CommandRunInput, EngineInterface, Register, Timer, ToolCallInput, ToolCallResult } from 'claude-code'
import type { ToolOutcome } from '../src/core/evidence.ts'
import { chooseCommandName, FALLBACK, PRIMARY, relay } from '../src/adapter/commands.ts'
import { recover, recoveryNotice } from '../src/adapter/recover.ts'
import { runtime, type Options } from '../src/adapter/runtime.ts'
import { captureFirstPrompt, compacted, heartbeat, managedNow, holdPrompt, measure, nudgeIfWaiting, onFreshSession, onStop, onTurnComplete, taskSection, onUserClear, recordTool, releaseOnExit, stopFailure, why } from '../src/adapter/task.ts'
import { HEARTBEAT_MS } from '../src/core/lock.ts'
import { HELD_TEXT } from '../src/adapter/ui.ts'


async function answer($: EngineInterface, opts: Options, e: CommandRunInput, idle: boolean, endedHere: ReadonlySet<string>) {
  try { return { text: await relay(await runtime($, opts), e.args, { userTyped: e.origin.kind === 'composer', idle, endedHere }) } } catch (err) {
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
  const opts: Options = { stateDir: typeof options.stateDir === 'string' && options.stateDir ? options.stateDir : undefined, autoRecover: options.autoRecover === true }
  // Which name this process registered; rebuilt by session.start after a reload.
  let commandName: typeof PRIMARY | typeof FALLBACK | null = null
  let beat: Timer | null = null
  // Whether a main-loop turn is open: engine state, not task state. Starts idle (a reload mid-turn at worst queues one nudge).
  let turnOpen = false
  // Session ids this process ended (/clear): process identity, so a lock is handed on only from our own past session.
  const endedHere = new Set<string>()

  on('session.start', async ($, e, next) => {
    const rt = await runtime($, opts, true)
    commandName = chooseCommandName(await $.command.list())
    await $.command.register({ name: commandName, description: 'Jeeves: keep a long task going across fresh conversations', argumentHint: 'on [goal] | off | pause | resume | rotate | continue | recover | threshold <n> | task | dod <text> | check <cmd> | status | history | help' })
    if (commandName === FALLBACK) $.ui.toast('/jeeves is taken by another command, so Jeeves uses /relay.')
    if (rt.probe.mode !== 'full' && rt.probe.message) {
      $.ui.status(rt.probe.mode === 'unsupported' ? `off: needs ${rt.probe.missing[0]}` : 'assisted mode')
      $.ui.toast(rt.probe.message)
    }
    // ST-6.1: a task an earlier session left (crash, exit mid-rotation) is named once; autoRecover continues it.
    await quietly($, opts, 'recovery scan', async rt => {
      const n = await recoveryNotice(rt)
      if (!n) return
      if (opts.autoRecover && n.recover) rt.port.toast(await recover(rt, await rt.port.sessionId(), endedHere))
      else rt.port.toast(n.text)
    })
    beat?.cancel()
    beat = $.clock.every(HEARTBEAT_MS, () => void quietly($, opts, 'heartbeat', heartbeat))
    return next(e)
  })

  on('command.run', { command: 'jeeves' }, async ($, e, next) => (commandName === PRIMARY ? answer($, opts, e, !turnOpen, endedHere) : next(e)))
    .catch(($, e, next) => (next.called ? next(e) : { text: 'Jeeves could not answer (internal error).' }))
  on('command.run', { command: 'relay' }, async ($, e, next) => (commandName === FALLBACK ? answer($, opts, e, !turnOpen, endedHere) : next(e)))
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
    endedHere.add(e.sessionId)
    await quietly($, opts, 'session end', rt => (e.reason === 'clear' ? onUserClear(rt, e.sessionId) : releaseOnExit(rt, e.sessionId)))
    return next(e)
  })
  // ST-2.1: the person's first prompt after `/jeeves on` (no goal) is the task, byte for byte. Slash commands are not.
  // ST-4.4: during a handover a typed prompt is held for the fresh conversation; slash commands still run.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'composer' || e.command || e.isMeta) return next(e)
    let held = false
    await quietly($, opts, 'capture', async rt => {
      held = await holdPrompt(rt, e.text, endedHere)
      if (!held) await captureFirstPrompt(rt, e.text)
    })
    if (!held) return next(e)
    $.ui.toast(HELD_TEXT)
    // ADR-010 A1: the engine leaves dropped text in the box; empty it once this hook has returned, or it may be sent twice.
    $.clock.after(0, () => { $.prompt.fill({ text: '', mode: 'replace' }).catch(() => {}) })
    return { drop: HELD_TEXT }
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
  // ST-6.4 / ADR-006: no compaction ahead of time while a task is managed; any other compaction runs (blocking it at the
  // limit would overflow), then the task hands over, with the nudge when Claude is idle (a manual /compact).
  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    if (e.trigger === 'precompute') {
      let skip = false
      await quietly($, opts, 'compact', async rt => { skip = await managedNow(rt) })
      return skip ? { skip: 'Jeeves hands this task over to a fresh conversation instead' } : next(e)
    }
    const r = await next(e)
    if (r.skip === undefined) await quietly($, opts, 'compacted', async rt => {
      await compacted(rt, e.trigger)
      if (!turnOpen) await nudgeIfWaiting(rt)
    })
    return r
  }).catch(($, e, next) => next(e))
  // ST-5.2: while this session owns an active task, the system prompt says how to report completion (ADR-007).
  on('prompt.compose', async ($, e, next) => {
    const base = await next(e)
    let text: string | null = null
    await quietly($, opts, 'compose', async rt => { text = await taskSection(rt) })
    return text === null ? base : { ...base, sections: [...base.sections, { id: 'jeeves:task', text, scope: 'session' }] }
  })
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
  // ST-6.2: an API error ended the main turn: pause with its code (a subagent's failure is its parent's to handle).
  on('classic.StopFailure', async ($, e, next) => {
    if (e.agent_id === undefined) await quietly($, opts, 'stop failure', rt => stopFailure(rt, e.error))
    return next(e)
  }).catch(($, e, next) => next(e))
  // ST-4.2: the fresh conversation of a rotation. ADR-003: the rotation is read and applied before next(e),
  // because $.command.run('clear') can resolve first.
  on('classic.SessionStart', async ($, e, next) => {
    let context: string | null = null
    if (e.source === 'clear') await quietly($, opts, 'fresh session', async rt => { context = await onFreshSession(rt, e.session_id, endedHere) })
    const base = await next(e)
    return context === null ? base : { ...base, additionalContext: [...(base.additionalContext ?? []), context] }
  }).catch(($, e, next) => next(e))
}
