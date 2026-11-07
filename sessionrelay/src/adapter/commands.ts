// /relay parsing and answers (ST-1.9). Later subcommands (on, off, rotate, ...) arrive with their stories.
import { join } from '../core/paths.ts'
import type { State } from '../core/types.ts'
import { projectDir, projectId, repoIdentity } from './git.ts'
import type { Runtime } from './runtime.ts'
import { HELP, statusText } from './ui.ts'

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

async function currentTask(rt: Runtime): Promise<{ task: { state: State; dir: string } | null; error: string | null }> {
  if (!rt.stateRoot) return { task: null, error: null }
  const id = await repoIdentity(rt.port, await rt.port.cwd())
  if (!id) return { task: null, error: null }
  const tasksDir = join(projectDir(rt.stateRoot, await projectId(id)), 'tasks')
  const found: { state: State; dir: string }[] = []
  let error: string | null = null
  for (const name of await rt.port.listDirs(tasksDir)) {
    const dir = join(tasksDir, name)
    const r = await rt.storage.readState(dir).catch(err => ({ ok: false as const, errors: [String(err)] }))
    if (r === null) continue
    if (r.ok) found.push({ state: r.value, dir })
    else error = `${name}: ${r.errors[0] ?? 'invalid'}`
  }
  const task = pickTask(found, await rt.port.sessionId())
  return { task, error: task ? null : error }
}

export async function relay(rt: Runtime, args: string): Promise<string> {
  const sub = args.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  if (sub === '' || sub === 'status') {
    const { task, error } = await currentTask(rt)
    return statusText({ probe: rt.probe, stateRoot: rt.stateRoot, stateRootError: rt.stateRootError, task, taskError: error })
  }
  if (sub === 'help') return HELP
  return `Unknown command "${sub.slice(0, 20)}".\n${HELP}`
}
