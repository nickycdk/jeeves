// ST-2.4 / AC-05: the threshold trigger, the warning and the test override, as the reducer applies them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isThreshold, reduce, type Ctx, type Effect, type Input } from '../../src/core/machine.ts'
import { DEFAULT_CONFIG, type State } from '../../src/core/types.ts'
import { AT, validState } from './helpers.ts'

const ctx = (over: Partial<Ctx> = {}): Ctx => ({ now: Date.parse(AT), config: DEFAULT_CONFIG, newRotationId: 'r1', ...over })
const m = (percent: number | undefined, sessionId = 'sess-a'): Input => ({ type: 'MEASURE', window: 1_000_000, sessionId, ...(percent === undefined ? {} : { percent }) })

/** Feed readings in order; collect every effect. */
function walk(percents: (number | undefined)[], start: State = validState(), c = ctx()) {
  let s = start
  const effects: Effect[] = []
  for (const p of percents) {
    const o = reduce(s, m(p), c)
    s = o.state
    effects.push(...o.effects)
  }
  return { s, effects, requests: effects.filter(e => e.type === 'LOG_EVENT' && e.code === 'THRESHOLD').length, toasts: effects.filter(e => e.type === 'TOAST') }
}

test('AC-05: 49 -> nothing; 50 -> exactly one ROTATION_REQUESTED; 51, 51, 70 -> nothing more', () => {
  const a = walk([49])
  assert.deepEqual([a.s.status, a.requests], ['MONITORING', 0])
  const b = walk([49, 50, 51, 51, 70])
  assert.deepEqual([b.s.status, b.requests], ['ROTATION_REQUESTED', 1])
  assert.equal(b.s.rotation?.rotationId, 'r1')
})

test('a jump from 40 straight to 70 gives one request; unknown readings in between give none', () => {
  const j = walk([40, undefined, 70, undefined, 71])
  assert.deepEqual([j.s.status, j.requests], ['ROTATION_REQUESTED', 1])
  assert.equal(walk([undefined, undefined]).requests, 0)
})

test('warning once per session at T-5 (45..49 for 50), never at or above T', () => {
  const w = walk([44, 45, 46, 49])
  assert.equal(w.toasts.length, 1)
  assert.match(w.toasts[0]!.type === 'TOAST' ? w.toasts[0]!.text : '', /Context at 45%\. Jeeves will hand over at 50%\./)
})

test('the threshold set on the task is used: 60 -> warn at 55, request at 60', () => {
  const s = validState({ thresholdPercent: 60 })
  assert.equal(walk([54, 55, 59], s).requests, 0)
  assert.equal(walk([55, 59], s).toasts.length, 1)
  assert.equal(walk([59, 60], s).requests, 1)
})

test('test override: used in place of the task threshold and never written to state', () => {
  const o = walk([1, 2, 3, 4], validState(), ctx({ thresholdOverride: 3 }))
  assert.equal(o.requests, 1)
  assert.equal(o.s.thresholdPercent, 50)
})

test('SET_THRESHOLD: a whole number 20..90 is stored and logged; anything else, or a DISABLED task, is ignored', () => {
  const set = reduce(validState(), { type: 'SET_THRESHOLD', percent: 60 }, ctx())
  assert.deepEqual([set.state.thresholdPercent, set.state.status], [60, 'MONITORING'])
  assert.deepEqual(set.effects.map(e => e.type), ['LOG_EVENT'])
  for (const bad of [19, 91, 50.5, NaN]) assert.ok(reduce(validState(), { type: 'SET_THRESHOLD', percent: bad }, ctx()).ignored, String(bad))
  assert.ok(reduce(validState({ status: 'DISABLED' }), { type: 'SET_THRESHOLD', percent: 60 }, ctx()).ignored)
  assert.deepEqual([20, 90, 21].map(isThreshold), [true, true, true])
})

test('AC-14: pause at 48% -> no request at 55%; resume -> request at the next measure', () => {
  let s = walk([48]).s
  s = reduce(s, { type: 'PAUSE' }, ctx()).state
  const paused = walk([55, 60], s)
  assert.deepEqual([paused.s.status, paused.requests], ['PAUSED', 0])
  s = reduce(paused.s, { type: 'RESUME', lockOk: true, sessionId: 'sess-a' }, ctx()).state
  assert.equal(s.status, 'MONITORING')
  const resumed = walk([55], s)
  assert.deepEqual([resumed.s.status, resumed.requests], ['ROTATION_REQUESTED', 1])
})
