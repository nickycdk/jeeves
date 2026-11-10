// Git output parsing and fact shapes. Pure.

export type StatusEntry = { xy: string; path: string; origPath?: string }

export type Porcelain = {
  branch: string | null
  detached: boolean
  noCommits: boolean
  upstream: string | null
  entries: StatusEntry[]
}

/** Parses `git status --porcelain=v1 --branch -z` output. */
export function parsePorcelainZ(out: string): Porcelain {
  const parts = out.split('\0')
  const p: Porcelain = { branch: null, detached: false, noCommits: false, upstream: null, entries: [] }
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i]!
    if (rec === '') continue
    if (rec.startsWith('## ')) {
      const head = rec.slice(3)
      if (head.startsWith('HEAD (no branch)')) p.detached = true
      else if (head.startsWith('No commits yet on ')) { p.noCommits = true; p.branch = head.slice('No commits yet on '.length).split('...')[0]!.trim() }
      else if (head.startsWith('Initial commit on ')) { p.noCommits = true; p.branch = head.slice('Initial commit on '.length).trim() }
      else {
        const [branch, rest] = head.split('...')
        p.branch = branch!.trim()
        p.upstream = rest ? rest.split(' ')[0]! : null
      }
      continue
    }
    const xy = rec.slice(0, 2)
    const entry: StatusEntry = { xy, path: rec.slice(3) }
    if (xy[0] === 'R' || xy[0] === 'C') entry.origPath = parts[++i]
    p.entries.push(entry)
  }
  return p
}

export type GitFacts =
  | {
      kind: 'git'
      worktree: string
      branch: string | null
      detached: boolean
      head: string | null
      status: StatusEntry[]
      /** Files changed since the task's start commit (tracked diff + untracked); null without a start commit. */
      changedSinceStart: string[] | null
      /** `<short sha> <subject>` per commit since the task's start commit, oldest first, at most COMMITS_MAX; null without a start commit. */
      commitsSinceStart: string[] | null
    }
  | { kind: 'none' }
  /** Git could not be asked (timeout, git missing): never shown as "clean". */
  | { kind: 'unknown'; reason: string }

export type RepoIdentity =
  | { kind: 'git'; commonDir: string; worktree: string }
  | { kind: 'none'; cwd: string }

export const COMMITS_MAX = 200

/** A commit id as git prints it (abbreviated or full, SHA-1 or SHA-256): never an option such as "--output=..." (ST-9.1). */
export const COMMIT_RE = /^[0-9a-f]{4,64}$/
