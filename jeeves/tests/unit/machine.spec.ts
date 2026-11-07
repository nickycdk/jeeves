import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HELD_MAX, isSafe, reduce, stopFailureCode, type Ctx, type Effect, type Input } from '../../src/core/machine.ts'
import { check } from '../../src/core/schema.ts'
import { DEFAULT_CONFIG, INERT, ROTATION_STATES, STATUSES, type Rotation, type State, type Status } from '../../src/core/types.ts'
import { AT, prng, validState } from './helpers.ts'

const T0 = Date.parse(AT)
const ctx = (over: Partial<Ctx> = {}): Ctx => ({ now: T0 + 1000, config: DEFAULT_CONFIG, newRotationId: 'r_new', ...over })
const rot = (over: Partial<Rotation> = {}): Rotation => ({
  rotationId: 'r1', trigger: 'THRESHOLD', requestedAt: AT, sourceSessionId: null, targetSessionId: null,
  step: 'REQUESTED', retries: 0, quiesceCount: 0, noteAppended: false, ...over,
})
const st = (status: Status, over: Partial<State> = {}): State =>
  validState({ status, rotation: ROTATION_STATES.includes(status) ? rot() : null, ...over })
const types = (effects: Effect[]) => effects.map(e => e.type)
const run = (s: State, i: Input, c = ctx()) => {
  const out = reduce(s, i, c)
  assert.ok(check('state', out.state).ok, `invalid state after ${i.type}: ${JSON.stringify(check('state', out.state))}`)
  return out
}
const measure = (percent: number | undefined, sessionId = 'sess-a'): Input => ({ type: 'MEASURE', window: 1_000_000, sessionId, ...(percent === undefined ? {} : { percent }) })
const stop = (bg = 0, agents = 0, handover?: { ok: true } | { ok: false; errors: string[] }): Input => ({ type: 'STOP', backgroundTasks: bg, runningAgents: agents, ...(handover ? { handover } : {}) })

// ---- One test per row of the 02 §4 table ----

test('row 1: DISABLED + /relay on (supported, lock acquired) -> MONITORING', () => {
  const o = run(st('DISABLED'), { type: 'ON', mode: 'full', lockAcquired: true, sessionId: 's9' })
  assert.equal(o.state.status, 'MONITORING')
  assert.equal(o.state.activeSessionId, 's9')
  assert.deepEqual(types(o.effects), ['LOG_EVENT'])
  // guards: unsupported -> no-op; lock held -> LOCK_HELD toast, stays DISABLED
  assert.ok(run(st('DISABLED'), { type: 'ON', mode: 'unsupported', lockAcquired: true, sessionId: 's9' }).ignored)
  const held = run(st('DISABLED'), { type: 'ON', mode: 'full', lockAcquired: false, sessionId: 's9' })
  assert.equal(held.state.status, 'DISABLED')
  assert.equal(held.state.lastErrorCode, 'LOCK_HELD')
})

test('row 2: MONITORING + measure >= T, not armedFired -> ROTATION_REQUESTED with a new rotationId', () => {
  const o = run(st('MONITORING'), measure(50))
  assert.equal(o.state.status, 'ROTATION_REQUESTED')
  assert.equal(o.state.rotation?.rotationId, 'r_new')
  assert.equal(o.state.rotation?.trigger, 'THRESHOLD')
  assert.equal(o.state.armedFired, true)
  assert.equal(o.effects[0]?.type === 'LOG_EVENT' && o.effects[0].code, 'THRESHOLD')
  assert.equal(run(st('MONITORING'), measure(49)).state.status, 'MONITORING')
  assert.equal(run(st('MONITORING', { armedFired: true }), measure(70)).state.status, 'MONITORING')
})

test('row 3: MONITORING + T-5 <= p < T -> warn once per session', () => {
  const a = run(st('MONITORING'), measure(45))
  assert.deepEqual(types(a.effects), ['TOAST'])
  assert.equal(a.state.warnedSessionId, 'sess-a')
  assert.deepEqual(run(a.state, measure(47)).effects, [])
  assert.deepEqual(types(run(a.state, measure(46, 'sess-b')).effects), ['TOAST'])
  assert.deepEqual(run(st('MONITORING'), measure(44)).effects, [])
})

test('row 4: MONITORING + measure(undefined) -> lastContext unknown, never 0', () => {
  const o = run(st('MONITORING'), measure(undefined))
  assert.equal(o.state.status, 'MONITORING')
  assert.equal(o.state.lastContext?.percent, undefined)
  assert.ok(!('percent' in o.state.lastContext!))
})

test('row 5: MONITORING/CONTINUING + /relay rotate or COMPACTED -> ROTATION_REQUESTED (MANUAL/COMPACTED)', () => {
  assert.equal(run(st('MONITORING'), { type: 'ROTATE_CMD' }).state.rotation?.trigger, 'MANUAL')
  assert.equal(run(st('CONTINUING', { rotation: rot({ step: 'CONTINUED' }) }), { type: 'COMPACTED' }).state.rotation?.trigger, 'COMPACTED')
})

test('row 6: ROTATION_REQUESTED + tool result (first time) -> one soft-quiesce note', () => {
  const a = run(st('ROTATION_REQUESTED'), { type: 'TOOL_RESULT', main: true })
  assert.deepEqual(types(a.effects), ['APPEND_NOTE'])
  assert.equal(a.state.rotation?.noteAppended, true)
  assert.ok(run(a.state, { type: 'TOOL_RESULT', main: true }).ignored)
})

test('row 7: ROTATION_REQUESTED/QUIESCING + safe Stop -> HANDOVER_GENERATING, capture facts, block with instruction', () => {
  for (const s of ['ROTATION_REQUESTED', 'QUIESCING'] as const) {
    const o = run(st(s), stop())
    assert.equal(o.state.status, 'HANDOVER_GENERATING')
    assert.deepEqual(types(o.effects), ['LOG_EVENT', 'CAPTURE_FACTS', 'BLOCK_STOP'])
    assert.equal(o.state.rotation?.step, 'HANDOVER_REQUESTED')
  }
})

