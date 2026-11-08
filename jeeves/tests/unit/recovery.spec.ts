// ST-6.1: the recovery classifier, one test per row of 02 §8 (REPO_MISMATCH: ST-6.5), the rebuild of a lost state.json,
// and the reducer's RECOVER.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reduce, type Ctx } from '../../src/core/machine.ts'
import { classify, rebuildState, type Found, type LockView } from '../../src/core/recovery.ts'
import { check } from '../../src/core/schema.ts'
import { DEFAULT_CONFIG, ROTATION_STATES, type State, type Status } from '../../src/core/types.ts'
import { AT, validState } from './helpers.ts'

const ME = 'sess-new', OLD = 'sess-old'
const STALE: LockView = { kind: 'held', owner: OLD, stale: true }
const LIVE: LockView = { kind: 'held', owner: OLD, stale: false }
const rot = { rotationId: 'r1', trigger: 'THRESHOLD' as const, requestedAt: AT, sourceSessionId: null, targetSessionId: null, step: 'HANDOVER_PERSISTED' as const, retries: 0, quiesceCount: 0, noteAppended: false }
const st = (status: Status, over: Partial<State> = {}) => validState({ status, activeSessionId: OLD, rotation: ROTATION_STATES.includes(status) ? rot : null, lastValidatedHandover: 'history/handover-001.md#sha256:' + 'a'.repeat(64), ...over })
const found = (s: State, lock: LockView = STALE, leftover: string | null = null): Found => ({ kind: 'state', state: s, lock, leftover })
const never = () => false
const c = (f: Found, endedHere: (s: string) => boolean = never) => classify(f, ME, endedHere)

test('02 §8 row 1: state.json unreadable -> rebuild; too new -> left alone', () => {
  assert.deepEqual(c({ kind: 'corrupt', tooNew: false }), { kind: 'rebuild' })
  assert.deepEqual(c({ kind: 'corrupt', tooNew: true }), { kind: 'too-new' })
})

test('02 §8 row 3: HANDOVER_GENERATING (and the steps before it) with a stale lock -> recover from the last handover, with the gap note', () => {
  for (const s of ['MONITORING', 'ROTATION_REQUESTED', 'QUIESCING', 'HANDOVER_GENERATING'] as const) assert.deepEqual(c(found(st(s))), { kind: 'recover', gap: true, adopt: null }, s)
  // VALIDATING: the interrupted rotation's handover was saved but not recorded: adopt it, nothing was lost after it.
  assert.deepEqual(c(found(st('VALIDATING'), STALE, `history/handover-002.md#sha256:${'b'.repeat(64)}`)), { kind: 'recover', gap: false, adopt: `history/handover-002.md#sha256:${'b'.repeat(64)}` })
  assert.deepEqual(c(found(st('VALIDATING'))), { kind: 'recover', gap: true, adopt: null })
})

test('02 §8 rows 4-5: ROTATING and RESTORING continue from handover N; CONTINUING too, noting work after it may exist', () => {
  assert.deepEqual(c(found(st('ROTATING'))), { kind: 'recover', gap: false, adopt: null })
  assert.deepEqual(c(found(st('RESTORING'))), { kind: 'recover', gap: false, adopt: null })
  assert.deepEqual(c(found(st('CONTINUING'))), { kind: 'recover', gap: true, adopt: null })
  // A free lock (the owner exited without a crash) recovers the same way.
  assert.deepEqual(c(found(st('ROTATING'), { kind: 'free' })), { kind: 'recover', gap: false, adopt: null })
})

test('02 §8 row 6 / AC 3: a live lock owned by another session -> LOCK_HELD, never recovered', () => {
  for (const s of ['MONITORING', 'ROTATING', 'CONTINUING'] as const) assert.deepEqual(c(found(st(s), LIVE)), { kind: 'lock-held', owner: OLD })
  // ...unless this process ended that session itself (its /clear never brought the fresh session).
  assert.equal(c(found(st('ROTATING'), LIVE), s => s === OLD).kind, 'recover')
})

