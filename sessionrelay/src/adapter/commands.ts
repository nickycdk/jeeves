// /relay parsing and answers (ST-1.9, E2). Commands that change a task run only when the user typed them (FR-05).
import { taskText } from '../core/task.ts'
import type { State } from '../core/types.ts'
import type { Runtime } from './runtime.ts'
import { addRevision, apply, claim, heldByOther, liveTask, ownTask, projectTasks, readTask, startTask, type Task } from './task.ts'
import { HELP, MSG, statusText } from './ui.ts'

export const PLUGIN = 'sessionrelay'
export const PRIMARY = 'relay'
export const FALLBACK = 'sessionrelay'

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

/** `origin.kind === 'composer'`: the person pressed Enter. Anything else (a plugin, a peer, the model) may only read. */
export type Caller = { userTyped: boolean }

const CHANGES = new Set(['on', 'off', 'dod', 'check'])

export async function relay(rt: Runtime, args: string, caller: Caller): Promise<string> {
  const m = /^\s*(\S*)\s?([\s\S]*)$/.exec(args)!
  const sub = m[1]!.toLowerCase(), rest = m[2]!
  if (sub === '' || sub === 'status') {
    const { tasks, errors } = await projectTasks(rt)
    const me = await rt.port.sessionId()
    const picked = pickTask(tasks, me)
    // In the owning session show the live reading (never a stale one); another session's task shows its last stored reading.
    const task = picked?.state.activeSessionId === me ? { ...picked, state: { ...picked.state, lastContext: { ...(await rt.port.usage()), at: new Date(await rt.port.now()).toISOString() } } } : picked
    return statusText({ probe: rt.probe, stateRoot: rt.stateRoot, stateRootError: rt.stateRootError, task, taskError: task ? null : errors[0] ?? null })
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

async function revise(rt: Runtime, tasks: Task[], me: string, kind: 'dod' | 'check', text: string): Promise<string> {
  if (!text.trim()) return MSG.reviseUsage(kind)
  const own = ownTask(tasks, me)
  if (!own) return MSG.noTask
  // Stored exactly as typed after the subcommand; a check command is text only and is never run here (FR-16).
  const n = await addRevision(rt, own.dir, kind, text.replace(/^\s+/, ''))
  return n === null ? MSG.waitingForPrompt : MSG.revised(n, kind)
}

/** First `/relay on` on this machine: the notice of ST-7.3. Hook point; the text and the once-only flag land there. */
async function firstActivationNotice(_rt: Runtime): Promise<string[]> {
  return []
}
