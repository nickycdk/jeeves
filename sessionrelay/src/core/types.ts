// Domain types for SessionRelay (02 §4, §6). Pure: no engine, no I/O.

export const SCHEMA_VERSION = 1

export const STATUSES = [
  'DISABLED', 'MONITORING', 'ROTATION_REQUESTED', 'QUIESCING', 'HANDOVER_GENERATING', 'VALIDATING',
  'ROTATING', 'RESTORING', 'CONTINUING', 'PAUSED', 'BLOCKED', 'NEEDS_REVIEW', 'FAILED', 'COMPLETED',
] as const
export type Status = (typeof STATUSES)[number]

/** States from which nothing rotates automatically (02 §4 invariants). */
export const INERT: readonly Status[] = ['DISABLED', 'PAUSED', 'BLOCKED', 'NEEDS_REVIEW', 'FAILED', 'COMPLETED']
/** States that hold a rotation in flight. */
export const ROTATION_STATES: readonly Status[] = [
  'ROTATION_REQUESTED', 'QUIESCING', 'HANDOVER_GENERATING', 'VALIDATING', 'ROTATING', 'RESTORING',
]

// 02 §6.5, plus STATE_CORRUPT, which 02 §8 uses but the §6.5 list omits.
export const REASON_CODES = [
  'THRESHOLD', 'MANUAL', 'COMPACTED', 'UNSAFE_BOUNDARY', 'USER_INTERRUPT', 'USER_CLEAR', 'USER_PAUSE',
  'HANDOVER_INVALID', 'ROTATE_UNAVAILABLE', 'POSSIBLE_LOOP', 'MAX_ROTATIONS', 'RATE_LIMIT', 'AUTH',
  'BILLING', 'OVERLOADED', 'API_ERROR', 'DISK', 'LOCK_HELD', 'STALE_LOCK', 'SCHEMA_TOO_NEW',
  'REPO_MISMATCH', 'DOD_UNMET', 'COMPLETED', 'STATE_CORRUPT',
] as const
export type ReasonCode = (typeof REASON_CODES)[number]

export const TRIGGERS = ['THRESHOLD', 'MANUAL', 'COMPACTED'] as const
export type Trigger = (typeof TRIGGERS)[number]

export const MODES = ['full', 'assisted', 'unsupported'] as const
export type Mode = (typeof MODES)[number]

/** Where a rotation stands; the dedupe key of each effect is `rotationId:step`. */
export const ROTATION_STEPS = [
  'REQUESTED', 'QUIESCING', 'HANDOVER_REQUESTED', 'HANDOVER_PERSISTED', 'CLEAR_SCHEDULED', 'CLEARED',
  'RESTORED', 'CONTINUED',
] as const
export type RotationStep = (typeof ROTATION_STEPS)[number]

/** ISO-8601 UTC timestamp string, as written to disk. */
export type Iso = string

export type Config = {
  schemaVersion: number
  thresholdPercent: number
  warnBeforePercent: number
  maxRotationsPerTask: number
  maxHandoverRetries: number
  maxConsecutiveFailures: number
  quiesceMaxTurns: number
  quiesceMaxMinutes: number
  autoRecover: boolean
  handoverMaxChars: number
  verificationCommands: string[]
}

export const DEFAULT_CONFIG: Config = {
  schemaVersion: SCHEMA_VERSION, thresholdPercent: 50, warnBeforePercent: 5,
  maxRotationsPerTask: 10, maxHandoverRetries: 2, maxConsecutiveFailures: 2,
  quiesceMaxTurns: 3, quiesceMaxMinutes: 20, autoRecover: false,
  handoverMaxChars: 12000, verificationCommands: [],
}

export type Rotation = {
  rotationId: string
  trigger: Trigger
  requestedAt: Iso
  sourceSessionId: string | null
  targetSessionId: string | null
  step: RotationStep
  retries: number
  quiesceCount: number
  /** Whether the one soft-quiesce note for this rotation was appended (ADR-004). */
  noteAppended: boolean
}

/** A context reading; `percent` absent means unknown, never 0 (AC-06). */
export type ContextReading = {
  percent?: number
  tokens?: number
  window: number
  at: Iso
}

export type State = {
  schemaVersion: number
  taskId: string
  projectId: string
  status: Status
  reason: ReasonCode | null
  mode: Mode
  taskRevision: number
  sessionSequence: number
  activeSessionId: string | null
  rotation: Rotation | null
  lastValidatedHandover: string | null
  rotationCount: number
  consecutiveFailures: number
  thresholdPercent: number
  lastContext: ContextReading | null
  armedFired: boolean
  /** Session in which the T−5 warning was shown (warn once per session). */
  warnedSessionId: string | null
  heldPrompts: string[]
  taskStartHead: string | null
  lastErrorCode: ReasonCode | null
  updatedAt: Iso
}

export type ProjectRecord = {
  schemaVersion: number
  repoRoot: string
  worktree: string
  createdAt: Iso
}

export type SessionRecord = {
  schemaVersion: number
  sessionId: string
  startedAt: Iso
  endedAt: Iso | null
  endReason: string | null
  startPct: number | null
  endPct: number | null
}

export type LockOwner = {
  schemaVersion: number
  ownerSessionId: string
  acquiredAt: Iso
  heartbeatAt: Iso
}

/** One `events.jsonl` line (02 §6.5); `detail` is redacted before it gets here. */
export type EventLine = {
  v: number
  at: Iso
  taskId: string
  rotationId: string | null
  from: Status | null
  to: Status | null
  code: ReasonCode | null
  pct: number | null
  sessionId: string | null
  detail: string
}
