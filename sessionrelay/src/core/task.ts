// The managed task (FR-05, ADR-007): a new task's state, and its append-only revision files. Pure.
import { SCHEMA_VERSION, type State } from './types.ts'

/** `task-rev-001.md`; rev 1 is the original prompt, byte for byte. */
export const revFile = (n: number) => `task-rev-${String(n).padStart(3, '0')}.md`

/** A DISABLED task, ready for the reducer's ON. */
export function newTaskState(t: { taskId: string; projectId: string; thresholdPercent: number; taskStartHead: string | null; at: string }): State {
  return {
    schemaVersion: SCHEMA_VERSION, taskId: t.taskId, projectId: t.projectId, status: 'DISABLED', reason: null, mode: 'full',
    taskRevision: 0, sessionSequence: 1, activeSessionId: null, rotation: null, lastValidatedHandover: null,
    rotationCount: 0, consecutiveFailures: 0, thresholdPercent: t.thresholdPercent, lastContext: null, armedFired: false,
    warnedSessionId: null, heldPrompts: [], taskStartHead: t.taskStartHead, lastErrorCode: null, updatedAt: t.at,
  }
}

/** What a later revision adds. Each revision file is one change, written once; the current task is all of them folded. */
export type ChangeKind = 'dod' | 'check'
export type Revision = { n: number; kind: 'original' | ChangeKind; text: string }
export type TaskView = { original: string; dod: string[]; checks: string[]; changes: Revision[] }

const LABEL: Record<ChangeKind, string> = { dod: 'Definition of Done item', check: 'Verification command (stored as text, never run by SessionRelay)' }
const HEADER = 'SessionRelay task revision'

/** Revision n >= 2: a short header, a blank line, then the user's text exactly as typed. */
export function renderChange(n: number, kind: ChangeKind, text: string, at: string): string {
  return `${HEADER} ${n}\nKind: ${kind}\nMeaning: ${LABEL[kind]}\nAdded by: /relay ${kind}, typed by the user\nAt: ${at}\n\n${text}`
}

/** Rev 1 is the original prompt as is; later ones are parsed back from `renderChange`. Null when a file is not one of ours. */
export function parseRevision(n: number, file: string): Revision | null {
  if (n === 1) return { n, kind: 'original', text: file }
  const split = file.indexOf('\n\n')
  if (split < 0 || !file.startsWith(`${HEADER} ${n}\n`)) return null
  const kind = /^Kind: (dod|check)$/m.exec(file.slice(0, split))?.[1] as ChangeKind | undefined
  return kind ? { n, kind, text: file.slice(split + 2) } : null
}

export function foldTask(revs: Revision[]): TaskView {
  const changes = revs.filter(r => r.kind !== 'original')
  return {
    original: revs.find(r => r.kind === 'original')?.text ?? '',
    dod: changes.filter(r => r.kind === 'dod').map(r => r.text),
    checks: changes.filter(r => r.kind === 'check').map(r => r.text),
    changes,
  }
}

const ORIGINAL_SHOWN = 1500

/** `/relay task`: the original prompt, every change since (each typed by the user), and the current DoD and checks. */
export function taskText(taskId: string, v: TaskView): string {
  const original = v.original.length > ORIGINAL_SHOWN ? `${v.original.slice(0, ORIGINAL_SHOWN)}\n[... ${v.original.length - ORIGINAL_SHOWN} more characters in ${revFile(1)}]` : v.original
  const list = (xs: string[], none: string) => (xs.length ? xs.map(x => `- ${x}`) : [none])
  return [
    `Task ${taskId}, revision ${v.changes.length + 1}`,
    `Original prompt (${revFile(1)}, never changed):`,
    original,
    '',
    v.changes.length ? 'Changes since, each typed by you:' : 'No changes since.',
    ...v.changes.map(c => `${revFile(c.n)}  ${c.kind === 'dod' ? 'DoD' : 'check'}: ${c.text}`),
    '',
    'Current Definition of Done:',
    ...list(v.dod, '(none: /relay dod <text> adds one)'),
    'Verification commands (never run by SessionRelay):',
    ...list(v.checks, '(none: /relay check <command> adds one)'),
  ].join('\n')
}
