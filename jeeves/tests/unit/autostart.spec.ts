// ST-13.2: who is an upgrader, and which level decides auto-start (spec §5.5, §5.6).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyInstall, resolveAutoStart, type AutoInputs } from '../../src/core/autostart.ts'

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
