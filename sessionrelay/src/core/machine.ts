// The state machine (02 §4): reduce(state, input, ctx) -> { state, effects }. Pure: time and IDs come in through ctx.
import { INERT, ROTATION_STATES, type Config, type Mode, type ReasonCode, type Rotation, type RotationStep, type State, type Status, type Trigger } from './types.ts'

export type Input =
  | { type: 'ON'; mode: Mode; lockAcquired: boolean; sessionId: string }
  | { type: 'OFF' }
  | { type: 'MEASURE'; percent?: number; tokens?: number; window: number; sessionId: string }
  | { type: 'ROTATE_CMD' }
  | { type: 'COMPACTED' }
  /** A main-loop tool call finished (soft-quiesce point). */
  | { type: 'TOOL_RESULT' }
  /** Main-loop classic.Stop. `handover` is the parse+validate outcome of the last message (HANDOVER_GENERATING only). */
  | { type: 'STOP'; backgroundTasks: number; runningAgents: number; handover?: { ok: true } | { ok: false; errors: string[] } }
  | { type: 'HANDOVER_PERSISTED'; ok: boolean; ref?: string }
  | { type: 'TURN_COMPLETE'; reason: 'answer' | 'aborted' | 'refusal' | 'error' }
  | { type: 'SESSION_END'; reason: string; sessionId: string }
  | { type: 'SESSION_START_CLEAR'; sessionId: string }
  | { type: 'CLEAR_FAILED' }
  /** The fresh conversation holds the task context (after /clear resolved, or after the restore-path append). */
  | { type: 'CONTEXT_READY' }
  | { type: 'PAUSE' }
  | { type: 'RESUME'; lockOk: boolean; sessionId: string }
  | { type: 'STOP_FAILURE'; error: string }
  | { type: 'COMPLETE_BLOCK'; evidenceOk: boolean; missing: string[] }

export type InputType = Input['type']

type Keyed = { key: string }
export type Effect = Keyed & (
  | { type: 'LOG_EVENT'; rotationId: string | null; from: Status; to: Status; code: ReasonCode | null; detail: string }
  | { type: 'TOAST'; text: string }
  | { type: 'APPEND_NOTE' }
  | { type: 'CAPTURE_FACTS' }
  | { type: 'BLOCK_STOP'; kind: 'handover-request' | 'handover-retry'; errors: string[] }
  | { type: 'PERSIST_HANDOVER' }
  | { type: 'RUN_CLEAR' }
  | { type: 'INJECT_CONTEXT'; via: 'session-start' | 'append' }
  | { type: 'SUBMIT_CONTINUATION'; heldPrompts: string[] }
  | { type: 'TRANSFER_LOCK'; from: string | null; to: string }
  | { type: 'RELEASE_LOCK' }
)

export type Ctx = { now: number; config: Config; newRotationId: string }

/** `ignored` says why an input changed nothing (forbidden or irrelevant here); the adapter logs it. */
export type Output = { state: State; effects: Effect[]; ignored?: string }

const ACTIVE = (s: Status) => !INERT.includes(s)
const HELD_STATES: readonly Status[] = ['HANDOVER_GENERATING', 'VALIDATING', 'ROTATING', 'RESTORING']

export function stopFailureCode(error: string): ReasonCode {
  switch (error) {
    case 'rate_limit': return 'RATE_LIMIT'
    case 'authentication_failed': case 'oauth_org_not_allowed': case 'verification_required': case 'cloud_credential_error': return 'AUTH'
    case 'billing_error': case 'account_on_hold': return 'BILLING'
    case 'overloaded': return 'OVERLOADED'
    default: return 'API_ERROR'
  }
}

