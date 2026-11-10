// ST-2.4: threshold trigger through the hooks, concurrency, /jeeves threshold, and the test override.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { bottom, fakeGit, PROMPT, relay, start, stateOf, submit, taskDirs, type Kit, test } from './kit.ts'
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

test('AC-05 through the hooks: warning at 35, nothing at 39, one request at 40, nothing more at 41, 41, 70', async ($, on) => {
  const { h, dir } = await onTask($, on)
  await measure($, 35)
  expect(h.toasts).toEqual(['Context at 35%. Jeeves will hand over at 40%.'])
  await measure($, 39)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  await measure($, 40)
  const s = stateOf(h, dir)
  expect([s.status, s.reason, s.armedFired]).toEqual(['ROTATION_REQUESTED', 'THRESHOLD', true])
  for (const p of [41, 41, 70]) await measure($, p)
  const reqs = events(h, dir).filter(e => e.code === 'THRESHOLD')
  expect(reqs.length).toBe(1)
  expect(reqs[0]).toMatchObject({ from: 'MONITORING', to: 'ROTATION_REQUESTED', pct: 40, rotationId: s.rotation.rotationId })
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

test('/jeeves threshold: 20..90 accepted and used; anything else rejected with the range', async ($, on) => {
  const { h, dir } = await onTask($, on)
  for (const bad of ['19', '91', '50.5', 'abc', '']) {
    expect(await relay($, `threshold ${bad}`)).toContain('Threshold must be a whole number from 20 to 90')
  }
  expect(stateOf(h, dir).thresholdPercent).toBe(40)
  expect(await relay($, 'threshold 60')).toBe('Threshold set to 60%: Jeeves warns at 55% and hands over at 60%.')
  await measure($, 55)
  await measure($, 59)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  await measure($, 60)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
  h.usage = { window: 1_000_000, percent: 60 }
  expect(await relay($, 'status')).toContain('Context: 60%  Threshold: 60%')
})

test('test override: only with JEEVES_TEST=1; requests at the override and status says TEST OVERRIDE', async ($, on) => {
  const { h, dir } = await onTask($, on, { HOME: '/home/t', JEEVES_TEST: '1', JEEVES_TEST_THRESHOLD_OVERRIDE: '3' })
  h.usage = { window: 1_000_000, percent: 2 }
  const status = await relay($, 'status')
  expect(status).toContain('Threshold: 3%')
  expect(status).toContain('TEST OVERRIDE (task setting 40%)')
  await measure($, 3)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
  expect(stateOf(h, dir).thresholdPercent).toBe(40)
})

test('the override is ignored without JEEVES_TEST=1', async ($, on) => {
  const { h, dir } = await onTask($, on, { HOME: '/home/t', JEEVES_TEST_THRESHOLD_OVERRIDE: '3' })
  await measure($, 10)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  expect(await relay($, 'status')).not.toContain('TEST OVERRIDE')
})

// ST-1.3 AC 1 carried over: 50 concurrent writers through the plugin's own hooks, every event line lands.
test('50 concurrent /jeeves threshold commands append 50 event lines, none lost, all valid JSON', async ($, on) => {
  const { h, dir } = await onTask($, on)
  const before = events(h, dir).length
  await Promise.all(Array.from({ length: 50 }, (_, i) => relay($, `threshold ${20 + i}`)))
  const after = events(h, dir)
  expect(after.length - before).toBe(50)
  expect(new Set(after.slice(before).map(e => e.detail)).size).toBe(50)
  expect(stateOf(h, dir).thresholdPercent).toBe(69)
})

test('ST-10.1: a new task takes 40% on a 1M window, as on any other; /jeeves threshold still wins; status shows tokens', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  h.usage = { window: 1_000_000 }
  await relay($, 'on')
  const [dir] = taskDirs(h)
  expect(stateOf(h, dir!).thresholdPercent).toBe(40)
  expect(await relay($, 'status')).toContain('Threshold: 40% (~400K)')
  await relay($, 'threshold 60')
  expect(stateOf(h, dir!).thresholdPercent).toBe(60)
  // A later model switch does not change the chosen threshold.
  h.usage = { window: 200_000 }
  await measure($, 10)
  expect(stateOf(h, dir!).thresholdPercent).toBe(60)
})

for (const window of [200_000, 0]) {
  test(`ST-10.1: window ${window} -> 40%`, async ($, on) => {
    const h = memHost(on)
    bottom(on)
    await start($)
    h.usage = { window }
    await relay($, 'on')
    expect(stateOf(h, taskDirs(h)[0]!).thresholdPercent).toBe(40)
  })
}

// ST-15.1 (AC-41's simulated 200K run): a 1M session behaves as a 200K one, only under JEEVES_TEST=1.
async function eligible1M($: Kit, on: Parameters<typeof memHost>[0], env: Record<string, string>) {
  const h = memHost(on, env)
  fakeGit(h)
  h.usage = { window: 1_000_000 }
  const got = bottom(on)
  await start($)
  return { h, got }
}
const SIM = { HOME: '/home/t', JEEVES_TEST: '1', JEEVES_TEST_WINDOW_OVERRIDE: '200000' }

test('window override 200000 on a 1M session: auto-watched since ADR-009 A4, /jeeves on still makes it explicit; 40% rule, ~80K threshold, readings re-based, TEST OVERRIDE (AC 1)', { options: { autoStart: 'on' } }, async ($, on) => {
  const { h } = await eligible1M($, on, SIM)
  const before = await relay($, 'status')
  expect(before).toContain('Auto-start: on')
  expect(before).toContain('TEST OVERRIDE window 200K')
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  expect([stateOf(h, dir).origin, stateOf(h, dir).thresholdPercent]).toEqual(['explicit', 40])
  await measure($, 7) // 70K tokens of a real 1M window: 35% of 200K, the warning
  expect(h.toasts.at(-1)).toBe('Context at 35%. Jeeves will hand over at 40%.')
  expect(stateOf(h, dir).lastContext).toMatchObject({ percent: 35, window: 200_000, tokens: 70_000 })
  expect(await relay($, 'status')).toContain('Threshold: 40% (~80K)')
  await measure($, 8)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
  expect(await relay($, 'status --diagnose')).toContain('window 200000')
})

test('the window override is ignored without JEEVES_TEST=1: the 1M session is auto-watched at 40% (AC 2)', { options: { autoStart: 'on' } }, async ($, on) => {
  const { h } = await eligible1M($, on, { HOME: '/home/t', JEEVES_TEST_WINDOW_OVERRIDE: '200000' })
  expect(await relay($, 'status')).not.toContain('TEST OVERRIDE')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  expect([stateOf(h, dir).origin, stateOf(h, dir).thresholdPercent]).toEqual(['auto', 40])
  await measure($, 10)
  expect(stateOf(h, dir).lastContext).toMatchObject({ percent: 10, window: 1_000_000 })
})
