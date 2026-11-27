// Completion (ST-5.1, FR-10, ADR-007): Claude's JEEVES-COMPLETE block and the machine evidence it is checked against.
// "Done" text alone never completes: only a block, and only when every verification command ran with exit 0 after
// the last edit, with the files unchanged since, and no blocker is open. Pure.
import { ledgerCommand } from './evidence.ts'
import { PLAN_CLOSE, PLAN_OPEN } from './plan.ts'
import type { CommandEntry, LedgerEntry } from './types.ts'

export const COMPLETE_OPEN = '<<<JEEVES-COMPLETE v1'
export const COMPLETE_CLOSE = 'JEEVES-COMPLETE>>>'
const OPEN_RE = /^\s*(?:`{3,}\w*\s*)?<<<\s*JEEVES-COMPLETE\s+v1\b(.*)$/i
const CLOSE_RE = /^\s*JEEVES-COMPLETE\s*>>>/i
const ITEM_RE = /^\s*(?:[-*•+]|\d+[.)])\s+(.*)$/
const NONE_RE = /^(none|n\/a|-|no blockers?)\.?$/i

export type CompleteBlock = { taskId: string | null; summary: string[]; checks: string[]; blockers: string[] }

/** The one JEEVES-COMPLETE block of a message; null when there is none, or more than one, or it is not closed. */
export function parseComplete(text: string): CompleteBlock | null {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  const opens = lines.flatMap((l, i) => (OPEN_RE.test(l) ? [i] : []))
  if (opens.length !== 1) return null
  const start = opens[0]!
  const end = lines.findIndex((l, i) => i > start && CLOSE_RE.test(l))
  if (end < 0) return null
  const taskId = /\btask=(\S+)/.exec(OPEN_RE.exec(lines[start]!)![1]!)?.[1] ?? null
  const sections: Record<string, string[]> = {}
  let current: string | null = null
  for (const l of lines.slice(start + 1, end)) {
    const h = /^\s{0,3}#{2,3}\s+(.*?)[\s:#]*$/.exec(l)
    if (h) { current = h[1]!.toLowerCase().replace(/[^a-z]/g, ''); sections[current] = []; continue }
    const m = ITEM_RE.exec(l)
    if (m && current) sections[current]!.push(m[1]!.trim())
  }
  const unquote = (s: string) => s.replace(/^`+|`+$/g, '').trim()
  return {
    taskId,
    summary: sections['summary'] ?? [],
    checks: (sections['checksrun'] ?? []).map(unquote),
    blockers: (sections['blockers'] ?? []).filter(b => !NONE_RE.test(b.trim())),
  }
}

/** Whether a ledger entry is a run of one of the verification commands (by exact ledger text). The gate and the stamp share it. */
export const isCheckRun = (commands: readonly string[], e: { kind: string; command?: string }): boolean =>
  commands.some(c => isRunOf(ledgerCommand(c), e))
/** The same test against a command already in ledger form (redaction done once per command, not per entry). */
const isRunOf = (form: string, e: { kind: string; command?: string }) => e.kind === 'cmd' && e.command === form

export type Missing = { command: string; why: string }
export type Evidence = { ok: boolean; missing: Missing[]; blockers: string[] }

/**
 * ADR-007: each verification command needs its latest ledger run, by exact command text, to have exited 0 after
 * the last edit. Order is the ledger's own (oldest first), so ties in the clock cannot reorder an edit and a run.
 * `tree`: the stamp of the files now; a passing run whose own stamp differs saw other files (a change through Bash,
 * an editor, another check). Either stamp missing (not git, an older entry, git did not answer): only the order counts.
 */
export function evaluate(commands: readonly string[], ledger: readonly LedgerEntry[], blockers: readonly string[], tree: string | null = null): Evidence {
  const lastEdit = ledger.findLastIndex(e => e.kind === 'edit')
  const missing: Missing[] = []
  for (const command of commands) {
    const want = ledgerCommand(command)
    const i = ledger.findLastIndex(e => isRunOf(want, e))
    const run = i >= 0 ? ledger[i] : undefined
    if (!run || run.kind !== 'cmd') missing.push({ command, why: 'never run (run it exactly as written)' })
    else if (run.exit !== 0) missing.push({ command, why: run.exit === null ? 'did not finish' : `last run exited ${run.exit}` })
    else if (i < lastEdit) missing.push({ command, why: `ran before the last edit (${(ledger[lastEdit] as { path: string }).path})` })
    else if (run.tree !== undefined && tree !== null && run.tree !== tree) missing.push({ command, why: changedSince(commands, ledger, i) })
  }
  return { ok: commands.length > 0 && missing.length === 0 && blockers.length === 0, missing, blockers: [...blockers] }
}

/** Why a passing run's stamp no longer matches: names the first later check run that saw other files, when only check runs came between. */
function changedSince(commands: readonly string[], ledger: readonly LedgerEntry[], i: number): string {
  const run = ledger[i] as CommandEntry
  const forms = commands.map(ledgerCommand)
  for (const e of ledger.slice(i + 1)) {
    if (e.kind !== 'cmd' || !forms.some(f => isRunOf(f, e))) break
    if (e.tree !== undefined && e.tree !== run.tree) return `files changed since it passed (\`${e.command}\` ran in between: if a check writes files, gitignore its outputs)`
  }
  return 'files changed since it passed (not through Edit/Write)'
}

/** The system-prompt section that tells Claude how to finish a managed task (ST-5.2). Deterministic.
 *  `planned`: Jeeves holds a plan already. Only that flag goes in, never the ticks: a section that changed with every
 *  step would make the prompt cache read the whole conversation again; a fresh conversation gets the list in its context. */
export function completionInstruction(taskId: string, commands: readonly string[], planned = false): string {
  return [
    planned
      ? `Jeeves holds the plan for this task (your ${PLAN_OPEN} block, or the list in the task context after a handover). Keep its step numbers. If the plan changes, write the whole plan again in a new ${PLAN_OPEN} block; steps with the same text keep their done mark.`
      : `Before you start on the task, write its plan once as one numbered list, 1 to N, one line per step and no sub-items (a single step is fine for a small task):\n${PLAN_OPEN}\n1. <step>\n2. <step>\n${PLAN_CLOSE}`,
    'As soon as you finish a step, write <<<JEEVES-PROGRESS done=<step number>>>> in your text before your next tool call, for example <<<JEEVES-PROGRESS done=2>>>; several at once: done=2,3.',
    `Jeeves manages this task (${taskId}) across fresh conversations. Saying "done" does not finish it.`,
    'Only when the whole task is done, end your final message with exactly this block:',
    `${COMPLETE_OPEN} task=${taskId}`,
    '## Summary',
    '- <what was built>',
    '## Checks run',
    ...(commands.length ? commands.map(c => `- \`${c}\``) : ['- none']),
    '## Blockers',
    '- none',
    COMPLETE_CLOSE,
    commands.length
      ? `Before writing it, after your last edit, run each of these as its own Bash command, exactly as written, with nothing before or after it (no ;, &&, pipes or echo): ${commands.map(c => `\`${c}\``).join(', ')}. Jeeves checks the block against the exit codes of those exact commands.`
      : 'This task has no verification commands, so the user confirms completion with /jeeves done.',
    'List open problems under Blockers instead of "none". Never write the block before the task is done.',
  ].join('\n')
}
