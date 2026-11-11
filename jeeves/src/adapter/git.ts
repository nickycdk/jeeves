// Repo identity and git facts via host git (read-only commands only; AC-19).
import { COMMIT_RE, COMMITS_MAX, parsePorcelainZ, type GitFacts, type RepoIdentity } from '../core/git.ts'
import { projectIdFromHash, projectKey } from '../core/ids.ts'
import { isInside, join } from '../core/paths.ts'
import type { FsPort, ProcResult } from './ports.ts'
import { sha256Hex } from './storage.ts'

export const GIT_TIMEOUT_MS = 10_000

// --no-optional-locks: status must not write the index (no git mutation, even incidental).
// core.fsmonitor=false: cheap hardening (ST-9.1, F-3). Other commands a repository's own .git/config names (filter
// drivers) still run, as they do for Claude Code's own `git status` in that repository; docs/threat-model.md.
// LC_ALL=C: git's messages in English, so "not a git repository" can be recognised.
const git = (port: FsPort, cwd: string, args: string[]): Promise<ProcResult> =>
  port.run(['git', '--no-optional-locks', '-c', 'core.fsmonitor=false', ...args], { cwd, timeoutMs: GIT_TIMEOUT_MS, env: { LC_ALL: 'C' } })

/** null when git could not answer (timeout, git missing, an unexpected git error): unknown, never "not a repo". */
export async function repoIdentity(port: FsPort, cwd: string): Promise<RepoIdentity | null> {
  const real = (await port.realPath(cwd)) ?? cwd
  let r: ProcResult
  try { r = await git(port, real, ['rev-parse', '--git-common-dir', '--show-toplevel']) } catch { return null }
  if (r.exitCode !== 0) return /not a git repository/i.test(r.stderr) ? { kind: 'none', cwd: real } : null
  const [rawCommon, worktree] = r.stdout.trim().split('\n')
  if (!rawCommon || !worktree) return null
  // --git-common-dir may be relative to the cwd (".git", "../.git"); --show-toplevel is absolute.
  const commonDir = rawCommon.startsWith('/') ? rawCommon : join(real, rawCommon)
  return {
    kind: 'git',
    commonDir: (await port.realPath(commonDir)) ?? commonDir,
    worktree: (await port.realPath(worktree)) ?? worktree,
  }
}

export async function projectId(id: RepoIdentity): Promise<string> {
  return projectIdFromHash(await sha256Hex(projectKey(id.kind === 'git' ? id : { cwd: id.cwd })))
}

/** Branch, HEAD, porcelain status, and the files changed and commits made since `taskStartHead`. Timeouts give `unknown`, never empty facts. */
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
    let commitsSinceStart: string[] | null = null
    if (taskStartHead && COMMIT_RE.test(taskStartHead)) {
      const d = await git(port, cwd, ['diff', '--name-only', '-z', taskStartHead, '--'])
      if (d.exitCode === 0) {
        const untracked = p.entries.filter(e => e.xy === '??').map(e => e.path)
        changedSinceStart = [...new Set([...d.stdout.split('\0').filter(Boolean), ...untracked])].sort()
      }
      if (head) {
        // --reverse applies after -n: the latest COMMITS_MAX commits, oldest first.
        const l = await git(port, cwd, ['log', '--no-color', '--format=%h %s', '--reverse', '-n', String(COMMITS_MAX), `${taskStartHead}..HEAD`, '--'])
        if (l.exitCode === 0) commitsSinceStart = l.stdout.split('\n').filter(Boolean)
      }
    }
    return { kind: 'git', worktree: cwd, branch: p.branch, detached: p.detached, head, status: p.entries, changedSinceStart, commitsSinceStart }
  } catch (err) {
    return { kind: 'unknown', reason: `git did not answer: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}` }
  }
}

