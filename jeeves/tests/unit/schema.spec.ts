import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyMigrations, check, migrate, MIGRATIONS, parseJson, type Kind } from '../../src/core/schema.ts'
import { SCHEMA_VERSION } from '../../src/core/types.ts'
import { prng, VALID, validState } from './helpers.ts'

const KINDS = Object.keys(VALID) as Kind[]
const errorsOf = (kind: Kind, v: unknown) => { const r = check(kind, v); return r.ok ? [] : r.errors }

test('every contract has a guard and its valid sample passes', () => {
  for (const k of KINDS) assert.deepEqual(errorsOf(k, VALID[k]), [], k)
})

test('missing, extra and wrong-type fields give path-qualified errors, per guard', () => {
  for (const k of KINDS) {
    const sample = VALID[k] as Record<string, unknown>
    for (const field of Object.keys(sample)) {
      const { [field]: _, ...missing } = sample
      assert.ok(errorsOf(k, missing).includes(`${field}: missing`), `${k}.${field} missing`)
      const wrong = { ...sample, [field]: typeof sample[field] === 'boolean' ? 42 : true }
      assert.ok(errorsOf(k, wrong).some(e => e.startsWith(`${field}: expected`)), `${k}.${field} wrong type`)
    }
    assert.deepEqual(errorsOf(k, { ...sample, surprise: 1 }), ['surprise: unknown field'], `${k} extra`)
    assert.deepEqual(errorsOf(k, []), ['(root): expected object, got array'], k)
  }
})

test('specific value errors', () => {
  const cases: [Kind, unknown, string][] = [
    ['state', validState({ thresholdPercent: 19 }), 'thresholdPercent: 19 is outside 20..90'],
    ['state', validState({ status: 'NAPPING' as never }), 'status: expected one of'],
    ['state', validState({ status: 'ROTATING' }), 'rotation: required while status is ROTATING'],
    ['state', validState({ updatedAt: '2026-11-07 08:00' }), 'updatedAt: "2026-11-07 08:00" is not an ISO UTC timestamp'],
    ['state', validState({ taskRevision: 1.5 }), 'taskRevision: expected integer, got number'],
    ['state', validState({ lastContext: { window: 1000, at: '2026-11-07T08:00:00Z', percent: 101 } }), 'lastContext.percent: 101 is outside 0..100'],
    ['state', validState({ heldPrompts: ['ok', 3 as never] }), 'heldPrompts[1]: expected string, got number'],
    ['state', validState({ rotation: { rotationId: 'r1', trigger: 'NOPE' as never, requestedAt: '2026-11-07T08:00:00Z', sourceSessionId: null, targetSessionId: null, step: 'REQUESTED', retries: 0, quiesceCount: 0, noteAppended: false } }), 'rotation.trigger: expected one of'],
    // ST-9.1: values that reach a file path or a git argument keep their format (state.json is writable by Claude's Bash).
    ['state', validState({ taskId: '../../elsewhere' }), 'taskId: "../../elsewhere" is not a safe name'],
    ['state', validState({ projectId: 'a/b' }), 'projectId: "a/b" is not a safe name'],
    ['state', validState({ status: 'ROTATING', rotation: { rotationId: '../x', trigger: 'THRESHOLD' as never, requestedAt: '2026-11-07T08:00:00Z', sourceSessionId: null, targetSessionId: null, step: 'REQUESTED', retries: 0, quiesceCount: 0, noteAppended: false } }), 'rotation.rotationId: "../x" is not a safe name'],
    ['state', validState({ taskStartHead: '--output=/tmp/x' }), 'taskStartHead: "--output=/tmp/x" is not a commit hash'],
    ['state', validState({ lastValidatedHandover: '../../notes.md#sha256:ab' }), 'lastValidatedHandover: "../../notes.md#sha256:ab" is not a handover reference'],
    ['event', { ...VALID.event, taskId: '-rf' }, 'taskId: "-rf" is not a safe name'],
    ['config', { ...VALID.config, verificationCommands: [''] }, 'verificationCommands[0]: must not be empty'],
    ['event', { ...VALID.event, detail: 'x'.repeat(2001) }, 'detail: longer than 2000 characters'],
  ]
  for (const [k, v, want] of cases) assert.ok(errorsOf(k, v).some(e => e.startsWith(want)), `${want} — got ${JSON.stringify(errorsOf(k, v))}`)
})

