// D-25 (amended after gate run 6): the test-only relative threshold (JEEVES_TEST_THRESHOLD_OVERRIDE=+d) through the
// hooks. A session's start is its first tool reading that differs from its first one (a fresh session's first response is smaller); the request comes at start + d; the fresh session
// rearms only below the source session's last reading (the rotation freed context), else POSSIBLE_LOOP.
import type { SessionMeasureInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { engineClear, generating, handover, relay, stateOf, stop, turnEnd, until, type Kit } from './kit.ts'

const ENV = { HOME: '/home/t', JEEVES_TEST: '1', JEEVES_TEST_THRESHOLD_OVERRIDE: '+0.8' }
const measure = ($: Kit, percent: number) =>
  $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)

type G = Awaited<ReturnType<typeof generating>>
const toolReading = async ($: Kit, g: G, percent: number) => {
  g.h.usage = { window: 1_000_000, percent }
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await until(g.h, () => stateOf(g.h, g.dir).lastContext?.percent === percent)
}

/** Start 6 (the first tool reading, 4, is passed over), request at 6.8, carried through /clear to CONTINUING; the source ends at 6.8. */
async function rotated($: Kit, on: Parameters<typeof generating>[1]) {
  const g = await generating($, on, { env: ENV, readings: [4, 6, 6.5, 6.8], viaTool: true })
  const { h, dir, ctl } = g
  expect([stateOf(h, dir).sessionStart.pct, stateOf(h, dir).thresholdPercent]).toEqual([6, 50])
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  ctl.onClear = async () => { await engineClear($, h, 'sess-2') }
  await turnEnd($)
  await until(h, () => stateOf(h, dir).status === 'CONTINUING')
  expect(stateOf(h, dir).rotation.guardPct).toBe(6.8)
  return g
}

test('relative override: early readings are no start; the fresh session rearms once its reading moves and rotates at its own start + d', async ($, on) => {
  const g = await rotated($, on)
  const { h, dir } = g
  await measure($, 3.7)
  await toolReading($, g, 3.76)
  await $.tool.call({ tool: 'Bash', command: 'ls' }) // a second call of the same response: same figure
  await until(h, () => stateOf(h, dir).ledger.length > 0)
  expect([stateOf(h, dir).status, stateOf(h, dir).sessionStart.firstPct]).toEqual(['CONTINUING', 3.76])
  await toolReading($, g, 6.2)
  const s = stateOf(h, dir)
  expect([s.status, s.sessionSequence, s.sessionStart.pct]).toEqual(['MONITORING', 2, 6.2])
  h.usage = { window: 1_000_000, percent: 6 }
  const status = await relay($, 'status')
  expect(status).toContain('Threshold: 7%')
  expect(status).toContain('TEST OVERRIDE +0.8 (task setting 50%)')
  await measure($, 6.9)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  await measure($, 7)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
})

test('relative override: a fresh session that starts at the source session\'s last reading is refused (POSSIBLE_LOOP)', async ($, on) => {
  const g = await rotated($, on)
  await toolReading($, g, 3.76)
  g.h.usage = { window: 1_000_000, percent: 6.8 }
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await until(g.h, () => stateOf(g.h, g.dir).status !== 'CONTINUING')
  const s = stateOf(g.h, g.dir)
  expect([s.status, s.reason]).toEqual(['NEEDS_REVIEW', 'POSSIBLE_LOOP'])
  expect(g.h.toasts.some(t => t.includes('already at 6.8% (threshold 6.8%)'))).toBe(true)
  expect(g.clears).toEqual(['clear'])
  // ST-10.3: /jeeves retry watches again in this session, with no rotation here even past the threshold.
  expect(await relay($, 'retry')).toContain('Watching again')
  expect(stateOf(g.h, g.dir).status).toBe('MONITORING')
  for (const p of [7.5, 20, 60]) await measure($, p)
  expect([stateOf(g.h, g.dir).status, g.clears]).toEqual(['MONITORING', ['clear']])
})

test('relative override needs JEEVES_TEST=1', async ($, on) => {
  const g = await generating($, on, { env: { HOME: '/home/t', JEEVES_TEST_THRESHOLD_OVERRIDE: '+0.8' }, readings: [52] })
  expect(stateOf(g.h, g.dir).status).toBe('HANDOVER_GENERATING')
  expect(await relay($, 'status')).not.toContain('TEST OVERRIDE')
})
