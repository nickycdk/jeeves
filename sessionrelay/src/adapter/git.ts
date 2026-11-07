// Repo identity and git facts via host git (read-only commands only; AC-19).
import { parsePorcelainZ, type GitFacts, type RepoIdentity } from '../core/git.ts'
import { projectIdFromHash, projectKey } from '../core/ids.ts'
import { join } from '../core/paths.ts'
import type { FsPort, ProcResult } from './ports.ts'
import { sha256Hex } from './storage.ts'

export const GIT_TIMEOUT_MS = 10_000

// --no-optional-locks: status must not write the index (no git mutation, even incidental).
const git = (port: FsPort, cwd: string, args: string[]): Promise<ProcResult> =>
  port.run(['git', '--no-optional-locks', ...args], { cwd, timeoutMs: GIT_TIMEOUT_MS })

/** null when git itself could not be asked (timeout, git missing). */
export async function repoIdentity(port: FsPort, cwd: string): Promise<RepoIdentity | null> {
  const real = (await port.realPath(cwd)) ?? cwd
  let r: ProcResult
  try { r = await git(port, real, ['rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel']) } catch { return null }
  if (r.exitCode !== 0) {
    // A bare repo or the inside of .git also fails here: treat any rev-parse refusal as "not a work tree".
    return { kind: 'none', cwd: real }
  }
  const [commonDir, worktree] = r.stdout.trim().split('\n')
  if (!commonDir || !worktree) return { kind: 'none', cwd: real }
  return {
    kind: 'git',
    commonDir: (await port.realPath(commonDir)) ?? commonDir,
    worktree: (await port.realPath(worktree)) ?? worktree,
  }
}

export async function projectId(id: RepoIdentity): Promise<string> {
  return projectIdFromHash(await sha256Hex(projectKey(id.kind === 'git' ? id : { cwd: id.cwd })))
}

/** Branch, HEAD, porcelain status and files changed since `taskStartHead`. Timeouts give `unknown`, never empty facts. */
export async function gitFacts(port: FsPort, id: RepoIdentity | null, taskStartHead: string | null = null): Promise<GitFacts> {
  if (id === null) return { kind: 'unknown', reason: 'git could not be run' }
  if (id.kind === 'none') return { kind: 'none' }
  const cwd = id.worktree
  try {
    const st = await git(port, cwd, ['status', '--porcelain=v1', '--branch', '-z', '--untracked-files=all'])
    if (st.exitCode !== 0) return { kind: 'unknown', reason: `git status exit ${st.exitCode}: ${st.stderr.trim().slice(0, 120)}` }
    const p = parsePorcelainZ(st.stdout)
    let head: string | null = null
    if (!p.noCommits) {
      const h = await git(port, cwd, ['rev-parse', '--verify', '-q', 'HEAD'])
      head = h.exitCode === 0 ? h.stdout.trim() : null
    }
    let changedSinceStart: string[] | null = null
    if (taskStartHead) {
      const d = await git(port, cwd, ['diff', '--name-only', '-z', taskStartHead, '--'])
      if (d.exitCode === 0) {
        const untracked = p.entries.filter(e => e.xy === '??').map(e => e.path)
        changedSinceStart = [...new Set([...d.stdout.split('\0').filter(Boolean), ...untracked])].sort()
      }
    }
    return { kind: 'git', worktree: cwd, branch: p.branch, detached: p.detached, head, status: p.entries, changedSinceStart }
  } catch (err) {
    return { kind: 'unknown', reason: `git did not answer: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}` }
  }
}

/** The project folder under the state root. */
export const projectDir = (stateRoot: string, pid: string) => join(stateRoot, 'projects', pid)
