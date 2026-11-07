// Recovery (02 §8, ST-6.1): what to do with a task found on disk that no live session runs. Pure.
import { recoverable } from './machine.ts'
import { newTaskState } from './task.ts'
import type { State } from './types.ts'

/** The task lock as found: `owner` is the session in owner.json (null when unreadable). */
export type LockView = { kind: 'free' } | { kind: 'held'; owner: string | null; stale: boolean }

export type Found =
  | { kind: 'state'; state: State; lock: LockView; leftover: string | null }
  | { kind: 'corrupt'; tooNew: boolean }

export type Action =
  /** Nothing to recover: `why` says what the task is (ended, paused, ...). */
  | { kind: 'none'; why: 'ended' | 'paused' | 'review' }
  /** This session runs the task. */
  | { kind: 'mine' }
  /** Another session holds a live lock: never touched (AC 3). */
  | { kind: 'lock-held'; owner: string | null }
  /** state.json is unreadable: rebuild it from events and files into NEEDS_REVIEW(STATE_CORRUPT), then recover. */
  | { kind: 'rebuild' }
  /** state.json comes from a newer Jeeves: left alone. */
  | { kind: 'too-new' }
  /**
   * Continue in this conversation from the last validated handover. `gap`: work after that handover may exist
   * (the conversation went on, or a new handover was lost). `adopt`: a handover saved for the interrupted rotation
   * whose state swap never happened (VALIDATING), used in place of the older one.
   */
  | { kind: 'recover'; gap: boolean; adopt: string | null }

/**
 * `me`: this session. `endedHere`: whether the lock's owner is a session this process ended itself (its /clear never
 * brought the fresh SessionStart), so its lock may be taken at once instead of after it goes stale.
 */
export function classify(f: Found, me: string, endedHere: (sessionId: string) => boolean): Action {
  if (f.kind === 'corrupt') return f.tooNew ? { kind: 'too-new' } : { kind: 'rebuild' }
  const s = f.state
  if (s.status === 'DISABLED' || s.status === 'COMPLETED' || s.status === 'FAILED') return { kind: 'none', why: 'ended' }
  if (s.status === 'PAUSED') return { kind: 'none', why: 'paused' }
  if (!recoverable(s)) return { kind: 'none', why: 'review' }
  const owner = f.lock.kind === 'held' ? f.lock.owner : null
  // This session runs it, except a repository mismatch it is waiting to have re-checked or relinked (ST-6.5).
  if (s.activeSessionId === me && (owner === null || owner === me)) return s.reason === 'REPO_MISMATCH' ? { kind: 'recover', gap: true, adopt: null } : { kind: 'mine' }
  if (f.lock.kind === 'held' && !f.lock.stale && owner !== me && !(owner !== null && endedHere(owner))) return { kind: 'lock-held', owner }
  switch (s.status) {
    // The handover of the interrupted rotation was saved and verified before the crash: nothing after it.
    case 'VALIDATING': return f.leftover ? { kind: 'recover', gap: false, adopt: f.leftover } : { kind: 'recover', gap: true, adopt: null }
    case 'ROTATING': case 'RESTORING': return { kind: 'recover', gap: false, adopt: null }
    default: return { kind: 'recover', gap: true, adopt: null }
  }
}

/** What survives a lost state.json: write-once files and the event log (02 §8). */
export type Remains = {
  taskId: string
  projectId: string
  /** `events.jsonl` lines, oldest first (unparseable ones are skipped). */
  events: string[]
  /** How many `task-rev-NNN.md` files exist in sequence from 1. */
  revisions: number
  /** The newest `history/handover-NNN.md` as a ref with its SHA-256, and how many there are. */
  handover: { ref: string; count: number } | null
  /** How many `sessions/NNN.json` files exist. */
  sessions: number
  at: string
}

/** A state rebuilt from what survives, always NEEDS_REVIEW(STATE_CORRUPT): the user decides, through /relay recover. */
export function rebuildState(r: Remains): State {
  const lines = r.events.flatMap(l => { try { return [JSON.parse(l) as Record<string, unknown>] } catch { return [] } })
  const last = lines.at(-1)
  const threshold = [...lines].reverse().map(l => /^threshold (\d+)%$/.exec(String(l.detail ?? ''))?.[1]).find(Boolean)
  const base = newTaskState({ taskId: r.taskId, projectId: r.projectId, thresholdPercent: threshold ? Number(threshold) : 50, taskStartHead: null, at: r.at })
  return {
    ...base, status: 'NEEDS_REVIEW', reason: 'STATE_CORRUPT', lastErrorCode: 'STATE_CORRUPT',
    taskRevision: r.revisions, sessionSequence: r.sessions + 1, rotationCount: r.handover?.count ?? 0,
    lastValidatedHandover: r.handover?.ref ?? null,
    activeSessionId: typeof last?.sessionId === 'string' ? last.sessionId : null,
  }
}
