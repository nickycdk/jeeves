// ST-2.3: the context reading is the main conversation's usage().context; unknown stays unknown; rate limits never count.
import type { SessionMeasureInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { bottom, PROMPT, relay, start, stateOf, submit, taskDirs, type Kit } from './kit.ts'
import { memHost } from './memfs.ts'

const ctx = (percent?: number): SessionMeasureInput['context'] => ({ window: 1_000_000, ...(percent === undefined ? {} : { percent, tokens: percent * 10_000 }) })
const measure = ($: Kit, percent: number | undefined, changed: SessionMeasureInput['changed'] = ['context']) =>
  $.session.measure({ context: ctx(percent), rateLimits: [{ kind: 'five_hour', percentUsed: 97 }], changed })

async function onTask($: Kit, on: Parameters<typeof memHost>[0]) {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  return { h, dir: taskDirs(h)[0]! }
}

test('a context measure stores the reading; status shows usage().context.percent', async ($, on) => {
  const { h, dir } = await onTask($, on)
  await measure($, 18)
  expect(stateOf(h, dir).lastContext).toMatchObject({ percent: 18, tokens: 180_000, window: 1_000_000 })
  h.usage = ctx(18)
  expect(await relay($, 'status')).toContain('Context: 18%  Threshold: 50%')
  // Status reads the live figure in the owning session, so it is never older than the last turn.
  h.usage = ctx(23)
  expect(await relay($, 'status')).toContain('Context: 23%')
  // The engine rounds percent to a whole number; with tokens known the stored reading is exact.
  await $.session.measure({ context: { window: 1_000_000, percent: 6, tokens: 63_161 }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
  expect(stateOf(h, dir).lastContext).toMatchObject({ percent: 6.32, tokens: 63_161 })
})

test('AC-06: an undefined percent is "unknown", never 0%, and never triggers', async ($, on) => {
  const { h, dir } = await onTask($, on)
  await measure($, 30)
  await measure($, undefined)
  const s = stateOf(h, dir)
  expect(s.lastContext.percent).toBe(undefined)
  expect(s.status).toBe('MONITORING')
  const status = await relay($, 'status')
  expect(status).toContain('Context: unknown')
  expect(status).not.toContain('0%  Threshold')
})

test('AC-04: a rate-limit-only measure changes nothing, even with a high context figure attached', async ($, on) => {
  const { h, dir } = await onTask($, on)
  await measure($, 20)
  const before = h.files.get(`${dir}/state.json`)
  await measure($, 95, ['rateLimits'])
  await measure($, 95, ['cost'])
  expect(h.files.get(`${dir}/state.json`)).toBe(before)
  expect(stateOf(h, dir).lastContext.percent).toBe(20)
})

test('AC-03: measures from 0 to 95% without /jeeves on leave no files and no effects', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  const argvBefore = h.argv.length
  for (let p = 0; p <= 95; p += 5) await measure($, p)
  expect(taskDirs(h)).toEqual([])
  expect(h.toasts).toEqual([])
  expect(h.argv.slice(argvBefore)).toEqual([])
})