test('row 8: ROTATION_REQUESTED/QUIESCING + unsafe Stop -> QUIESCING, count++, stop allowed', () => {
  const a = run(st('ROTATION_REQUESTED'), stop(1, 0))
  assert.equal(a.state.status, 'QUIESCING')
  assert.equal(a.state.rotation?.quiesceCount, 1)
  assert.ok(!types(a.effects).includes('BLOCK_STOP'))
  const b = run(a.state, stop(0, 1))
  assert.equal(b.state.status, 'QUIESCING')
  assert.equal(b.state.rotation?.quiesceCount, 2)
})

test('row 9: QUIESCING + Stop past quiesceMaxTurns or quiesceMaxMinutes -> PAUSED(UNSAFE_BOUNDARY)', () => {
  const byCount = run(st('QUIESCING', { rotation: rot({ step: 'QUIESCING', quiesceCount: 3 }) }), stop(1))
  assert.equal(byCount.state.status, 'PAUSED')
  assert.equal(byCount.state.reason, 'UNSAFE_BOUNDARY')
  assert.ok(types(byCount.effects).includes('TOAST'))
  const byTime = run(st('QUIESCING', { rotation: rot({ step: 'QUIESCING', quiesceCount: 1 }) }), stop(1), ctx({ now: T0 + 21 * 60_000 }))
  assert.equal(byTime.state.reason, 'UNSAFE_BOUNDARY')
})

test('row 10: HANDOVER_GENERATING + Stop with a valid block -> VALIDATING, persist effect', () => {
  const o = run(st('HANDOVER_GENERATING', { rotation: rot({ step: 'HANDOVER_REQUESTED' }) }), stop(0, 0, { ok: true }))
  assert.equal(o.state.status, 'VALIDATING')
  assert.ok(types(o.effects).includes('PERSIST_HANDOVER'))
  const p = run(o.state, { type: 'HANDOVER_PERSISTED', ok: true, ref: 'history/handover-001.md#sha256:ab' })
  assert.equal(p.state.status, 'ROTATING')
  assert.equal(p.state.rotation?.step, 'HANDOVER_PERSISTED')
  assert.equal(p.state.lastValidatedHandover, 'history/handover-001.md#sha256:ab')
  const fail = run(o.state, { type: 'HANDOVER_PERSISTED', ok: false })
  assert.deepEqual([fail.state.status, fail.state.reason], ['NEEDS_REVIEW', 'DISK'])
})

test('row 11: HANDOVER_GENERATING + invalid block, retries left -> block with the specific errors', () => {
  const o = run(st('HANDOVER_GENERATING', { rotation: rot({ step: 'HANDOVER_REQUESTED' }) }), stop(0, 0, { ok: false, errors: ["missing 'Exact next actions'"] }))
  assert.equal(o.state.status, 'HANDOVER_GENERATING')
  assert.equal(o.state.rotation?.retries, 1)
  const block = o.effects.find(e => e.type === 'BLOCK_STOP')
  assert.ok(block?.type === 'BLOCK_STOP' && block.kind === 'handover-retry' && block.errors[0] === "missing 'Exact next actions'")
})

test('row 12: HANDOVER_GENERATING + invalid, retries exhausted -> NEEDS_REVIEW(HANDOVER_INVALID), last good handover kept', () => {
  const s = st('HANDOVER_GENERATING', { rotation: rot({ step: 'HANDOVER_REQUESTED', retries: 2 }), lastValidatedHandover: 'history/handover-001.md#sha256:aa' })
  const o = run(s, stop(0, 0, { ok: false, errors: ['x'] }))
  assert.deepEqual([o.state.status, o.state.reason], ['NEEDS_REVIEW', 'HANDOVER_INVALID'])
  assert.equal(o.state.lastValidatedHandover, 'history/handover-001.md#sha256:aa')
  assert.ok(!types(o.effects).includes('BLOCK_STOP'))
  assert.ok(!types(o.effects).includes('RUN_CLEAR'))
})

test('row 13: HANDOVER_GENERATING + turn aborted -> PAUSED(USER_INTERRUPT), no hidden continuation', () => {
  const o = run(st('HANDOVER_GENERATING'), { type: 'TURN_COMPLETE', reason: 'aborted' })
  assert.deepEqual([o.state.status, o.state.reason], ['PAUSED', 'USER_INTERRUPT'])
  assert.ok(!types(o.effects).some(t => t === 'SUBMIT_CONTINUATION' || t === 'BLOCK_STOP'))
})

test('row 14: ROTATING + turn.complete -> schedule /clear once', () => {
  const s = st('ROTATING', { rotation: rot({ step: 'HANDOVER_PERSISTED' }), lastValidatedHandover: 'h#sha256:1' })
  const o = run(s, { type: 'TURN_COMPLETE', reason: 'answer', handoverVerified: true })
  assert.deepEqual(types(o.effects), ['RUN_CLEAR'])
  assert.equal(o.effects[0]?.key, 'r1:CLEAR_SCHEDULED')
  assert.ok(run(o.state, { type: 'TURN_COMPLETE', reason: 'answer', handoverVerified: true }).ignored, 'dedupe: second turn.complete does nothing')
})

