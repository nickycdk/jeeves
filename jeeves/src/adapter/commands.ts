// /jeeves parsing and answers (ST-1.9, E2). Commands that change a task run only when the user typed them (FR-05).
import { capText, isThreshold, laterCap, THRESHOLD_MAX, THRESHOLD_MIN } from '../core/machine.ts'
import { heldPrompt } from '../core/continuation.ts'
import { suggestChecks } from '../core/suggest.ts'
import { taskText } from '../core/task.ts'
import { join } from '../core/paths.ts'
import { DEFAULT_CONFIG, ROTATION_STATES, type State } from '../core/types.ts'
import type { Runtime } from './runtime.ts'
import { addRevision, apply, claim, heldByOther, liveTasks, ownTask, projectTasks, readTask, nudgeIfWaiting, restoreHere, startTask, takeLock, type Task } from './task.ts'
import { recover, restoredText } from './recover.ts'
import { defaultsCommand, readDefaults } from './defaults.ts'
import { autoCommand, setSessionOff } from './auto.ts'
import { reasonLine, type AutoRow } from '../core/autostart.ts'
import { diagnose } from './diagnose.ts'
import { eligibility } from './eligible.ts'
import { fullHistory, statsText } from './history.ts'
import { purge } from './purge.ts'
import { firstActivationText, HELP, historyText, MSG, statusText } from './ui.ts'

export const PLUGIN = 'jeeves'
export const PRIMARY = 'jeeves'
export const FALLBACK = 'relay'

/** `jeeves` unless another plugin, the user or an MCP server already has it (ADR-009, amended by D-29). */
export function chooseCommandName(existing: readonly { name: string; plugin?: string }[]): typeof PRIMARY | typeof FALLBACK {
  return existing.some(c => c.name === PRIMARY && c.plugin !== PLUGIN) ? FALLBACK : PRIMARY
}

/** The task status shows: this session's active task, else the most recently updated one that is not DISABLED. */
export function pickTask<T extends { state: State }>(tasks: T[], sessionId: string): T | null {
  const live = tasks.filter(t => t.state.status !== 'DISABLED')
  const mine = live.find(t => t.state.activeSessionId === sessionId)
  return mine ?? live.sort((a, b) => b.state.updatedAt.localeCompare(a.state.updatedAt))[0] ?? null
}

/**
 * `userTyped` (`origin.kind === 'composer'`): the person pressed Enter; anything else (a plugin, a peer, the model) may
 * only read. `idle`: no main-loop turn is open, so a requested handover needs the nudge to get a Stop (ST-4.7).
 * `endedHere`: session ids this process ended (by /clear), whose locks it may hand on.
 */
export type Caller = { userTyped: boolean; idle?: boolean; endedHere: ReadonlySet<string>; autoRow?: AutoRow }

const CHANGES = new Set(['purge', 'later', 'on', 'off', 'dod', 'check', 'threshold', 'pause', 'resume', 'continue', 'rotate', 'done', 'recover', 'retry'])

