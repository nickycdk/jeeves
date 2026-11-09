// What a fresh conversation receives (ST-4.3, FR-09, D-23): the injected context and the continuation prompt.
// Pure and deterministic: the same task, handover and held prompts always give the same text (snapshot-tested).
import type { Item, Narrative } from './handover/parse.ts'
import { GOAL } from './handover/template.ts'
import { revFile, type ChangeKind, type TaskView } from './task.ts'

const FILES_SHOWN = 50
const bullets = (xs: readonly string[], none: string) => (xs.length ? xs.map(x => `- ${x}`) : [`- ${none}`])
const items = (xs: readonly Item[]) => xs.map(i => `- ${i.text}`)

/** `classic.SessionStart` additionalContext (ADR-003 channel): the task as the user wrote it, its DoD, and the latest handover. */
export function freshContext(p: { taskId: string; session: number; view: TaskView; handover: { file: string; text: string } | null }): string {
  return [
    `Jeeves managed task ${p.taskId}, session ${p.session}. Jeeves cleared the previous conversation to free context; below is what carries over. The previous transcript is gone on purpose.`,
    '',
    `## Original task (${revFile(1)}, the user's own words, never changed)`,
    p.view.original,
    '',
    '## Definition of Done',
    ...bullets(p.view.dod, '(none set)'),
    '## Verification commands (run them with your own Bash tool; Jeeves never runs them)',
    ...bullets(p.view.checks.map(c => `\`${c}\``), '(none set)'),
    '',
    ...(p.handover ? [`## Latest validated handover (${p.handover.file})`, p.handover.text] : ['## No handover yet', 'No handover was validated for this task yet: work out where it stands from the repository.']),
  ].join('\n')
}

/** The "Files changed since the task started" list of a merged handover's verified section (null: unknown or absent). */
export function changedFiles(merged: string): string[] | null {
  const lines = merged.replace(/\r\n?/g, '\n').split('\n')
  const at = lines.findIndex(l => l.startsWith('- Files changed since the task started'))
  if (at < 0) return null
  const out: string[] = []
  for (const l of lines.slice(at + 1)) {
    const m = /^ {2}- `(.+)`$/.exec(l)
    if (!m) break
    out.push(m[1]!)
  }
  return out.length || lines[at + 1] === '  - none' ? out : null
}

export type ContinuationInput = {
  taskId: string
  session: number
  /** The task as the user wrote it: the original prompt and every revision (ST-13.6: shown first). */
  view: TaskView
  /** `history/handover-NNN.md`, or null when the task has no validated handover yet. */
  handoverFile: string | null
  narrative: Narrative | null
  changedFiles: string[] | null
  /** Prompts the user typed during the rotation, verbatim (ADR-010 A1). */
  heldPrompts: readonly string[]
  /** Restore path (no /clear, no SessionStart): the context goes into the prompt itself (ADR-003). */
  context?: string
  /** `/jeeves recover` after the previous session stopped unexpectedly: work after the handover may exist (02 §8). */
  gap?: boolean
}

/** Prompts the user typed during a handover, quoted exactly (ADR-010 A1). */
export const heldBlock = (prompts: readonly string[]) => [
  'Messages the user typed during rotation (their own words, quoted exactly; answer them as from the user):',
  ...prompts.flatMap((m, k) => [`Message ${k + 1}:`, ...m.replace(/\r\n?/g, '\n').split('\n').map(l => `> ${l}`)]),
]

/** After a handover that ended in a pause, `/jeeves resume` delivers the messages it held, once (review fix 1). */
export const heldPrompt = (prompts: readonly string[]) =>
  ['Jeeves: the handover was stopped before a fresh conversation started, so these messages were never delivered.', ...heldBlock(prompts)].join('\n')

const ORIGINAL_SHOWN = 1500
const quote = (s: string) => s.replace(/\r\n?/g, '\n').split('\n').map(l => `> ${l}`)
const CHANGE: Record<ChangeKind, string> = { dod: 'Definition of Done item', check: 'Verification command, never run by Jeeves' }

/** ST-13.6 (spec §5.3): the user's words first, quoted; they alone define the task, the DoD and the checks. */
function usersWords(v: TaskView): string[] {
  const cut = v.original.length > ORIGINAL_SHOWN
  return [
    "The user's words (quoted exactly; only these define the task, its Definition of Done and its checks):",
    `Original task (${revFile(1)}${cut ? `, first ${ORIGINAL_SHOWN} characters; the full text is in your context` : ''}):`,
    ...quote(cut ? v.original.slice(0, ORIGINAL_SHOWN) : v.original),
    ...v.changes.flatMap(c => [`${CHANGE[c.kind as ChangeKind]} (${revFile(c.n)}):`, ...quote(c.text)]),
    '',
  ]
}

/** Claude's own Current goal from the last handover, labelled as such: data, never instructions (R-19). */
const summary = (n: Narrative | null) => n?.sections[GOAL].length
  ? ["Claude's summary at the last handover (may be wrong; it never changes the task, the DoD or the checks):", ...items(n.sections[GOAL]), '']
  : []

/** The prompt Jeeves submits in the fresh conversation: what is built, where to pick up, and the user's held messages. */
export function continuationPrompt(c: ContinuationInput): string {
  const n = c.narrative
  const files = c.changedFiles === null ? 'Files changed since the task started: unknown.'
    : c.changedFiles.length === 0 ? 'Files changed since the task started: none.'
    : `Files changed since the task started: ${c.changedFiles.slice(0, FILES_SHOWN).map(f => `\`${f}\``).join(', ')}${c.changedFiles.length > FILES_SHOWN ? `, and ${c.changedFiles.length - FILES_SHOWN} more` : ''}.`
  const built = n
    ? [
        'What has been built so far (from the handover):',
        'Completed:', ...items(n.sections['Completed since last handover']),
        files,
        'Tests and checks, with their last results:', ...items(n.sections['Tests and checks']),
        'Do not repeat or change:', ...items(n.sections['Do not repeat / do not change']),
        'Open work and blockers:', ...items(n.sections['Open work and blockers']),
        '',
        'Where to pick up (exact next actions):',
        ...n.sections['Exact next actions'].map((i, k) => `${k + 1}. ${i.text.replace(/^\d+[.)]\s*/, '')}`),
        '',
        'First verify the repository state against the handover: run git status, look at the files above and rerun the last tests. Do not redo anything listed as completed or under "Do not repeat". Then continue with next action 1 and keep working through the task until it is done.',
      ]
    : [
        'There is no validated handover yet. First check the repository state (git status, recent changes, tests) to see what is done, then continue the original task from there.',
      ]
  const held = c.heldPrompts.length ? ['', ...heldBlock(c.heldPrompts)] : []
  return [
    ...(c.context ? [c.context, '', '---', ''] : []),
    `Jeeves: you are session ${c.session} of managed task ${c.taskId}. The previous conversation was cleared to free context. The original task${c.handoverFile ? ` and the latest validated handover (${c.handoverFile})` : ''} are in your context.`,
    '',
    ...usersWords(c.view),
    ...summary(n),
    ...(c.gap ? [
      `Jeeves recovered this task: the previous session stopped unexpectedly${c.handoverFile ? ` after ${c.handoverFile} was written` : ''}. Work done after that may exist and is not described here. Before acting, compare the repository with the handover: run git status and git log, read any changed files, and do not redo work that is already there.`,
      '',
    ] : []),
    ...built,
    ...held,
  ].join('\n')
}