test('ST-4.1 AC 2: a handover that no longer verifies (or was not checked) never clears -> NEEDS_REVIEW(HANDOVER_INVALID)', () => {
  const s = st('ROTATING', { rotation: rot({ step: 'HANDOVER_PERSISTED' }), lastValidatedHandover: 'h#sha256:1' })
  for (const i of [{ type: 'TURN_COMPLETE', reason: 'answer', handoverVerified: false }, { type: 'TURN_COMPLETE', reason: 'answer' }] as const) {
    const o = run(s, i)
    assert.deepEqual([o.state.status, o.state.reason, o.state.rotation], ['NEEDS_REVIEW', 'HANDOVER_INVALID', null])
    assert.ok(!types(o.effects).includes('RUN_CLEAR'))
    assert.equal(o.state.lastValidatedHandover, 'h#sha256:1', 'the saved handover ref is kept')
  }
})

test('D-23: IDLE in ROTATION_REQUESTED -> one nudge per rotation; nowhere else', () => {
  const o = run(st('ROTATION_REQUESTED'), { type: 'IDLE' })
  assert.deepEqual(types(o.effects), ['SUBMIT_NUDGE'])
  assert.equal(o.effects[0]?.key, 'r1:nudge')
  assert.equal(o.state.rotation?.nudged, true)
  assert.equal(o.state.status, 'ROTATION_REQUESTED')
  assert.ok(run(o.state, { type: 'IDLE' }).ignored, 'nudged once')
  for (const status of ['MONITORING', 'QUIESCING', 'HANDOVER_GENERATING', 'ROTATING', 'PAUSED', 'CONTINUING'] as const) assert.ok(run(st(status), { type: 'IDLE' }).ignored, status)
})

test('row 15: ROTATING + session.end(clear) -> sourceSessionId recorded, session record written once', () => {
  const s = st('ROTATING', { rotation: rot({ step: 'CLEAR_SCHEDULED' }), lastValidatedHandover: 'h#sha256:1', sessionSequence: 2,
    sessionStart: { at: '2026-11-07T07:00:00.000Z', pct: 4 }, lastContext: { percent: 51, window: 1, at: AT } })
  const o = run(s, { type: 'SESSION_END', reason: 'clear', sessionId: 'sess-a' })
  assert.equal(o.state.status, 'ROTATING')
  assert.equal(o.state.rotation?.sourceSessionId, 'sess-a')
  assert.equal(o.state.rotation?.step, 'CLEARED')
  const w = o.effects.find(e => e.type === 'WRITE_SESSION')
  assert.ok(w?.type === 'WRITE_SESSION')
  assert.equal(w.n, 2)
  assert.deepEqual(w.record, { schemaVersion: 1, sessionId: 'sess-a', startedAt: '2026-11-07T07:00:00.000Z', endedAt: new Date(T0 + 1000).toISOString(), endReason: 'clear', startPct: 4, endPct: 51 })
  assert.ok(check('session', w.record).ok)
  assert.ok(run(o.state, { type: 'SESSION_END', reason: 'clear', sessionId: 'sess-a' }).ignored, 'a second end changes nothing')
})

test('ST-4.2: a /clear before Jeeves scheduled one is the user\'s (USER_CLEAR); a fresh session with the old id is refused', () => {
  const s = st('ROTATING', { rotation: rot({ step: 'HANDOVER_PERSISTED' }), lastValidatedHandover: 'h#sha256:1' })
  const o = run(s, { type: 'SESSION_END', reason: 'clear', sessionId: 'sess-a' })
  assert.deepEqual([o.state.status, o.state.reason, o.state.rotation], ['PAUSED', 'USER_CLEAR', null])
  assert.ok(!types(o.effects).includes('WRITE_SESSION'))
  const same = run(st('ROTATING', { rotation: rot({ step: 'CLEARED', sourceSessionId: 'sess-a' }) }), { type: 'SESSION_START_CLEAR', sessionId: 'sess-a', handoverOk: true })
  assert.ok(same.ignored, 'source must differ from target')
})

test('ST-4.2: the session start is recorded at ON and in the fresh session; its first reading becomes startPct', () => {
  const on = run(st('DISABLED', { activeSessionId: null }), { type: 'ON', mode: 'full', lockAcquired: true, sessionId: 'sess-a' })
  assert.deepEqual(on.state.sessionStart, { at: new Date(T0 + 1000).toISOString(), pct: null })
  const m = run(on.state, measure(7))
  assert.equal(m.state.sessionStart?.pct, 7)
  assert.equal(run(m.state, measure(9)).state.sessionStart?.pct, 7, 'first reading only')
  const fresh = run(st('ROTATING', { rotation: rot({ step: 'CLEARED', sourceSessionId: 'sess-a' }), sessionStart: { at: AT, pct: 7 } }), { type: 'SESSION_START_CLEAR', sessionId: 'sess-b', handoverOk: true })
  assert.equal(fresh.state.sessionStart?.pct, null)
})

test('row 16: ROTATING + SessionStart(clear) -> RESTORING, target id, lock to new id, inject context', () => {
  const s = st('ROTATING', { rotation: rot({ step: 'CLEARED', sourceSessionId: 'sess-a' }), lastValidatedHandover: 'h#sha256:1' })
  const o = run(s, { type: 'SESSION_START_CLEAR', sessionId: 'sess-b', handoverOk: true })
  assert.equal(o.state.status, 'RESTORING')
  assert.equal(o.state.rotation?.targetSessionId, 'sess-b')
  assert.equal(o.state.activeSessionId, 'sess-b')
  assert.deepEqual(types(o.effects), ['LOG_EVENT', 'TRANSFER_LOCK', 'INJECT_CONTEXT'])
  const t = o.effects.find(e => e.type === 'TRANSFER_LOCK')
  assert.ok(t?.type === 'TRANSFER_LOCK' && t.from === 'sess-a' && t.to === 'sess-b')
  assert.ok(run(o.state, { type: 'SESSION_START_CLEAR', sessionId: 'sess-c', handoverOk: true }).ignored, 'target id is immutable')
})

