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
