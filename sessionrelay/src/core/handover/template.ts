// Text SessionRelay hands to Claude (ADR-003, ADR-004). Pure.

/** The one hidden note per rotation, at the first main-loop tool result after the threshold (S-03: 5/5, no further tool calls). */
export const QUIESCE_NOTE = 'SessionRelay: the context threshold was reached. Finish the step you are on, do not start any new step or tool call, and end your turn now with a one-line summary of what is done and what is left.'

export const HEADINGS = ['Completed since last handover', 'Decisions and constraints', 'Tests and checks', 'Open work and blockers', 'Exact next actions', 'Do not repeat / do not change'] as const
export const OPEN = '<<<SESSIONRELAY-HANDOVER v1'
export const CLOSE = 'SESSIONRELAY-HANDOVER>>>'

/** The Stop `block` text that asks Claude for the handover (ADR-003). */
export function handoverInstruction(p: { taskId: string; rotationId: string; maxChars: number }): string {
  return [
    'SessionRelay: this conversation will be replaced by a fresh one to free context. Write a handover so the next conversation can continue the task without repeating work.',
    'Rules: do not run any new tool or command now; summarise only. Never include secrets, tokens, passwords or .env contents.',
    `Reply with exactly one block in this exact format, nothing inside it but the six sections, at most ${p.maxChars} characters:`,
    '',
    `${OPEN} task=${p.taskId} rotation=${p.rotationId}`,
    ...HEADINGS.flatMap(h => [`## ${h}`, h === 'Exact next actions' ? '1. [inferred] <first concrete step>' : '- [verified] <fact you checked> / [inferred] <your conclusion> / [unknown] <open question>']),
    CLOSE,
  ].join('\n')
}
