// ST-13.1 (AC-45): v0.3's schema bumps, read by v0.3 and by the frozen v0.2 reader (tests/fixtures/v0.2-core).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { check, defaultsVersion, parseJson } from '../../src/core/schema.ts'
import { newTaskState } from '../../src/core/task.ts'
import type { ProjectDefaults } from '../../src/core/types.ts'
import * as v02 from '../fixtures/v0.2-core/schema.ts'
import { validState } from './helpers.ts'

const V02_DIR = join(import.meta.dirname, '../fixtures/v0.2-core')
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n'
/** What the defaults writer puts on disk (src/adapter/defaults.ts). */
const written = (d: ProjectDefaults) => json({ ...d, schemaVersion: defaultsVersion(d) })
const v02State = () => { const { origin: _, ...s } = validState(); return { ...s, schemaVersion: 1 } }

test('a v0.2 state.json reads as an explicit task at version 2', () => {
  const r = parseJson('state', json(v02State()))
  assert.ok(r.ok, JSON.stringify(r))
  assert.equal(r.value.origin, 'explicit')
  assert.equal(r.value.schemaVersion, 2)
  // ST-13.6: a v0.2 task keeps accepting six-heading handovers.
  assert.equal(r.value.preUpgrade, true)
  assert.equal(check('state', r.value).ok, true)
})

test('new tasks are version 2, explicit unless told otherwise', () => {
  const base = { taskId: 't_20261108_aaaaaa', projectId: 'p1', thresholdPercent: 40, taskStartHead: null, at: '2026-11-08T08:00:00.000Z' }
  assert.equal(newTaskState(base).origin, 'explicit')
  assert.equal(newTaskState({ ...base, origin: 'auto' }).origin, 'auto')
  assert.equal(newTaskState(base).schemaVersion, 2)
  assert.equal(newTaskState(base).preUpgrade, undefined)
  assert.equal(parseJson('state', json(validState({ origin: 'manual' as never }))).ok, false)
})

test('a v0.2 project config.json keeps its defaults', () => {
  const r = parseJson('defaults', json({ schemaVersion: 1, thresholdPercent: 65, verificationCommands: ['npm test'] }))
  assert.ok(r.ok)
  assert.equal(r.value.thresholdPercent, 65)
  assert.deepEqual(r.value.verificationCommands, ['npm test'])
  assert.equal(r.value.autoStart, undefined)
})

test('config.json is written as v2 only while autoStart is set', () => {
  assert.equal(defaultsVersion({ schemaVersion: 2, verificationCommands: [] }), 1)
  assert.equal(defaultsVersion({ schemaVersion: 2, thresholdPercent: 60, verificationCommands: ['make test'] }), 1)
  assert.equal(defaultsVersion({ schemaVersion: 1, verificationCommands: [], autoStart: 'off' }), 2)
  assert.equal(parseJson('defaults', json({ schemaVersion: 2, verificationCommands: [], autoStart: 'maybe' })).ok, false)
})

test('auto.json: valid files read, anything else is refused (ignored by the caller)', () => {
  for (const ok of [{ schemaVersion: 1, default: 'on' }, { schemaVersion: 1, default: 'off', reason: 'upgraded from 0.2' }]) assert.ok(parseJson('auto', json(ok)).ok)
  for (const bad of ['{', '[]', json({ schemaVersion: 1, default: 'yes' }), json({ schemaVersion: 1 }), json({ schemaVersion: 1, default: 'on', extra: 1 }), json({ schemaVersion: 1, default: 'on', reason: 'x'.repeat(201) })]) {
    assert.equal(parseJson('auto', bad).ok, false, bad.slice(0, 60))
  }
  const r = parseJson('auto', json({ schemaVersion: 2, default: 'on' }))
  assert.equal(r.ok ? null : r.code, 'SCHEMA_TOO_NEW')
})

// AC-45: a v0.2 build meeting v0.3 files.
test('v0.2 refuses a v0.3 task as SCHEMA_TOO_NEW and only reads text (nothing to rewrite)', () => {
  const text = json(newTaskState({ taskId: 't_20261108_aaaaaa', projectId: 'p1', thresholdPercent: 40, taskStartHead: null, at: '2026-11-08T08:00:00.000Z', origin: 'auto' }))
  const before = text
  const r = v02.parseJson('state', text)
  assert.equal(r.ok ? null : r.code, 'SCHEMA_TOO_NEW')
  assert.equal(text, before)
})

test('v0.2 ignores a config.json with autoStart, and keeps reading every other v0.3 config.json in full', () => {
  const withAuto = v02.parseJson('defaults', written({ schemaVersion: 2, thresholdPercent: 60, verificationCommands: ['npm test'], autoStart: 'off' }))
  assert.equal(withAuto.ok ? null : withAuto.code, 'SCHEMA_TOO_NEW')
  // A threshold or check changed in v0.3 without autoStart: v0.2 still reads both after a downgrade.
  const plain = v02.parseJson('defaults', written({ schemaVersion: 2, thresholdPercent: 60, verificationCommands: ['npm test'] }))
  assert.ok(plain.ok, JSON.stringify(plain))
  assert.equal(plain.value.thresholdPercent, 60)
  assert.deepEqual(plain.value.verificationCommands, ['npm test'])
  // `defaults clear` (or auto cleared) goes back to the v0.2 shape.
  assert.ok(v02.parseJson('defaults', written({ schemaVersion: 2, verificationCommands: [] })).ok)
})

test('v0.2 never reads auto.json: its reader has no such file or kind', () => {
  const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : []))
  for (const f of files(V02_DIR)) assert.equal(/auto\.json|\bauto:/.test(readFileSync(f, 'utf8')), false, f)
})
