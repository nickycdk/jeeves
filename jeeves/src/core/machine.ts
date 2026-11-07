// The state machine (02 §4): reduce(state, input, ctx) -> { state, effects }. Pure: time and IDs come in through ctx.
import { evaluate } from './completion.ts'
import type { LedgerRecord } from './evidence.ts'
import { INERT, LEDGER_MAX, ROTATION_STATES, SCHEMA_VERSION, type Config, type Mode, type ReasonCode, type Rotation, type RotationStep, type SessionRecord, type State, type Status, type Trigger } from './types.ts'

export type Input =
  | { type: 'ON'; mode: Mode; lockAcquired: boolean; sessionId: string }
  /** `sessionId`: the session turning it off, which now holds the lock it releases. */
  | { type: 'OFF'; sessionId: string }
  /** A user command wrote task revision `revision` (FR-05; never model text). */
  /** `pending`: the revision wrote the first queued change (pendingChanges[0]), which is now done. */
  | { type: 'REVISED'; revision: number; pending?: boolean }
  /** `/relay dod|check` before the original prompt is captured (taskRevision 0): kept until rev 1 exists. */
  | { type: 'QUEUE_CHANGE'; kind: 'dod' | 'check'; text: string }
  /** `/relay threshold <n>`, n a whole number 20..90 (FR-03). */
  | { type: 'SET_THRESHOLD'; percent: number }
  /** `fromTool`: read at a main-loop tool result, so after a model call (D-25 counts only those as a session's start). */
  | { type: 'MEASURE'; percent?: number; tokens?: number; window: number; sessionId: string; fromTool?: boolean }
  | { type: 'ROTATE_CMD' }
  | { type: 'COMPACTED' }
  /** A tool call finished: `entry` goes to the ledger; on the main loop it is also the soft-quiesce point. */
  /** `reading`: the main conversation's context read at this tool result (mid-turn readings, see TOOL_RESULT). */
  | { type: 'TOOL_RESULT'; main: boolean; entry?: LedgerRecord; reading?: { percent?: number; tokens?: number; window: number; sessionId: string } }
  /** Main-loop classic.Stop. `handover` is the parse+validate outcome of the last message (HANDOVER_GENERATING only). */
  /** `fatal`: the handover cannot become valid by asking again (the branch moved, git did not answer): stop at once. */
  | { type: 'STOP'; backgroundTasks: number; runningAgents: number; handover?: { ok: true } | { ok: false; errors: string[]; fatal?: ReasonCode } }
  | { type: 'HANDOVER_PERSISTED'; ok: boolean; ref?: string }
  /** A main-loop turn ended. `handoverVerified`: the saved handover still matches its SHA-256 (read in ROTATING only). */
  | { type: 'TURN_COMPLETE'; reason: 'answer' | 'aborted' | 'refusal' | 'error'; handoverVerified?: boolean }
  /** The main loop is idle (no turn open), so no Stop will come by itself (D-23). */
  | { type: 'IDLE' }
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
  /** `/relay continue` in a fresh conversation (assisted mode, ST-4.6); the command already holds the lock. */
  | { type: 'CONTINUE_CMD'; sessionId: string }
  /** classic.StopFailure on the main loop (ST-6.2). `resetsAt`: when the exhausted rate-limit window resets, if known. */
  | { type: 'STOP_FAILURE'; error: string; resetsAt?: string }
  /** Claude's JEEVES-COMPLETE block at a main-loop Stop: the task's verification commands and the block's blockers (ST-5.2). */
  | { type: 'COMPLETE_BLOCK'; commands: string[]; blockers: string[] }
  /** `/relay done`: the user confirms a completion Jeeves could not verify (ADR-007). */
  | { type: 'DONE_CMD'; sessionId: string }

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
export const THRESHOLD_MIN = 20
export const THRESHOLD_MAX = 90
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