/** Whether `sha` is a commit of the repository at `worktree` (a moved repository still has the task's start commit). */
export async function hasCommit(port: FsPort, worktree: string, sha: string): Promise<boolean> {
  if (!COMMIT_RE.test(sha)) return false
  return (await git(port, worktree, ['cat-file', '-e', `${sha}^{commit}`]).catch(() => null))?.exitCode === 0
}

// shortcut: past this many changed paths no stamp is taken (the gate falls back to edit order); raise it if real tasks hit it.
export const STAMP_PATHS_MAX = 2000
const HASH_CHUNK = 200

/**
 * A stamp of the content of every file changed since `taskStartHead` (tracked diff plus untracked, ignored files left
 * out), so committing or stashing and popping the same content keeps it. Read-only: `hash-object` without `-w`.
 * Paths are repository-root relative and every call runs from the root. Never counted: any `.claude/` folder (Claude
 * Code writes it) and `exclude`, absolute paths (Jeeves's own state, written while a check is recorded). A symbolic
 * link counts by where it leads, not by what the file there holds. Null when there
 * is nothing to compare against: no git, no start commit, git did not answer, or too many paths.
 */
export async function treeStamp(port: FsPort, id: RepoIdentity | null, taskStartHead: string | null, exclude: readonly string[] = []): Promise<string | null> {
  if (id?.kind !== 'git' || !taskStartHead || !COMMIT_RE.test(taskStartHead)) return null
  const root = id.worktree
  try {
    // The root is a real path; an exclude may reach the same folder through a link (macOS /var is /private/var).
    const skip = await Promise.all(exclude.map(async x => (await port.realPath(x)) ?? x))
    const [st, d] = await Promise.all([
      git(port, root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']),
      git(port, root, ['diff', '--name-only', '-z', '--no-renames', taskStartHead, '--']),
    ])
    if (st.exitCode !== 0 || d.exitCode !== 0) return null
    const untracked = parsePorcelainZ(st.stdout).entries.filter(e => e.xy === '??').map(e => e.path)
    const paths = [...new Set([...d.stdout.split('\0').filter(Boolean), ...untracked])]
      // Claude Code writes a .claude/ folder wherever it runs, which may be a subfolder of the repository.
      .filter(p => !p.split('/').includes('.claude') && !skip.some(x => isInside(join(root, p), x))).sort()
    if (paths.length > STAMP_PATHS_MAX) return null
    const value = new Map<string, string>()
    const files: string[] = []
    // The disk decides, not git's flags: `git rm --cached f` lists f as deleted and as untracked.
    const stats = await Promise.all(paths.map(p => port.stat(join(root, p))))
    for (const [k, p] of paths.entries()) {
      const s = stats[k]
      if (!s) value.set(p, 'deleted')
      else if (s.isLink) value.set(p, `link:${s.realPath ?? 'dangling'}`)
      else if (s.kind === 'file') files.push(p)
      else value.set(p, s.kind) // a submodule, a directory, a socket
    }
    for (let i = 0; i < files.length; i += HASH_CHUNK) {
      const chunk = files.slice(i, i + HASH_CHUNK)
      // Paths as argv, after --: a name with a newline or a leading - stays one path.
      const h = await git(port, root, ['hash-object', '--no-filters', '--', ...chunk])
      const ids = h.stdout.split('\n').filter(Boolean)
      if (h.exitCode !== 0 || ids.length !== chunk.length) return null
      chunk.forEach((p, j) => value.set(p, ids[j]!))
    }
    return await sha256Hex(paths.map(p => `${p}\0${value.get(p)}`).join('\n'))
  } catch {
    return null
  }
}

/** The project folder under the state root. */
export const projectDir = (stateRoot: string, pid: string) => join(stateRoot, 'projects', pid)

/** `git --version`'s answer, or null when git did not answer (for diagnose). */
export const gitVersion = (port: FsPort, cwd: string): Promise<string | null> =>
  git(port, cwd, ['--version']).then(r => (r.exitCode === 0 ? r.stdout.trim() : null), () => null)
