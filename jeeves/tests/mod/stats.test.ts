// ST-11.4: /jeeves stats through the hooks: after a real rotation, with an unreadable task. The 50-task timing (AC-32 P) is in tests/perf/stats.test.ts.
import { expect } from 'claude-code/testing'
import { bottom, engineClear, generating, handover, relay, start, stateOf, stop, turnEnd, until, test } from './kit.ts'
import { memHost } from './memfs.ts'

test('after one rotation: project and task figures; an unreadable task is counted as such; anyone may read', async ($, on) => {
  const g = await generating($, on)
  const { h, dir, ctl } = g
  h.costUsd = 0.42
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  ctl.onClear = async () => { await engineClear($, h, 'sess-2') }
  await turnEnd($)
  await until(h, () => stateOf(h, dir).status === 'CONTINUING')
  h.files.set(dir.replace(/[^/]+$/, 't_broken/state.json'), '{ nope')
  const text = await relay($, 'stats', 'plugin')
  for (const want of ['Jeeves stats, this project:', 'Tasks: 1 (1 unreadable, not counted)', 'Rotations: 1  Sessions: 1', 'Cost: $0.42 over 1 session(s)', `Task ${g.taskId}:`]) expect(text).toContain(want)
  expect(text.toLowerCase()).not.toContain('saved')
})
