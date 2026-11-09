// ST-7.1: one transcript line per state change (none per tool call), and this plugin's own status entry: context and
// threshold while watching, a word label otherwise, at most 40 columns.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { bottom, engineClear, fakeGit, generating, handover, PROMPT, relay, start, stateOf, stop, submit, taskDirs, turnEnd, TURN, until, type Kit, test } from './kit.ts'
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
    'Jeeves: handover validated (goal: Finish operator precedence in the calculator.), starting fresh. Previous conversation: claude --resume sess-test',
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

// ST-14.2 (spec §6.5): `/jeeves` alone, one snapshot per state; each fits 8 lines of 40 ASCII columns.
const ROW = { options: { autoStart: 'default' } }
const shaped = (text: string) => {
  expect(text.split('\n').length).toBeLessThanOrEqual(8)
  for (const l of text.split('\n')) expect(l.length).toBeLessThanOrEqual(40)
  expect(/^[\x20-\x7e\n]*$/.test(text)).toBe(true)
  return text
}

test('ST-14.2: /jeeves alone per state: not watched, watching, warning, paused', ROW, async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  expect(shaped(await relay($, ''))).toBe([
    'Jeeves  mode: full',
    'Auto off: not a git repository (+1 more)',
    'No managed task. Start with /jeeves on',
    'Path: /home/t/.local/state/jeeves',
    'Try: /jeeves on | help',
  ].join('\n'))
  await relay($, 'on')
  await submit($, PROMPT)
  h.usage = { window: 1_000_000, percent: 20 }
  await measure($, 20)
  const id = stateOf(h, taskDirs(h)[0]!).taskId
  const status = async () => shaped(await relay($, '')).replace(id, 'ID').replace(/^Path: .*$/m, 'Path: P')
  expect(await status()).toBe([
    'Jeeves  mode: full',
    'Task: ID (explicit)',
    'State: MONITORING',
    'Context: 20%  Threshold: 50% (~500K)',
    'Rotations: 0  Session: 1',
    'Last: no handover yet',
    'Path: P',
    'Try: /jeeves help',
  ].join('\n'))
  h.usage = { window: 1_000_000, percent: 46 }
  await measure($, 46)
  expect(await status()).toBe([
    'Jeeves  mode: full',
    'Task: ID (explicit)',
    'State: MONITORING',
    'Context: 46%  Threshold: 50% (~500K)',
    'Rotations: 0  Session: 1',
    'Last: no handover yet',
    'Path: P',
    'Try: /jeeves later | off | help',
  ].join('\n'))
  await relay($, 'pause')
  expect(await status()).toBe([
    'Jeeves  mode: full',
    'Task: ID (explicit)',
    'State: PAUSED (USER_PAUSE)',
    'Context: 46%  Threshold: 50% (~500K)',
    'Rotations: 0  Session: 1',
    'Paused by you. /jeeves resume',
    'Last: no handover yet',
    'Try: /jeeves resume | off | help',
  ].join('\n'))
})

test('ST-14.2: /jeeves alone in an eligible session before its first prompt: watched, no task yet', ROW, async ($, on) => {
  const h = memHost(on)
  bottom(on)
  fakeGit(h)
  h.usage = { window: 1_000_000 }
  await start($)
  expect(shaped(await relay($, ''))).toBe([
    'Jeeves  mode: full',
    'Auto-start: on (fresh install)',
    'No managed task. Start with /jeeves on',
    'Path: /home/t/.local/state/jeeves',
    'Try: /jeeves help',
  ].join('\n'))
})

test('ST-14.2: /jeeves alone after a failed handover offers retry, and not once the retries are used up', ROW, async ($, on) => {
  const g = await generating($, on)
  for (let i = 0; i < 3; i++) await stop($, 'no handover here')
  await turnEnd($)
  expect(shaped(await relay($, ''))).toBe([
    TURN ? 'Jeeves  mode: full (turn)' : 'Jeeves  mode: full',
    'Task: TASK (explicit)',
    'State: NEEDS_REVIEW (HANDOVER_INVALID)',
    'Context: unknown  Threshold: 50% (~100K)',
    'Rotations: 0  Session: 1',
    'Handover invalid. Try: /jeeves retry',
    'Last: no handover yet, error HANDOVER...',
    'Try: /jeeves retry | off | help',
  ].join('\n').replace('TASK', g.taskId))
  await relay($, 'retry')
  await stop($, 'ok', { stop_hook_active: false })
  for (let i = 0; i < 3; i++) await stop($, 'no handover here')
  const used = await relay($, '')
  expect(used).toContain('Retries used up. /jeeves off ends it')
  expect(used.split('\n').at(-1)).toBe('Try: /jeeves help')
})

test('ST-14.5: an auto task\'s status entry is empty until within 15 points of the threshold (24% of 40 empty, 25% shown)', { options: { autoStart: 'on' } }, async ($, on) => {
  const h = memHost(on)
  bottom(on)
  fakeGit(h)
  h.usage = { window: 1_000_000 }
  await start($)
  await submit($, PROMPT)
  expect(stateOf(h, taskDirs(h)[0]!).origin).toBe('auto')
  for (const p of [10, 24]) await measure($, p)
  expect(h.status.filter(s => s !== undefined)).toEqual([])
  await measure($, 25)
  expect(h.status.at(-1)).toBe('Jeeves 25%/40%')
  await measure($, 12)
  expect(h.status.at(-1)).toBe(undefined)
})

test('ST-14.5: an explicit task\'s status entry shows from the start', ROW, async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  expect(h.status.at(-1)).toBe('Jeeves ?/50%')
  await submit($, PROMPT)
  await measure($, 10)
  expect(h.status.at(-1)).toBe('Jeeves 10%/50%')
})
