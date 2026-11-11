// The state machine (02 §4): reduce(state, input, ctx) -> { state, effects }. Pure: time and IDs come in through ctx.
import { largeWindow } from './autostart.ts'
import { evaluate } from './completion.ts'
import { pruneTails, type LedgerRecord } from './evidence.ts'
import { INERT, LEDGER_MAX, ROTATION_STATES, SCHEMA_VERSION, type Config, type Mode, type ReasonCode, type Rotation, type RotationStep, type SessionRecord, type State, type Status, type Trigger } from './types.ts'

export type Input =
  | { type: 'ON'; mode: Mode; lockAcquired: boolean; sessionId: string }
  /** `sessionId`: the session turning it off, which now holds the lock it releases. */
  | { type: 'OFF'; sessionId: string }
  /** A user command wrote task revision `revision` (FR-05; never model text). */
  /** `pending`: the revision wrote the first queued change (pendingChanges[0]), which is now done. */
  | { type: 'REVISED'; revision: number; pending?: boolean }
  /** `/jeeves dod|check` before the original prompt is captured (taskRevision 0): kept until rev 1 exists. */
  | { type: 'QUEUE_CHANGE'; kind: 'dod' | 'check'; text: string }
  /** ST-13.7: `/jeeves on <goal>` in an auto task; the goal revision is written first. */
  | { type: 'EXPLICIT' }
  /** `/jeeves threshold <n>`, n a whole number 20..90 (FR-03). */
  | { type: 'SET_THRESHOLD'; percent: number }
  /** `/jeeves limit <n>`, n a whole number 1..100: handovers this task may make before PAUSED(MAX_ROTATIONS). */
  | { type: 'SET_LIMIT'; max: number }
  /** `fromTool`: read at a main-loop tool result, so after a model call (D-25 counts only those as a session's start). */
  | { type: 'MEASURE'; percent?: number; tokens?: number; window: number; sessionId: string; fromTool?: boolean }
  | { type: 'ROTATE_CMD' }
  /** `/jeeves later` (ST-13.5): move the threshold up by LATER_STEP, never past `cap` (laterCap, read at each command). */
  | { type: 'LATER'; cap: number }
  /** `/jeeves retry` (ST-10.2, ST-10.3): ask again after NEEDS_REVIEW(HANDOVER_INVALID), or watch again after POSSIBLE_LOOP. */
  | { type: 'RETRY_CMD' }
  /** A compaction of the main conversation stood (ADR-006); `trigger` as the engine named it. */
  | { type: 'COMPACTED'; trigger?: string }
  /** A tool call finished: `entry` goes to the ledger; on the main loop it is also the soft-quiesce point. */
  /** `reading`: the main conversation's context read at this tool result (mid-turn readings, see TOOL_RESULT). */
  | { type: 'TOOL_RESULT'; main: boolean; entry?: LedgerRecord; reading?: { percent?: number; tokens?: number; window: number; sessionId: string } }
  /** Main-loop classic.Stop. `handover` is the parse+validate outcome of the last message (HANDOVER_GENERATING only). */
  /** `fatal`: the handover cannot become valid by asking again (the branch moved, git did not answer): stop at once. */
  | { type: 'STOP'; backgroundTasks: number; runningAgents: number; handover?: { ok: true } | { ok: false; errors: string[]; fatal?: ReasonCode } }
  | { type: 'HANDOVER_PERSISTED'; ok: boolean; ref?: string; goal?: string }
  /** A main-loop turn ended. `handoverVerified`: the saved handover still matches its SHA-256 (read in ROTATING only). */
  | { type: 'TURN_COMPLETE'; reason: 'answer' | 'aborted' | 'refusal' | 'error'; handoverVerified?: boolean }
  /** The main loop is idle (no turn open), so no Stop will come by itself (D-23). */
  | { type: 'IDLE' }
  /** The heartbeat's clock check while QUIESCING (ADR-004: 3 stops or quiesceMaxMinutes, whichever comes first): with work left in the background no further Stop may ever come. */
  | { type: 'QUIESCE_TICK' }
  /** `costUsd`: the ending conversation's cost, when the engine gave one. */
  | { type: 'SESSION_END'; reason: string; sessionId: string; costUsd?: number }
  /** `handoverOk`: the handover to inject was read back and matches its SHA-256 (or the task has none yet). */
  | { type: 'SESSION_START_CLEAR'; sessionId: string; handoverOk: boolean }
  | { type: 'CLEAR_FAILED' }
  /** `$.prompt.submit` of the continuation rejected (ADR-002 A1: checked at first use). */
  | { type: 'SUBMIT_FAILED'; heldPrompts: string[] }
  /** The fresh conversation holds the task context (after /clear resolved, or after the restore-path append). */
  | { type: 'CONTEXT_READY' }
  /** A prompt the user typed during a handover, held for the fresh conversation (ADR-010). */
  | { type: 'HOLD_PROMPT'; text: string }
  | { type: 'PAUSE' }
  | { type: 'RESUME'; lockOk: boolean; sessionId: string }
  /** `/jeeves continue` in a fresh conversation (assisted mode, ST-4.6); the command already holds the lock. */
  | { type: 'CONTINUE_CMD'; sessionId: string }
  /** classic.StopFailure on the main loop (ST-6.2). `resetsAt`: when the exhausted rate-limit window resets, if known. */
  | { type: 'STOP_FAILURE'; error: string; resetsAt?: string }
  /** Claude's JEEVES-COMPLETE block at a main-loop Stop: the task's verification commands and the block's blockers (ST-5.2). */
  | { type: 'COMPLETE_BLOCK'; commands: string[]; blockers: string[] }
  /** `/jeeves done`: the user confirms a completion Jeeves could not verify (ADR-007). */
  | { type: 'DONE_CMD'; sessionId: string }
  /**
   * `/jeeves recover` (ST-6.1, 02 §8): this session took the lock of a task no live session runs and continues it here
   * (restore path). `adopt`: the interrupted rotation's saved handover, recorded now (its state swap never happened).
   */
  | { type: 'RECOVER'; sessionId: string; adopt?: string }
  /** A state write failed (ST-6.5): the last written state stays the checkpoint; this is written in its place if it can be. */
  /** `to`: the status the failed write was going to record. */
  | { type: 'DISK_FAILED'; path: string; error: string; to: Status }
  /** The repository is not the one the handover describes (ST-6.5): no continuation; this session keeps the lock. */
  /** `adopt`: the handover the restore was built on (recovery may have adopted a newer one than the state records). */
  | { type: 'REPO_MISMATCH'; sessionId: string; detail: string; adopt?: string }
  /** `/jeeves recover --relink` moved the task into this project's folder (the repository moved, ST-6.5). */
  | { type: 'RELINKED'; projectId: string }