test('row 17: ROTATING + runCommand rejects -> NEEDS_REVIEW(ROTATE_UNAVAILABLE), mode assisted', () => {
  const o = run(st('ROTATING', { rotation: rot({ step: 'CLEAR_SCHEDULED' }) }), { type: 'CLEAR_FAILED' })
  assert.deepEqual([o.state.status, o.state.reason, o.state.mode], ['NEEDS_REVIEW', 'ROTATE_UNAVAILABLE', 'assisted'])
  const toast = o.effects.find(e => e.type === 'TOAST')
  assert.match(toast?.type === 'TOAST' ? toast.text : '', /Run \/clear, then type \/relay continue/)
})

test('row 18: RESTORING + context ready -> CONTINUING, submit continuation with held prompts', () => {
  const s = st('RESTORING', { rotation: rot({ step: 'RESTORED', sourceSessionId: 'a', targetSessionId: 'b' }), heldPrompts: ['also fix the typo'] })
  const o = run(s, { type: 'CONTEXT_READY' })
  assert.equal(o.state.status, 'CONTINUING')
  assert.deepEqual(o.state.heldPrompts, [])
  assert.equal(o.state.rotationCount, 1)
  const sub = o.effects.find(e => e.type === 'SUBMIT_CONTINUATION')
  assert.deepEqual(sub?.type === 'SUBMIT_CONTINUATION' && sub.heldPrompts, ['also fix the typo'])
})

test('ST-4.3: a fresh session whose handover no longer verifies takes the task but injects nothing -> NEEDS_REVIEW', () => {
  const s = st('ROTATING', { rotation: rot({ step: 'CLEARED', sourceSessionId: 'sess-a' }), lastValidatedHandover: 'h#sha256:1' })
  const o = run(s, { type: 'SESSION_START_CLEAR', sessionId: 'sess-b', handoverOk: false })
  assert.deepEqual([o.state.status, o.state.reason, o.state.activeSessionId, o.state.rotation], ['NEEDS_REVIEW', 'HANDOVER_INVALID', 'sess-b', null])
  assert.deepEqual(types(o.effects), ['LOG_EVENT', 'TRANSFER_LOCK', 'TOAST'])
})

test('ST-4.3: a rejected continuation prompt -> NEEDS_REVIEW(ROTATE_UNAVAILABLE), assisted, /relay continue offered', () => {
  const o = run(st('CONTINUING', { rotation: rot({ step: 'CONTINUED' }) }), { type: 'SUBMIT_FAILED' })
  assert.deepEqual([o.state.status, o.state.reason, o.state.mode], ['NEEDS_REVIEW', 'ROTATE_UNAVAILABLE', 'assisted'])
  const t = o.effects.find(e => e.type === 'TOAST')
  assert.match(t?.type === 'TOAST' ? t.text : '', /\/relay continue/)
  assert.ok(run(st('MONITORING'), { type: 'SUBMIT_FAILED' }).ignored)
})

test('row 19: CONTINUING + fresh measure < T-10 -> MONITORING, rearmed, sessionSequence++', () => {
  const s = st('CONTINUING', { rotation: rot({ step: 'CONTINUED' }), armedFired: true, sessionSequence: 1 })
  assert.equal(run(s, measure(undefined)).state.status, 'CONTINUING', 'unknown reading does not rearm')
  const o = run(s, measure(3))
  assert.equal(o.state.status, 'MONITORING')
  assert.equal(o.state.armedFired, false)
  assert.equal(o.state.sessionSequence, 2)
  assert.equal(o.state.rotation, null)
})

test('row 20: CONTINUING + measure >= T-10 -> FAILED(POSSIBLE_LOOP), no rotation', () => {
  const o = run(st('CONTINUING', { rotation: rot({ step: 'CONTINUED' }) }), measure(40))
  assert.deepEqual([o.state.status, o.state.reason], ['FAILED', 'POSSIBLE_LOOP'])
  assert.equal(o.state.rotation, null)
})

test('row 21: any active + /relay pause -> PAUSED(USER_PAUSE), cancelling a requested rotation; deferred while a handover is in flight', () => {
  // VALIDATING pauses at once: nothing is cleared yet (M3 review fix 3).
  for (const s of ['MONITORING', 'ROTATION_REQUESTED', 'QUIESCING', 'VALIDATING', 'CONTINUING'] as const) {
    const o = run(st(s, s === 'CONTINUING' ? { rotation: rot({ step: 'CONTINUED' }) } : {}), { type: 'PAUSE' })
    assert.deepEqual([o.state.status, o.state.reason, o.state.rotation], ['PAUSED', 'USER_PAUSE', null], s)
  }
  for (const s of ['HANDOVER_GENERATING', 'ROTATING', 'RESTORING'] as const) {
    const d = run(st(s), { type: 'PAUSE' })
    assert.deepEqual([d.state.status, d.state.pauseRequested, d.state.rotation?.rotationId], [s, true, 'r1'], s)
    assert.ok(run(d.state, { type: 'PAUSE' }).ignored, `${s}: second pause`)
  }
  // The deferred pause applies after the continuation: the prompt is still submitted, then PAUSED(USER_PAUSE).
  const restoring = run(st('RESTORING', { rotation: rot({ step: 'RESTORED' }) }), { type: 'PAUSE' }).state
  const after = run(restoring, { type: 'CONTEXT_READY' })
  assert.deepEqual([after.state.status, after.state.reason, after.state.pauseRequested, after.state.rotation], ['PAUSED', 'USER_PAUSE', false, null])
  assert.ok(types(after.effects).includes('SUBMIT_CONTINUATION'))
  assert.equal(after.state.rotationCount, 1)
  // A pause in ROTATION_REQUESTED cancels the request, and a resume rearms.
  const cancelled = run(st('ROTATION_REQUESTED', { armedFired: true }), { type: 'PAUSE' }).state
  assert.deepEqual([cancelled.status, cancelled.rotation, cancelled.armedFired], ['PAUSED', null, false])
})

