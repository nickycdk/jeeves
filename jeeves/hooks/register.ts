// Wires engine events to the adapter; no logic here (02 §3).
import type { CommandRunInput, EngineInterface, Register, Timer, ToolCallInput, ToolCallResult } from 'claude-code'
import type { ToolOutcome } from '../src/core/evidence.ts'
import { chooseCommandName, FALLBACK, PRIMARY, relay } from '../src/adapter/commands.ts'
import { recover, recoveryNotice } from '../src/adapter/recover.ts'
import { cleanupAuto } from '../src/adapter/purge.ts'
import { upgradeCheck } from '../src/adapter/auto.ts'
import { autoNotice, carryOver, carryUndecided, decideAtStart, forget, hint, startAuto } from '../src/adapter/eligible.ts'
import { isAutoRow } from '../src/core/autostart.ts'
import { bgNotified, bgStarted, markStopSkipped, runtime, type Options } from '../src/adapter/runtime.ts'
import { captureFirstPrompt, compacted, completionRow, heartbeat, managedNow, holdPrompt, measure, nudgeIfWaiting, onFreshSession, onStop, onTurnComplete, taskSection, turnBoundary, onUserClear, recordTool, releaseOnExit, stopFailure, why } from '../src/adapter/task.ts'
import { HEARTBEAT_MS } from '../src/core/lock.ts'
import { ARGUMENT_HINT, HELD_TEXT, MSG, offStatus } from '../src/adapter/ui.ts'


