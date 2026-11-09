// Text Jeeves hands to Claude (ADR-003, ADR-004). Pure.

/** The one hidden note per rotation, at the first main-loop tool result after the threshold (S-03: 5/5, no further tool calls). */
export const QUIESCE_NOTE = 'Jeeves: the context threshold was reached. Finish the step you are on, do not start any new step or tool call, and end your turn now with a one-line summary of what is done and what is left.'

/** The one prompt Jeeves submits when a handover request finds Claude idle, so a Stop comes without the user (D-23, ST-4.7). */
export const NUDGE_PROMPT = 'Jeeves: prepare handover. The context threshold was reached. Do not start new work or run any tool; reply with one short line saying what is done. Jeeves will then ask for the handover.'

/** ST-13.6 (spec §5.3, ADR-003 A1): Claude's one-line view of the task, data for the next conversation, never instructions. */
export const GOAL = 'Current goal'
export const GOAL_BULLETS_MAX = 2
export const GOAL_CHARS_MAX = 300
export const HEADINGS = [GOAL, 'Completed since last handover', 'Decisions and constraints', 'Tests and checks', 'Open work and blockers', 'Exact next actions', 'Do not repeat / do not change'] as const
export const OPEN = '<<<JEEVES-HANDOVER v1'
export const CLOSE = 'JEEVES-HANDOVER>>>'

/** What Jeeves already recorded, listed so Claude does not restate it. */
export type CapturedFacts = { branch: string | null; head: string | null; changedFiles: number | null; commands: number; edits: number }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function factsLine(f: CapturedFacts | null): string {
  if (!f) return 'Jeeves records git status, branch, HEAD, edited files and command exit codes itself.'
  const where = f.branch ? `branch ${f.branch}` : 'a detached HEAD'
  const head = f.head ? ` at ${f.head.slice(0, 12)}` : ''
  const changed = f.changedFiles === null ? '' : `, ${plural(f.changedFiles, 'changed file')}`
  return `Jeeves already recorded: ${where}${head}${changed}, ${plural(f.commands, 'command')} with exit codes, ${plural(f.edits, 'edit')}.`
}

/** The Stop `block` text that asks Claude for the handover (ST-3.4, ADR-003). Deterministic; at most HANDOVER_INSTRUCTION_MAX characters. */
export function handoverInstruction(p: { taskId: string; rotationId: string; maxChars: number; facts: CapturedFacts | null }): string {
  return [
    'Jeeves: this conversation will be replaced by a fresh one to free context. Write a handover so the next conversation can continue the task without repeating work.',
    'Rules: do not run any new tool or command now; summarise only. Write only task-relevant facts. Never include secrets, tokens, passwords or .env contents.',
    `${factsLine(p.facts)} Do not restate raw diffs or command output; name files and commands instead, in \`backticks\`.`,
    `Reply with exactly one block in this exact format, nothing inside it but the seven sections, at most ${p.maxChars} characters:`,
    '',
    `${OPEN} task=${p.taskId} rotation=${p.rotationId}`,
    ...HEADINGS.flatMap(h => [`## ${h}`, h === GOAL ? '- [inferred] <what the task aims at now, one line>' : h === 'Exact next actions' ? '1. [inferred] <first concrete step>' : '- [verified] <fact you checked> / [inferred] <your conclusion> / [unknown] <open question>']),
    CLOSE,
    '',
    `Every bullet starts with one tag: [verified] (you saw it in tool output this session), [inferred], or [unknown]. Every section has at least one bullet; write "- [verified] none" if empty. "Current goal": 1 or 2 bullets, each at most ${GOAL_CHARS_MAX} characters. "Exact next actions" is a numbered list with at least one item. A [verified] bullet that names a file or claims a check passed is checked against the repository and the command record: name each file by its real path from the repository root, never a placeholder such as stepN or a path starting with ../. Copy the first and last line of the block exactly.`,
  ].join('\n')
}

export const HANDOVER_INSTRUCTION_MAX = 2500

/** The Stop `block` text after an invalid handover: the specific errors, then the exact first line again. */
export function retryInstruction(p: { taskId: string; rotationId: string; errors: string[] }): string {
  const shown = p.errors.slice(0, 8).map(e => `- ${e}`).join('\n').slice(0, 1800)
  return [
    'Jeeves: the handover is invalid. Fix these and reply again with one corrected block in the same format; do not run any tool or command:',
    shown,
    `First line: ${OPEN} task=${p.taskId} rotation=${p.rotationId}`,
    `Last line: ${CLOSE}`,
  ].join('\n')
}
