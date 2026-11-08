// Completion (ST-5.1, FR-10, ADR-007): Claude's TIBBS-COMPLETE block and the machine evidence it is checked against.
// "Done" text alone never completes: only a block, and only when every verification command ran with exit 0 after
// the last edit and no blocker is open. Pure.
import type { LedgerEntry } from './types.ts'

export const COMPLETE_OPEN = '<<<TIBBS-COMPLETE v1'
export const COMPLETE_CLOSE = 'TIBBS-COMPLETE>>>'
const OPEN_RE = /^\s*(?:`{3,}\w*\s*)?<<<\s*TIBBS-COMPLETE\s+v1\b(.*)$/i
const CLOSE_RE = /^\s*TIBBS-COMPLETE\s*>>>/i
const ITEM_RE = /^\s*(?:[-*•+]|\d+[.)])\s+(.*)$/
const NONE_RE = /^(none|n\/a|-|no blockers?)\.?$/i

export type CompleteBlock = { taskId: string | null; summary: string[]; checks: string[]; blockers: string[] }

/** The one TIBBS-COMPLETE block of a message; null when there is none, or more than one, or it is not closed. */
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

export type Missing = { command: string; why: string }
export type Evidence = { ok: boolean; missing: Missing[]; blockers: string[] }

/**
 * ADR-007: each verification command needs its latest ledger run, by exact command text, to have exited 0 after
 * the last edit. Order is the ledger's own (oldest first), so ties in the clock cannot reorder an edit and a run.
 */
export function evaluate(commands: readonly string[], ledger: readonly LedgerEntry[], blockers: readonly string[]): Evidence {
  const lastEdit = ledger.findLastIndex(e => e.kind === 'edit')
  const missing: Missing[] = []
  for (const command of commands) {
    const want = command.trim()
    const i = ledger.findLastIndex(e => e.kind === 'cmd' && e.command.trim() === want)
    const run = i >= 0 ? ledger[i] : undefined
    if (!run || run.kind !== 'cmd') missing.push({ command, why: 'never run (run it exactly as written)' })
    else if (run.exit !== 0) missing.push({ command, why: run.exit === null ? 'did not finish' : `last run exited ${run.exit}` })
    else if (i < lastEdit) missing.push({ command, why: `ran before the last edit (${(ledger[lastEdit] as { path: string }).path})` })
  }
  return { ok: commands.length > 0 && missing.length === 0 && blockers.length === 0, missing, blockers: [...blockers] }
}

/** The system-prompt section that tells Claude how to finish a managed task (ST-5.2). Deterministic. */
export function completionInstruction(taskId: string, commands: readonly string[]): string {
  return [
    `Tibbs manages this task (${taskId}) across fresh conversations. Saying "done" does not finish it.`,
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
      ? `Before writing it, after your last edit, run each of these as its own Bash command, exactly as written, with nothing before or after it (no ;, &&, pipes or echo): ${commands.map(c => `\`${c}\``).join(', ')}. Tibbs checks the block against the exit codes of those exact commands.`
      : 'This task has no verification commands, so the user confirms completion with /tibbs done.',
    'List open problems under Blockers instead of "none". Never write the block before the task is done.',
  ].join('\n')
}
