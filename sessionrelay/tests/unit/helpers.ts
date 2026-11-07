import type { Kinds } from '../../src/core/schema.ts'
import { DEFAULT_CONFIG, type EventLine, type LockOwner, type ProjectRecord, type SessionRecord, type State } from '../../src/core/types.ts'
export type { Kinds }

/** Seeded PRNG (mulberry32): property tests are reproducible from the seed. */
export function prng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]! }
}

export const AT = '2026-11-07T08:00:00.000Z'

export const validState = (over: Partial<State> = {}): State => ({
  schemaVersion: 1, taskId: 't_20261107_k3m9qa', projectId: '9f2c00aa11bb22cc', status: 'MONITORING',
  reason: null, mode: 'full', taskRevision: 1, sessionSequence: 1, activeSessionId: 'sess-a', rotation: null,
  lastValidatedHandover: null, rotationCount: 0, consecutiveFailures: 0, thresholdPercent: 50,
  lastContext: null, armedFired: false, warnedSessionId: null, heldPrompts: [], pauseRequested: false, taskStartHead: null,
  lastErrorCode: null, updatedAt: AT, ...over,
})

export const VALID = {
  state: validState(),
  config: { ...DEFAULT_CONFIG },
  project: { schemaVersion: 1, repoRoot: '/r', worktree: '/r', createdAt: AT } satisfies ProjectRecord,
  session: { schemaVersion: 1, sessionId: 's1', startedAt: AT, endedAt: null, endReason: null, startPct: null, endPct: 12 } satisfies SessionRecord,
  lock: { schemaVersion: 1, ownerSessionId: 's1', acquiredAt: AT, heartbeatAt: AT } satisfies LockOwner,
  event: { v: 1, at: AT, taskId: 't1', rotationId: null, from: 'MONITORING', to: 'ROTATION_REQUESTED', code: 'THRESHOLD', pct: 52, sessionId: 's1', detail: '' } satisfies EventLine,
} satisfies { [K in keyof Kinds]: Kinds[K] }
