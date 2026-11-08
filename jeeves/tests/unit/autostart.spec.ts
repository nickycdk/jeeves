// ST-13.2: who is an upgrader, and which level decides auto-start (spec §5.5, §5.6).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoReason, classifyInstall, NOT_WATCHED, ordered, reasonLine, resolveAutoStart, startReasons, type AutoInputs, type StartFacts } from '../../src/core/autostart.ts'
import { reduce, windowEndText } from '../../src/core/machine.ts'
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
  assert.deepEqual(r({ window: 200_000 }), ['200K window at start']) // "above 200K": exactly 200K is not
  assert.deepEqual(r({ window: 200_001 }), [])
  assert.deepEqual(r({ window: 0 }), ['200K window at start']) // unknown: the safe direction
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
  assert.deepEqual([...NOT_WATCHED], ['-p or SDK', 'unsupported', 'assisted mode', 'this session', 'this project', 'everywhere', 'upgraded from 0.2', 'resumed conversation', 'not a git repository', '200K window at start'])
  assert.deepEqual(ordered(['200K window at start', 'this session', 'resumed conversation', 'this session']), ['this session', 'resumed conversation', '200K window at start'])
  assert.equal(reasonLine([]), null)
  assert.equal(reasonLine(['not a git repository']), 'Auto off: not a git repository')
  assert.equal(reasonLine(['200K window at start', 'not a git repository', 'assisted mode']), 'Auto off: assisted mode (+2 more)')
  for (const r of NOT_WATCHED) assert.ok(reasonLine([r, ...NOT_WATCHED])!.length <= 40, r)
})

test('model switch (AC-37): a reading with a window of 200K or less ends an auto task in MONITORING or CONTINUING, with its message', () => {
  const ctx = { now: Date.parse(AT) + 1000, config: DEFAULT_CONFIG, newRotationId: 'r_new' }
  const m = (window: number) => ({ type: 'MEASURE' as const, window, percent: 30, sessionId: 'sess-a' })
  for (const status of ['MONITORING', 'CONTINUING'] as Status[]) {
    const o = reduce(validState({ origin: 'auto', status }), m(200_000), ctx)
    assert.equal(o.state.status, 'DISABLED', status)
    assert.deepEqual(o.effects.map(e => e.type), ['LOG_EVENT', 'RELEASE_LOCK', 'TOAST'])
    assert.equal(o.effects.flatMap(e => (e.type === 'TOAST' ? [e.text] : []))[0], "Jeeves: not watching any more (this model's window is 200K); /jeeves on to watch anyway")
  }
  assert.equal(windowEndText(128_000), "Jeeves: not watching any more (this model's window is 128K); /jeeves on to watch anyway")
  // Explicit tasks keep watching with their threshold; an auto task on a large window, or mid-rotation, is left alone.
  const explicit = reduce(validState({ status: 'MONITORING' }), m(200_000), ctx)
  assert.equal(explicit.state.status, 'MONITORING')
  assert.equal(explicit.state.thresholdPercent, 50)
  assert.equal(reduce(validState({ origin: 'auto' }), m(1_000_000), ctx).state.status, 'MONITORING')
  assert.equal(reduce(validState({ origin: 'auto' }), m(0), ctx).state.status, 'MONITORING')
  assert.equal(reduce(validState({ origin: 'auto', status: 'PAUSED', reason: 'USER_PAUSE' }), m(200_000), ctx).state.status, 'PAUSED')
})
