// Plan 12: a fresh conversation that starts with little room under the threshold gets one hint per task naming a
// threshold with about 30 points of room. The "shown" flag is in the plugin store, never in state.json.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { engineClear, generating, handover, stateOf, stop, turnEnd, turnStart, until, type Kit, test } from './kit.ts'
import { memHost } from './memfs.ts'

const measure = ($: Kit, percent: number) =>
  $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
/** A reading as live delivers most of them: with a main-loop tool result (TOOL_RESULT), not session.measure. */
async function viaTool($: Kit, h: ReturnType<typeof memHost>, dir: string, percent: number) {
  h.usage = { window: 1_000_000, percent }
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await until(h, () => stateOf(h, dir).lastContext?.percent === percent)
}
const HINT = 'this conversation started at 27%, leaving 13 points before the 40% handover. /jeeves threshold 60 gives more room (/jeeves defaults threshold 60 for this project).'

/** A task just handed over at 52% (threshold 40): the fresh conversation is CONTINUING, waiting for its first reading. */
async function fresh($: Kit, on: Parameters<typeof memHost>[0], env?: Record<string, string>) {
  const g = await generating($, on, env ? { env } : {})
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  g.ctl.onClear = async () => { await engineClear($, g.h, 'sess-2') }
  await turnEnd($)
  await until(g.h, () => stateOf(g.h, g.dir).status === 'CONTINUING')
  return g
}

test('a fresh conversation at 27% under 40% gets one hint naming 60, in a toast and the transcript; once per task', async ($, on) => {
  const { h, dir, taskId, ctl } = await fresh($, on)
  h.store.set('roomHint:t_other', true)
  await viaTool($, h, dir, 27)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  expect(h.toasts.filter(t => t === HINT)).toEqual([HINT])
  expect(h.notes.at(-1)).toBe(HINT)
  expect(h.store.get(`roomHint:${taskId}`)).toBe(true)
  expect(JSON.stringify(stateOf(h, dir))).not.toContain('roomHint')

  // A second handover; its fresh conversation starts at 27% again: no second hint.
  await turnStart($, 't2')
  await measure($, 52)
  expect((await stop($, 'step done', { stop_hook_active: false })).block).toContain('JEEVES-HANDOVER')
  ctl.onClear = async () => { await engineClear($, h, 'sess-3') }
  expect(await stop($, handover(taskId, stateOf(h, dir).rotation.rotationId))).toEqual({})
  await turnEnd($, 'answer', 't2')
  await until(h, () => stateOf(h, dir).status === 'CONTINUING' && stateOf(h, dir).rotationCount === 2)
  await viaTool($, h, dir, 27)
  expect([stateOf(h, dir).status, stateOf(h, dir).rotationCount]).toEqual(['MONITORING', 2])
  expect(h.toasts.filter(t => t === HINT).length).toBe(1)
})

test('a fresh conversation at 18% under 40% has room enough: no hint', async ($, on) => {
  const { h, dir, taskId } = await fresh($, on)
  await measure($, 18)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  expect(h.toasts.some(t => t.includes('/jeeves threshold'))).toBe(false)
  expect(h.store.has(`roomHint:${taskId}`)).toBe(false)
})

test('under the test threshold override: no hint', async ($, on) => {
  const { h, dir } = await fresh($, on, { HOME: '/home/t', JEEVES_TEST: '1', JEEVES_TEST_THRESHOLD_OVERRIDE: '40' })
  await measure($, 27)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  expect(h.toasts.some(t => t.includes('/jeeves threshold'))).toBe(false)
})
