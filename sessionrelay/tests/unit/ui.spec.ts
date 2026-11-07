import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chooseCommandName, pickTask } from '../../src/adapter/commands.ts'
import { HELP, statusText, WIDTH, type StatusView } from '../../src/adapter/ui.ts'
import { probe } from '../../src/core/probe.ts'
import { validState } from './helpers.ts'

const all = { 'command.run': true, 'prompt.submit': true, 'session.usage': true, 'process.run': true }
const full = probe({ version: '2.1.319', primitives: all, stopHookRegistered: true })
const root = '/Users/someone-with-a-long-name/Library/Application Support/SessionRelay'
const view = (over: Partial<StatusView> = {}): StatusView => ({ probe: full, stateRoot: root, stateRootError: null, task: null, taskError: null, ...over })
const shape = (text: string) => {
  const lines = text.split('\n')
  assert.ok(lines.length <= 8, `more than 8 lines:\n${text}`)
  for (const l of lines) assert.ok(l.length <= WIDTH, `wider than ${WIDTH}: "${l}"`)
  assert.ok(/^[\x20-\x7e\n]*$/.test(text), `non-ASCII in:\n${text}`)
}

test('no task: says so and how to start', () => {
  const t = statusText(view())
  shape(t)
  assert.equal(t.split('\n')[0], 'SessionRelay  mode: full')
  assert.ok(t.includes('No managed task. Start with /relay on'))
  assert.ok(t.split('\n').at(-1)!.startsWith('Path: ...'))
})

test('a task: mode, task, state, context or unknown, threshold, rotations, last result, path', () => {
  const dir = `${root}/projects/9f2c00aa11bb22cc/tasks/t_20261107_k3m9qa`
  const state = validState({ status: 'PAUSED', reason: 'RATE_LIMIT', lastErrorCode: 'RATE_LIMIT', rotationCount: 2, sessionSequence: 3, lastValidatedHandover: 'history/handover-002.md#sha256:ab', lastContext: { window: 1_000_000, at: '2026-11-07T08:00:00Z', percent: 18 } })
  const t = statusText(view({ task: { state, dir } }))
  shape(t)
  for (const want of ['Task: t_20261107_k3m9qa', 'State: PAUSED (RATE_LIMIT)', 'Context: 18%  Threshold: 50%', 'Rotations: 2  Session: 3', 'Last: handover-002.md, error RATE_LIMIT', 'Path: ...']) assert.ok(t.includes(want), `missing "${want}" in\n${t}`)
  const unknown = statusText(view({ task: { state: validState({ lastContext: { window: 1, at: '2026-11-07T08:00:00Z' } }), dir } }))
  assert.ok(unknown.includes('Context: unknown'), 'unknown, never 0%')
  assert.ok(!unknown.includes('0%  '))
})

test('unsupported and assisted modes and a broken state folder still fit', () => {
  const uns = statusText(view({ probe: probe({ version: '2.1.200', primitives: all, stopHookRegistered: true }) }))
  shape(uns)
  assert.ok(uns.includes('mode: unsupported') && uns.includes('Needs Claude Code 2.1.319+') && uns.includes('This is 2.1.200'))
  shape(statusText(view({ probe: probe({ version: '2.1.319', primitives: { ...all, 'process.run': false }, stopHookRegistered: true }) })))
  const broken = statusText(view({ stateRoot: null, stateRootError: 'BAD_STATE_ROOT: HOME is not set; set stateDir in /config' }))
  shape(broken)
  assert.ok(broken.includes('State folder: error'))
  shape(statusText(view({ taskError: 't1: schemaVersion: version 9 is newer than this SessionRelay supports (1); update' })))
  shape(HELP)
})

test('command name: relay unless someone else has it', () => {
  assert.equal(chooseCommandName([]), 'relay')
  assert.equal(chooseCommandName([{ name: 'relay', plugin: 'sessionrelay' }]), 'relay', 'our own registration from before a reload')
  assert.equal(chooseCommandName([{ name: 'relay', plugin: 'other' }]), 'sessionrelay')
  assert.equal(chooseCommandName([{ name: 'relay' }]), 'sessionrelay', 'a user command')
})

test('pickTask prefers this session, then the latest non-disabled task', () => {
  const a = { state: validState({ taskId: 'a', activeSessionId: 'other', updatedAt: '2026-11-07T09:00:00Z' }) }
  const b = { state: validState({ taskId: 'b', activeSessionId: 'me', updatedAt: '2026-11-07T08:00:00Z' }) }
  const c = { state: validState({ taskId: 'c', status: 'DISABLED', updatedAt: '2026-11-07T10:00:00Z' }) }
  assert.equal(pickTask([a, b, c], 'me')?.state.taskId, 'b')
  assert.equal(pickTask([a, c], 'me')?.state.taskId, 'a')
  assert.equal(pickTask([c], 'me'), null)
})