test('a missing context percent is valid: unknown, never 0 (AC-06)', () => {
  assert.deepEqual(errorsOf('state', validState({ lastContext: { window: 1_000_000, at: '2026-11-07T08:00:00Z' } })), [])
})

test('v1 round-trips through JSON for every kind', () => {
  for (const k of KINDS) {
    const r = parseJson(k, JSON.stringify(VALID[k]))
    assert.ok(r.ok, k)
    assert.deepEqual(r.value, VALID[k])
  }
})

test('an unknown higher version is rejected as SCHEMA_TOO_NEW', () => {
  for (const k of KINDS) {
    const field = k === 'event' ? 'v' : 'schemaVersion'
    const r = migrate(k, { ...VALID[k], [field]: SCHEMA_VERSION + 1 })
    assert.equal(r.ok, false)
    assert.equal(!r.ok && r.code, 'SCHEMA_TOO_NEW', k)
  }
  assert.equal(MIGRATIONS.state.length + 1, SCHEMA_VERSION)
})

test('the migration pipeline applies each step in order', () => {
  const steps = [(o: Record<string, unknown>) => ({ ...o, a: 1 }), (o: Record<string, unknown>) => ({ ...o, b: (o.a as number) + 1 })]
  assert.deepEqual(applyMigrations({ schemaVersion: 1 }, 'schemaVersion', steps), { ok: true, value: { schemaVersion: 3, a: 1, b: 2 } })
  assert.deepEqual(applyMigrations({ schemaVersion: 2, a: 5 }, 'schemaVersion', steps), { ok: true, value: { schemaVersion: 3, a: 5, b: 6 } })
  assert.equal(applyMigrations({ schemaVersion: 0 }, 'schemaVersion', steps).ok, false)
  assert.equal(applyMigrations({}, 'schemaVersion', steps).ok, false)
})

test('bad JSON is an error, not a throw', () => {
  const r = parseJson('state', '{"schemaVersion":1,')
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.errors[0]! : '', /^not valid JSON/)
})

test('fuzz: random JSON and mutated samples never throw, and anything accepted re-checks', () => {
  const rnd = prng(20261107)
  const atoms = [null, true, false, 0, -1, 1.5, 1e309, '', 'x', 'MONITORING', '2026-11-07T08:00:00Z', [], {}]
  const randomJson = (depth: number): unknown => {
    if (depth > 3 || rnd.next() < 0.5) return rnd.pick(atoms)
    if (rnd.next() < 0.5) return Array.from({ length: rnd.int(4) }, () => randomJson(depth + 1))
    return Object.fromEntries(Array.from({ length: rnd.int(4) }, () => [rnd.pick(['a', 'schemaVersion', 'v', 'status']), randomJson(depth + 1)]))
  }
  let accepted = 0
  for (let i = 0; i < 3000; i++) {
    const k = rnd.pick(KINDS)
    let v: unknown = randomJson(0)
    if (rnd.next() < 0.6) {
      const sample = structuredClone(VALID[k]) as Record<string, unknown>
      const key = rnd.pick(Object.keys(sample))
      if (rnd.next() < 0.3) delete sample[key]
      else sample[key] = randomJson(1)
      v = sample
    }
    const r = migrate(k, v)
    if (r.ok) { accepted++; assert.deepEqual(check(k, structuredClone(r.value)).ok, true) }
  }
  assert.ok(accepted > 0, 'some mutations should still be valid (e.g. same-type values)')
})
