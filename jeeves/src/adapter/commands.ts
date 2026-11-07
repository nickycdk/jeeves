// /relay parsing and answers (ST-1.9, E2). Commands that change a task run only when the user typed them (FR-05).
import { isThreshold, THRESHOLD_MAX, THRESHOLD_MIN } from '../core/machine.ts'
import { taskText } from '../core/task.ts'
import type { State } from '../core/types.ts'
import type { Runtime } from './runtime.ts'
import { addRevision, apply, claim, heldByOther, liveTask, ownTask, projectTasks, readTask, nudgeIfWaiting, restoreHere, startTask, takeLock, type Task } from './task.ts'
import { recover } from './recover.ts'
import { firstActivationText, HELP, MSG, statusText } from './ui.ts'

export const PLUGIN = 'jeeves'
export const PRIMARY = 'relay'
export const FALLBACK = 'jeeves'

/** `relay` unless another plugin, the user or an MCP server already has it (ADR-009). */
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
export type Caller = { userTyped: boolean; idle?: boolean; endedHere: ReadonlySet<string> }

const CHANGES = new Set(['on', 'off', 'dod', 'check', 'threshold', 'pause', 'resume', 'continue', 'rotate', 'done', 'recover'])

export async function relay(rt: Runtime, args: string, caller: Caller): Promise<string> {
  const m = /^\s*(\S*)\s?([\s\S]*)$/.exec(args)!
  const sub = m[1]!.toLowerCase(), rest = m[2]!
  if (sub === '' || sub === 'status') {
    const { tasks, errors } = await projectTasks(rt)
    const me = await rt.port.sessionId()
    const picked = pickTask(tasks, me)
    // In the owning session show the live reading (never a stale one); another session's task shows its last stored reading.
    const task = picked?.state.activeSessionId === me ? { ...picked, state: { ...picked.state, lastContext: { ...(await rt.port.usage()), at: new Date(await rt.port.now()).toISOString() } } } : picked
    return statusText({ probe: rt.probe, stateRoot: rt.stateRoot, stateRootError: rt.stateRootError, task, taskError: task ? null : errors[0] ?? null, thresholdOverride: rt.thresholdOverride, thresholdRelative: rt.thresholdRelative })
  }
  if (sub === 'help') return HELP
  if (sub === 'task') {
    const own = ownTask((await projectTasks(rt)).tasks, await rt.port.sessionId())
    if (!own) return MSG.noTask
    if (own.state.taskRevision === 0) return MSG.waitingForPrompt
    const { view, errors } = await readTask(rt, own.dir, own.state)
    return [taskText(own.state.taskId, view), ...errors.map(e => `Warning: ${e}`)].join('\n')
  }
  if (!CHANGES.has(sub)) return `Unknown command "${sub.slice(0, 20)}".\n${HELP}`
  if (!caller.userTyped) return MSG.userOnly
  if (!rt.projectDir) return MSG.noProject(rt.stateRootError)
  const me = await rt.port.sessionId()
  const { tasks } = await projectTasks(rt)
  switch (sub) {
    case 'on': return on(rt, tasks, me, rest)
    case 'off': return off(rt, tasks, me)
    case 'threshold': return threshold(rt, tasks, me, rest.trim())
    case 'pause': return pause(rt, tasks, me)
    case 'resume': return resume(rt, tasks, me)
    case 'continue': return continueHere(rt, tasks, me, caller.endedHere)
    case 'rotate': return rotate(rt, tasks, me, caller.idle === true)
    case 'done': return confirmDone(rt, tasks, me, caller.endedHere)
    case 'recover': return recover(rt, me, caller.endedHere, rest.trim() === '--relink')
    default: return revise(rt, tasks, me, sub as 'dod' | 'check', rest)
  }
}

async function on(rt: Runtime, tasks: Task[], me: string, rest: string): Promise<string> {
  if (rt.probe.mode === 'unsupported') return rt.probe.message ?? MSG.unsupported
  const own = ownTask(tasks, me)
  if (own) return MSG.alreadyOn(own.state)
  const other = liveTask(tasks)
  if (other) return (await heldByOther(rt, other.dir, me)) ? MSG.lockHeld(other.state.taskId) : MSG.leftBehind(other.state)
  // The goal is everything after "on " as typed; only the separating whitespace is dropped.
  const goal = rest.replace(/^\s+/, '')
  const r = await startTask(rt, me, goal.trim() ? goal : null)
  if (r.state.status !== 'MONITORING') return MSG.lockHeld(r.state.taskId)
  if (goal.trim()) rt.port.submitPromptSoon(goal, err => rt.port.toast(MSG.submitFailed(err)))
  return [MSG.turnedOn(r.state.taskId, goal.trim() !== ''), ...(await firstActivationNotice(rt))].join('\n')
}

async function off(rt: Runtime, tasks: Task[], me: string): Promise<string> {
  const target = ownTask(tasks, me) ?? tasks.find(t => t.state.status !== 'DISABLED') ?? null
  if (!target) return MSG.noTask
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
    const r = await restoreHere(rt, target.dir, { type: 'RESUME', lockOk: true, sessionId: me })
    if (r !== null && typeof r === 'object') return MSG.repoMismatch(r.mismatch.expected, r.mismatch.actual)
    return r === 'restored' ? MSG.restored(target.state.taskId) : r === 'unverified' ? MSG.handoverUnverified : MSG.noTask
  }
  const r = await apply(rt, target.dir, { type: 'RESUME', lockOk: true, sessionId: me })
  if (!r) return MSG.noTask
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
  const r = await restoreHere(rt, target.dir, { type: 'CONTINUE_CMD', sessionId: me })
  if (r !== null && typeof r === 'object') return MSG.repoMismatch(r.mismatch.expected, r.mismatch.actual)
  return r === 'restored' ? MSG.restored(target.state.taskId) : r === 'unverified' ? MSG.handoverUnverified : MSG.nothingToContinue
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

/** First `/relay on` on this machine (spec §4.1): where state lives, that a fresh conversation starts by itself, how to pause. */
async function firstActivationNotice(rt: Runtime): Promise<string[]> {
  return (await rt.port.firstActivation()) ? firstActivationText(rt.stateRoot ?? '', rt.probe.mode === 'assisted') : []
}