export async function relay(rt: Runtime, args: string, caller: Caller): Promise<string> {
  const m = /^\s*(\S*)\s?([\s\S]*)$/.exec(args)!
  const sub = m[1]!.toLowerCase(), rest = m[2]!
  if (sub === '' || sub === 'status') {
    const { tasks, errors } = await projectTasks(rt)
    const me = await rt.port.sessionId()
    const picked = pickTask(tasks, me)
    const autoRow = caller.autoRow ?? 'default'
    if (rest.trim() === '--diagnose') return diagnose(rt, me, picked, errors, autoRow)
    // In the owning session show the live reading (never a stale one); another session's task shows its last stored reading.
    const task = picked?.state.activeSessionId === me ? { ...picked, state: { ...picked.state, lastContext: { ...(await rt.port.usage()), at: new Date(await rt.port.now()).toISOString() } } } : picked
    return statusText({ auto: task?.state.activeSessionId === me ? null : await autoLine(rt, autoRow), probe: rt.probe, stateRoot: rt.stateRoot, stateRootError: rt.stateRootError, task, taskError: task ? null : errors[0] ?? null, thresholdOverride: rt.thresholdOverride, thresholdRelative: rt.thresholdRelative, defaultsError: (await readDefaults(rt)).error })
  }
  if (sub === 'help') return HELP
  if (sub === 'history') {
    const { tasks } = await projectTasks(rt)
    const t = pickTask(tasks, await rt.port.sessionId()) ?? tasks[0]
    if (!t) return MSG.noTask
    const events = await rt.storage.readEvents(t.dir)
    const text = historyText(t.state, events)
    return rest.trim() === '--full' ? [text, ...(await fullHistory(rt, t.dir, t.state, events))].join('\n') : text
  }
  if (sub === 'stats') {
    const { tasks, errors } = await projectTasks(rt)
    return statsText(rt, tasks, errors.length, pickTask(tasks, await rt.port.sessionId()))
  }
  if (sub === 'task') {
    const own = ownTask((await projectTasks(rt)).tasks, await rt.port.sessionId())
    if (!own) return MSG.noTask
    if (own.state.taskRevision === 0) return MSG.waitingForPrompt
    const { view, errors } = await readTask(rt, own.dir, own.state)
    return [taskText(own.state.taskId, view), ...errors.map(e => `Warning: ${e}`)].join('\n')
  }
  if (sub === 'defaults') return defaultsCommand(rt, rest, caller.userTyped)
  if (sub === 'auto') return autoCommand(rt, rest, caller.userTyped, caller.autoRow ?? 'default')
  if (!CHANGES.has(sub)) return `Unknown command "${sub.slice(0, 20)}".\n${HELP}`
  if (!caller.userTyped) return MSG.userOnly
  const me = await rt.port.sessionId()
  // purge --all needs only the state folder, not this project (git may not have answered).
  if (sub === 'purge') return purge(rt, me, rest)
  // ST-13.2: /jeeves off also keeps auto-start off for the rest of this session, with or without a task.
  if (sub === 'off') await setSessionOff(rt)
  // R-25: no rotation can finish without the Stop hook, and none starts on an unsupported version.
  if (rt.probe.mode === 'unsupported' && ['on', 'resume', 'rotate', 'retry'].includes(sub)) return rt.probe.message ?? MSG.unsupported
  if (!rt.projectDir) return MSG.noProject(rt.stateRootError)
  const { tasks } = await projectTasks(rt)
  switch (sub) {
    case 'on': return on(rt, tasks, me, rest)
    case 'off': return off(rt, tasks, me)
    case 'threshold': return threshold(rt, tasks, me, rest.trim())
    case 'pause': return pause(rt, tasks, me)
    case 'resume': return resume(rt, tasks, me)
    case 'continue': return continueHere(rt, tasks, me, caller.endedHere)
    case 'rotate': return rotate(rt, tasks, me, caller.idle === true)
    case 'later': return later(rt, tasks, me)
    case 'done': return confirmDone(rt, tasks, me, caller.endedHere)
    case 'retry': return retry(rt, tasks, me, caller.idle === true)
    case 'recover': return rest.trim() === '' || rest.trim() === '--relink' ? recover(rt, me, caller.endedHere, rest.trim() === '--relink') : MSG.recoverUsage
    default: return revise(rt, tasks, me, sub as 'dod' | 'check', rest)
  }
}

async function on(rt: Runtime, tasks: Task[], me: string, rest: string): Promise<string> {
  const own = ownTask(tasks, me)
  // ST-13.7 (spec §5.7): a goal typed during an auto task makes it explicit; the goal is the user's next revision.
  if (own?.state.origin === 'auto' && rest.trim()) {
    const n = await addRevision(rt, own.dir, 'goal', rest.replace(/^\s+/, ''))
    if (typeof n !== 'number') return MSG.waitingForPrompt
    await apply(rt, own.dir, { type: 'EXPLICIT' })
    return MSG.madeExplicit(own.state.taskId, n)
  }
  if (own) return MSG.alreadyOn(own.state)
  // ST-6.6 (02 §7): a task no session runs is offered back first; a running session's task stays its own, and this
  // session starts a separate one.
  const others = liveTasks(tasks)
  for (const t of others) if (!(await heldByOther(rt, t.dir, me))) return MSG.leftBehind(t.state)
  const busy = others[0]?.state.taskId ?? null
  // The goal is everything after "on " as typed; only the separating whitespace is dropped.
  const goal = rest.replace(/^\s+/, '')
  // ST-11.1: this project's defaults; an unreadable file is ignored and said.
  const defaults = await readDefaults(rt)
  const r = await startTask(rt, me, goal.trim() ? goal : null, defaults.value?.thresholdPercent)
  if (r.state.status !== 'MONITORING') return MSG.lockHeld(r.state.taskId)
  // As /jeeves check writes them: after the goal (rev 2..), or queued until the first prompt.
  for (const cmd of defaults.value?.verificationCommands ?? []) await addRevision(rt, r.dir, 'check', cmd)
  if (goal.trim()) rt.port.submitPromptSoon(goal, err => rt.port.toast(MSG.submitFailed(err)))
  return [...(busy ? [MSG.separateTask(busy)] : []), MSG.turnedOn(r.state.taskId, goal.trim() !== ''), ...(defaults.error ? [MSG.defaultsIgnored] : []), ...(await suggestions(rt, defaults.value?.verificationCommands.length ?? 0)), ...(await firstActivationNotice(rt))].join('\n')
}

