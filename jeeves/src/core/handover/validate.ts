// Handover validator (ST-3.6, 02 §6.4): the parsed narrative checked against the plugin's own facts. Pure: the
// adapter passes git facts, the ledger, and which mentioned paths exist on disk.
//
// Reading of 02 §6.4 (D-20): file paths, branch/HEAD and "passed" claims are checked in [verified] bullets, plus
// every bullet under "Tests and checks". [inferred]/[unknown] bullets are labelled guesses ("check for a
// `package.json`"), and checking them would make valid handovers fail.
import type { GitFacts } from '../git.ts'
import { normalize } from '../paths.ts'
import { findSecrets } from '../redact.ts'
import type { LedgerEntry, ReasonCode } from '../types.ts'
import { parseHandover, type Item, type Narrative, type ParseCode } from './parse.ts'
import { HEADINGS } from './template.ts'

export type ValidationCode = ParseCode | 'WRONG_IDS' | 'TOO_LONG' | 'MISSING_PATH' | 'REPO_MISMATCH' | 'FALSE_PASS' | 'SECRET' | 'GIT_UNKNOWN'
export type ValidationError = { code: ValidationCode; message: string }

export type Facts = {
  taskId: string
  rotationId: string
  maxChars: number
  /** Git facts now, at the Stop that carries the handover. */
  git: GitFacts
  /** The branch at the safe Stop that asked for the handover; undefined when no snapshot was readable. */
  capturedBranch?: string | null | undefined
  ledger: readonly LedgerEntry[]
  /** The mentioned paths (as `mentionedPaths` returned them) that exist on disk. */
  existing: ReadonlySet<string>
  /** A task created before v0.3 (`state.preUpgrade`): its handover may be a v1 block without Current goal (ST-13.6). */
  preUpgrade?: boolean
}

export type Validation =
  | { ok: true; narrative: Narrative }
  /** `fatal`: asking Claude again cannot fix it; the rotation stops with this reason. */
  | { ok: false; errors: ValidationError[]; fatal?: ReasonCode }

const CHECKED = (h: string, i: Item) => i.tag === 'verified' || h === 'Tests and checks'
const claims = (n: Narrative) => HEADINGS.flatMap(h => n.sections[h].filter(i => CHECKED(h, i)).map(i => i.text))