test('row 22: PAUSED + /relay resume -> MONITORING, or RESTORING via the restore path after USER_CLEAR', () => {
  const m = run(st('PAUSED', { reason: 'USER_PAUSE' }), { type: 'RESUME', lockOk: true, sessionId: 'sess-a' })
  assert.equal(m.state.status, 'MONITORING')
  const r = run(st('PAUSED', { reason: 'USER_CLEAR', activeSessionId: 'old' }), { type: 'RESUME', lockOk: true, sessionId: 'new' })
  assert.equal(r.state.status, 'RESTORING')
  assert.ok(r.effects.some(e => e.type === 'INJECT_CONTEXT' && e.via === 'prompt'))
  assert.ok(!r.effects.some(e => e.type === 'TRANSFER_LOCK'), 'the command took the lock already')
  assert.equal(run(r.state, { type: 'CONTEXT_READY' }).state.status, 'CONTINUING')
  const held = run(st('PAUSED', { reason: 'USER_PAUSE' }), { type: 'RESUME', lockOk: false, sessionId: 'x' })
  assert.deepEqual([held.state.status, held.state.lastErrorCode], ['PAUSED', 'LOCK_HELD'])
})

test('row 23: any active + StopFailure -> PAUSED with a distinct reason code', () => {
  const cases: [string, string][] = [['rate_limit', 'RATE_LIMIT'], ['authentication_failed', 'AUTH'], ['billing_error', 'BILLING'], ['overloaded', 'OVERLOADED'], ['server_error', 'API_ERROR'], ['unknown', 'API_ERROR']]
  for (const [error, code] of cases) {
    const o = run(st('MONITORING'), { type: 'STOP_FAILURE', error })
    assert.deepEqual([o.state.status, o.state.reason], ['PAUSED', code], error)
    assert.notEqual(code, 'THRESHOLD')
  }
  assert.equal(stopFailureCode('rate_limit') === stopFailureCode('overloaded'), false)
})

test('rows 24-25: MONITORING/CONTINUING + COMPLETE block -> COMPLETED with evidence, else NEEDS_REVIEW(DOD_UNMET)', () => {
  const ok = run(st('MONITORING'), { type: 'COMPLETE_BLOCK', evidenceOk: true, missing: [] })
  assert.equal(ok.state.status, 'COMPLETED')
  assert.ok(types(ok.effects).includes('RELEASE_LOCK'))
  const no = run(st('MONITORING'), { type: 'COMPLETE_BLOCK', evidenceOk: false, missing: ['npm test'] })
  assert.deepEqual([no.state.status, no.state.reason], ['NEEDS_REVIEW', 'DOD_UNMET'])
})

test('row 26: any + /relay off -> DISABLED, state kept, lock released', () => {
  for (const s of STATUSES.filter(s => s !== 'DISABLED')) {
    const o = run(st(s, { rotationCount: 3 }), { type: 'OFF', sessionId: 'sess-a' })
    assert.equal(o.state.status, 'DISABLED', s)
    assert.equal(o.state.rotationCount, 3)
    assert.ok(types(o.effects).includes('RELEASE_LOCK'))
  }
})

test('row 27: any + session.end(clear) while not ROTATING -> PAUSED(USER_CLEAR)', () => {
  for (const s of ['MONITORING', 'ROTATION_REQUESTED', 'QUIESCING', 'HANDOVER_GENERATING', 'CONTINUING', 'PAUSED'] as const) {
    const o = run(st(s, s === 'CONTINUING' ? { rotation: rot({ step: 'CONTINUED' }) } : {}), { type: 'SESSION_END', reason: 'clear', sessionId: 'sess-a' })
    assert.deepEqual([o.state.status, o.state.reason], ['PAUSED', 'USER_CLEAR'], s)
  }
  assert.ok(run(st('DISABLED'), { type: 'SESSION_END', reason: 'clear', sessionId: 's' }).ignored)
  assert.ok(run(st('MONITORING'), { type: 'SESSION_END', reason: 'exit', sessionId: 's' }).ignored)
})

test('the event line of a transition that ends a rotation still names that rotation', () => {
  const o = run(st('QUIESCING', { rotation: rot({ step: 'QUIESCING', quiesceCount: 3 }) }), stop(1))
  const log = o.effects.find(e => e.type === 'LOG_EVENT')
  assert.equal(o.state.rotation, null)
  assert.equal(log?.type === 'LOG_EVENT' && log.rotationId, 'r1')
  const plain = run(st('DISABLED'), { type: 'ON', mode: 'full', lockAcquired: true, sessionId: 's' }).effects[0]
  assert.equal(plain?.type === 'LOG_EVENT' && plain.rotationId, null)
})

test('a user pause or /clear is not recorded as an error', () => {
  assert.equal(run(st('MONITORING'), { type: 'PAUSE' }).state.lastErrorCode, null)
  assert.equal(run(st('MONITORING'), { type: 'SESSION_END', reason: 'clear', sessionId: 's' }).state.lastErrorCode, null)
  assert.equal(run(st('MONITORING'), { type: 'STOP_FAILURE', error: 'rate_limit' }).state.lastErrorCode, 'RATE_LIMIT')
})

// ---- Forbidden transitions ----

