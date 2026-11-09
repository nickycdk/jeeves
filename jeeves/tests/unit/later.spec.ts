// ST-13.5 (spec §5.5, AC-39): /jeeves later's cap arithmetic and its reducer rule.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capText, laterCap, reduce, type Ctx, type Input } from '../../src/core/machine.ts'
import { check } from '../../src/core/schema.ts'
import { DEFAULT_CONFIG, type State } from '../../src/core/types.ts'
import { AT, validState } from './helpers.ts'

const C: Ctx = { now: Date.parse(AT) + 1000, config: DEFAULT_CONFIG, newRotationId: 'r_new' }
const run = (s: State, i: Input, c = C) => {
  const o = reduce(s, i, c)
  assert.ok(check('state', o.state).ok, JSON.stringify(check('state', o.state)))
  return o
}

test('cap: 90%, or 5 points below the auto-compaction point when lower; compaction off (or window unknown) is 90%', () => {
  assert.equal(laterCap(1_000_000, null), 90)
  assert.equal(laterCap(1_000_000, 967_000), 90) // 96.7% - 5 = 91 -> 90
  assert.equal(laterCap(1_000_000, 900_000), 85)
  assert.equal(laterCap(200_000, 167_000), 78) // floor(83.5) - 5
  assert.equal(laterCap(0, 167_000), 90)
})

test('later: +10, the warning comes again; to the cap at most, then refused; only while watching', () => {
  const s = validState({ thresholdPercent: 40, warnedSessionId: 'sess-a' })
  const o = run(s, { type: 'LATER', cap: 90 })
  assert.equal(o.state.thresholdPercent, 50)
  assert.equal(o.state.warnedSessionId, null)
  assert.equal(o.state.laterCapped, false)
  const near = run(validState({ thresholdPercent: 80 }), { type: 'LATER', cap: 85 })
  assert.equal(near.state.thresholdPercent, 85)
  assert.equal(near.state.laterCapped, true)
  assert.ok(run(near.state, { type: 'LATER', cap: 85 }).ignored)
  assert.ok(run(validState({ thresholdPercent: 80 }), { type: 'LATER', cap: 78 }).ignored) // cap below the threshold: never lowered
  for (const status of ['ROTATION_REQUESTED', 'PAUSED'] as const) {
    const r = run(validState({ status, rotation: status === 'ROTATION_REQUESTED' ? { rotationId: 'r1', trigger: 'THRESHOLD', requestedAt: AT, sourceSessionId: null, targetSessionId: null, step: 'REQUESTED', retries: 0, quiesceCount: 0, noteAppended: false } : null, reason: status === 'PAUSED' ? 'USER_PAUSE' : 'THRESHOLD' }), { type: 'LATER', cap: 90 })
    assert.ok(r.ignored, status)
  }
})

test('at the cap the warning says it cannot be postponed further; /jeeves threshold clears that', () => {
  const capped = validState({ thresholdPercent: 85, laterCapped: true })
  const w = run(capped, { type: 'MEASURE', window: 1_000_000, percent: 80, sessionId: 'sess-a' })
  assert.deepEqual(w.effects.flatMap(e => (e.type === 'TOAST' ? [e.text] : [])), ["Jeeves hands over at 85% (now 80%); can't postpone further. /jeeves off to keep this conversation."])
  assert.equal(capText(85, 80.4), "Jeeves hands over at 85% (now 80%); can't postpone further. /jeeves off to keep this conversation.")
  assert.equal(run(capped, { type: 'SET_THRESHOLD', percent: 60 }).state.laterCapped, false)
})
