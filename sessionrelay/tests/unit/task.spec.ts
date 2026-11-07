import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reduce, type Ctx } from '../../src/core/machine.ts'
import { check } from '../../src/core/schema.ts'
import { newTaskState, revFile } from '../../src/core/task.ts'
import { DEFAULT_CONFIG } from '../../src/core/types.ts'
import { AT } from './helpers.ts'

const ctx: Ctx = { now: Date.parse(AT), config: DEFAULT_CONFIG, newRotationId: 'r1' }
const fresh = () => newTaskState({ taskId: 't_20261107_aaaaaa', projectId: 'p', thresholdPercent: 50, taskStartHead: null, at: AT })

test('a new task is a valid DISABLED state with no revision yet; ON makes it MONITORING', () => {
  assert.ok(check('state', fresh()).ok)
  const on = reduce(fresh(), { type: 'ON', mode: 'full', lockAcquired: true, sessionId: 's' }, ctx)
  assert.deepEqual([on.state.status, on.state.taskRevision, on.state.activeSessionId], ['MONITORING', 0, 's'])
  assert.equal(revFile(1), 'task-rev-001.md')
  assert.equal(revFile(12), 'task-rev-012.md')
})

test('REVISED moves the revision forward by exactly one and logs it; never on a DISABLED task', () => {
  const on = reduce(fresh(), { type: 'ON', mode: 'full', lockAcquired: true, sessionId: 's' }, ctx).state
  const r1 = reduce(on, { type: 'REVISED', revision: 1 }, ctx)
  assert.equal(r1.state.taskRevision, 1)
  assert.equal(r1.state.status, 'MONITORING')
  assert.deepEqual(r1.effects.map(e => e.type), ['LOG_EVENT'])
  assert.ok(reduce(r1.state, { type: 'REVISED', revision: 3 }, ctx).ignored)
  assert.ok(reduce(fresh(), { type: 'REVISED', revision: 1 }, ctx).ignored)
})

test('revisions: N changes give N+1 files; each parses back exactly, and the fold is the current task', async () => {
  const { renderChange, parseRevision, foldTask, taskText } = await import('../../src/core/task.ts')
  const original = 'Build it.\nWith 🚀.'
  const files = [original, renderChange(2, 'dod', 'all tests pass\n  even slow ones', AT), renderChange(3, 'check', 'npm test -- --grep "a b"', AT), renderChange(4, 'dod', 'README updated', AT)]
  const revs = files.map((f, i) => parseRevision(i + 1, f))
  assert.ok(revs.every(Boolean))
  const v = foldTask(revs.map(r => r!))
  assert.equal(v.original, original)
  assert.deepEqual(v.dod, ['all tests pass\n  even slow ones', 'README updated'])
  assert.deepEqual(v.checks, ['npm test -- --grep "a b"'])
  const text = taskText('t1', v)
  assert.ok(text.includes('Task t1, revision 4'))
  assert.ok(text.includes('task-rev-003.md  check: npm test -- --grep "a b"'))
  // A file that is not ours, or a revision number that does not match its header, is refused.
  assert.equal(parseRevision(2, 'hello'), null)
  assert.equal(parseRevision(3, files[1]!), null)
})
