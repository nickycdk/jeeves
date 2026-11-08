// `/jeeves purge` (ST-8.1, PRIVACY.md): deletes task files on request, in two typed steps. The first names the scope
// and lists what would go, with a short code; `/jeeves purge confirm <code>` within 2 minutes deletes it. Only folders
// under <state root>/projects are ever removed, never the state root itself (it may be a folder the user chose).
import { join } from '../core/paths.ts'
import type { Runtime } from './runtime.ts'

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
    // Only the folders that were listed; their locks checked again, since a task may have started or resumed since.
    const scope = { paths: p.paths, what: p.what }
    const refused = await busy(rt, me, scope.paths)
    if (refused) return refused
    const root = join(rt.stateRoot, 'projects') + '/'
    const failed: string[] = []
    for (const path of scope.paths) {
      // A last guard: never delete outside <state root>/projects, whatever built the list.
      if (!path.startsWith(root) || path.includes('/../')) { failed.push(path); continue }
      const r = await rt.port.run(['rm', '-rf', path], { timeoutMs: 30_000 }).catch(err => ({ exitCode: -1, stderr: String(err), stdout: '' }))
      if (r.exitCode !== 0) failed.push(path)
    }
    return failed.length ? `Deleted ${scope.what}, except: ${failed.join(', ')}` : `Deleted ${scope.what}.`
  }
  pending = null
  const scope = await targets(rt, flag, value)
  if (typeof scope === 'string') return scope
  if (!scope.paths.length) return `Nothing to purge for ${scope.what}.`
  const refused = await busy(rt, me, scope.paths)
  if (refused) return refused
  pending = { code: code(), paths: scope.paths, what: scope.what, until: now + CONFIRM_MS }
  return [
    `This deletes ${scope.what}, for good:`,
    ...scope.paths.map(p => `  ${p}`),
    `To delete, type: /jeeves purge confirm ${pending.code}  (within 2 minutes)`,
  ].join('\n')
}

async function targets(rt: Runtime, flag: string | undefined, value: string | undefined): Promise<{ paths: string[]; what: string } | string> {
  const projects = join(rt.stateRoot!, 'projects')
  if (flag === '--task' && value) {
    if (!rt.projectDir) return PURGE_USAGE
    // Only a folder that exists under this project's tasks/ by that exact name: no path from the argument is used.
    if (!(await rt.port.listDirs(join(rt.projectDir, 'tasks'))).includes(value)) return `No task ${value.slice(0, 40)} in this project. /jeeves history shows the current one.`
    return { paths: [join(rt.projectDir, 'tasks', value)], what: `task ${value}` }
  }
  if (flag === '--project' && !value) {
    if (!rt.projectDir) return PURGE_USAGE
    return { paths: (await rt.port.exists(rt.projectDir)) ? [rt.projectDir] : [], what: "this project's Jeeves files" }
  }
  if (flag === '--all' && !value) return { paths: (await rt.port.listDirs(projects)).map(d => join(projects, d)), what: 'every Jeeves task on this machine' }
  return PURGE_USAGE
}

/**
 * A task with a live lock (this session's running task, or another session at work) is never purged. Decided by the
 * lock, not state.json, so an unreadable task is covered too.
 */
async function busy(rt: Runtime, me: string, paths: string[]): Promise<string | null> {
  for (const path of paths) {
    const dirs = /\/tasks\/[^/]+$/.test(path) ? [path] : (await rt.port.listDirs(join(path, 'tasks'))).map(id => join(path, 'tasks', id))
    for (const dir of dirs) {
      const id = dir.split('/').at(-1)
      const l = await rt.storage.readLock(dir, await rt.port.now()).catch(() => null)
      if (!l) return `The lock of task ${id} could not be read, so nothing was deleted. /jeeves status --diagnose shows the folder.`
      if (l.kind !== 'held' || l.stale) continue
      return l.owner?.ownerSessionId === me ? `Task ${id} is still running in this session: /jeeves off first. Nothing was deleted.` : `Task ${id} is held by a running session (LOCK_HELD). Nothing was deleted.`
    }
  }
  return null
}
