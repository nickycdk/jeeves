// ST-7.1: one transcript line per state change (none per tool call), and this plugin's own status entry: context and
// threshold while watching, a word label otherwise, at most 40 columns.
import type { SessionMeasureInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { bottom, engineClear, generating, handover, PROMPT, relay, start, stateOf, stop, submit, turnEnd, until, type Kit } from './kit.ts'
import { memHost } from './memfs.ts'

const measure = ($: Kit, percent: number) =>
  $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)

test('a full rotation: one line per transition, in order; status shows context/threshold, then each step, then session 2', async ($, on) => {
  const g = await generating($, on)
  const { h, dir, ctl } = g
  expect(h.notes).toEqual([
    'Jeeves: on, watching context',
    'Jeeves: handover requested (THRESHOLD)',
    'Jeeves: asking Claude for the handover',
  ])
  expect(h.status).toContain('Jeeves ?/50%')
  expect(h.status).toContain('Jeeves: handover requested')
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  ctl.onClear = async () => { await engineClear($, h, 'sess-2') }
  await turnEnd($)
  await until(h, () => stateOf(h, dir).status === 'CONTINUING')
  await measure($, 4)
  expect(h.notes.slice(3)).toEqual([
    'Jeeves: checking the handover',
    'Jeeves: handover validated (goal: Finish operator precedence in the calculator.), starting fresh',
    'Jeeves: restoring the task',
    'Jeeves: the fresh conversation continues the task',
    'Jeeves: session 2 at 4%, watching context',
  ])
  expect(h.status.at(-1)).toBe('Jeeves 4%/50%')
  for (const s of h.status) expect((s ?? '').length).toBeLessThanOrEqual(40)
  expect(h.notes.every(n => /^[\x20-\x7e]+$/.test(n))).toBe(true)
})

test('tool calls and readings below the threshold add no transcript line; pause and off say so once', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }) as never)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  for (const p of [10, 20, 30]) await measure($, p)
  expect(h.notes).toEqual(['Jeeves: on, watching context'])
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(h.notes).toEqual(['Jeeves: on, watching context'])
  expect(h.status.at(-1)).toBe('Jeeves 30%/50%')
  await relay($, 'pause')
  expect(h.notes.at(-1)).toBe('Jeeves: paused (USER_PAUSE): Paused by you. /jeeves resume')
  expect(h.status.at(-1)).toBe('Jeeves: paused (USER_PAUSE)')
  await relay($, 'off')
  expect(h.notes.at(-1)).toBe('Jeeves: off (task files kept)')
  expect(h.status.at(-1)).toBe(undefined)
})