/** What the user should do about each StopFailure code (ST-6.2, AC-23). Jeeves never retries by itself. */
export function stopFailureText(code: ReasonCode, error: string, resetsAt?: string): string {
  const reset = resetsAt && !Number.isNaN(Date.parse(resetsAt)) ? new Date(resetsAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : null
  switch (code) {
    case 'RATE_LIMIT': return `Paused (RATE_LIMIT): the usage limit is reached.${reset ? ` It resets at ${reset}.` : ''} Then type /relay resume.`
    case 'AUTH': return `Paused (AUTH): Claude Code is not logged in (${error}). Run /login, then /relay resume.`
    case 'BILLING': return `Paused (BILLING): your account has a billing problem (${error}). Fix it, then /relay resume.`
    case 'OVERLOADED': return 'Paused (OVERLOADED): the API is overloaded. Wait a few minutes, then /relay resume.'
    default: return `Paused (API_ERROR): the API returned an error (${error}). /relay resume tries again.`
  }
}

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

  // ADR-002: no automatic /clear here; the saved handover waits for the user's /clear and /relay continue (AC-25).
  const unavailable = (detail: string): Output => {
    go('NEEDS_REVIEW', 'ROTATE_UNAVAILABLE', { rotation: null, mode: 'assisted' }, detail)
    effects.push({ type: 'TOAST', key: key('assisted'), text: 'Automatic /clear is unavailable. The handover is saved. Run /clear, then type /relay continue.' })
    return done()
  }

  const request = (trigger: Trigger): Output => {
    // ST-4.5 guards, before anything is asked of Claude.
    if (state.consecutiveFailures >= ctx.config.maxConsecutiveFailures) {
      const last = state.lastErrorCode ?? 'API_ERROR'
      go('FAILED', last, { rotation: null }, `${state.consecutiveFailures} failed rotations in a row`)
      effects.push({ type: 'TOAST', key: `-:failed:${state.consecutiveFailures}`, text: `Stopped: ${state.consecutiveFailures} handovers in a row failed (last ${last}). Run /relay status.` })
      return done()
    }
    if (state.rotationCount >= ctx.config.maxRotationsPerTask) {
      go('PAUSED', 'MAX_ROTATIONS', { rotation: null, armedFired: false }, `${state.rotationCount} rotations`)
      effects.push({ type: 'TOAST', key: `-:max:${state.rotationCount}`, text: `Paused: this task reached ${state.rotationCount} rotations, the limit (MAX_ROTATIONS). /relay off ends it.` })
      return done()
    }
    const rotation: Rotation = {
      rotationId: ctx.newRotationId, trigger, requestedAt: at, sourceSessionId: null, targetSessionId: null,
      step: 'REQUESTED', retries: 0, quiesceCount: 0, noteAppended: false,
    }
    go('ROTATION_REQUESTED', trigger, { rotation, armedFired: true }, trigger === 'THRESHOLD' ? `context ${next.lastContext?.percent ?? '?'}%` : '')
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
    if (state.status === 'MONITORING') {
      if (p === undefined) return done()
      if (p >= T && !state.armedFired) return request('THRESHOLD')
      if (p >= T - ctx.config.warnBeforePercent && p < T && state.warnedSessionId !== input.sessionId) {
        next = { ...next, warnedSessionId: input.sessionId }
        effects.push({ type: 'TOAST', key: `-:warn:${input.sessionId}`, text: `Context at ${Math.round(p)}%. Jeeves will hand over at ${shown(T)}%.` })
      }
      return done()
    }
    if (state.status === 'CONTINUING') {
      if (p === undefined || !counts) return done()
      if (p < rearmBelow) {
        go('MONITORING', null, { armedFired: false, rotation: null, sessionSequence: state.sessionSequence + 1, warnedSessionId: null, completionAsked: false }, `rearmed at ${p}%`)
        return done()
      }
      go('FAILED', 'POSSIBLE_LOOP', { rotation: null }, `fresh session already at ${p}%`)
      effects.push({ type: 'TOAST', key: key('loop'), text: `Stopped: the fresh session is already at ${p}% (threshold ${shown(rel !== undefined ? rearmBelow : T)}%). Possible rotation loop. Run /relay status.` })
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
        effects.push({ type: 'TOAST', key: '-:lock-held', text: 'Another session owns this task (LOCK_HELD). /relay status shows it read-only.' })
        return done()
      }
      go('MONITORING', null, { mode: input.mode, activeSessionId: input.sessionId, armedFired: false, rotation: null, sessionStart: { at, pct: null } })
      return done()
    }

    case 'OFF':
      if (state.status === 'DISABLED') return ignore('already off')
      go('DISABLED', null, { rotation: null, activeSessionId: input.sessionId })
      effects.push({ type: 'RELEASE_LOCK', key: key('release') })
      return done()

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
      return edit({ thresholdPercent: input.percent }, `threshold-${input.percent}`, `threshold ${input.percent}%`)

    case 'ROTATE_CMD':
    case 'COMPACTED':
      if (state.status !== 'MONITORING' && state.status !== 'CONTINUING') return ignore(ROTATION_STATES.includes(state.status) ? 'a rotation is already in progress' : 'no automatic rotation from this state')
      return request(input.type === 'ROTATE_CMD' ? 'MANUAL' : 'COMPACTED')

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
      if (input.entry) next = { ...next, ledger: [...state.ledger, { ...input.entry, at }].slice(-LEDGER_MAX), updatedAt: at }
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
          effects.push({ type: 'TOAST', key: key('unsafe'), text: `Paused: no safe point to hand over (${why}). Finish the work, then /relay resume.` })
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
          effects.push({ type: 'TOAST', key: key('fatal'), text: `Handover stopped (${h.fatal}): ${h.errors[0] ?? 'see /relay status'}. Nothing was cleared.` })
          return done()
        }
        if (r.retries < ctx.config.maxHandoverRetries) {
          setRotation({ retries: r.retries + 1 })
          effects.push({ type: 'BLOCK_STOP', key: key(`retry-${r.retries + 1}`), kind: 'handover-retry', errors: h.errors })
          return done()
        }
        go('NEEDS_REVIEW', 'HANDOVER_INVALID', { rotation: null, armedFired: true }, h.errors.slice(0, 3).join('; '))
        effects.push({ type: 'TOAST', key: key('invalid'), text: 'Handover was invalid after retries. Nothing was cleared. Run /relay status.' })
        return done()
      }
      return ignore('nothing to do at this stop')
    }

    case 'HANDOVER_PERSISTED':
      if (state.status !== 'VALIDATING') return ignore('no handover being persisted')
      if (!input.ok || !input.ref) {
        go('NEEDS_REVIEW', 'DISK', { rotation: null }, 'handover could not be saved and verified')
        effects.push({ type: 'TOAST', key: key('disk'), text: 'Could not save the handover (DISK). Nothing was cleared.' })
        return done()
      }
      go('ROTATING', state.rotation!.trigger, { lastValidatedHandover: input.ref })
      setRotation({ step: 'HANDOVER_PERSISTED' })
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
          effects.push({ type: 'TOAST', key: key('changed'), text: 'The saved handover changed on disk, so Jeeves did not clear. Run /relay status.' })
          return done()
        }
        if (state.mode !== 'full') return unavailable('assisted mode: Jeeves does not clear by itself')
        setRotation({ step: 'CLEAR_SCHEDULED' })
        effects.push({ type: 'RUN_CLEAR', key: key('CLEAR_SCHEDULED') })
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
      go('PAUSED', 'USER_CLEAR', { rotation: null, armedFired: false }, 'conversation cleared by the user')
      effects.push({ type: 'TOAST', key: `-:user-clear:${input.sessionId}`, text: 'You cleared the conversation, so Jeeves paused this task. /relay status shows it.' })
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
          { type: 'TOAST', key: key('changed'), text: 'The saved handover could not be verified, so Jeeves did not continue. Run /relay status.' },
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
      if (state.status !== 'NEEDS_REVIEW' || state.reason !== 'ROTATE_UNAVAILABLE') return ignore('no handover waiting for /relay continue')
      const rotation: Rotation = {
        rotationId: ctx.newRotationId, trigger: 'MANUAL', requestedAt: at, sourceSessionId: state.activeSessionId,
        targetSessionId: input.sessionId, step: 'RESTORED', retries: 0, quiesceCount: 0, noteAppended: false,
      }
      go('RESTORING', 'MANUAL', { rotation, activeSessionId: input.sessionId, sessionStart: { at, pct: null } }, '/relay continue (assisted)')
      effects.push({ type: 'INJECT_CONTEXT', key: key('RESTORED'), via: 'prompt' })
      return done()
    }

    case 'SUBMIT_FAILED':
      if (state.status !== 'CONTINUING') return ignore('no continuation pending')
      // The held prompts were cleared for the continuation that did not go out: keep them for /relay continue.
      go('NEEDS_REVIEW', 'ROTATE_UNAVAILABLE', { rotation: null, mode: 'assisted', heldPrompts: [...input.heldPrompts, ...state.heldPrompts] }, 'continuation prompt rejected')
      effects.push({ type: 'TOAST', key: key('assisted'), text: 'Jeeves could not send the continuation. The handover is saved: type /relay continue.' })
      return done()

    case 'CONTEXT_READY': {
      if (state.status !== 'RESTORING') return ignore('not restoring')
      const patch = { heldPrompts: [], rotationCount: state.rotationCount + 1, consecutiveFailures: 0 }
      const submit: Effect = { type: 'SUBMIT_CONTINUATION', key: key('CONTINUED'), heldPrompts: state.heldPrompts }
      if (state.pauseRequested) {
        // The pause asked for during the handover applies now: the fresh conversation continues, nothing rotates further.
        go('PAUSED', 'USER_PAUSE', { ...patch, rotation: null, armedFired: false }, 'paused after the continuation, as asked')
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
      // The event line gets a redacted, capped copy (storage); the full text waits in state for the continuation.
      return edit({ heldPrompts: [...state.heldPrompts, input.text] }, `held-${state.heldPrompts.length + 1}`, `held prompt: ${input.text}`)

    case 'PAUSE':
      // VALIDATING with nothing cleared yet (a state write failed after the handover was saved): pause at once.
      if (HELD_STATES.includes(state.status) && state.status !== 'VALIDATING') {
        if (state.pauseRequested) return ignore('pause already requested')
        return edit({ pauseRequested: true }, 'pause-requested', 'pause requested; applies after the continuation')
      }
      if (!ACTIVE(state.status)) return ignore('nothing to pause')
      go('PAUSED', 'USER_PAUSE', { rotation: null, armedFired: false })
      return done()

    case 'RESUME': {
      if (state.status !== 'PAUSED') return ignore('not paused')
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
      go('MONITORING', null, { armedFired: false, activeSessionId: input.sessionId, ...(input.sessionId !== state.activeSessionId ? { sessionStart: { at, pct: null } } : {}) })
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
        effects.push({ type: 'TOAST', key: key('dod-none'), text: 'Claude says the task is done. It has no verification commands, so confirm with /relay done.' })
        return done()
      }
      const ev = evaluate(input.commands, state.ledger, input.blockers)
      const missing = [...ev.missing.map(m => `\`${m.command}\`: ${m.why}`), ...ev.blockers.map(b => `blocker: ${b}`)]
      if (ev.ok) {
        const summary = `completed after ${state.rotationCount} rotation(s) in ${state.sessionSequence} session(s); checks passed: ${input.commands.map(c => `\`${c}\``).join(', ')}`
        go('COMPLETED', 'COMPLETED', { rotation: null, completionAsked: false }, summary)
        effects.push({ type: 'RELEASE_LOCK', key: key('release') }, { type: 'TOAST', key: key('completed'), text: `Task ${state.taskId} ${summary}.` })
        return done()
      }
      if (!state.completionAsked) {
        next = { ...next, completionAsked: true, updatedAt: at }
        effects.push({ type: 'BLOCK_STOP', key: key('complete-ask'), kind: 'completion-missing', errors: missing })
        return done()
      }
      go('NEEDS_REVIEW', 'DOD_UNMET', { rotation: null }, `missing: ${missing.join('; ')}`)
      effects.push({ type: 'TOAST', key: key('dod'), text: `Not marked done: ${missing.length} check(s) missing or failing. /relay status shows the task; /relay done confirms by hand.` })
      return done()
    }

    case 'DONE_CMD':
      if (state.status !== 'NEEDS_REVIEW' || state.reason !== 'DOD_UNMET') return ignore('nothing waits for /relay done')
      // A user approval, logged apart from evidence-based completion (from NEEDS_REVIEW, detail says who decided).
      go('COMPLETED', 'COMPLETED', { rotation: null, activeSessionId: input.sessionId }, 'approved by the user with /relay done (not verified by checks)')
      effects.push({ type: 'RELEASE_LOCK', key: key('release') })
      return done()
  }
}