export function reduce(state: State, input: Input, ctx: Ctx): Output {
  const at = new Date(ctx.now).toISOString()
  const T = state.thresholdPercent
  const rid = state.rotation?.rotationId ?? '-'
  const effects: Effect[] = []
  let next: State = state

  const ignore = (why: string): Output => ({ state, effects: [], ignored: `${input.type} in ${state.status}: ${why}` })
  const go = (to: Status, code: ReasonCode | null, patch: Partial<State> = {}, detail = ''): void => {
    const from = next.status
    next = { ...next, ...patch, status: to, reason: code, updatedAt: at }
    // A user's own pause or /clear is not an error.
    const isError = code !== null && !code.startsWith('USER_') && to !== 'MONITORING' && to !== 'COMPLETED' && to !== 'CONTINUING' && !ROTATION_STATES.includes(to)
    if (isError) next.lastErrorCode = code
    // The rotation this line is about, even when the transition just ended it.
    const r = next.rotation?.rotationId ?? rid
    effects.push({ type: 'LOG_EVENT', key: `${r}:${to}`, rotationId: r === '-' ? null : r, from, to, code, detail })
  }
  const setRotation = (patch: Partial<Rotation>) => { next = { ...next, rotation: { ...next.rotation!, ...patch }, updatedAt: at } }
  const key = (step: RotationStep | string) => `${next.rotation?.rotationId ?? rid}:${step}`
  const done = (): Output => ({ state: next, effects })

  const request = (trigger: Trigger): Output => {
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
    if (state.status === 'MONITORING') {
      if (p === undefined) return done()
      if (p >= T && !state.armedFired) return request('THRESHOLD')
      if (p >= T - ctx.config.warnBeforePercent && p < T && state.warnedSessionId !== input.sessionId) {
        next = { ...next, warnedSessionId: input.sessionId }
        effects.push({ type: 'TOAST', key: `-:warn:${input.sessionId}`, text: `Context at ${p}%. SessionRelay will hand over at ${T}%.` })
      }
      return done()
    }
    if (state.status === 'CONTINUING') {
      if (p === undefined) return done()
      if (p < T - 10) {
        go('MONITORING', null, { armedFired: false, rotation: null, sessionSequence: state.sessionSequence + 1, warnedSessionId: null }, `rearmed at ${p}%`)
        return done()
      }
      go('FAILED', 'POSSIBLE_LOOP', { rotation: null }, `fresh session already at ${p}%`)
      effects.push({ type: 'TOAST', key: key('loop'), text: `Stopped: the fresh session is already at ${p}% (threshold ${T}%). Possible rotation loop. Run /relay status.` })
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
      go('MONITORING', null, { mode: input.mode, activeSessionId: input.sessionId, armedFired: false, rotation: null })
      return done()
    }

    case 'OFF':
      if (state.status === 'DISABLED') return ignore('already off')
      go('DISABLED', null, { rotation: null })
      effects.push({ type: 'RELEASE_LOCK', key: key('release') })
      return done()

    case 'ROTATE_CMD':
    case 'COMPACTED':
      if (state.status !== 'MONITORING' && state.status !== 'CONTINUING') return ignore(ROTATION_STATES.includes(state.status) ? 'a rotation is already in progress' : 'no automatic rotation from this state')
      return request(input.type === 'ROTATE_CMD' ? 'MANUAL' : 'COMPACTED')

    case 'TOOL_RESULT':
      if (state.status !== 'ROTATION_REQUESTED' || state.rotation!.noteAppended) return ignore('no note due')
      setRotation({ noteAppended: true })
      effects.push({ type: 'APPEND_NOTE', key: key('note') })
      return done()

    case 'STOP': {
      if (state.status === 'ROTATION_REQUESTED' || state.status === 'QUIESCING') {
        const r = state.rotation!
        if (input.backgroundTasks === 0 && input.runningAgents === 0) {
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
        const h = input.handover ?? { ok: false, errors: ['no SESSIONRELAY-HANDOVER block found in the last message'] }
        if (h.ok) {
          go('VALIDATING', r.trigger)
          effects.push({ type: 'PERSIST_HANDOVER', key: key('persist') })
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
      if (state.status === 'ROTATING' && state.rotation!.step === 'HANDOVER_PERSISTED') {
        setRotation({ step: 'CLEAR_SCHEDULED' })
        effects.push({ type: 'RUN_CLEAR', key: key('CLEAR_SCHEDULED') })
        return done()
      }
      return ignore('nothing scheduled')

    case 'SESSION_END':
      if (input.reason !== 'clear') return ignore(`end reason ${input.reason}`)
      if (state.status === 'ROTATING') {
        const r = state.rotation!
        if (r.step !== 'CLEAR_SCHEDULED') return ignore(`clear at step ${r.step}`)
        setRotation({ step: 'CLEARED', sourceSessionId: r.sourceSessionId ?? input.sessionId })
        return done()
      }
      if (!ACTIVE(state.status) && state.status !== 'PAUSED') return ignore('no active task')
      go('PAUSED', 'USER_CLEAR', { rotation: null, armedFired: false }, 'conversation cleared by the user')
      effects.push({ type: 'TOAST', key: `-:user-clear:${input.sessionId}`, text: 'You cleared the conversation, so SessionRelay paused this task. /relay resume continues it here.' })
      return done()

    case 'SESSION_START_CLEAR': {
      if (state.status !== 'ROTATING') return ignore('not rotating')
      const r = state.rotation!
      if (r.step !== 'CLEAR_SCHEDULED' && r.step !== 'CLEARED') return ignore(`fresh session at step ${r.step}`)
      if (r.targetSessionId !== null) return ignore('target session already set')
      const source = r.sourceSessionId ?? state.activeSessionId
      go('RESTORING', r.trigger, { activeSessionId: input.sessionId })
      setRotation({ step: 'RESTORED', sourceSessionId: source, targetSessionId: input.sessionId })
      effects.push(
        { type: 'TRANSFER_LOCK', key: key('lock'), from: state.activeSessionId, to: input.sessionId },
        { type: 'INJECT_CONTEXT', key: key('RESTORED'), via: 'session-start' },
      )
      return done()
    }

    case 'CLEAR_FAILED':
      if (state.status !== 'ROTATING') return ignore('not rotating')
      go('NEEDS_REVIEW', 'ROTATE_UNAVAILABLE', { rotation: null, mode: 'assisted' })
      effects.push({ type: 'TOAST', key: key('assisted'), text: 'Automatic /clear is unavailable. The handover is saved. Run /clear, then type /relay continue.' })
      return done()

    case 'CONTEXT_READY':
      if (state.status !== 'RESTORING') return ignore('not restoring')
      go('CONTINUING', state.rotation!.trigger, { heldPrompts: [], rotationCount: state.rotationCount + 1, consecutiveFailures: 0 })
      setRotation({ step: 'CONTINUED' })
      effects.push({ type: 'SUBMIT_CONTINUATION', key: key('CONTINUED'), heldPrompts: state.heldPrompts })
      return done()

    case 'PAUSE':
      if (HELD_STATES.includes(state.status)) return ignore('a handover is in flight; pause after the rotation finishes')
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
        // Restore path (02 §5.3): this conversation is already fresh; inject by append, then continue.
        const rotation: Rotation = {
          rotationId: ctx.newRotationId, trigger: 'MANUAL', requestedAt: at, sourceSessionId: state.activeSessionId,
          targetSessionId: input.sessionId, step: 'RESTORED', retries: 0, quiesceCount: 0, noteAppended: false,
        }
        go('RESTORING', 'MANUAL', { rotation, activeSessionId: input.sessionId }, 'resume after user /clear')
        effects.push(
          { type: 'TRANSFER_LOCK', key: key('lock'), from: state.activeSessionId, to: input.sessionId },
          { type: 'INJECT_CONTEXT', key: key('RESTORED'), via: 'append' },
        )
        return done()
      }
      go('MONITORING', null, { armedFired: false, activeSessionId: input.sessionId })
      return done()
    }

    case 'STOP_FAILURE': {
      if (!ACTIVE(state.status)) return ignore('no active task')
      const code = stopFailureCode(input.error)
      go('PAUSED', code, { rotation: null, armedFired: false }, input.error)
      effects.push({ type: 'TOAST', key: key(`fail-${code}`), text: `Paused (${code}): Claude could not answer (${input.error}). /relay resume when it works again.` })
      return done()
    }

    case 'COMPLETE_BLOCK':
      if (state.status !== 'MONITORING' && state.status !== 'CONTINUING') return ignore('completion only while monitoring')
      if (input.evidenceOk) {
        go('COMPLETED', 'COMPLETED', { rotation: null })
        effects.push({ type: 'RELEASE_LOCK', key: key('release') })
        return done()
      }
      go('NEEDS_REVIEW', 'DOD_UNMET', { rotation: null }, `missing: ${input.missing.join(', ')}`)
      effects.push({ type: 'TOAST', key: key('dod'), text: `Not marked done: checks missing (${input.missing.join(', ')}). /relay done confirms by hand.` })
      return done()
  }
}
