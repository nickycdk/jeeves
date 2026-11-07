// ST-2.4: threshold trigger through the hooks, concurrency, /relay threshold, and the test override.
import type { SessionMeasureInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { bottom, PROMPT, relay, start, stateOf, submit, taskDirs, type Kit } from './kit.ts'
import { memHost } from './memfs.ts'

const measure = ($: Kit, percent: number) =>
  $.session.measure({ context: { window: 1_000_000, percent, tokens: percent * 10_000 }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
const events = (h: ReturnType<typeof memHost>, dir: string) => h.files.get(`${dir}/events.jsonl`)!.trim().split('\n').map(l => JSON.parse(l))

async function onTask($: Kit, on: Parameters<typeof memHost>[0], env?: Record<string, string>) {
  const h = memHost(on, env)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  return { h, dir: taskDirs(h)[0]! }
}

test('AC-05 through the hooks: warning at 45, nothing at 49, one request at 50, nothing more at 51, 51, 70', async ($, on) => {
  const { h, dir } = await onTask($, on)
  await measure($, 45)
  expect(h.toasts).toEqual(['Context at 45%. SessionRelay will hand over at 50%.'])
  await measure($, 49)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  await measure($, 50)
  const s = stateOf(h, dir)
  expect([s.status, s.reason, s.armedFired]).toEqual(['ROTATION_REQUESTED', 'THRESHOLD', true])
  for (const p of [51, 51, 70]) await measure($, p)
  const reqs = events(h, dir).filter(e => e.code === 'THRESHOLD')
  expect(reqs.length).toBe(1)
  expect(reqs[0]).toMatchObject({ from: 'MONITORING', to: 'ROTATION_REQUESTED', pct: 50, rotationId: s.rotation.rotationId })
  expect(stateOf(h, dir).rotation.rotationId).toBe(s.rotation.rotationId)
  expect(h.toasts.length).toBe(1)
})

test('concurrent duplicate measures past the threshold give exactly one request and one rotationId', async ($, on) => {
  const { h, dir } = await onTask($, on)
  await Promise.all([52, 52, 53, 60, 52, 70, 55, 52].map(p => measure($, p)))
  const reqs = events(h, dir).filter(e => e.code === 'THRESHOLD')
  expect(reqs.length).toBe(1)
  expect(stateOf(h, dir).rotation.rotationId).toBe(reqs[0].rotationId)
})

test('/relay threshold: 20..90 accepted and used; anything else rejected with the range', async ($, on) => {
  const { h, dir } = await onTask($, on)
  for (const bad of ['19', '91', '50.5', 'abc', '']) {
    expect(await relay($, `threshold ${bad}`)).toContain('Threshold must be a whole number from 20 to 90')
  }
  expect(stateOf(h, dir).thresholdPercent).toBe(50)
  expect(await relay($, 'threshold 60')).toBe('Threshold set to 60%: SessionRelay warns at 55% and hands over at 60%.')
  await measure($, 55)
  await measure($, 59)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  await measure($, 60)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
  h.usage = { window: 1_000_000, percent: 60 }
  expect(await relay($, 'status')).toContain('Context: 60%  Threshold: 60%')
})

test('test override: only with SESSIONRELAY_TEST=1; requests at the override and status says TEST OVERRIDE', async ($, on) => {
  const { h, dir } = await onTask($, on, { HOME: '/home/t', SESSIONRELAY_TEST: '1', SESSIONRELAY_TEST_THRESHOLD_OVERRIDE: '3' })
  h.usage = { window: 1_000_000, percent: 2 }
  const status = await relay($, 'status')
  expect(status).toContain('Threshold: 3%')
  expect(status).toContain('TEST OVERRIDE (task setting 50%)')
  await measure($, 3)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
  expect(stateOf(h, dir).thresholdPercent).toBe(50)
})

test('the override is ignored without SESSIONRELAY_TEST=1', async ($, on) => {
  const { h, dir } = await onTask($, on, { HOME: '/home/t', SESSIONRELAY_TEST_THRESHOLD_OVERRIDE: '3' })
  await measure($, 10)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  expect(await relay($, 'status')).not.toContain('TEST OVERRIDE')
})

// ST-1.3 AC 1 carried over: 50 concurrent writers through the plugin's own hooks, every event line lands.
test('50 concurrent /relay threshold commands append 50 event lines, none lost, all valid JSON', async ($, on) => {
  const { h, dir } = await onTask($, on)
  const before = events(h, dir).length
  await Promise.all(Array.from({ length: 50 }, (_, i) => relay($, `threshold ${20 + i}`)))
  const after = events(h, dir)
  expect(after.length - before).toBe(50)
  expect(new Set(after.slice(before).map(e => e.detail)).size).toBe(50)
  expect(stateOf(h, dir).thresholdPercent).toBe(69)
})