export type InputType = Input['type']

type Keyed = { key: string }
export type Effect = Keyed & (
  | { type: 'LOG_EVENT'; rotationId: string | null; from: Status; to: Status; code: ReasonCode | null; detail: string }
  | { type: 'TOAST'; text: string }
  | { type: 'APPEND_NOTE' }
  | { type: 'CAPTURE_FACTS' }
  | { type: 'BLOCK_STOP'; kind: 'handover-request' | 'handover-retry' | 'completion-missing'; errors: string[] }
  | { type: 'PERSIST_HANDOVER' }
  | { type: 'RUN_CLEAR' }
  | { type: 'SUBMIT_NUDGE' }
  /** `prompt`: the restore path puts the context into the continuation prompt itself (ADR-003 channel note). */
  | { type: 'INJECT_CONTEXT'; via: 'session-start' | 'prompt' }
  | { type: 'SUBMIT_CONTINUATION'; heldPrompts: string[] }
  /** `/jeeves resume` after a handover that ended in a pause: deliver the prompts it held (ADR-010). */
  | { type: 'SUBMIT_HELD'; heldPrompts: string[] }
  | { type: 'TRANSFER_LOCK'; from: string | null; to: string }
  | { type: 'RELEASE_LOCK' }
  /** Write `sessions/NNN.json` once for the session that just ended (ST-4.2). */
  | { type: 'WRITE_SESSION'; n: number; record: SessionRecord }
)

/**
 * `thresholdOverride`: the test-only threshold (06 §1); used in place of the task's, never stored.
 * `thresholdRelative`: the test-only relative threshold (D-25): this session's first reading + d.
 */
export type Ctx = { now: number; config: Config; newRotationId: string; thresholdOverride?: number; thresholdRelative?: number }

/** `ignored` says why an input changed nothing (forbidden or irrelevant here); the adapter logs it. */
export type Output = { state: State; effects: Effect[]; ignored?: string }

const ACTIVE = (s: Status) => !INERT.includes(s)
export const LOOP_MARGIN = 10
export const TEST_LOOP_MARGIN = 0.5
/** Spec §5.2: an auto task does not rotate in its first 3 main turns unless the context passes the threshold by NEAR_MARGIN. */
export const GRACE_TURNS = 3
/** A user's /clear (spec §5.7). */
export const USER_CLEAR_AUTO = 'Jeeves: task ended (new conversation); the next prompt starts a new one'
export const USER_CLEAR_EXPLICIT = 'Jeeves: paused (you cleared the conversation); /jeeves resume continues the task'
/** Spec §5.2: a new auto task whose first reading is this close to the threshold ends at once. */
export const NEAR_MARGIN = 10
/** `/jeeves later` (spec §5.5): each one moves the threshold up this much. */
export const LATER_STEP = 10
export const LATER_MAX = 90
/**
 * The highest threshold `/jeeves later` may set: 90%, or 5 points below the auto-compaction point when that is lower,
 * so a postponed handover always comes before Claude Code compacts. `autoCompactTokens` null: auto-compaction is off.
 */
export function laterCap(window: number, autoCompactTokens: number | null): number {
  if (autoCompactTokens === null || window <= 0) return LATER_MAX
  return Math.min(LATER_MAX, Math.floor((autoCompactTokens / window) * 100) - 5)
}
/** Plan 12: a fresh conversation with less room than ROOM_MIN points gets a hint naming a threshold with about ROOM_TARGET. */
export const ROOM_MIN = 20
export const ROOM_TARGET = 30
/** The threshold to suggest when a conversation starting at `p` has little room under `T`, or null when none is worth typing. */
export function roomHint(p: number, T: number, cap: number): number | null {
  if (T - p >= ROOM_MIN) return null
  const next = Math.min(Math.floor(cap / 5) * 5, Math.ceil((p + ROOM_TARGET) / 5) * 5)
  return next >= T + 10 ? next : null
}
/** The warning and the `/jeeves later` answer once the cap is reached (spec §5.5). */
export const capText = (t: number, p: number | undefined) =>
  `Jeeves hands over at ${t}% (now ${p === undefined ? '?' : Math.round(p)}%); can't postpone further. /jeeves off to keep this conversation.`
/** The near-threshold message (spec §5.2). */
export const nearText = (p: number) => `Jeeves: not watching this session, context already at ${Math.round(p)}%; /jeeves on to watch anyway`
export const THRESHOLD_MIN = 20
export const THRESHOLD_MAX = 90
export const LIMIT_MIN = 1
export const LIMIT_MAX = 100
export const isLimit = (n: number) => Number.isInteger(n) && n >= LIMIT_MIN && n <= LIMIT_MAX
export const isThreshold = (n: number) => Number.isInteger(n) && n >= THRESHOLD_MIN && n <= THRESHOLD_MAX
/** Where a JEEVES-COMPLETE block counts: monitoring, or a rotation that has not asked Claude for anything yet. */
export const COMPLETION_STATES: readonly Status[] = ['MONITORING', 'CONTINUING', 'ROTATION_REQUESTED', 'QUIESCING']
export const HELD_STATES: readonly Status[] = ['HANDOVER_GENERATING', 'VALIDATING', 'ROTATING', 'RESTORING']
/** The schema's cap on held prompts; past it a prompt goes through to the conversation instead. */
export const HELD_MAX = 50

export function stopFailureCode(error: string): ReasonCode {
  switch (error) {
    case 'rate_limit': return 'RATE_LIMIT'
    case 'authentication_failed': case 'oauth_org_not_allowed': case 'verification_required': case 'cloud_credential_error': return 'AUTH'
    case 'billing_error': case 'account_on_hold': return 'BILLING'
    case 'overloaded': return 'OVERLOADED'
    default: return 'API_ERROR'
  }
}

/** A task `/jeeves recover` may continue: active, blocked, or stopped because its state.json had to be rebuilt. */
export const recoverable = (s: State) =>
  ACTIVE(s.status) || s.status === 'BLOCKED' || (s.status === 'NEEDS_REVIEW' && s.reason === 'STATE_CORRUPT')