test('this session\'s own task, paused or ended tasks are not recovered', () => {
  assert.deepEqual(c(found(st('CONTINUING', { activeSessionId: ME }), { kind: 'held', owner: ME, stale: false })), { kind: 'mine' })
  assert.deepEqual(c(found(st('PAUSED', { reason: 'USER_PAUSE' }))), { kind: 'none', why: 'paused' })
  for (const s of ['DISABLED', 'COMPLETED', 'FAILED'] as const) assert.deepEqual(c(found(st(s))), { kind: 'none', why: 'ended' })
  assert.deepEqual(c(found(st('NEEDS_REVIEW', { reason: 'HANDOVER_INVALID' }))), { kind: 'none', why: 'review' })
  assert.equal(c(found(st('NEEDS_REVIEW', { reason: 'STATE_CORRUPT' }))).kind, 'recover')
  assert.equal(c(found(st('BLOCKED', { reason: 'DISK' }))).kind, 'recover')
})

test('AC 4: a rebuilt state is valid, NEEDS_REVIEW(STATE_CORRUPT), and keeps what the files prove', () => {
  const events = [
    JSON.stringify({ v: 1, at: AT, taskId: 't_1', detail: 'threshold 60%', sessionId: 'a' }),
    'not json',
    JSON.stringify({ v: 1, at: AT, taskId: 't_1', detail: 'x', sessionId: 'sess-last' }),
  ]
  const s = rebuildState({ taskId: 't_1', projectId: 'p', events, revisions: 3, handover: { ref: 'history/handover-002.md#sha256:' + 'c'.repeat(64), count: 2 }, sessions: 2, startHead: 'a1b2c3d4e5f6', at: AT })
  assert.ok(check('state', s).ok, JSON.stringify(check('state', s)))
  assert.deepEqual([s.status, s.reason, s.taskRevision, s.rotationCount, s.sessionSequence, s.thresholdPercent, s.activeSessionId],
    ['NEEDS_REVIEW', 'STATE_CORRUPT', 3, 2, 3, 60, 'sess-last'])
  assert.equal(s.lastValidatedHandover, 'history/handover-002.md#sha256:' + 'c'.repeat(64))
  assert.equal(s.taskStartHead, 'a1b2c3d4e5f6')
  const empty = rebuildState({ taskId: 't_2', projectId: 'p', events: [], revisions: 0, handover: null, sessions: 0, startHead: null, at: AT })
  assert.deepEqual([empty.status, empty.lastValidatedHandover, empty.activeSessionId, empty.thresholdPercent], ['NEEDS_REVIEW', null, null, DEFAULT_CONFIG.thresholdPercent])
})

test('RECOVER: a new rotation in RESTORING, owned here, held prompts kept; refused for tasks with nothing to recover', () => {
  const ctx: Ctx = { now: Date.parse(AT) + 1000, config: DEFAULT_CONFIG, newRotationId: 'r_rec' }
  const o = reduce(st('HANDOVER_GENERATING', { heldPrompts: ['hi'], pauseRequested: true }), { type: 'RECOVER', sessionId: ME }, ctx)
  assert.ok(check('state', o.state).ok)
  assert.deepEqual([o.state.status, o.state.reason, o.state.activeSessionId, o.state.rotation?.rotationId, o.state.rotation?.sourceSessionId, o.state.heldPrompts, o.state.pauseRequested],
    ['RESTORING', 'STALE_LOCK', ME, 'r_rec', OLD, ['hi'], false])
  assert.deepEqual(o.effects.map(e => e.type), ['LOG_EVENT', 'INJECT_CONTEXT'])
  const adopted = reduce(st('VALIDATING'), { type: 'RECOVER', sessionId: ME, adopt: 'history/handover-002.md#sha256:' + 'b'.repeat(64) }, ctx)
  assert.equal(adopted.state.lastValidatedHandover, 'history/handover-002.md#sha256:' + 'b'.repeat(64))
  for (const s of ['PAUSED', 'COMPLETED', 'DISABLED'] as const) assert.ok(reduce(st(s), { type: 'RECOVER', sessionId: ME }, ctx).ignored, s)
  assert.equal(reduce(o.state, { type: 'CONTEXT_READY' }, ctx).state.status, 'CONTINUING')
})

