// Domain types for Jeeves (02 §4, §6). Pure: no engine, no I/O.

/** Current version of the files that have not changed since v0.1 (config, project, session, lock, event). */
export const SCHEMA_VERSION = 1
/** v0.3 (ST-13.1): `state.json` gains `origin`. */
export const STATE_SCHEMA_VERSION = 2
/** v0.3 (ST-13.1): project `config.json` gains `autoStart`; written as v2 only while it is set, so v0.2 keeps reading the others. */
export const DEFAULTS_SCHEMA_VERSION = 2
/** v0.3 (ST-13.1): `auto.json` in the state root. */
export const AUTO_SCHEMA_VERSION = 1

export const ORIGINS = ['auto', 'explicit'] as const
/** How a task started: `/jeeves on` (explicit) or auto-start (ADR-009 A3). Tasks from v0.2 read as explicit. */
export type TaskOrigin = (typeof ORIGINS)[number]
export const ON_OFF = ['on', 'off'] as const
export type OnOff = (typeof ON_OFF)[number]

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
  schemaVersion: SCHEMA_VERSION, thresholdPercent: 40, warnBeforePercent: 5,
  maxRotationsPerTask: 30, maxHandoverRetries: 2, maxConsecutiveFailures: 2,
  quiesceMaxTurns: 3, quiesceMaxMinutes: 20, autoRecover: false,
  handoverMaxChars: 12000, verificationCommands: [],
}

/** `projects/<projectId>/config.json` (ST-11.1, ADR-009 A2): copied into a new task at /jeeves on. */
export type ProjectDefaults = {
  schemaVersion: number
  thresholdPercent?: number
  verificationCommands: string[]
  /** The handover limit for new tasks here (`/jeeves defaults limit <n>`); absent = DEFAULT_CONFIG.maxRotationsPerTask. */
  maxRotations?: number
  /** v0.3: auto-start for this project; absent = not set (spec §5.5). */
  autoStart?: OnOff
}
export const DEFAULTS_CHECKS_MAX = 20

/** `<stateRoot>/auto.json` (v0.3, spec §5.5–5.6): auto-start everywhere, written by `/jeeves auto` and the upgrade check. */
export type AutoFile = { schemaVersion: number; default: OnOff; reason?: string }

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
  /** Whether the one "prepare handover" prompt was sent because the request found Claude idle (D-23). */
  nudged?: boolean
  /** Relative test threshold only (D-25): the source session's last reading; the fresh session must start below it. */
  guardPct?: number
  /** The validated handover's Current goal on one line (ST-13.6), for the rotation line. */
  goal?: string
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
  origin: TaskOrigin
  status: Status
  reason: ReasonCode | null
  mode: Mode
  /** Revisions written so far; 0 while `/jeeves on` waits for the first prompt to capture. */
  taskRevision: number
  sessionSequence: number
  activeSessionId: string | null
  /** When the active session took the task, and its first known context reading (for `sessions/NNN.json`). */
  /** `firstPct`: relative test threshold only (D-25): the session's first tool reading, passed over as its start. */
  sessionStart?: { at: Iso; pct: number | null; firstPct?: number }
  rotation: Rotation | null
  lastValidatedHandover: string | null
  rotationCount: number
  consecutiveFailures: number
  thresholdPercent: number
  /** `/jeeves limit <n>` or the project default: handovers this task may make; absent = DEFAULT_CONFIG.maxRotationsPerTask. */
  maxRotations?: number
  lastContext: ContextReading | null
  armedFired: boolean
  /** Session in which the T−5 warning was shown (warn once per session). */
  warnedSessionId: string | null
  heldPrompts: string[]
  /** `/jeeves dod|check` typed before the first prompt: written as revisions 2.. right after rev 1 is captured. */
  pendingChanges?: { kind: 'dod' | 'check'; text: string }[]
  /** Auto tasks (ST-13.4, spec §5.2): main turns ended so far, counted to GRACE_TURNS; no rotation before that. */
  graceTurns?: number
  /** Created by v0.2 (set by the state v1 → v2 migration): its handovers may omit Current goal (ST-13.6). */
  preUpgrade?: boolean
  /** `/jeeves later` reached its cap (ST-13.5): the warning says no further postponing is possible. */
  laterCapped?: boolean
  /** A completion block already got its one "run the missing checks" Stop block in this session (ST-5.2). */
  completionAsked?: boolean
  /** `/jeeves pause` during a handover: pause once the fresh conversation has its task (ST-2.5). */
  pauseRequested: boolean
  taskStartHead: string | null
  lastErrorCode: ReasonCode | null
  /** Evidence ledger (ST-3.1): the last LEDGER_MAX commands and edits, oldest first. */
  ledger: LedgerEntry[]
  updatedAt: Iso
}

/** A finished Bash call. `ok`: it did not fail or get denied; `exit` is known only when the call ran to an end (null: denied, backgrounded). */
export type CommandEntry = { kind: 'cmd'; command: string; ok: boolean; exit: number | null; at: Iso; agent: string | null }
/** A successful Edit/Write/NotebookEdit. `agent`: the subagent's id, null on the main loop. */
export type EditEntry = { kind: 'edit'; path: string; at: Iso; agent: string | null }
export type LedgerEntry = CommandEntry | EditEntry
export const LEDGER_MAX = 200
export const LEDGER_COMMAND_MAX = 300

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
  /** The conversation's cost at its end (`$.session.usage().cost`; it starts over at /clear), when known. */
  costUsd?: number
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