async function answer($: EngineInterface, opts: Options, e: CommandRunInput, idle: boolean, endedHere: ReadonlySet<string>) {
  await quietly($, opts, 'carry-over', rt => carryUndecided(rt, endedHere))
  try { return { text: await relay(await runtime($, opts), e.args, { userTyped: e.origin.kind === 'composer', idle, endedHere, autoRow: opts.autoStart ?? 'default' }) } } catch (err) {
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
  const opts: Options = {
    stateDir: typeof options.stateDir === 'string' && options.stateDir ? options.stateDir : undefined, autoRecover: options.autoRecover === true,
    autoStart: isAutoRow(options.autoStart) ? options.autoStart : 'default',
  }
  // Which name this process registered; rebuilt by session.start after a reload.
  let commandName: typeof PRIMARY | typeof FALLBACK | null = null
  let beat: Timer | null = null
  // Whether a main-loop turn is open: engine state, not task state. Starts idle (a reload mid-turn at worst queues one nudge).
  let turnOpen = false
  // ADR-007 A1: a main turn started in turn mode whose completion row is not decided yet (sent at its first reading).
  let rowDue = false
  // R-25: whether this main turn's classic.Stop reached Jeeves.
  let stopSeen = true
  let warnedSkip = false
  // Session ids this process ended (/clear): process identity, so a lock is handed on only from our own past session.
  const endedHere = new Set<string>()

  on('session.start', async ($, e, next) => {
    const rt = await runtime($, opts, true)
    commandName = chooseCommandName(await $.command.list())
    await $.command.register({ name: commandName, description: 'Jeeves: keep a long task going across fresh conversations', argumentHint: ARGUMENT_HINT })
    if (commandName === FALLBACK) $.ui.toast('/jeeves is taken by another command, so Jeeves uses /relay.')
    if (rt.probe.mode !== 'full' && rt.probe.message) {
      $.ui.status(offStatus(rt.probe))
      // A refusal in turn mode was said when it happened; a later session start in this process only restores the status.
      if (rt.probe.boundary !== 'turn') $.ui.toast(rt.probe.message)
    }
    // ST-13.2 (spec §5.6): the upgrade check, once per install; an upgrader hears once that auto-start waits for them.
    await quietly($, opts, 'upgrade check', async rt => { if ((await upgradeCheck(rt))?.notice) rt.port.toast(MSG.upgradeNotice) })
    // ST-13.3 (spec §5.1): whether this session may be auto-watched, decided once (a reload keeps it).
    await quietly($, opts, 'eligibility', rt => decideAtStart(rt, e.isInteractive))
    // ST-13.4 (spec §5.4): before any recording, so the same session is watched from its first typed prompt.
    await quietly($, opts, 'auto notice', rt => autoNotice(rt, opts.autoStart ?? 'default'))
    // ST-13.8 (spec §5.9): ended auto tasks without a rotation go 7 days after their last update, auto-start on or off.
    await quietly($, opts, 'cleanup', async rt => { await cleanupAuto(rt) })
    // ST-6.1: a task an earlier session left (crash, exit mid-rotation) is named once; autoRecover continues it.
    // ST-13.7 (spec §5.8): an auto task cut off mid-rotation continues by itself, but only in an interactive, full-mode,
    // fresh conversation; under -p, assisted or resumed it waits.
    await quietly($, opts, 'recovery scan', async rt => {
      const n = await recoveryNotice(rt)
      if (!n) return
      const autoOk = n.auto && e.isInteractive && rt.probe.mode === 'full' && (await rt.port.turns()) === 0
      if (n.recover && (opts.autoRecover || autoOk)) rt.port.toast(await recover(rt, await rt.port.sessionId(), endedHere))
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
      if (rowDue && rt.probe.boundary === 'turn' && rt.probe.mode !== 'unsupported' && await completionRow(rt)) rowDue = false
      // ST-14.1: no task of this session's own took the reading, so it may be one for the hint.
      if (!(await measure(rt, e.context))) await hint(rt, opts.autoStart ?? 'default', e.context)
      // Q-10: a reading that crosses the threshold after the turn ended finds Claude idle (D-23).
      if (!turnOpen) await nudgeIfWaiting(rt)
    })
    return next(e)
  })
  // A user's /clear pauses the task (USER_CLEAR); any other end gives the lock up, state untouched.
  on('session.end', async ($, e, next) => {
    endedHere.add(e.sessionId)
    await quietly($, opts, 'session end', async rt => {
      if (e.reason === 'clear') return onUserClear(rt, e.sessionId)
      await releaseOnExit(rt, e.sessionId)
      await forget(rt, e.sessionId)
    })
    return next(e)
  })
  // ST-2.1: the person's first prompt after `/jeeves on` (no goal) is the task, byte for byte. Slash commands are not.
  // ST-4.4: during a handover a typed prompt is held for the fresh conversation; slash commands still run.
  on('prompt.submit', async ($, e, next) => {
    // ADR-004 A2: a background task's notification ends it in turn mode's record (kept in every mode, it costs nothing).
    if (e.origin.kind === 'task-notification') bgNotified(e.text)
    if (e.origin.kind !== 'composer' || e.command || e.isMeta) return next(e)
    let held = false
    await quietly($, opts, 'carry-over', rt => carryUndecided(rt, endedHere))
    await quietly($, opts, 'hold', async rt => { held = await holdPrompt(rt, e.text, endedHere) })
    // ST-13.4: an eligible session's first typed prompt starts its auto task, word for word; else the usual capture.
    if (!held) await quietly($, opts, 'auto start', rt => startAuto(rt, e.text, opts.autoStart ?? 'default'))
    if (!held) await quietly($, opts, 'capture', rt => captureFirstPrompt(rt, e.text))
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
    const bg = (r.result as { backgroundTaskId?: unknown } | undefined)?.backgroundTaskId
    if (e.agentId === undefined && typeof bg === 'string') bgStarted(bg)
    void quietly($, opts, 'ledger', rt => recordTool(rt, outcome(e, r)))
    return r
  }).catch(($, e, next) => next(e))
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      turnOpen = true
      stopSeen = false
      // ADR-007 A1: turn mode's completion rules go in at this turn's first reading (ST-16.8: a row appended at
      // turn.start does not reach any request of its own turn, live).
      rowDue = true
    }
    return next(e)
  })
  // ST-4.1: after the handover turn, /clear; an interrupt during a handover pauses; an idle request gets its nudge.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      turnOpen = false
      if (stopSeen === false && e.reason === 'answer' && !e.isAborted && !warnedSkip) {
        warnedSkip = true
        // ADR-002 A3: turn mode from here on; tasks, auto ones too, carry on (ST-16.1). A version refusal stays as it is.
        await quietly($, opts, 'stop skipped', async rt => {
          markStopSkipped(rt)
          rt.port.log('jeeves: Stop hook skipped, turn mode')
        })
      }
      // ADR-004 A2: in turn mode this is the boundary; a rotation requested before the skip was seen is taken over here.
      if (e.reason === 'answer' && !e.isAborted) await quietly($, opts, 'turn boundary', async rt => {
        if (rt.probe.boundary === 'turn' && rt.probe.mode !== 'unsupported') await turnBoundary(rt, e.answer)
      })
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
    if (e.agent_id === undefined) stopSeen = true
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
    if (e.source === 'clear') await quietly($, opts, 'fresh session', async rt => {
      await carryOver(rt, e.session_id, endedHere)
      context = await onFreshSession(rt, e.session_id, endedHere)
    })
    const base = await next(e)
    return context === null ? base : { ...base, additionalContext: [...(base.additionalContext ?? []), context] }
  }).catch(($, e, next) => next(e))
}
