// ST-13.2: who is an upgrader, and which level decides auto-start (spec §5.5, §5.6).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoReason, classifyInstall, NOT_WATCHED, ordered, reasonLine, resolveAutoStart, startReasons, type AutoInputs, type StartFacts } from '../../src/core/autostart.ts'
import { GRACE_TURNS, nearText, reduce, windowEndText, type Ctx, type Input } from '../../src/core/machine.ts'
import { check } from '../../src/core/schema.ts'
import { DEFAULT_CONFIG, type Status } from '../../src/core/types.ts'
import { AT, validState } from './helpers.ts'

test('an upgrader is a store with firstActivationShown or a state folder with a project; anything else is fresh', () => {
  assert.equal(classifyInstall(false, false), 'fresh')
  assert.equal(classifyInstall(true, false), 'upgrader')
  assert.equal(classifyInstall(false, true), 'upgrader')
  assert.equal(classifyInstall(true, true), 'upgrader')
})

test('precedence: session, project, /config row (on/off), auto.json, then the install default; the source is named', () => {
  const base: AutoInputs = { sessionOff: false, row: 'default', install: 'fresh' }
  const r = (o: Partial<AutoInputs>) => resolveAutoStart({ ...base, ...o })
  assert.deepEqual(r({}), { on: true, source: 'fresh install' })
  assert.deepEqual(r({ install: 'upgrader' }), { on: false, source: 'upgraded from 0.2' })
  assert.deepEqual(r({ file: 'off', fileUpgraded: true, install: 'upgrader' }), { on: false, source: 'upgraded from 0.2' }, 'the upgrade check wrote auto.json')
  assert.deepEqual(r({ file: 'off', install: 'upgrader' }), { on: false, source: 'auto.json' }, '/jeeves auto off wrote it')
  assert.deepEqual(r({ install: null }), { on: false, source: 'upgraded from 0.2' }) // check not run yet: the safe direction
  assert.deepEqual(r({ install: 'upgrader', file: 'on' }), { on: true, source: 'auto.json' })
  assert.deepEqual(r({ file: 'off' }), { on: false, source: 'auto.json' })
  assert.deepEqual(r({ file: 'off', row: 'on' }), { on: true, source: '/config' })
  assert.deepEqual(r({ file: 'on', row: 'off' }), { on: false, source: '/config' })
  assert.deepEqual(r({ row: 'off', project: 'on' }), { on: true, source: 'this project' })
  assert.deepEqual(r({ row: 'on', project: 'off' }), { on: false, source: 'this project' })
  for (const o of [{}, { project: 'on' as const }, { row: 'on' as const }, { file: 'on' as const }]) assert.deepEqual(r({ ...o, sessionOff: true }), { on: false, source: 'this session' })
})

// ---- ST-13.3 (spec §5.1, AC-36): eligibility at session start and the reason order ----

test('eligibility table: each fact alone gives its own reason; a fresh, interactive, full, git, 1M session gives none', () => {
  const ok: StartFacts = { interactive: true, mode: 'full', git: true, window: 1_000_000, turns: 0 }
  const r = (o: Partial<StartFacts>) => startReasons({ ...ok, ...o })
  assert.deepEqual(r({}), [])
  assert.deepEqual(r({ interactive: false }), ['-p or SDK'])
  assert.deepEqual(r({ mode: 'unsupported' }), ['unsupported'])
  assert.deepEqual(r({ mode: 'assisted' }), ['assisted mode'])
  assert.deepEqual(r({ turns: 1 }), ['resumed conversation'])
  assert.deepEqual(r({ git: false }), ['not a git repository'])
  assert.deepEqual(r({ window: 199_999 }), ['window below 200K at start']) // ADR-009 A4: 200K or more
  assert.deepEqual(r({ window: 200_000 }), [])
  assert.deepEqual(r({ window: 1_000_000 }), [])
  assert.deepEqual(r({ window: 0 }), ['window below 200K at start']) // unknown: the safe direction
})

