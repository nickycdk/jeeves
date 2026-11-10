// The handover limit (maintainer decision 2026-11-10): /jeeves limit <n> per task, 30 when not set; PAUSED(MAX_ROTATIONS) at the limit.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { bottom, engineClear, generating, handover, PROMPT, relay, start, stateOf, stop, submit, taskDirs, turnEnd, until, type Kit, test } from './kit.ts'
import { memHost } from './memfs.ts'

const measure = ($: Kit, percent: number) =>
  $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)

test('/jeeves limit: 1..100 accepted and shown in status; anything else rejected with the range, nothing changed', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  expect(await relay($, 'limit 5')).toBe('No managed task. Start with /jeeves on')
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  expect(await relay($, 'status')).toContain('Rotations: 0/30  Session: 1')
  for (const bad of ['0', '101', '2.5', 'abc', '']) {
    expect(await relay($, `limit ${bad}`)).toBe(`The handover limit must be a whole number from 1 to 100 (got "${bad}"). Example: /jeeves limit 50`)
  }
  expect('maxRotations' in stateOf(h, dir)).toBe(false)
  expect(await relay($, 'limit 5', 'plugin')).toContain('Only you can')
  expect(await relay($, 'limit 5')).toBe('Handover limit set to 5 for this task (0 done so far).')
  expect(stateOf(h, dir).maxRotations).toBe(5)
  expect(await relay($, 'status')).toContain('Rotations: 0/5  Session: 1')
})

test('a task paused at its limit continues after a higher /jeeves limit and /jeeves resume', async ($, on) => {
  const g = await generating($, on)
  const { h, dir, ctl } = g
  await relay($, 'limit 1')
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  ctl.onClear = async () => { await engineClear($, h, 'sess-2') }
  await turnEnd($)
  await until(h, () => stateOf(h, dir).status === 'CONTINUING')
  await measure($, 4)
  await measure($, 52)
  const s = stateOf(h, dir)
  expect([s.status, s.reason, s.rotationCount, s.rotation]).toEqual(['PAUSED', 'MAX_ROTATIONS', 1, null])
  expect(h.toasts.at(-1)).toBe('Paused: this task reached 1 rotations, the limit. /jeeves limit <n> raises it, then /jeeves resume; /jeeves off ends it.')
  expect(await relay($, 'status')).toContain('Rotations: 1/1  Session: 2')
  expect(await relay($, 'limit 1')).toBe('Handover limit set to 1 for this task (1 done so far). That is not above the handovers done, so the task stays paused.')
  expect(await relay($, 'limit 3')).toBe('Handover limit set to 3 for this task (1 done so far). /jeeves resume continues it.')
  expect(stateOf(h, dir).status).toBe('PAUSED')
  await relay($, 'resume')
  expect(stateOf(h, dir).status).toBe('MONITORING')
  await measure($, 52)
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['ROTATION_REQUESTED', 'THRESHOLD'])
})