test('forbidden transitions are no-ops with a reason', () => {
  const cases: [Status, Input][] = [
    ['DISABLED', { type: 'ROTATE_CMD' }], ['PAUSED', { type: 'ROTATE_CMD' }], ['COMPLETED', { type: 'COMPACTED' }],
    ['ROTATION_REQUESTED', { type: 'ROTATE_CMD' }], ['MONITORING', { type: 'CLEAR_FAILED' }], ['MONITORING', { type: 'CONTEXT_READY' }],
    ['MONITORING', { type: 'HANDOVER_PERSISTED', ok: true, ref: 'x' }], ['MONITORING', stop()], ['PAUSED', stop()],
    ['MONITORING', { type: 'RESUME', lockOk: true, sessionId: 's' }], ['MONITORING', { type: 'ON', mode: 'full', lockAcquired: true, sessionId: 's' }],
    ['DISABLED', { type: 'OFF', sessionId: 'sess-a' }], ['NEEDS_REVIEW', { type: 'PAUSE' }], ['FAILED', { type: 'STOP_FAILURE', error: 'rate_limit' }],
    ['ROTATING', { type: 'COMPLETE_BLOCK', evidenceOk: true, missing: [] }], ['MONITORING', { type: 'SESSION_START_CLEAR', sessionId: 'b', handoverOk: true }],
  ]
  for (const [s, i] of cases) {
    const before = st(s)
    const o = run(before, i)
    assert.equal(o.state, before, `${s} + ${i.type} changed state`)
    assert.deepEqual(o.effects, [])
    assert.match(o.ignored ?? '', new RegExp(`^${i.type} in ${s}: .+`))
  }
  for (const s of INERT) assert.equal(run(st(s), measure(95)).state.status, s, `${s} never rotates on a measure`)
})

// ---- Purity and a full rotation ----

const deepFreeze = <T>(o: T): T => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o) } return o }

test('reducer is pure: same input, same output; inputs are never mutated', () => {
  const s = deepFreeze(st('MONITORING'))
  const i = deepFreeze(measure(55))
  assert.deepEqual(reduce(s, i, ctx()), reduce(s, i, ctx()))
})

test('a whole rotation runs MONITORING -> ... -> MONITORING with effects in order', () => {
  let s = st('MONITORING')
  const seen: string[] = []
  const step = (i: Input) => { const o = run(s, i); s = o.state; seen.push(...o.effects.filter(e => e.type !== 'LOG_EVENT').map(e => e.type)) }
  step(measure(52)); step({ type: 'TOOL_RESULT', main: true }); step(stop()); step(stop(0, 0, { ok: true }))
  step({ type: 'HANDOVER_PERSISTED', ok: true, ref: 'history/handover-001.md#sha256:1' }); step({ type: 'TURN_COMPLETE', reason: 'answer', handoverVerified: true })
  step({ type: 'SESSION_END', reason: 'clear', sessionId: 'sess-a' }); step({ type: 'SESSION_START_CLEAR', sessionId: 'sess-b', handoverOk: true })
  step({ type: 'CONTEXT_READY' }); step(measure(undefined, 'sess-b')); step(measure(3, 'sess-b'))
  assert.equal(s.status, 'MONITORING')
  assert.deepEqual(seen, ['APPEND_NOTE', 'CAPTURE_FACTS', 'BLOCK_STOP', 'PERSIST_HANDOVER', 'RUN_CLEAR', 'WRITE_SESSION', 'TRANSFER_LOCK', 'INJECT_CONTEXT', 'SUBMIT_CONTINUATION'])
  assert.equal(s.rotationCount, 1)
  assert.equal(s.activeSessionId, 'sess-b')
})

// ---- Property test: random input sequences never violate the invariants ----