test('auto-start off is a reason placed by its source: session, project, everywhere (/config, auto.json), upgrade default', () => {
  assert.equal(autoReason({ on: true, source: 'fresh install' }), null)
  assert.equal(autoReason({ on: true, source: 'this project' }), null)
  assert.equal(autoReason({ on: false, source: 'this session' }), 'this session')
  assert.equal(autoReason({ on: false, source: 'this project' }), 'this project')
  assert.equal(autoReason({ on: false, source: '/config' }), 'everywhere')
  assert.equal(autoReason({ on: false, source: 'auto.json' }), 'everywhere')
  assert.equal(autoReason({ on: false, source: 'upgraded from 0.2' }), 'upgraded from 0.2')
})

test('reason order (spec §5.1): unfixable first, then the fixable ones easiest first; (+N more); every line fits 40 columns', () => {
  assert.deepEqual([...NOT_WATCHED], ['-p or SDK', 'unsupported', 'assisted mode', 'this session', 'this project', 'everywhere', 'upgraded from 0.2', 'resumed conversation', 'not a git repository', 'window below 200K at start'])
  assert.deepEqual(ordered(['window below 200K at start', 'this session', 'resumed conversation', 'this session']), ['this session', 'resumed conversation', 'window below 200K at start'])
  assert.equal(reasonLine([]), null)
  assert.equal(reasonLine(['not a git repository']), 'Auto off: not a git repository')
  assert.equal(reasonLine(['window below 200K at start', 'not a git repository', 'assisted mode']), 'Auto off: assisted mode (+2 more)')
  for (const r of NOT_WATCHED) assert.ok(reasonLine([r, ...NOT_WATCHED])!.length <= 40, r)
})

test('model switch (AC-37, ADR-009 A4): a reading with a window below 200K ends an auto task in MONITORING or CONTINUING, with its message', () => {
  const ctx = { now: Date.parse(AT) + 1000, config: DEFAULT_CONFIG, newRotationId: 'r_new' }
  const m = (window: number) => ({ type: 'MEASURE' as const, window, percent: 30, sessionId: 'sess-a' })
  for (const status of ['MONITORING', 'CONTINUING'] as Status[]) {
    const o = reduce(validState({ origin: 'auto', status }), m(128_000), ctx)
    assert.equal(o.state.status, 'DISABLED', status)
    assert.deepEqual(o.effects.map(e => e.type), ['LOG_EVENT', 'RELEASE_LOCK', 'TOAST'])
    assert.equal(o.effects.flatMap(e => (e.type === 'TOAST' ? [e.text] : []))[0], "Jeeves: not watching any more (this model's window is 128K); /jeeves on to watch anyway")
    // P-2 (D-53): a 1M auto task moved to 200K keeps watching, with its threshold.
    const kept = reduce(validState({ origin: 'auto', status, thresholdPercent: 40 }), { ...m(200_000), percent: 10 }, ctx)
    assert.notEqual(kept.state.status, 'DISABLED', status)
    assert.equal(kept.state.thresholdPercent, 40)
  }
  assert.equal(windowEndText(128_000), "Jeeves: not watching any more (this model's window is 128K); /jeeves on to watch anyway")
  // Explicit tasks keep watching with their threshold; an auto task on a large window, or mid-rotation, is left alone.
  const explicit = reduce(validState({ status: 'MONITORING' }), m(128_000), ctx)
  assert.equal(explicit.state.status, 'MONITORING')
  assert.equal(explicit.state.thresholdPercent, 50)
  assert.equal(reduce(validState({ origin: 'auto' }), m(1_000_000), ctx).state.status, 'MONITORING')
  assert.equal(reduce(validState({ origin: 'auto' }), m(0), ctx).state.status, 'MONITORING')
  assert.equal(reduce(validState({ origin: 'auto', status: 'PAUSED', reason: 'USER_PAUSE' }), m(128_000), ctx).state.status, 'PAUSED')
})

// ---- ST-13.4 (spec §5.2, AC-37): near-threshold rule and grace period ----
const C: Ctx = { now: Date.parse(AT) + 1000, config: DEFAULT_CONFIG, newRotationId: 'r_new' }
const at = (percent: number): Input => ({ type: 'MEASURE', window: 1_000_000, percent, sessionId: 'sess-a' })
const turn: Input = { type: 'TURN_COMPLETE', reason: 'answer' }
const run = (s: ReturnType<typeof validState>, ...inputs: Input[]) => inputs.reduce((st, i) => {
  const o = reduce(st, i, C)
  assert.ok(check('state', o.state).ok, JSON.stringify(check('state', o.state)))
  return o.state
}, s)
const fresh = (over = {}) => validState({ origin: 'auto', thresholdPercent: 40, ...over })

