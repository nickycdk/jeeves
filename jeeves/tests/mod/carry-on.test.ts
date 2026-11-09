// ADR-007 A2 (run-2 stall, maintainer decision): in the conversation an automatic rotation opened for an auto task,
// the first Stop with no completion block gets one carry-on prompt; never a second, never after the user typed, never
// for an explicit task.
import { expect } from 'claude-code/testing'
import { CARRY_ON_PROMPT } from '../../src/core/handover/template.ts'
import { engineClear, generating, handover, stateOf, stop, submit, turnEnd, until, type Kit, test } from './kit.ts'

async function rotated($: Kit, on: Parameters<typeof generating>[1], auto: boolean) {
  const g = await generating($, on, auto ? { auto, readings: [10, 52] } : {})
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  g.ctl.onClear = async () => { await engineClear($, g.h, 'sess-2') }
  await turnEnd($)
  await until(g.h, () => g.prompts.some(p => p.text.includes('Jeeves: you are session 2')))
  expect(stateOf(g.h, g.dir).origin).toBe(auto ? 'auto' : 'explicit')
  return g
}

test('an auto task: the continuation turn that stops announcing its next step gets one carry-on, then Claude may stop', { options: { autoStart: 'on' } }, async ($, on) => {
  await rotated($, on, true)
  expect(await stop($, 'Next I will wire the CSV parser into the CLI.')).toEqual({ block: CARRY_ON_PROMPT })
  expect(await stop($, 'Next I will wire the CSV parser into the CLI.')).toEqual({})
})

test('an auto task: no carry-on once the user typed in the fresh conversation', { options: { autoStart: 'on' } }, async ($, on) => {
  await rotated($, on, true)
  await submit($, 'wait, use the other parser')
  expect(await stop($, 'Switched. Next I will run the tests.')).toEqual({})
})

test('an explicit task: no carry-on', async ($, on) => {
  await rotated($, on, false)
  expect(await stop($, 'Next I will wire the CSV parser into the CLI.')).toEqual({})
})
