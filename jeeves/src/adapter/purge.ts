// `/jeeves purge` (ST-8.1, PRIVACY.md): deletes task files on request, in two typed steps. The first names the scope
// and lists what would go, with a short code; `/jeeves purge confirm <code>` within 2 minutes deletes it. Only folders
// under <state root>/projects are ever removed, never the state root itself (it may be a folder the user chose).
import { join } from '../core/paths.ts'
import type { Runtime } from './runtime.ts'
import { liveTasks, projectTasks, type Task } from './task.ts'

const CONFIRM_MS = 120_000
export const PURGE_USAGE = 'Usage: /jeeves purge --task <id> | --project | --all. Jeeves lists what would be deleted and asks you to confirm with a code.'

/** The purge waiting for its code, in this process only. */
let pending: { code: string; paths: string[]; what: string; until: number } | null = null

const code = () => [...crypto.getRandomValues(new Uint8Array(2))].map(b => b.toString(16).padStart(2, '0')).join('')

export async function purge(rt: Runtime, me: string, args: string): Promise<string> {
  const [flag, value, extra] = args.trim().split(/\s+/)
  if (!rt.stateRoot) return 'Nothing to purge: Jeeves has no state folder.'
  const now = await rt.port.now()
  if (flag === 'confirm') {
    const p = pending
    pending = null // one try per code: a wrong one cancels it
    if (!p || value !== p.code || now > p.until || extra) return 'No purge waits for that code (codes last 2 minutes). Start again with /jeeves purge.'
    const root = join(rt.stateRoot, 'projects') + '/'
    const failed: string[] = []
    for (const path of p.paths) {
      // A last guard: never delete outside <state root>/projects, whatever built the list.
      if (!path.startsWith(root) || path.includes('/../')) { failed.push(path); continue }
      const r = await rt.port.run(['rm', '-rf', path], { timeoutMs: 30_000 }).catch(err => ({ exitCode: -1, stderr: String(err), stdout: '' }))
      if (r.exitCode !== 0) failed.push(path)
    }
    return failed.length ? `Deleted ${p.what}, except: ${failed.join(', ')}` : `Deleted ${p.what}.`
  }
  pending = null
  const scope = await targets(rt, me, flag, value)
  if (typeof scope === 'string') return scope
  if (!scope.paths.length) return `Nothing to purge for ${scope.what}.`
  pending = { code: code(), paths: scope.paths, what: scope.what, until: now + CONFIRM_MS }
  return [
    `This deletes ${scope.what}, for good:`,
    ...scope.paths.map(p => `  ${p}`),
    `To delete, type: /jeeves purge confirm ${pending.code}  (within 2 minutes)`,
  ].join('\n')
}

async function targets(rt: Runtime, me: string, flag: string | undefined, value: string | undefined): Promise<{ paths: string[]; what: string } | string> {
  const projects = join(rt.stateRoot!, 'projects')
  if (flag === '--task' && value) {
    if (!rt.projectDir) return PURGE_USAGE
    // Only a folder that exists under this project's tasks/ by that exact name: no path from the argument is used.
    if (!(await rt.port.listDirs(join(rt.projectDir, 'tasks'))).includes(value)) return `No task ${value.slice(0, 40)} in this project. /jeeves history shows the current one.`
    const t = (await projectTasks(rt)).tasks.find(x => x.dir === join(rt.projectDir!, 'tasks', value))
    const busy = t ? await refusal(rt, me, [t]) : null
    return busy ?? { paths: [join(rt.projectDir, 'tasks', value)], what: `task ${value}` }
  }
  if (flag === '--project' && !value) {
    if (!rt.projectDir) return PURGE_USAGE
    const busy = await refusal(rt, me, (await projectTasks(rt)).tasks)
    if (busy) return busy
    return { paths: (await rt.port.exists(rt.projectDir)) ? [rt.projectDir] : [], what: "this project's Jeeves files" }
  }
  if (flag === '--all' && !value) {
    if (rt.projectDir) { const busy = await refusal(rt, me, (await projectTasks(rt)).tasks); if (busy) return busy }
    // Every other project too: a live lock anywhere (another session at work) stops the whole purge.
    for (const p of await rt.port.listDirs(projects)) {
      for (const id of await rt.port.listDirs(join(projects, p, 'tasks'))) {
        const l = await rt.storage.readLock(join(projects, p, 'tasks', id), await rt.port.now())
        if (l.kind === 'held' && !l.stale) return `Task ${id} is held by a running session (LOCK_HELD). Nothing was deleted.`
      }
    }
    return { paths: (await rt.port.listDirs(projects)).map(d => join(projects, d)), what: 'every Jeeves task on this machine' }
  }
  return PURGE_USAGE
}

/** A task still running here, or held by another live session, is never purged. */
async function refusal(rt: Runtime, me: string, tasks: Task[]): Promise<string | null> {
  for (const t of liveTasks(tasks)) {
    if (t.state.activeSessionId === me) return `Task ${t.state.taskId} is still running in this session: /jeeves off first. Nothing was deleted.`
    const l = await rt.storage.readLock(t.dir, await rt.port.now())
    if (l.kind === 'held' && !l.stale) return `Task ${t.state.taskId} is held by another running session (LOCK_HELD). Nothing was deleted.`
  }
  return null
}