async function off(rt: Runtime, tasks: Task[], me: string): Promise<string> {
  const target = ownTask(tasks, me) ?? tasks.find(t => t.state.status !== 'DISABLED') ?? null
  if (!target) return MSG.autoOffSession
  if (!(await claim(rt, target.dir, me))) return MSG.lockHeld(target.state.taskId)
  await apply(rt, target.dir, { type: 'OFF', sessionId: me })
  return MSG.turnedOff(target.state.taskId, target.dir)
}

async function pause(rt: Runtime, tasks: Task[], me: string): Promise<string> {
  const own = ownTask(tasks, me)
  if (!own) return MSG.noTask
  const r = await apply(rt, own.dir, { type: 'PAUSE' })
  if (!r) return MSG.noTask
  if (r.state.status === 'PAUSED') return MSG.paused(own.state.status === 'ROTATION_REQUESTED' || own.state.status === 'QUIESCING')
  return r.state.pauseRequested ? MSG.pauseDeferred : MSG.notPausable(r.state.status)
}

/** This session's paused task, else the project's latest paused one (a pause survives a restart, FR-11). */
async function resume(rt: Runtime, tasks: Task[], me: string): Promise<string> {
  const own = ownTask(tasks, me)
  const resumable = (s: State) => s.status === 'PAUSED' || (s.status === 'BLOCKED' && s.reason === 'DISK')
  const target = own && resumable(own.state) ? own : own ? null : tasks.find(t => resumable(t.state)) ?? null
  if (!target) return own ? MSG.notPaused(own.state.status) : MSG.noTask
  // Only the lock holder writes the task: a live owner elsewhere gets LOCK_HELD and nothing is written.
  if (!(await claim(rt, target.dir, me))) return MSG.lockHeld(target.state.taskId)
  if (target.state.reason === 'USER_CLEAR') {
    // Restore path: this conversation is fresh; the task and its last handover go in as the next prompt.
    return restoredText(await restoreHere(rt, target.dir, { type: 'RESUME', lockOk: true, sessionId: me }), MSG.restored(target.state.taskId), MSG.noTask)
  }
  const r = await apply(rt, target.dir, { type: 'RESUME', lockOk: true, sessionId: me })
  if (!r) return MSG.noTask
  const held = r.forHook.find(f => f.type === 'SUBMIT_HELD')
  if (held?.type === 'SUBMIT_HELD') rt.port.submitPromptSoon(heldPrompt(held.heldPrompts), err => rt.port.toast(MSG.heldNotSent(err, held.heldPrompts)))
  return MSG.resumed(target.state.thresholdPercent, rt.thresholdOverride)
}

/** ST-4.7 / FR-11: hand over now, through exactly the threshold's pipeline (same reducer path, same nudge when idle). */
async function rotate(rt: Runtime, tasks: Task[], me: string, idle: boolean): Promise<string> {
  const own = ownTask(tasks, me)
  if (!own) return MSG.noTask
  const r = await apply(rt, own.dir, { type: 'ROTATE_CMD' })
  const requested = r?.state.status === 'ROTATION_REQUESTED' && r.state.rotation?.rotationId !== own.state.rotation?.rotationId
  if (!requested) return MSG.notRotatable(r?.state.status ?? own.state.status)
  if (idle) await nudgeIfWaiting(rt)
  return MSG.rotateRequested
}

/**
 * ST-13.5 (spec §5.5): skip the next handover. The cap is read at each `later` (a model switch moves the
 * auto-compaction point); a rotation already under way is not stopped.
 */
async function later(rt: Runtime, tasks: Task[], me: string): Promise<string> {
  const own = ownTask(tasks, me)
  if (!own) return MSG.noTask
  if (own.state.status !== 'MONITORING') return MSG.laterRefused(own.state.status, ROTATION_STATES.includes(own.state.status))
  const u = await rt.port.usage().catch(() => null)
  const cap = laterCap(u?.window ?? 0, await rt.port.autoCompactTokens())
  const r = await apply(rt, own.dir, { type: 'LATER', cap })
  const t = r?.state.thresholdPercent ?? own.state.thresholdPercent
  if (t === own.state.thresholdPercent) return capText(t, u?.percent)
  return MSG.postponed(t, t - DEFAULT_CONFIG.warnBeforePercent, t >= cap)
}

const retryable = (s: State) => s.status === 'NEEDS_REVIEW' && (s.reason === 'HANDOVER_INVALID' || s.reason === 'POSSIBLE_LOOP')

