// The merged handover file (ST-3.8, 02 §6.4, PRD §8.4): plugin-verified facts around Claude's narrative block. Pure.
// The narrative goes in as its sentinel block, so the file parses back to the same sections (round trip).
import type { GitFacts } from '../git.ts'
import { redact } from '../redact.ts'
import type { LedgerEntry, Trigger } from '../types.ts'
import { parseHandover, type Narrative } from './parse.ts'
import { CLOSE, GOAL, HEADINGS, OPEN } from './template.ts'

export type Cron = { id: string; schedule: string; recurring: boolean; prompt: string }

export type RenderInput = {
  n: number
  taskId: string
  rotationId: string
  trigger: Trigger
  sourceSessionId: string | null
  at: string
  contextPercent: number | null
  retries: number
  taskRevision: number
  dod: string[]
  checks: string[]
  taskStartHead: string | null
  git: GitFacts
  /** null in turn mode: the crons came from `classic.Stop`, which is skipped there (ADR-003 A2). */
  crons: readonly Cron[] | null
  ledger: readonly LedgerEntry[]
  narrative: Narrative
}

export const handoverFile = (n: number) => `history/handover-${String(n).padStart(3, '0')}.md`
/** `state.lastValidatedHandover`: the handover file (group 1) and its SHA-256 (group 2). Never a path outside history/ (ST-9.1). */
export const HANDOVER_REF_RE = /^(history\/handover-\d{3,}\.md)#sha256:([0-9a-f]{64})$/
const rev = (n: number) => `task-rev-${String(n).padStart(3, '0')}.md`
const LIST_MAX = 50
const list = <T>(xs: readonly T[], line: (x: T) => string, none: string) =>
  xs.length ? [...xs.slice(-LIST_MAX).map(x => `- ${line(x)}`), ...(xs.length > LIST_MAX ? [`- (${xs.length - LIST_MAX} earlier not shown)`] : [])] : [`- ${none}`]
/** User text on one line, so it can never start a sentinel or heading line in the file. */
const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
const oneLine = (s: string, max: number) => { const f = redact(s).replace(/\s+/g, ' ').trim(); return f.length > max ? `${f.slice(0, max - 1)}…` : f }

function verified(r: RenderInput): string[] {
  const g = r.git
  const repo = g.kind === 'git'
    ? [
        `- Worktree: ${g.worktree}`,
        `- Branch: ${g.branch ?? '(detached HEAD)'}`,
        `- HEAD: ${g.head ?? '(no commits yet)'}`,
        `- git status --porcelain (${g.status.length} entries):`,
        ...list(g.status, e => `\`${e.xy} ${e.path}${e.origPath ? ` <- ${e.origPath}` : ''}\``, 'clean').map(l => `  ${l}`),
        `- Files changed since the task started${r.taskStartHead ? ` (${r.taskStartHead.slice(0, 12)})` : ''}:`,
        ...(g.changedSinceStart === null ? ['  - (unknown: no start commit)'] : list(g.changedSinceStart, p => `\`${p}\``, 'none').map(l => `  ${l}`)),
        '- Commits since the task started (git log, oldest first):',
        ...(g.commitsSinceStart === null ? ['  - (unknown: no start commit)'] : list(g.commitsSinceStart, c => oneLine(c, 160), 'none').map(l => `  ${l}`)),
      ]
    : g.kind === 'none' ? ['- Not a git repository.'] : [`- Git facts unknown: ${g.reason}`]
  const edits = [...new Set(r.ledger.flatMap(e => (e.kind === 'edit' ? [e.path] : [])))]
  const cmds = r.ledger.flatMap(e => (e.kind === 'cmd' ? [e] : []))
  return [
    '## Verified repository state',
    `Captured by Jeeves at ${r.at} from git, tool calls and the Stop event; not written by Claude.`,
    ...repo,
    '- Edited files (ledger):',
    ...list(edits, p => `\`${p}\``, 'none').map(l => `  ${l}`),
    '- Commands (ledger, oldest first):',
    ...list(cmds, c => `\`${c.command}\` -> ${c.exit === null ? (c.ok ? 'no exit status (backgrounded)' : 'denied or did not finish') : `exit ${c.exit}`}${c.agent ? ` (subagent ${c.agent})` : ''}`, 'none').map(l => `  ${l}`),
    ...(r.crons === null ? ['- Scheduled session crons: not available in turn mode'] : [
      '- Scheduled session crons (keep running across the rotation):',
      ...list(r.crons, c => `\`${c.schedule}\`${c.recurring ? ' recurring' : ' once'}: ${oneLine(c.prompt, 120)}`, 'none').map(l => `  ${l}`),
    ]),
  ]
}

/** An item's text without its leading `[verified]`/`[inferred]`/`[unknown]` tag. */
export const untag = (text: string) => text.replace(/^\s*\[(verified|inferred|unknown)\]\s*/i, '')

const GOAL_LINE_MAX = 80
/** The rotation line's goal (spec §5.3): the first Current goal bullet without its tag, redacted, on one line; null without one. */
export function goalLine(n: Narrative): string | null {
  const first = n.sections[GOAL][0]
  return first ? oneLine(untag(first.text), GOAL_LINE_MAX) || null : null
}

export function renderHandover(r: RenderInput): string {
  const n = String(r.n).padStart(3, '0')
  return [
    `# Jeeves handover ${n}`,
    '',
    `Task ${r.taskId}, rotation ${r.rotationId}, written ${r.at}. Facts below the narrative heading come from Jeeves; the narrative is Claude's.`,
    '',
    '## Original task and DoD',
    `- Original prompt: \`${rev(1)}\` (never changed). Current revision: \`${rev(Math.max(1, r.taskRevision))}\`.`,
    '- Definition of Done:',
    ...list(r.dod, d => flat(d), '(none)').map(l => `  ${l}`),
    '- Verification commands (stored as text, never run by Jeeves):',
    ...list(r.checks, c => `\`${flat(c)}\``, '(none)').map(l => `  ${l}`),
    '',
    ...verified(r),
    '',
    '## Narrative (written by Claude, validated by Jeeves)',
    '',
    `${OPEN} task=${r.taskId} rotation=${r.rotationId}`,
    r.narrative.body,
    CLOSE,
    '',
    '## Rotation metadata',
    `- Handover: ${n}`,
    `- Rotation: ${r.rotationId} (trigger ${r.trigger})`,
    `- Source session: ${r.sourceSessionId ?? 'unknown'}`,
    `- Context at the request: ${r.contextPercent === null ? 'unknown' : `${r.contextPercent}%`}`,
    `- Retries used: ${r.retries}`,
    '',
  ].join('\n')
}

/** The merged file parses back to the narrative it was made from. */
export function roundTrips(merged: string, narrative: Narrative): boolean {
  const back = parseHandover(merged)
  return back.ok && back.value.taskId === narrative.taskId && back.value.rotationId === narrative.rotationId &&
    HEADINGS.every(h => JSON.stringify(back.value.sections[h]) === JSON.stringify(narrative.sections[h]))
}
