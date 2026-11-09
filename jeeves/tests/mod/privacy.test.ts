// ST-13.9 AC 3 (NFR-10): after an auto task with a rotation, prompt text sits only in task-rev-* and state.json's
// heldPrompts; no assistant text outside the handover. The E-layer grep over a live state folder runs in ST-15.2.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { engineClear, generating, handover, stateOf, stop, submit, turnEnd, until, test } from './kit.ts'

const STATE = '/home/t/.local/state/jeeves'
const TASK = 'Build the parser.' // the start of the kit's PROMPT, the task's first typed prompt
const HELD = 'held-marker: also rename the module'
const LATER = 'later-marker: and add a test for it'
const ASSISTANT = 'step done' // what Claude said in the turns before the handover

test('NFR-10: prompt text only in task-rev-* and heldPrompts after an auto task with a rotation', { options: { autoStart: 'on' } }, async ($, on) => {
  const g = await generating($, on, { auto: true, readings: [10, 52] })
  const { h, dir, ctl, prompts } = g
  expect(stateOf(h, dir).origin).toBe('auto')
  await submit($, HELD)
  expect(stateOf(h, dir).heldPrompts).toEqual([HELD])

  const files = () => [...h.files].filter(([f]) => f.startsWith(STATE))
  /** Files holding `text`, with heldPrompts taken out of state.json first. */
  const holding = (text: string) => files().filter(([f, t]) => {
    if (!f.endsWith('/state.json')) return t.includes(text)
    const { heldPrompts: _, ...rest } = JSON.parse(t)
    return JSON.stringify(rest).includes(text)
  }).map(([f]) => f.slice(dir.length + 1))

  // Mid-rotation: the held prompt is in state.json's heldPrompts and nowhere else.
  expect(holding(HELD)).toEqual([])
  expect(files().filter(([, t]) => t.includes(HELD)).map(([f]) => f)).toEqual([`${dir}/state.json`])

  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  ctl.onClear = async () => { await engineClear($, h, 'sess-2') }
  await turnEnd($)
  await until(h, () => stateOf(h, dir).status === 'CONTINUING')
  await until(h, () => prompts.some(p => p.text.startsWith('Jeeves: you are session 2')))
  await $.session.measure({ context: { window: 1_000_000, percent: 4 }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  await submit($, LATER)
  await h.clock.settle()

  expect(stateOf(h, dir).rotationCount).toBe(1)
  expect(holding(TASK)).toEqual(['task-rev-001.md'])
  expect(files().filter(([, t]) => t.includes(HELD))).toEqual([])
  expect(files().filter(([, t]) => t.includes(LATER))).toEqual([])
  expect(files().filter(([, t]) => t.includes(ASSISTANT))).toEqual([])
})