/** ST-6.5 / AC-23: a failed task-file write names the folder and the fix. */
export const diskText = (path: string, error: string) =>
  `Blocked: Jeeves could not write its task files in ${path} (${error.slice(0, 120)}). The last saved state is kept. Free disk space or fix that folder's permissions, then type /jeeves resume.`

/** What the user should do about each StopFailure code (ST-6.2, AC-23). Jeeves never retries by itself. */
export function stopFailureText(code: ReasonCode, error: string, resetsAt?: string): string {
  const reset = resetsAt && !Number.isNaN(Date.parse(resetsAt)) ? new Date(resetsAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : null
  switch (code) {
    case 'RATE_LIMIT': return `Paused: the usage limit is reached.${reset ? ` It resets at ${reset}.` : ''} Then type /jeeves resume.`
    case 'AUTH': return `Paused: Claude Code is not logged in (${error}). Run /login, then /jeeves resume.`
    case 'BILLING': return `Paused: your account has a billing problem (${error}). Fix it, then /jeeves resume.`
    case 'OVERLOADED': return 'Paused: the API is overloaded. Wait a few minutes, then /jeeves resume.'
    default: return `Paused: the API returned an error (${error}). /jeeves resume tries again.`
  }
}

/** The model-switch message (spec §5.1), with the window rounded to thousands. */
export const windowEndText = (window: number) => `Jeeves: not watching any more (this model's window is ${Math.round(window / 1000)}K); /jeeves on to watch anyway`

/** ADR-004 (+A1): a main-loop Stop is a safe boundary when no background task and no subagent is running. Crons do not count. */
export const isSafe = (b: { backgroundTasks: number; runningAgents: number }) => b.backgroundTasks === 0 && b.runningAgents === 0

export function reduce(state: State, input: Input, ctx: Ctx): Output {
  const at = new Date(ctx.now).toISOString()
  const rel = ctx.thresholdRelative
  const startPct = state.sessionStart?.pct ?? null
  // D-25: no request until this session's first reading is known.
  const T = rel !== undefined ? (startPct === null ? Infinity : startPct + rel) : ctx.thresholdOverride ?? state.thresholdPercent
  // Loop guard (02 §4: rearm below T−10). Under the test override a fresh live session already starts near 6%, so a
  // cheap test threshold (~8%) uses a 0.5-point margin; real thresholds (20..90) always keep 10 (ST-4.8 reading).
  // Relative (D-25 as amended): below the source session's last reading, so the rotation freed context; none recorded rearms.
  const rearmBelow = rel !== undefined ? state.rotation?.guardPct ?? Infinity
    : T - (ctx.thresholdOverride === undefined ? LOOP_MARGIN : TEST_LOOP_MARGIN)
  const shown = (n: number) => Math.round(n * 100) / 100
  // ST-13.4: a new auto task (before its first rotation) is in its grace period for its first main turns.
  const isNewAuto = state.origin === 'auto' && state.rotationCount === 0
  const inGrace = isNewAuto && (state.graceTurns ?? 0) < GRACE_TURNS
  const rid = state.rotation?.rotationId ?? '-'
  const effects: Effect[] = []
  let next: State = state

  const ignore = (why: string): Output => ({ state, effects: [], ignored: `${input.type} in ${state.status}: ${why}` })
  const go = (to: Status, code: ReasonCode | null, patch: Partial<State> = {}, detail = ''): void => {
    const from = next.status
    next = { ...next, ...patch, status: to, reason: code, updatedAt: at }
    // A deferred pause is spent once the task stops on its own.
    if (INERT.includes(to)) next.pauseRequested = false
    // A user's own pause or /clear is not an error.
    const isError = code !== null && !code.startsWith('USER_') && to !== 'MONITORING' && to !== 'COMPLETED' && to !== 'CONTINUING' && !ROTATION_STATES.includes(to)
    if (isError) next.lastErrorCode = code
    // A rotation that ended in an error counts towards maxConsecutiveFailures; a continued rotation resets it.
    if (isError && (ROTATION_STATES.includes(from) || from === 'CONTINUING')) next.consecutiveFailures = state.consecutiveFailures + 1
    // The rotation this line is about, even when the transition just ended it.
    const r = next.rotation?.rotationId ?? rid
    effects.push({ type: 'LOG_EVENT', key: `${r}:${to}`, rotationId: r === '-' ? null : r, from, to, code, detail })
  }
  const setRotation = (patch: Partial<Rotation>) => { next = { ...next, rotation: { ...next.rotation!, ...patch }, updatedAt: at } }
  const key = (step: RotationStep | string) => `${next.rotation?.rotationId ?? rid}:${step}`
  const done = (): Output => ({ state: next, effects })
  // A change that keeps the status (revision, threshold); logged as from = to.
  const edit = (patch: Partial<State>, what: string, detail: string): Output => {
    next = { ...next, ...patch, updatedAt: at }
    effects.push({ type: 'LOG_EVENT', key: `${rid}:${what}`, rotationId: state.rotation?.rotationId ?? null, from: state.status, to: state.status, code: null, detail })
    return done()
  }

  // ADR-002: no automatic /clear here; the saved handover waits for the user's /clear and /jeeves continue (AC-25).
  const unavailable = (detail: string): Output => {
    go('NEEDS_REVIEW', 'ROTATE_UNAVAILABLE', { rotation: null, mode: 'assisted' }, detail)
    effects.push({ type: 'TOAST', key: key('assisted'), text: 'Automatic /clear is unavailable. The handover is saved. Run /clear, then type /jeeves continue.' })
    return done()
  }

  const request = (trigger: Trigger, detail?: string): Output => {
    // ST-4.5 guards, before anything is asked of Claude.
    if (state.consecutiveFailures >= ctx.config.maxConsecutiveFailures) {
      const last = state.lastErrorCode ?? 'API_ERROR'
      go('FAILED', last, { rotation: null }, `${state.consecutiveFailures} failed rotations in a row`)
      effects.push({ type: 'TOAST', key: `-:failed:${state.consecutiveFailures}`, text: `Stopped: ${state.consecutiveFailures} handovers in a row failed (last ${last}). Run /jeeves status.` })
      return done()
    }
    if (state.rotationCount >= (state.maxRotations ?? ctx.config.maxRotationsPerTask)) {
      go('PAUSED', 'MAX_ROTATIONS', { rotation: null, armedFired: false }, `${state.rotationCount} rotations`)
      effects.push({ type: 'TOAST', key: `-:max:${state.rotationCount}`, text: `Paused: this task reached ${state.rotationCount} rotations, the limit. /jeeves limit <n> raises it, then /jeeves resume; /jeeves off ends it.` })
      return done()
    }
    const rotation: Rotation = {
      rotationId: ctx.newRotationId, trigger, requestedAt: at, sourceSessionId: null, targetSessionId: null,
      step: 'REQUESTED', retries: 0, quiesceCount: 0, noteAppended: false,
    }
    go('ROTATION_REQUESTED', trigger, { rotation, armedFired: true }, detail ?? (trigger === 'THRESHOLD' ? `context ${next.lastContext?.percent ?? '?'}%` : ''))
    return done()
  }

  // Context readings are recorded in every state (status shows them); unknown stays unknown (AC-06).
  if (input.type === 'MEASURE') {
    const reading = { window: input.window, at, ...(input.percent !== undefined ? { percent: input.percent } : {}), ...(input.tokens !== undefined ? { tokens: input.tokens } : {}) }
    next = { ...next, lastContext: reading, updatedAt: at }
    const p = input.percent
    // D-25 (relative only): a session's start is its first tool reading that differs from its first one. A fresh session's
    // first model call really is ~2.4 points smaller than the next (live runs 6-9: 37.5K tokens, then ~64K), and every tool
    // result of that first response reads the same figure (run 9: two tool calls, both 3.76%).
    const ss = next.sessionStart
    if (p !== undefined && ss && ss.pct === null && input.sessionId === state.activeSessionId) {
      if (rel === undefined || (input.fromTool && ss.firstPct !== undefined && p !== ss.firstPct)) next = { ...next, sessionStart: { at: ss.at, pct: p } }
      else if (input.fromTool && ss.firstPct === undefined) next = { ...next, sessionStart: { ...ss, firstPct: p } }
    }
    // Relative: a reading counts for the loop guard only once the session's start is known.
    const counts = rel === undefined || next.sessionStart?.pct != null
    // ST-13.3 (spec §5.1, ADR-009 A4): a reading showing a window auto-start would not take (`/model` below 200K) ends
    // an auto task; a 1M task moved to 200K keeps its threshold, as explicit tasks do. Not mid-rotation (the reading after it lands in CONTINUING), not on an unknown window (0).
    if (state.origin === 'auto' && (state.status === 'MONITORING' || state.status === 'CONTINUING') && input.window > 0 && !largeWindow(input.window)) {
      go('DISABLED', null, { rotation: null }, `window ${input.window}`)
      effects.push({ type: 'RELEASE_LOCK', key: key('release') }, { type: 'TOAST', key: `-:window:${input.sessionId}`, text: windowEndText(input.window) })
      return done()
    }
    if (state.status === 'MONITORING') {
      if (p === undefined) return done()
      // ST-13.4 near-threshold rule: the first known reading of a new auto task (a large CLAUDE.md, a pasted log).
      const margin = ctx.thresholdOverride === undefined ? NEAR_MARGIN : TEST_LOOP_MARGIN
      if (isNewAuto && state.lastContext?.percent === undefined && rel === undefined && p >= T - margin) {
        go('DISABLED', null, { rotation: null }, `first reading ${p}%`)
        effects.push({ type: 'RELEASE_LOCK', key: key('release') }, { type: 'TOAST', key: `-:near:${input.sessionId}`, text: nearText(p) })
        return done()
      }
      // Grace (spec §5.2 as amended 2026-11-09) holds the handover back at most `margin` points: a one-turn task still rotates.
      if (p >= T && !state.armedFired && (!inGrace || p >= T + margin)) return request('THRESHOLD')
      if (p >= T - ctx.config.warnBeforePercent && p < T && state.warnedSessionId !== input.sessionId) {
        next = { ...next, warnedSessionId: input.sessionId }
        effects.push({ type: 'TOAST', key: `-:warn:${input.sessionId}:${T}`, text: state.laterCapped && ctx.thresholdOverride === undefined ? capText(T, p) : `Context at ${Math.round(p)}%. Jeeves will hand over at ${shown(T)}%.` })
      }
      return done()
    }
    if (state.status === 'CONTINUING') {
      if (p === undefined || !counts) return done()
      if (p < rearmBelow) {
        go('MONITORING', null, { armedFired: false, rotation: null, sessionSequence: state.sessionSequence + 1, warnedSessionId: null, completionAsked: false, consecutiveFailures: 0 }, `rearmed at ${p}%`)
        return done()
      }
      // ST-10.3: reviewable (/jeeves retry) until the failure counter is used up, then FAILED as in v0.1.
      const final = state.consecutiveFailures + 1 >= ctx.config.maxConsecutiveFailures
      go(final ? 'FAILED' : 'NEEDS_REVIEW', 'POSSIBLE_LOOP', { rotation: null }, `fresh session already at ${p}%`)
      const msg = `the fresh session is already at ${p}% (threshold ${shown(rel !== undefined ? rearmBelow : T)}%). Possible rotation loop.`
      effects.push({ type: 'TOAST', key: key('loop'), text: final ? `Stopped: ${msg} Run /jeeves status.` : `Paused: ${msg} /jeeves retry to keep working here, or raise /jeeves threshold.` })
      return done()
    }
    return done()
  }

  switch (input.type) {
    case 'ON': {
      if (state.status !== 'DISABLED') return ignore('already on')
      if (input.mode === 'unsupported') return ignore('this Claude Code version is not supported')
      if (!input.lockAcquired) {
        next = { ...state, lastErrorCode: 'LOCK_HELD', updatedAt: at }
        effects.push({ type: 'TOAST', key: '-:lock-held', text: 'Another session owns this task (LOCK_HELD). /jeeves status shows it read-only.' })
        return done()
      }
      go('MONITORING', null, { mode: input.mode, activeSessionId: input.sessionId, armedFired: false, rotation: null, sessionStart: { at, pct: null } })
      return done()
    }

    case 'EXPLICIT':
      if (state.origin === 'explicit') return ignore('already explicit')
      return edit({ origin: 'explicit' }, 'explicit', 'origin: auto -> explicit (/jeeves on with a goal)')

    case 'OFF':
      if (state.status === 'DISABLED') return ignore('already off')
      go('DISABLED', null, { rotation: null, activeSessionId: input.sessionId })
      effects.push({ type: 'RELEASE_LOCK', key: key('release') })
      return done()

    case 'LATER': {
      // Only while watching: a rotation under way is not stopped (`/jeeves pause` is for that). The adapter answers.
      if (state.status !== 'MONITORING') return ignore('only while watching')
      const to = Math.min(state.thresholdPercent + LATER_STEP, input.cap)
      if (to <= state.thresholdPercent) return ignore('at the cap')
      // The warning comes again 5 points before the new threshold.
      return edit({ thresholdPercent: to, warnedSessionId: null, laterCapped: to >= input.cap }, `later-${to}`, `later: threshold ${state.thresholdPercent}% -> ${to}%`)
    }

    case 'REVISED':
      if (state.status === 'DISABLED') return ignore('no active task')
      if (input.revision !== state.taskRevision + 1) return ignore(`revision ${input.revision} after ${state.taskRevision}`)
      return edit({ taskRevision: input.revision, ...(input.pending ? { pendingChanges: (state.pendingChanges ?? []).slice(1) } : {}) }, `rev-${input.revision}`, `task revision ${input.revision}`)

    case 'QUEUE_CHANGE': {
      if (state.status === 'DISABLED' || state.taskRevision !== 0) return ignore('only before the first prompt')
      const queued = state.pendingChanges ?? []
      if (queued.length >= 20) return ignore('20 changes already queued')
      return edit({ pendingChanges: [...queued, { kind: input.kind, text: input.text }] }, `queued-${queued.length + 1}`, `queued ${input.kind} until the first prompt`)
    }

    case 'SET_THRESHOLD':
      if (state.status === 'DISABLED') return ignore('no active task')
      if (!isThreshold(input.percent)) return ignore(`threshold ${input.percent} is outside ${THRESHOLD_MIN}..${THRESHOLD_MAX}`)
      return edit({ thresholdPercent: input.percent, ...(state.laterCapped ? { laterCapped: false } : {}) }, `threshold-${input.percent}`, `threshold ${input.percent}%`)

    case 'SET_LIMIT':
      if (state.status === 'DISABLED') return ignore('no active task')
      if (!isLimit(input.max)) return ignore(`limit ${input.max} is outside ${LIMIT_MIN}..${LIMIT_MAX}`)
      return edit({ maxRotations: input.max }, `limit-${input.max}`, `limit ${input.max} handovers`)

    case 'ROTATE_CMD':
    case 'COMPACTED':
      if (state.status !== 'MONITORING' && state.status !== 'CONTINUING') return ignore(ROTATION_STATES.includes(state.status) ? 'a rotation is already in progress' : 'no automatic rotation from this state')
      return request(input.type === 'ROTATE_CMD' ? 'MANUAL' : 'COMPACTED', input.type === 'COMPACTED' && input.trigger ? `after ${input.trigger} compaction` : undefined)

    case 'RETRY_CMD': {
      if (state.status !== 'NEEDS_REVIEW' || (state.reason !== 'HANDOVER_INVALID' && state.reason !== 'POSSIBLE_LOOP')) return ignore('retry applies after an invalid handover or a possible loop')
      if (state.consecutiveFailures >= ctx.config.maxConsecutiveFailures) return ignore(`${state.consecutiveFailures} failed rotations in a row, the limit`)
      if (state.reason === 'HANDOVER_INVALID') return request('MANUAL', 'RETRY')
      // No rotation in this session (armedFired); the next fresh session re-arms as usual.
      go('MONITORING', null, { armedFired: true, rotation: null, sessionSequence: state.sessionSequence + 1, warnedSessionId: null, completionAsked: false }, 'RETRY')
      return done()
    }

    case 'TOOL_RESULT':
      if (state.status === 'DISABLED') return ignore('no active task')
      if (input.reading) {
        // The engine sends few session.measure events in a long turn (debug run 3: one in 60 s), so each main-loop
        // tool result also carries a reading: applied first, so a request it makes gets its quiesce note right here.
        const { reading, ...rest } = input
        const m = reduce(state, { type: 'MEASURE', ...reading, fromTool: true }, ctx)
        const t = reduce(m.state, rest, ctx)
        return { state: t.state, effects: [...m.effects, ...t.effects] }
      }
      // Recorded without an event line: the ledger is evidence, not a transition.
      if (input.entry) {
        const ledger = [...state.ledger, { ...input.entry, at }].slice(-LEDGER_MAX)
        next = { ...next, ledger: input.entry.kind === 'cmd' ? pruneTails(ledger) : ledger, updatedAt: at }
      }
      if (input.main && state.status === 'ROTATION_REQUESTED' && !state.rotation!.noteAppended) {
        setRotation({ noteAppended: true })
        effects.push({ type: 'APPEND_NOTE', key: key('note') })
      }
      return next === state ? ignore('nothing to record') : done()

    case 'STOP': {
      if (state.status === 'ROTATION_REQUESTED' || state.status === 'QUIESCING') {
        const r = state.rotation!
        if (isSafe(input)) {
          go('HANDOVER_GENERATING', r.trigger, {}, '')
          setRotation({ step: 'HANDOVER_REQUESTED', retries: 0 })
          effects.push({ type: 'CAPTURE_FACTS', key: key('facts') }, { type: 'BLOCK_STOP', key: key('HANDOVER_REQUESTED'), kind: 'handover-request', errors: [] })
          return done()
        }
        const count = r.quiesceCount + 1
        const waited = ctx.now - Date.parse(r.requestedAt)
        const why = [input.backgroundTasks && `${input.backgroundTasks} background task(s)`, input.runningAgents && `${input.runningAgents} running agent(s)`].filter(Boolean).join(', ')
        if (count > ctx.config.quiesceMaxTurns || waited > ctx.config.quiesceMaxMinutes * 60_000) {
          go('PAUSED', 'UNSAFE_BOUNDARY', { rotation: null, armedFired: false }, `no safe point after ${count} stops: ${why}`)
          effects.push({ type: 'TOAST', key: key('unsafe'), text: `Paused: no safe point to hand over (${why}). Finish the work, then /jeeves resume.` })
          return done()
        }
        if (state.status === 'ROTATION_REQUESTED') go('QUIESCING', r.trigger, {}, `waiting: ${why}`)
        setRotation({ step: 'QUIESCING', quiesceCount: count })
        return done()
      }
      if (state.status === 'HANDOVER_GENERATING') {
        const r = state.rotation!
        const h = input.handover ?? { ok: false, errors: ['no JEEVES-HANDOVER block found in the last message'] }
        if (h.ok) {
          go('VALIDATING', r.trigger)
          effects.push({ type: 'PERSIST_HANDOVER', key: key('persist') })
          return done()
        }
        if (h.fatal) {
          go('NEEDS_REVIEW', h.fatal, { rotation: null, armedFired: true }, h.errors.slice(0, 3).join('; '))
          effects.push({ type: 'TOAST', key: key('fatal'), text: `Handover stopped (${h.fatal}): ${h.errors[0] ?? 'see /jeeves status'}. Nothing was cleared.` })
          return done()
        }
        if (r.retries < ctx.config.maxHandoverRetries) {
          setRotation({ retries: r.retries + 1 })
          effects.push({ type: 'BLOCK_STOP', key: key(`retry-${r.retries + 1}`), kind: 'handover-retry', errors: h.errors })
          return done()
        }
        go('NEEDS_REVIEW', 'HANDOVER_INVALID', { rotation: null, armedFired: true }, h.errors.slice(0, 3).join('; '))
        effects.push({ type: 'TOAST', key: key('invalid'), text: `Handover failed its checks ${r.retries + 1} times. Last problem: ${h.errors[0] ?? 'see /jeeves status'}. Nothing was cleared. /jeeves retry` })
        return done()
      }
      return ignore('nothing to do at this stop')
    }

    case 'HANDOVER_PERSISTED':
      if (state.status !== 'VALIDATING') return ignore('no handover being persisted')
      if (!input.ok || !input.ref) {
        go('NEEDS_REVIEW', 'DISK', { rotation: null }, 'handover could not be saved and verified')
        effects.push({ type: 'TOAST', key: key('disk'), text: 'Could not save the handover to disk. Nothing was cleared.' })
        return done()
      }
      // The ref in the event keeps every handover's hash, for /jeeves history --full (ST-11.3).
      go('ROTATING', state.rotation!.trigger, { lastValidatedHandover: input.ref }, input.ref)
      setRotation({ step: 'HANDOVER_PERSISTED', ...(input.goal ? { goal: input.goal } : {}) })
      return done()

    case 'TURN_COMPLETE':
      if (state.status === 'HANDOVER_GENERATING' && input.reason === 'aborted') {
        go('PAUSED', 'USER_INTERRUPT', { rotation: null, armedFired: false })
        return done()
      }
      // ST-6.3: after an interrupt the user has the floor: no nudge later either (a late reading finds the turn closed).
      if ((state.status === 'ROTATION_REQUESTED' || state.status === 'QUIESCING') && input.reason === 'aborted' && !state.rotation!.nudged) {
        setRotation({ nudged: true })
        return done()
      }
      if (state.status === 'ROTATING' && state.rotation!.step === 'HANDOVER_PERSISTED') {
        // ST-4.1 AC 2: never /clear on a handover that changed or vanished since it was verified.
        if (input.handoverVerified !== true) {
          go('NEEDS_REVIEW', 'HANDOVER_INVALID', { rotation: null }, 'saved handover no longer matches its hash')
          effects.push({ type: 'TOAST', key: key('changed'), text: 'The saved handover changed on disk, so Jeeves did not clear. Run /jeeves status.' })
          return done()
        }
        if (state.mode !== 'full') return unavailable('assisted mode: Jeeves does not clear by itself')
        setRotation({ step: 'CLEAR_SCHEDULED' })
        effects.push({ type: 'RUN_CLEAR', key: key('CLEAR_SCHEDULED') })
        return done()
      }
      // ST-13.4: the grace period counts main turns (any ending) while the new auto task watches.
      if (inGrace && state.status === 'MONITORING') {
        next = { ...next, graceTurns: (state.graceTurns ?? 0) + 1, updatedAt: at }
        return done()
      }
      return ignore('nothing scheduled')

    case 'IDLE':
      // The request landed after the turn's Stop: one short prompt gets a Stop, so nothing waits for the user (D-23).
      if (state.status !== 'ROTATION_REQUESTED') return ignore('no request waiting for a Stop')
      if (state.rotation!.nudged) return ignore('already nudged')
      setRotation({ nudged: true })
      effects.push({ type: 'SUBMIT_NUDGE', key: key('nudge') })
      return done()

    case 'QUIESCE_TICK': {
      if (state.status !== 'QUIESCING') return ignore('not waiting for a safe point')
      if (ctx.now - Date.parse(state.rotation!.requestedAt) <= ctx.config.quiesceMaxMinutes * 60_000) return ignore('still within the wait')
      go('PAUSED', 'UNSAFE_BOUNDARY', { rotation: null, armedFired: false }, `no safe point after ${ctx.config.quiesceMaxMinutes} minutes`)
      effects.push({ type: 'TOAST', key: key('unsafe'), text: `Paused: no safe point to hand over (background work still running after ${ctx.config.quiesceMaxMinutes} minutes). Finish the work, then /jeeves resume.` })
      return done()
    }

    case 'SESSION_END':
      if (input.reason !== 'clear') return ignore(`end reason ${input.reason}`)
      if (state.status === 'ROTATING' && state.rotation!.step === 'CLEARED') return ignore('already cleared')
      if (state.status === 'ROTATING' && state.rotation!.step === 'CLEAR_SCHEDULED') {
        const r = state.rotation!
        const record: SessionRecord = {
          schemaVersion: SCHEMA_VERSION, sessionId: input.sessionId, startedAt: state.sessionStart?.at ?? r.requestedAt, endedAt: at,
          endReason: 'clear', startPct: state.sessionStart?.pct ?? null, endPct: state.lastContext?.percent ?? null,
          ...(input.costUsd !== undefined ? { costUsd: input.costUsd } : {}),
        }
        setRotation({ step: 'CLEARED', sourceSessionId: r.sourceSessionId ?? input.sessionId, ...(rel !== undefined && record.endPct !== null ? { guardPct: record.endPct } : {}) })
        effects.push({ type: 'WRITE_SESSION', key: key('session'), n: state.sessionSequence, record })
        return done()
      }
      // A /clear Jeeves did not schedule (ROTATING before CLEAR_SCHEDULED) is the user's: pause, never a rotation (ST-4.2 AC 2).
      if (!ACTIVE(state.status) && state.status !== 'PAUSED') return ignore('no active task')
      // ST-13.7 (spec §5.7, ADR-010 A2): an auto task ends (files kept) and the next typed prompt starts a new one.
      go(state.origin === 'auto' ? 'DISABLED' : 'PAUSED', 'USER_CLEAR', { rotation: null, armedFired: false }, 'conversation cleared by the user')
      effects.push({ type: 'TOAST', key: `-:user-clear:${input.sessionId}`, text: state.origin === 'auto' ? USER_CLEAR_AUTO : USER_CLEAR_EXPLICIT })
      return done()

    case 'SESSION_START_CLEAR': {
      if (state.status !== 'ROTATING') return ignore('not rotating')
      const r = state.rotation!
      if (r.step !== 'CLEAR_SCHEDULED' && r.step !== 'CLEARED') return ignore(`fresh session at step ${r.step}`)
      if (r.targetSessionId !== null) return ignore('target session already set')
      const source = r.sourceSessionId ?? state.activeSessionId
      if (input.sessionId === source) return ignore('the fresh session has the old id')
      if (!input.handoverOk) {
        // Already cleared, so the fresh session takes the task, but nothing unverified is injected or continued.
        go('NEEDS_REVIEW', 'HANDOVER_INVALID', { rotation: null, activeSessionId: input.sessionId, sessionStart: { at, pct: null } }, 'handover unreadable or changed at the fresh session')
        effects.push(
          { type: 'TRANSFER_LOCK', key: key('lock'), from: state.activeSessionId, to: input.sessionId },
          { type: 'TOAST', key: key('changed'), text: 'The saved handover could not be verified, so Jeeves did not continue. Run /jeeves status.' },
        )
        return done()
      }
      go('RESTORING', r.trigger, { activeSessionId: input.sessionId, sessionStart: { at, pct: null } })
      setRotation({ step: 'RESTORED', sourceSessionId: source, targetSessionId: input.sessionId })
      effects.push(
        { type: 'TRANSFER_LOCK', key: key('lock'), from: state.activeSessionId, to: input.sessionId },
        { type: 'INJECT_CONTEXT', key: key('RESTORED'), via: 'session-start' },
      )
      return done()
    }

    case 'CLEAR_FAILED':
      if (state.status !== 'ROTATING') return ignore('not rotating')
      return unavailable('/clear was refused')

    case 'CONTINUE_CMD': {
      if (state.status !== 'NEEDS_REVIEW' || state.reason !== 'ROTATE_UNAVAILABLE') return ignore('no handover waiting for /jeeves continue')
      const rotation: Rotation = {
        rotationId: ctx.newRotationId, trigger: 'MANUAL', requestedAt: at, sourceSessionId: state.activeSessionId,
        targetSessionId: input.sessionId, step: 'RESTORED', retries: 0, quiesceCount: 0, noteAppended: false,
      }
      go('RESTORING', 'MANUAL', { rotation, activeSessionId: input.sessionId, sessionStart: { at, pct: null } }, '/jeeves continue (assisted)')
      effects.push({ type: 'INJECT_CONTEXT', key: key('RESTORED'), via: 'prompt' })
      return done()
    }

    case 'SUBMIT_FAILED':
      if (state.status !== 'CONTINUING') return ignore('no continuation pending')
      // The held prompts were cleared for the continuation that did not go out: keep them for /jeeves continue.
      go('NEEDS_REVIEW', 'ROTATE_UNAVAILABLE', { rotation: null, mode: 'assisted', heldPrompts: [...input.heldPrompts, ...state.heldPrompts] }, 'continuation prompt rejected')
      effects.push({ type: 'TOAST', key: key('assisted'), text: 'Jeeves could not send the continuation. The handover is saved: type /jeeves continue.' })
      return done()

    case 'CONTEXT_READY': {
      if (state.status !== 'RESTORING') return ignore('not restoring')
      // The failure counter resets once the fresh session is below the loop margin (MEASURE in CONTINUING), so a
      // retried loop still counts (ST-10.3); a paused continuation has no such check and resets here.
      const patch = { heldPrompts: [], rotationCount: state.rotationCount + 1 }
      const submit: Effect = { type: 'SUBMIT_CONTINUATION', key: key('CONTINUED'), heldPrompts: state.heldPrompts }
      if (state.pauseRequested) {
        // The pause asked for during the handover applies now: the fresh conversation continues, nothing rotates further.
        go('PAUSED', 'USER_PAUSE', { ...patch, consecutiveFailures: 0, rotation: null, armedFired: false }, 'paused after the continuation, as asked')
        effects.push(submit)
        return done()
      }
      go('CONTINUING', state.rotation!.trigger, patch)
      setRotation({ step: 'CONTINUED' })
      effects.push(submit)
      return done()
    }

    case 'HOLD_PROMPT':
      if (!HELD_STATES.includes(state.status)) return ignore('no handover in flight')
      if (state.heldPrompts.length >= HELD_MAX) return ignore(`${HELD_MAX} prompts already held`)
      // NFR-10: the event line names the prompt, never its text; the text waits in state only until the continuation.
      return edit({ heldPrompts: [...state.heldPrompts, input.text] }, `held-${state.heldPrompts.length + 1}`, `held prompt ${state.heldPrompts.length + 1} (${input.text.length} chars)`)

    case 'PAUSE':
      // VALIDATING with nothing cleared yet (a state write failed after the handover was saved): pause at once.
      if (HELD_STATES.includes(state.status) && state.status !== 'VALIDATING') {
        if (state.pauseRequested) return ignore('pause already requested')
        return edit({ pauseRequested: true }, 'pause-requested', 'pause requested; applies after the continuation')
      }
      if (!ACTIVE(state.status)) return ignore('nothing to pause')
      // Paused in a continued session: the rotation succeeded, so the failure count resets as at rearm (review fix).
      go('PAUSED', 'USER_PAUSE', { rotation: null, armedFired: false, ...(state.status === 'CONTINUING' ? { consecutiveFailures: 0 } : {}) })
      return done()

    case 'RESUME': {
      // BLOCKED(DISK) resumes the same way once the disk works again (ST-6.5).
      if (state.status !== 'PAUSED' && !(state.status === 'BLOCKED' && state.reason === 'DISK')) return ignore('not paused')
      if (!input.lockOk) {
        next = { ...state, lastErrorCode: 'LOCK_HELD', updatedAt: at }
        effects.push({ type: 'TOAST', key: '-:lock-held', text: 'Another session owns this task (LOCK_HELD).' })
        return done()
      }
      if (state.reason === 'USER_CLEAR') {
        // Restore path (02 §5.3): this conversation is already fresh; the context goes into the continuation prompt.
        const rotation: Rotation = {
          rotationId: ctx.newRotationId, trigger: 'MANUAL', requestedAt: at, sourceSessionId: state.activeSessionId,
          targetSessionId: input.sessionId, step: 'RESTORED', retries: 0, quiesceCount: 0, noteAppended: false,
        }
        // The command took the lock before this input (claim), so there is nothing to transfer.
        go('RESTORING', 'MANUAL', { rotation, activeSessionId: input.sessionId, sessionStart: { at, pct: null } }, 'resume after user /clear')
        effects.push({ type: 'INJECT_CONTEXT', key: key('RESTORED'), via: 'prompt' })
        return done()
      }
      go('MONITORING', null, { armedFired: false, activeSessionId: input.sessionId, heldPrompts: [], ...(input.sessionId !== state.activeSessionId ? { sessionStart: { at, pct: null } } : {}) })
      if (state.heldPrompts.length) effects.push({ type: 'SUBMIT_HELD', key: key('held'), heldPrompts: state.heldPrompts })
      return done()
    }

    case 'STOP_FAILURE': {
      if (!ACTIVE(state.status)) return ignore('no active task')
      const code = stopFailureCode(input.error)
      go('PAUSED', code, { rotation: null, armedFired: false }, input.error)
      // An API failure waits for the user; it is not a failed rotation (maxConsecutiveFailures counts those).
      next = { ...next, consecutiveFailures: state.consecutiveFailures }
      effects.push({ type: 'TOAST', key: key(`fail-${code}`), text: stopFailureText(code, input.error, input.resetsAt) })
      return done()
    }

    case 'COMPLETE_BLOCK': {
      // A requested rotation that has asked Claude nothing yet gives way: a finished task needs no handover.
      if (!COMPLETION_STATES.includes(state.status)) return ignore('completion only while monitoring or before a handover is asked')
      if (input.commands.length === 0) {
        go('NEEDS_REVIEW', 'DOD_UNMET', { rotation: null }, 'Claude reports done; the task has no verification commands')
        effects.push({ type: 'TOAST', key: key('dod-none'), text: 'Claude says the task is done. It has no verification commands, so confirm with /jeeves done.' })
        return done()
      }
      const ev = evaluate(input.commands, state.ledger, input.blockers)
      const missing = [...ev.missing.map(m => `\`${m.command}\`: ${m.why}`), ...ev.blockers.map(b => `blocker: ${b}`)]
      if (ev.ok) {
        const summary = `completed after ${state.rotationCount} rotation(s) in ${state.sessionSequence} session(s); checks passed: ${input.commands.map(c => `\`${c}\``).join(', ')}`
        go('COMPLETED', 'COMPLETED', { rotation: null, completionAsked: false }, summary)
        // No toast: the adapter's completion summary goes to the transcript and the notification (plan 12).
        effects.push({ type: 'RELEASE_LOCK', key: key('release') })
        return done()
      }
      if (!state.completionAsked) {
        next = { ...next, completionAsked: true, updatedAt: at }
        effects.push({ type: 'BLOCK_STOP', key: key('complete-ask'), kind: 'completion-missing', errors: missing })
        return done()
      }
      go('NEEDS_REVIEW', 'DOD_UNMET', { rotation: null }, `missing: ${missing.join('; ')}`)
      effects.push({ type: 'TOAST', key: key('dod'), text: `Not marked done: ${missing.length} check(s) missing or failing. /jeeves status shows the task; /jeeves done confirms by hand.` })
      return done()
    }

    case 'RECOVER': {
      if (!recoverable(state)) return ignore('nothing to recover')
      // A new rotation keyed by its own id: a second /jeeves recover finds RESTORING/CONTINUING owned by this session.
      const rotation: Rotation = {
        rotationId: ctx.newRotationId, trigger: 'MANUAL', requestedAt: at, sourceSessionId: state.activeSessionId,
        targetSessionId: input.sessionId, step: 'RESTORED', retries: 0, quiesceCount: 0, noteAppended: false,
      }
      const from = input.adopt ?? state.lastValidatedHandover
      go('RESTORING', 'STALE_LOCK', {
        rotation, activeSessionId: input.sessionId, sessionStart: { at, pct: null }, armedFired: false, pauseRequested: false,
        completionAsked: false, lastValidatedHandover: from,
      }, `recovered by /jeeves recover from ${state.status}${from ? ` with ${from.split('#')[0]}` : ' with no handover'}`)
      effects.push({ type: 'INJECT_CONTEXT', key: key('RESTORED'), via: 'prompt' })
      return done()
    }

    case 'DISK_FAILED':
      // Only a running task is blocked. A failed write into or out of a stop (PAUSED, NEEDS_REVIEW, FAILED, ...) keeps the
      // checkpoint as it is: overwriting it would lose its reason, and /jeeves resume would then skip it.
      if (!ACTIVE(state.status) || INERT.includes(input.to)) return ignore('only a running task is blocked')
      go('BLOCKED', 'DISK', { rotation: null, armedFired: false }, `${input.path}: ${input.error}`)
      effects.push({ type: 'TOAST', key: '-:disk', text: diskText(input.path, input.error) })
      return done()

    case 'REPO_MISMATCH':
      // From any task a restore path can reach (recover, resume after /clear, assisted continue), so /jeeves recover can follow.
      if (state.status === 'DISABLED' || state.status === 'COMPLETED' || state.status === 'FAILED') return ignore('nothing to block')
      go('BLOCKED', 'REPO_MISMATCH', { rotation: null, armedFired: false, activeSessionId: input.sessionId, ...(input.adopt ? { lastValidatedHandover: input.adopt } : {}) }, input.detail)
      return done()

    case 'RELINKED':
      if (state.projectId === input.projectId) return ignore('already in this project')
      return edit({ projectId: input.projectId }, 'relinked', `relinked to project ${input.projectId}`)

    case 'DONE_CMD':
      if (state.status !== 'NEEDS_REVIEW' || state.reason !== 'DOD_UNMET') return ignore('nothing waits for /jeeves done')
      // A user approval, logged apart from evidence-based completion (from NEEDS_REVIEW, detail says who decided).
      go('COMPLETED', 'COMPLETED', { rotation: null, activeSessionId: input.sessionId }, 'approved by the user with /jeeves done (not verified by checks)')
      effects.push({ type: 'RELEASE_LOCK', key: key('release') })
      return done()
  }
}