test('ST-6.5: DISK_FAILED blocks once, keeping the rotation out; REPO_MISMATCH blocks for this session; resume leaves BLOCKED(DISK) only', () => {
  const ctx: Ctx = { now: Date.parse(AT) + 1000, config: DEFAULT_CONFIG, newRotationId: 'r_x' }
  const d = reduce(st('ROTATION_REQUESTED'), { type: 'DISK_FAILED', path: '/s/t', error: 'EIO', to: 'QUIESCING' }, ctx)
  assert.deepEqual([d.state.status, d.state.reason, d.state.rotation], ['BLOCKED', 'DISK', null])
  assert.ok(d.effects.some(e => e.type === 'TOAST' && e.text.includes('/s/t') && e.text.includes('/jeeves resume')))
  assert.ok(reduce(d.state, { type: 'DISK_FAILED', path: '/s/t', error: 'EIO', to: 'MONITORING' }, ctx).ignored, 'one block, one toast')
  assert.equal(reduce(d.state, { type: 'RESUME', lockOk: true, sessionId: ME }, ctx).state.status, 'MONITORING')
  const m = reduce(st('ROTATING'), { type: 'REPO_MISMATCH', sessionId: ME, detail: 'x' }, ctx)
  assert.deepEqual([m.state.status, m.state.reason, m.state.activeSessionId], ['BLOCKED', 'REPO_MISMATCH', ME])
  assert.ok(reduce(m.state, { type: 'RESUME', lockOk: true, sessionId: ME }, ctx).ignored, 'a mismatch needs recover, not resume')
  // The blocking session may run /jeeves recover again (re-check or --relink).
  assert.equal(classify(found(m.state, { kind: 'held', owner: ME, stale: false }), ME, never).kind, 'recover')
  assert.equal(reduce(m.state, { type: 'RELINKED', projectId: 'p2' }, ctx).state.projectId, 'p2')
})

test('code review 2-4: a mismatch blocks from assisted NEEDS_REVIEW too and keeps the adopted handover; a disk error never overwrites a stop', () => {
  const ctx: Ctx = { now: Date.parse(AT) + 1000, config: DEFAULT_CONFIG, newRotationId: 'r_x' }
  const assisted = reduce(st('NEEDS_REVIEW', { reason: 'ROTATE_UNAVAILABLE', mode: 'assisted' }), { type: 'REPO_MISMATCH', sessionId: ME, detail: 'x' }, ctx)
  assert.deepEqual([assisted.state.status, assisted.state.reason], ['BLOCKED', 'REPO_MISMATCH'])
  assert.equal(classify(found(assisted.state, { kind: 'held', owner: ME, stale: false }), ME, never).kind, 'recover')
  const newer = 'history/handover-002.md#sha256:' + 'd'.repeat(64)
  assert.equal(reduce(st('VALIDATING'), { type: 'REPO_MISMATCH', sessionId: ME, detail: 'x', adopt: newer }, ctx).state.lastValidatedHandover, newer)
  assert.ok(reduce(st('PAUSED', { reason: 'USER_CLEAR' }), { type: 'DISK_FAILED', path: '/s', error: 'EIO', to: 'RESTORING' }, ctx).ignored)
  assert.ok(reduce(st('CONTINUING'), { type: 'DISK_FAILED', path: '/s', error: 'EIO', to: 'FAILED' }, ctx).ignored)
  assert.ok(reduce(st('NEEDS_REVIEW', { reason: 'DOD_UNMET' }), { type: 'DISK_FAILED', path: '/s', error: 'EIO', to: 'COMPLETED' }, ctx).ignored)
  assert.equal(reduce(st('CONTINUING'), { type: 'DISK_FAILED', path: '/s', error: 'EIO', to: 'MONITORING' }, ctx).state.status, 'BLOCKED')
})