test('property: 300 seeded random walks of 200 inputs keep every invariant (02 §4)', () => {
  const sessions = ['sess-a', 'sess-b', 'sess-c']
  const gen = (rnd: ReturnType<typeof prng>): Input => {
    const sid = rnd.pick(sessions)
    switch (rnd.int(19)) {
      case 0: return { type: 'ON', mode: rnd.pick(['full', 'assisted', 'unsupported'] as const), lockAcquired: rnd.next() < 0.8, sessionId: sid }
      case 1: return rnd.next() < 0.2 ? { type: 'OFF', sessionId: sid } : measure(rnd.int(101), sid)
      case 2: case 3: return rnd.next() < 0.15 ? measure(undefined, sid) : measure(rnd.int(101), sid)
      case 4: return { type: 'ROTATE_CMD' }
      case 5: return { type: 'COMPACTED' }
      case 6: return { type: 'TOOL_RESULT', main: true }
      case 7: case 8: return stop(rnd.int(2), rnd.int(2), rnd.next() < 0.6 ? { ok: true } : { ok: false, errors: ['bad'] })
      case 9: return { type: 'HANDOVER_PERSISTED', ok: rnd.next() < 0.9, ref: `history/handover-${rnd.int(9)}.md#sha256:x` }
      case 10: return rnd.next() < 0.2 ? { type: 'IDLE' } : { type: 'TURN_COMPLETE', reason: rnd.pick(['answer', 'aborted', 'refusal', 'error'] as const), handoverVerified: rnd.next() < 0.9 }
      case 11: return { type: 'SESSION_END', reason: rnd.pick(['clear', 'clear', 'exit']), sessionId: sid }
      case 12: return { type: 'SESSION_START_CLEAR', sessionId: sid, handoverOk: rnd.next() < 0.9 }
      case 13: return rnd.next() < 0.3 ? { type: 'SUBMIT_FAILED' } : { type: 'CLEAR_FAILED' }
      case 14: return { type: 'CONTEXT_READY' }
      case 15: return { type: 'PAUSE' }
      case 16: return { type: 'RESUME', lockOk: rnd.next() < 0.8, sessionId: sid }
      case 17: return { type: 'STOP_FAILURE', error: rnd.pick(['rate_limit', 'overloaded', 'authentication_failed', 'billing_error', 'server_error']) }
      default: return { type: 'COMPLETE_BLOCK', evidenceOk: rnd.next() < 0.5, missing: ['npm test'] }
    }
  }
  // Half the inputs follow the happy path from the current state, so walks reach the deep states.
  const natural = (s: State, rnd: ReturnType<typeof prng>): Input | null => {
    const sid = s.activeSessionId ?? 'sess-a'
    switch (s.status) {
      case 'DISABLED': return { type: 'ON', mode: 'full', lockAcquired: true, sessionId: sid }
      case 'MONITORING': return measure(40 + rnd.int(30), sid)
      case 'ROTATION_REQUESTED': case 'QUIESCING': return rnd.next() < 0.3 ? { type: 'TOOL_RESULT', main: true } : stop(rnd.next() < 0.2 ? 1 : 0, 0)
      case 'HANDOVER_GENERATING': return stop(0, 0, rnd.next() < 0.8 ? { ok: true } : { ok: false, errors: ['bad'] })
      case 'VALIDATING': return { type: 'HANDOVER_PERSISTED', ok: true, ref: 'history/handover-001.md#sha256:x' }
      case 'ROTATING': return s.rotation!.step === 'HANDOVER_PERSISTED' ? { type: 'TURN_COMPLETE', reason: 'answer', handoverVerified: true }
        : s.rotation!.step === 'CLEAR_SCHEDULED' ? { type: 'SESSION_END', reason: 'clear', sessionId: sid }
        : { type: 'SESSION_START_CLEAR', sessionId: `${sid}+`, handoverOk: true }
      case 'RESTORING': return { type: 'CONTEXT_READY' }
      case 'CONTINUING': return measure(rnd.next() < 0.9 ? rnd.int(20) : 45, sid)
      case 'PAUSED': return { type: 'RESUME', lockOk: true, sessionId: sid }
      default: return null
    }
  }
  let rotationsSeen = 0, clears = 0
  for (let seed = 1; seed <= 300; seed++) {
    const rnd = prng(seed)
    let s = deepFreeze(st('DISABLED', { activeSessionId: null }))
    let now = T0
    const persisted = new Set<string>()
    const idsOf = new Map<string, { source: string | null; target: string | null }>()
    const emittedKeys = new Set<string>()
    for (let n = 0; n < 200; n++) {
      const input = deepFreeze(rnd.next() < 0.5 ? natural(s, rnd) ?? gen(rnd) : gen(rnd))
      now += rnd.int(120_000)
      const c = ctx({ now, newRotationId: `r${seed}_${n}` })
      const o = reduce(s, input, c)
      const where = `seed ${seed} step ${n} ${s.status} + ${JSON.stringify(input)}`
      assert.deepEqual(reduce(s, input, c), o, `pure: ${where}`)
      const v = check('state', o.state)
      assert.ok(v.ok, `schema: ${where}: ${!v.ok && v.errors}`)
      const r = o.state.rotation
      // At most one active rotation, and its ID is fixed until it ends.
      if (s.rotation && r && ROTATION_STATES.includes(s.status) && ROTATION_STATES.includes(o.state.status)) assert.equal(r.rotationId, s.rotation.rotationId, `rotationId changed: ${where}`)
      // A rotation starts only from MONITORING/CONTINUING (or the restore path from PAUSED): never from an inert state on its own.
      if (o.state.status === 'ROTATION_REQUESTED' && s.status !== 'ROTATION_REQUESTED') {
        assert.ok(s.status === 'MONITORING' || s.status === 'CONTINUING', `rotation from ${where}`)
        rotationsSeen++
      }
      if (INERT.includes(s.status) && input.type === 'MEASURE') assert.equal(o.state.status, s.status, `inert state moved on a measure: ${where}`)
      // source/target session IDs never change once set.
      if (r) {
        const prev = idsOf.get(r.rotationId)
        if (prev) {
          if (prev.source !== null) assert.equal(r.sourceSessionId, prev.source, `sourceSessionId changed: ${where}`)
          if (prev.target !== null) assert.equal(r.targetSessionId, prev.target, `targetSessionId changed: ${where}`)
        }
        idsOf.set(r.rotationId, { source: r.sourceSessionId, target: r.targetSessionId })
      }
      if (input.type === 'HANDOVER_PERSISTED' && s.status === 'VALIDATING' && o.state.status === 'ROTATING') persisted.add(s.rotation!.rotationId)
      for (const e of o.effects) {
        assert.match(e.key, /^[^:]+:.+$/, `effect key: ${where}`)
        // /clear only after this rotation's handover was persisted and verified.
        if (e.type === 'RUN_CLEAR') {
          clears++
          assert.ok(persisted.has(s.rotation!.rotationId), `RUN_CLEAR before persist: ${where}`)
          assert.ok(o.state.lastValidatedHandover, `RUN_CLEAR without a handover: ${where}`)
        }
        // Step effects are emitted once per rotation (dedupe by rotationId:step).
        if (['RUN_CLEAR', 'SUBMIT_CONTINUATION', 'INJECT_CONTEXT', 'PERSIST_HANDOVER', 'CAPTURE_FACTS', 'APPEND_NOTE', 'SUBMIT_NUDGE'].includes(e.type)) {
          assert.ok(!emittedKeys.has(e.key), `duplicate ${e.type} ${e.key}: ${where}`)
          emittedKeys.add(e.key)
        }
      }
      // Rate-limit style failures never carry the threshold code.
      if (input.type === 'STOP_FAILURE' && o.state !== s) assert.notEqual(o.state.reason, 'THRESHOLD')
      if (o.ignored) assert.equal(o.state, s, `ignored input changed state: ${where}`)
      s = deepFreeze(o.state)
    }
  }
  console.log(`property: rotations ${rotationsSeen}, clears ${clears}`)
  assert.ok(rotationsSeen > 100 && clears > 100, `walks reach deep states (rotations ${rotationsSeen}, clears ${clears})`)
})

test('isSafe truth table (ADR-004 + A1): only no background task and no running agent is safe', () => {
  for (const [bg, ag, want] of [[0, 0, true], [1, 0, false], [0, 1, false], [2, 3, false]] as const) assert.equal(isSafe({ backgroundTasks: bg, runningAgents: ag }), want)
})

