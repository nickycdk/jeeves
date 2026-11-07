// D-25: the test-only relative threshold (JEEVES_TEST_THRESHOLD_OVERRIDE=+d) through the hooks: a request at the
// session's first reading + d, a rearm in the fresh session, and the loop guard against the threshold that ended the last one.
import type { SessionMeasureInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { engineClear, generating, handover, relay, stateOf, stop, turnEnd, until, type Kit } from './kit.ts'

const ENV = { HOME: '/home/t', JEEVES_TEST: '1', JEEVES_TEST_THRESHOLD_OVERRIDE: '+0.8' }
const measure = ($: Kit, percent: number) =>
  $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)

/** A rotation requested by the relative threshold (start 6, request at 6.8), carried through /clear to CONTINUING. */
async function rotated($: Kit, on: Parameters<typeof generating>[1]) {
  const g = await generating($, on, { env: ENV, readings: [6, 6.5, 6.8] })
  const { h, dir, ctl } = g
  expect([stateOf(h, dir).rotation.thresholdAt, stateOf(h, dir).thresholdPercent]).toEqual([6.8, 50])
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  ctl.onClear = async () => { await engineClear($, h, 'sess-2') }
  await turnEnd($)
  await until(h, () => stateOf(h, dir).status === 'CONTINUING')
  return g
}

test('relative override: requests at first reading + d, rearms in the fresh session, which rotates at its own start + d', async ($, on) => {
  const { h, dir } = await rotated($, on)
  h.usage = { window: 1_000_000, percent: 6 }
  await measure($, 6.2)
  const s = stateOf(h, dir)
  expect([s.status, s.sessionSequence, s.sessionStart.pct]).toEqual(['MONITORING', 2, 6.2])
  const status = await relay($, 'status')
  expect(status).toContain('Threshold: 7%')
  expect(status).toContain('TEST OVERRIDE +0.8 (task setting 50%)')
  await measure($, 6.9)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  await measure($, 7)
  expect([stateOf(h, dir).status, stateOf(h, dir).rotation.thresholdAt]).toEqual(['ROTATION_REQUESTED', 7])
})

test('relative override: a fresh session that starts at the old threshold is refused (POSSIBLE_LOOP)', async ($, on) => {
  const { h, dir } = await rotated($, on)
  await measure($, 6.8)
  const s = stateOf(h, dir)
  expect([s.status, s.reason]).toEqual(['FAILED', 'POSSIBLE_LOOP'])
  expect(h.toasts.some(t => t.includes('already at 6.8% (threshold 6.8%)'))).toBe(true)
})

test('relative override needs JEEVES_TEST=1', async ($, on) => {
  const g = await generating($, on, { env: { HOME: '/home/t', JEEVES_TEST_THRESHOLD_OVERRIDE: '+0.8' }, readings: [52] })
  expect(stateOf(g.h, g.dir).rotation.thresholdAt).toBe(undefined)
  expect(await relay($, 'status')).not.toContain('TEST OVERRIDE')
})