test('near-threshold: the first known reading of a new auto task within 10 points ends it, with its message', () => {
  const o = reduce(fresh(), at(34), C)
  assert.equal(o.state.status, 'DISABLED')
  assert.deepEqual(o.effects.map(e => e.type), ['LOG_EVENT', 'RELEASE_LOCK', 'TOAST'])
  assert.equal(o.effects.flatMap(e => (e.type === 'TOAST' ? [e.text] : []))[0], 'Jeeves: not watching this session, context already at 34%; /jeeves on to watch anyway')
  assert.equal(nearText(33.6), 'Jeeves: not watching this session, context already at 34%; /jeeves on to watch anyway')
  assert.equal(run(fresh(), at(29.9)).status, 'MONITORING')
  assert.equal(run(fresh(), at(55)).status, 'DISABLED') // past the threshold counts too: no rotation on the first reading
  // Only the first known reading, only a new auto task: a later reading, an explicit task or a rotated one go on.
  assert.equal(run(fresh(), at(20), at(35)).status, 'MONITORING')
  assert.equal(run(fresh({ lastContext: { window: 1_000_000, at: AT } }), at(35)).status, 'DISABLED') // unknown first, then known
  assert.equal(run(validState({ thresholdPercent: 40 }), at(35)).status, 'MONITORING')
  assert.equal(run(fresh({ rotationCount: 1 }), at(35)).status, 'MONITORING')
  // Under the test threshold the margin is the test loop margin (a fresh live session already starts near 6%).
  assert.equal(reduce(fresh(), at(6), { ...C, thresholdOverride: 8 }).state.status, 'MONITORING')
  assert.equal(reduce(fresh(), at(7.6), { ...C, thresholdOverride: 8 }).state.status, 'DISABLED')
})

test('grace: a new auto task does not rotate in its first 3 main turns below threshold + 10; the first reading at or past the threshold after them does', () => {
  let s = run(fresh(), at(20))
  for (let i = 1; i <= GRACE_TURNS; i++) {
    s = run(s, at(45))
    assert.equal(s.status, 'MONITORING', `turn ${i}`)
    s = run(s, turn)
    assert.equal(s.graceTurns, i)
  }
  s = run(s, turn) // past the grace period the count stops
  assert.equal(s.graceTurns, GRACE_TURNS)
  assert.equal(run(s, at(45)).status, 'ROTATION_REQUESTED')
  // Grace holds the handover back at most 10 points: at threshold + 10 it is requested in turn 1 (a one-turn task, AC-41).
  assert.equal(run(fresh(), at(20), at(49.9)).status, 'MONITORING')
  assert.equal(run(fresh(), at(20), at(50)).status, 'ROTATION_REQUESTED')
  assert.equal(reduce(run(fresh(), at(2)), at(8.4), { ...C, thresholdOverride: 8 }).state.status, 'MONITORING')
  assert.equal(reduce(run(fresh(), at(2)), at(8.5), { ...C, thresholdOverride: 8 }).state.status, 'ROTATION_REQUESTED')
  // Explicit tasks have no grace period, and count nothing.
  const ex = run(validState({ thresholdPercent: 40 }), at(20), turn)
  assert.equal(ex.graceTurns, undefined)
  assert.equal(run(ex, at(45)).status, 'ROTATION_REQUESTED')
  // After the first rotation an auto task rotates as any other.
  assert.equal(run(fresh({ rotationCount: 1, lastContext: { window: 1_000_000, at: AT, percent: 20 } }), at(45)).status, 'ROTATION_REQUESTED')
})

test('ST-14.1: the hint only for reasons 3b and 4-6; any explicit off, -p, unsupported or assisted keeps it silent', async () => {
  const { hintable } = await import('../../src/core/autostart.ts')
  assert.equal(hintable([]), false)
  for (const r of ['upgraded from 0.2', 'resumed conversation', 'not a git repository', 'window below 200K at start'] as const) assert.equal(hintable([r]), true, r)
  assert.equal(hintable(['resumed conversation', 'not a git repository', 'window below 200K at start']), true)
  for (const r of ['-p or SDK', 'unsupported', 'assisted mode', 'this session', 'this project', 'everywhere'] as const) assert.equal(hintable([r, 'not a git repository']), false, r)
})