const BACKTICKED = /`([^`\n]{1,300})`/g
/** Extensions a slash-less token must have to count as a file name (`console.log` and `obj.map` must not). */
const FILE_EXT = /\.(c|cc|cfg|cjs|conf|cpp|cs|css|csv|cts|go|gradle|h|hpp|html?|ini|ipynb|java|js|json|jsx|kt|lock|md|mjs|mts|php|py|rb|rs|scss|sh|sql|svelte|svg|swift|toml|ts|tsx|txt|vue|xml|ya?ml|zsh)$/i

/** A backticked token that names a file: no spaces or code characters, not a URL; a trailing `:line` is dropped. */
export function asPath(token: string): string | null {
  const t = token.trim().replace(/[.,;]+$/, '').replace(/:\d+(:\d+)?$/, '')
  // A backslash is code (a regex like `/\s+/`, live run 8), never a POSIX path.
  if (!t || /[\s()[\]{}<>=$*?"'|;,&!\\]/.test(t) || t.includes('://') || t.startsWith('-') || t.startsWith('~')) return null
  // With a slash: a folder (`docs/`) or a name with an extension. `/api/users`, `@types/node`, `origin/main` and
  // `application/json` name no file, and flagging them as missing cost handovers their retries.
  if (t.includes('/')) return t.endsWith('/') ? (/[A-Za-z0-9]/.test(t) ? t : null) : /[\w-]\.[A-Za-z][A-Za-z0-9]*$/.test(t) ? t : null
  return /^[\w@.-]*[\w-]\.[A-Za-z][A-Za-z0-9]*$/.test(t) && FILE_EXT.test(t) ? t : null
}

/** Paths named in checked bullets, for the adapter to look up on disk. */
export function mentionedPaths(n: Narrative): string[] {
  const out = new Set<string>()
  for (const text of claims(n)) for (const m of text.matchAll(BACKTICKED)) {
    // "branch `feat/x`" names a branch, not a file.
    if (/\bbranch\s*(?:is\s+|:\s*)?$/i.test(text.slice(Math.max(0, m.index - 20), m.index))) continue
    const p = asPath(m[1]!)
    if (p) out.add(p)
  }
  return [...out]
}

/** A path relative to the worktree, as git status prints it. */
const repoRelative = (p: string, worktree: string) => {
  const n = normalize(p)
  return n.startsWith(`${worktree}/`) ? n.slice(worktree.length + 1) : n.replace(/^\.\//, '')
}

const BRANCH_CLAIMS = [/\b(?:on|current|working)\s+branch\s*(?:is\s+|:\s*|=\s*)?`?([\w./-]*[\w-])`?(?=[\s,.;)]|$)/gi, /\bbranch\s+`([\w./-]+)`/gi]
const HEAD_CLAIM = /\bHEAD\s*(?:is|at|=|:)?\s*`?([0-9a-f]{7,40})\b/gi
const PASS = /\b(pass(es|ed|ing)?|green|succeed(s|ed)?|successful(ly)?|ok|works)\b/i
const NOT_PASS = /\b(fail(s|ed|ing|ure)?|not\s+pass|doesn't\s+pass|does\s+not\s+pass|broken|red|errors?|untested|not\s+run)\b/i
const LOOKUP = /^(grep|egrep|fgrep|rg|diff|test|ls|cat|find)\s/
const flat = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** Parse, then check against the facts. Errors are written for Claude: each names what to fix. */
export function validateHandover(message: string, f: Facts): Validation {
  const parsed = parseHandover(message, { requireGoal: !f.preUpgrade })
  if (!parsed.ok) return { ok: false, errors: parsed.errors }
  const n = parsed.value
  const errors: ValidationError[] = []
  const err = (code: ValidationCode, message: string) => errors.push({ code, message })

  if (n.taskId !== f.taskId || n.rotationId !== f.rotationId) {
    err('WRONG_IDS', `the first line must read "task=${f.taskId} rotation=${f.rotationId}" (got task=${n.taskId ?? '?'} rotation=${n.rotationId ?? '?'})`)
  }
  if (n.body.length > f.maxChars) err('TOO_LONG', `the block is ${n.body.length} characters; the limit is ${f.maxChars}`)
  const secrets = findSecrets(n.body)
  if (secrets.length) err('SECRET', `the block contains what looks like a secret (${secrets.join(', ')}); remove it and write "[redacted]"`)

  // Git truth: a branch that moved while the handover was written cannot be fixed by asking again.
  if (f.git.kind === 'unknown') return { ok: false, fatal: 'HANDOVER_INVALID', errors: [{ code: 'GIT_UNKNOWN', message: `git did not answer (${f.git.reason}), so the handover cannot be checked` }, ...errors] }
  if (f.git.kind === 'git' && f.capturedBranch !== undefined && f.capturedBranch !== f.git.branch) {
    return { ok: false, fatal: 'REPO_MISMATCH', errors: [{ code: 'REPO_MISMATCH', message: `the branch changed during the handover (${f.capturedBranch ?? 'detached'} -> ${f.git.branch ?? 'detached'})` }, ...errors] }
  }

  const texts = claims(n)
  if (f.git.kind === 'git') {
    const { branch, head, worktree, status } = f.git
    for (const text of texts) {
      for (const re of BRANCH_CLAIMS) for (const m of text.matchAll(re)) {
        if (m[1] !== branch) err('REPO_MISMATCH', `REPO_MISMATCH: a [verified] bullet says branch "${m[1]}", but the repository is on ${branch ? `"${branch}"` : 'a detached HEAD'}`)
      }
      for (const m of text.matchAll(HEAD_CLAIM)) {
        if (!head || !head.startsWith(m[1]!.toLowerCase())) err('REPO_MISMATCH', `REPO_MISMATCH: a [verified] bullet says HEAD is ${m[1]}, but HEAD is ${head?.slice(0, 12) ?? 'unborn'}`)
      }
    }
    const deleted = new Set(status.filter(e => e.xy.includes('D')).map(e => e.path))
    for (const p of mentionedPaths(n)) {
      if (!f.existing.has(p) && !deleted.has(repoRelative(p, worktree))) err('MISSING_PATH', `\`${p}\` is named in a [verified] bullet but does not exist and is not deleted in git status`)
    }
  } else {
    for (const p of mentionedPaths(n)) if (!f.existing.has(p)) err('MISSING_PATH', `\`${p}\` is named in a [verified] bullet but does not exist`)
  }

  // AC-09: a check claimed to pass whose latest run failed.
  const cmds = f.ledger.filter(e => e.kind === 'cmd')
  for (const text of texts) {
    if (!PASS.test(text) || NOT_PASS.test(text)) continue
    const lower = flat(text)
    const tokens = [...text.matchAll(BACKTICKED)].map(m => flat(m[1]!)).filter(t => t.length >= 3)
    const latest = [...cmds].reverse().find(c => {
      const cmd = flat(c.command)
      // A search that found nothing exits 1 too: `grep TODO src/a.ts` is no failed check of `src/a.ts`.
      return (cmd.length >= 3 && lower.includes(cmd)) || (!LOOKUP.test(cmd) && tokens.some(t => cmd.includes(t)))
    })
    if (latest && !latest.ok) err('FALSE_PASS', `a bullet says \`${latest.command}\` passed, but its last run ${latest.exit === null ? 'did not finish' : `exited ${latest.exit}`}; say it failed`)
  }

  return errors.length ? { ok: false, errors } : { ok: true, narrative: n }
}
