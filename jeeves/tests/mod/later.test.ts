// ST-13.5 (spec §5.5, AC-39): /jeeves later through the hooks: +10 and a new warning, the cap from auto-compaction,
// the cap message, refused during a rotation, explicit and auto tasks, and only when the person typed it.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { bottom, generating, PROMPT, relay, start, stateOf, submit, taskDirs, type Kit, test } from './kit.ts'
import { memHost, type MemHost } from './memfs.ts'

const CAP = "Jeeves hands over at 85% (now 80%); can't postpone further. /jeeves off to keep this conversation."
const measure = ($: Kit, h: MemHost, percent: number) => {
  h.usage = { window: 1_000_000, percent }
  return $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
}
/** A task on a 1M window (threshold 40%), first prompt captured; `origin` as the test needs (an auto one past its grace period). */
async function task($: Kit, on: Parameters<typeof memHost>[0], origin: 'explicit' | 'auto' = 'explicit') {
  const h = memHost(on)
  h.usage = { window: 1_000_000 }
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  h.files.set(`${dir}/state.json`, JSON.stringify({ ...stateOf(h, dir), origin, ...(origin === 'auto' ? { graceTurns: 3 } : {}) }, null, 2) + '\n')
  return { h, dir }
}

for (const origin of ['explicit', 'auto'] as const) {
  test(`${origin} task: later moves the threshold up 10 and warns again 5 points before (AC 1, 5)`, async ($, on) => {
    const { h, dir } = await task($, on, origin)
    await measure($, h, 20)
    await measure($, h, 36)
    expect(h.toasts.filter(t => t.startsWith('Context at 36%')).length).toBe(1)
    expect(await relay($, 'later')).toBe('Postponed: Jeeves now hands over at 50% and warns at 45%. /jeeves later again postpones further.')
    expect(stateOf(h, dir).thresholdPercent).toBe(50)
    await measure($, h, 41)
    expect(stateOf(h, dir).status).toBe('MONITORING')
    await measure($, h, 46)
    expect(h.toasts).toContain('Context at 46%. Jeeves will hand over at 50%.')
    await measure($, h, 50)
    expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
  })
}

test('the cap comes from auto-compaction (5 points below), and the warning then says so (AC 2, 3)', async ($, on) => {
  const { h, dir } = await task($, on)
  h.autoCompact = 900_000 // 90% -> cap 85
  await relay($, 'threshold 80')
  expect(await relay($, 'later')).toBe("Postponed: Jeeves now hands over at 85% and warns at 80%. That is the cap: it can't be postponed again.")
  await measure($, h, 80)
  expect(h.toasts).toContain(CAP)
  expect(await relay($, 'later')).toBe(CAP)
  expect(stateOf(h, dir).thresholdPercent).toBe(85)
})

test('auto-compaction off: the cap is 90% (AC 2)', async ($, on) => {
  const { h, dir } = await task($, on)
  await relay($, 'threshold 85')
  await relay($, 'later')
  expect(stateOf(h, dir).thresholdPercent).toBe(90)
  h.usage = { window: 1_000_000, percent: 70 }
  expect(await relay($, 'later')).toBe("Jeeves hands over at 90% (now 70%); can't postpone further. /jeeves off to keep this conversation.")
})

test('during a rotation later is refused and names /jeeves pause; the rotation goes on (AC 4)', async ($, on) => {
  const { h, dir } = await generating($, on)
  expect(await relay($, 'later')).toBe('Nothing to postpone: the task is HANDOVER_GENERATING. A handover under way goes on; /jeeves pause stops handovers until /jeeves resume.')
  expect(stateOf(h, dir).status).toBe('HANDOVER_GENERATING')
})

test('later typed by anyone but the person: refused, threshold unchanged (AC 6)', async ($, on) => {
  const { h, dir } = await task($, on)
  expect(await relay($, 'later', 'plugin')).toBe('Only you can change a Jeeves task: type the /jeeves command yourself.')
  expect(stateOf(h, dir).thresholdPercent).toBe(40)
})

test('no task: later says so', async ($, on) => {
  memHost(on)
  await start($)
  expect(await relay($, 'later')).toBe('No managed task. Start with /jeeves on')
})
