// /relay parsing and answers (ST-1.9, E2). Commands that change a task run only when the user typed them (FR-05).
import type { State } from '../core/types.ts'
import type { Runtime } from './runtime.ts'
import { apply, claim, heldByOther, liveTask, ownTask, projectTasks, startTask, type Task } from './task.ts'
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

const CHANGES = new Set(['on', 'off'])

export async function relay(rt: Runtime, args: string, caller: Caller): Promise<string> {
  const m = /^\s*(\S*)\s?([\s\S]*)$/.exec(args)!
  const sub = m[1]!.toLowerCase(), rest = m[2]!
  if (sub === '' || sub === 'status') {
    const { tasks, errors } = await projectTasks(rt)
    const task = pickTask(tasks, await rt.port.sessionId())
    return statusText({ probe: rt.probe, stateRoot: rt.stateRoot, stateRootError: rt.stateRootError, task, taskError: task ? null : errors[0] ?? null })
  }
  if (sub === 'help') return HELP
  if (!CHANGES.has(sub)) return `Unknown command "${sub.slice(0, 20)}".\n${HELP}`
  if (!caller.userTyped) return MSG.userOnly
  if (!rt.projectDir) return MSG.noProject(rt.stateRootError)
  const me = await rt.port.sessionId()
  const { tasks } = await projectTasks(rt)
  switch (sub) {
    case 'on': return on(rt, tasks, me, rest)
    default: return off(rt, tasks, me)
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

/** First `/relay on` on this machine: the notice of ST-7.3. Hook point; the text and the once-only flag land there. */
async function firstActivationNotice(_rt: Runtime): Promise<string[]> {
  return []
}