test('HANDOVER_GENERATING + a fatal handover outcome -> NEEDS_REVIEW(code) at once, no retry, nothing to clear', () => {
  const o = run(st('HANDOVER_GENERATING', { rotation: rot({ step: 'HANDOVER_REQUESTED' }) }), { type: 'STOP', backgroundTasks: 0, runningAgents: 0, handover: { ok: false, errors: ['the branch changed'], fatal: 'REPO_MISMATCH' } })
  assert.deepEqual([o.state.status, o.state.reason, o.state.rotation], ['NEEDS_REVIEW', 'REPO_MISMATCH', null])
  assert.deepEqual(types(o.effects), ['LOG_EVENT', 'TOAST'])
})

test('review fix 3: /relay pause in VALIDATING (nothing cleared yet) pauses at once; ROTATING still defers', () => {
  const v = run(st('VALIDATING', { rotation: rot({ step: 'HANDOVER_REQUESTED' }) }), { type: 'PAUSE' })
  assert.deepEqual([v.state.status, v.state.reason, v.state.rotation], ['PAUSED', 'USER_PAUSE', null])
  const r = run(st('ROTATING', { rotation: rot({ step: 'HANDOVER_PERSISTED' }) }), { type: 'PAUSE' })
  assert.deepEqual([r.state.status, r.state.pauseRequested], ['ROTATING', true])
})

test('ST-4.4: HOLD_PROMPT appends in HANDOVER_GENERATING..RESTORING only, up to the cap; the event detail carries the text for redaction', () => {
  for (const status of ['HANDOVER_GENERATING', 'VALIDATING', 'ROTATING', 'RESTORING'] as const) {
    const o = run(st(status), { type: 'HOLD_PROMPT', text: 'hi' })
    assert.deepEqual([o.state.status, o.state.heldPrompts], [status, ['hi']], status)
    const e = o.effects.find(x => x.type === 'LOG_EVENT')
    assert.ok(e?.type === 'LOG_EVENT' && e.detail === 'held prompt: hi' && e.from === status && e.to === status)
  }
  for (const status of ['MONITORING', 'ROTATION_REQUESTED', 'QUIESCING', 'CONTINUING', 'PAUSED'] as const) assert.ok(run(st(status), { type: 'HOLD_PROMPT', text: 'hi' }).ignored, status)
  const full = st('ROTATING', { heldPrompts: Array.from({ length: HELD_MAX }, (_, i) => `m${i}`) })
  assert.ok(run(full, { type: 'HOLD_PROMPT', text: 'one more' }).ignored, 'cap')
})

// ---- ST-4.5: rearm, loop guard, rotation cap, consecutive failures (one test per rule) ----

test('ST-4.5 rearm: CONTINUING + reading < T-10 -> MONITORING, armedFired=false, sessionSequence+1; the next crossing rotates again', () => {
  const s = st('CONTINUING', { rotation: rot({ step: 'CONTINUED' }), armedFired: true, sessionSequence: 2, rotationCount: 1 })
  const o = run(s, measure(39))
  assert.deepEqual([o.state.status, o.state.armedFired, o.state.sessionSequence], ['MONITORING', false, 3])
  assert.equal(run(o.state, measure(50), ctx({ newRotationId: 'r2' })).state.rotation?.rotationId, 'r2')
})

test('ST-4.5 loop guard: CONTINUING never rotates on a reading; >= T-10 -> FAILED(POSSIBLE_LOOP)', () => {
  for (let p = 40; p <= 100; p += 5) {
    const o = run(st('CONTINUING', { rotation: rot({ step: 'CONTINUED' }) }), measure(p))
    assert.deepEqual([o.state.status, o.state.reason], ['FAILED', 'POSSIBLE_LOOP'], `p=${p}`)
  }
})

test('ST-4.5 max rotations: rotationCount >= maxRotationsPerTask -> PAUSED(MAX_ROTATIONS), threshold, manual and compaction alike', () => {
  const max = DEFAULT_CONFIG.maxRotationsPerTask
  for (const i of [measure(60), { type: 'ROTATE_CMD' }, { type: 'COMPACTED' }] as const) {
    const o = run(st('MONITORING', { rotationCount: max }), i)
    assert.deepEqual([o.state.status, o.state.reason, o.state.rotation], ['PAUSED', 'MAX_ROTATIONS', null], i.type)
    assert.ok(o.effects.some(e => e.type === 'TOAST'))
  }
  assert.equal(run(st('MONITORING', { rotationCount: max - 1 }), measure(60)).state.status, 'ROTATION_REQUESTED')
})

test('ST-4.5 consecutive failures: each failed rotation counts, a continued one resets; at the max the next request -> FAILED', () => {
  const max = DEFAULT_CONFIG.maxConsecutiveFailures
  const failed = run(st('HANDOVER_GENERATING', { rotation: rot({ step: 'HANDOVER_REQUESTED', retries: 2 }) }), stop(0, 0, { ok: false, errors: ['x'] }))
  assert.equal(failed.state.consecutiveFailures, 1)
  const unsafe = run(st('QUIESCING', { rotation: rot({ quiesceCount: 3 }), consecutiveFailures: 1 }), stop(1, 0))
  assert.deepEqual([unsafe.state.reason, unsafe.state.consecutiveFailures], ['UNSAFE_BOUNDARY', 2])
  const o = run(st('MONITORING', { consecutiveFailures: max, lastErrorCode: 'UNSAFE_BOUNDARY' }), measure(60))
  assert.deepEqual([o.state.status, o.state.reason, o.state.rotation], ['FAILED', 'UNSAFE_BOUNDARY', null])
  const ok = run(st('RESTORING', { rotation: rot({ step: 'RESTORED' }), consecutiveFailures: 1 }), { type: 'CONTEXT_READY' })
  assert.equal(ok.state.consecutiveFailures, 0)
  assert.equal(run(st('MONITORING'), { type: 'PAUSE' }).state.consecutiveFailures, 0, 'a user pause is not a failure')
})