/** ST-10.2 / ST-10.3 (ADR-009 A2): this session's own task only; another session's is LOCK_HELD, nothing written. */
async function retry(rt: Runtime, tasks: Task[], me: string, idle: boolean): Promise<string> {
  const own = ownTask(tasks, me)
  if (!own || !retryable(own.state)) {
    const other = tasks.find(t => retryable(t.state) && t.state.activeSessionId !== me)
    return other ? MSG.lockHeld(other.state.taskId) : MSG.nothingToRetry
  }
  const r = await apply(rt, own.dir, { type: 'RETRY_CMD' })
  if (!r) return MSG.noTask
  if (r.state.status === 'MONITORING') return MSG.retryWatching
  // The reducer refuses a retry only when the failure limit is used up (the task is retryable here).
  if (r.state.status !== 'ROTATION_REQUESTED') return MSG.retryUsedUp(r.state.consecutiveFailures)
  if (idle) await nudgeIfWaiting(rt)
  return MSG.retryRequested
}

/** ST-5.2 / ADR-007: the user confirms a completion that checks could not verify (recorded as the user's decision). */
async function confirmDone(rt: Runtime, tasks: Task[], me: string, endedHere: ReadonlySet<string>): Promise<string> {
  const target = tasks.find(t => t.state.status === 'NEEDS_REVIEW' && t.state.reason === 'DOD_UNMET')
  if (!target) return MSG.nothingToConfirm
  if (!(await takeLock(rt, target.dir, target.state.activeSessionId, me, endedHere))) return MSG.lockHeld(target.state.taskId)
  const r = await apply(rt, target.dir, { type: 'DONE_CMD', sessionId: me })
  return r?.state.status === 'COMPLETED' ? MSG.confirmedDone(target.state.taskId) : MSG.nothingToConfirm
}

/** Assisted mode (ST-4.6, ADR-002): after the user's /clear, continue the task whose handover waits, in this fresh conversation. */
async function continueHere(rt: Runtime, tasks: Task[], me: string, endedHere: ReadonlySet<string>): Promise<string> {
  const target = tasks.find(t => t.state.status === 'NEEDS_REVIEW' && t.state.reason === 'ROTATE_UNAVAILABLE')
  if (!target) return MSG.nothingToContinue
  if ((await rt.port.turns()) > 0) return MSG.continueNeedsFresh
  if (!(await takeLock(rt, target.dir, target.state.activeSessionId, me, endedHere))) return MSG.lockHeld(target.state.taskId)
  return restoredText(await restoreHere(rt, target.dir, { type: 'CONTINUE_CMD', sessionId: me }), MSG.restored(target.state.taskId), MSG.nothingToContinue)
}

async function threshold(rt: Runtime, tasks: Task[], me: string, arg: string): Promise<string> {
  const n = /^\d+$/.test(arg) ? Number(arg) : NaN
  if (!isThreshold(n)) return MSG.thresholdRange(arg, THRESHOLD_MIN, THRESHOLD_MAX)
  const own = ownTask(tasks, me)
  if (!own) return MSG.noTask
  await apply(rt, own.dir, { type: 'SET_THRESHOLD', percent: n })
  return MSG.thresholdSet(n, rt.thresholdOverride)
}

async function revise(rt: Runtime, tasks: Task[], me: string, kind: 'dod' | 'check', text: string): Promise<string> {
  if (!text.trim()) return MSG.reviseUsage(kind)
  const own = ownTask(tasks, me)
  if (!own) return MSG.noTask
  // Stored exactly as typed after the subcommand; a check command is text only and is never run here (FR-16).
  const n = await addRevision(rt, own.dir, kind, text.replace(/^\s+/, ''))
  return n === null ? MSG.waitingForPrompt : n === 'pending' ? MSG.revisePending(kind) : MSG.revised(n, kind)
}

/** ST-11.2: one line of check commands found in the repository, when the task starts with none. Never run or added. */
async function suggestions(rt: Runtime, checks: number): Promise<string[]> {
  if (checks > 0 || !rt.identity) return []
  const root = rt.identity.kind === 'git' ? rt.identity.worktree : rt.identity.cwd
  const read = (f: string) => rt.port.read(join(root, f)).catch(() => null)
  const s = suggestChecks(await read('package.json'), await read('Makefile'))
  return s.length ? [MSG.suggestedChecks(s)] : []
}

/** First `/jeeves on` on this machine (spec §4.1): where state lives, that a fresh conversation starts by itself, how to pause. */
async function firstActivationNotice(rt: Runtime): Promise<string[]> {
  return (await rt.port.firstActivation()) ? firstActivationText(rt.stateRoot ?? '', rt.probe.mode === 'assisted') : []
}

/** ST-13.3: the status line on auto-start: the first reason this session is not watched, else where "on" came from. */
async function autoLine(rt: Runtime, row: AutoRow): Promise<string> {
  const e = await eligibility(rt, row)
  return reasonLine(e.reasons) ?? `Auto-start: on (${e.auto.source})`
}
