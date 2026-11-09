// ST-4.1 / AC-10: the rotation executor. After the handover turn ends, /clear runs exactly once per rotation, never
// without a verified handover, and nothing but /clear (no --resume, --continue or fork). D-23: an idle request is nudged.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { NUDGE_PROMPT } from '../../src/core/handover/template.ts'
import { bottom, engineClear, generating, handover, PROMPT, relay, start, stateOf, stop, submit, taskDirs, turnEnd, turnStart, until, type Kit, test } from './kit.ts'
import { memHost } from './memfs.ts'

const measure = ($: Kit, percent: number) =>
  $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)

/** A task in ROTATING with handover-001 saved, the handover turn still open. */
async function rotating($: Kit, on: Parameters<typeof memHost>[0]) {
  const g = await generating($, on)
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  expect(stateOf(g.h, g.dir).status).toBe('ROTATING')
  return g
}

test('AC 1: duplicated turn.complete -> exactly one /clear, scheduled after the hook returned', async ($, on) => {
  const { h, dir, clears } = await rotating($, on)
  await turnEnd($)
  expect(clears).toEqual([])
  expect(stateOf(h, dir).rotation.step).toBe('CLEAR_SCHEDULED')
  await turnEnd($)
  await turnEnd($, 'answer', 't2')
  await until(h, () => clears.length > 0)
  await h.clock.settle()
  expect(clears).toEqual(['clear'])
})

test('AC 1: a worker respawn (session.start again) does not run /clear a second time', async ($, on) => {
  const { h, clears } = await rotating($, on)
  await turnEnd($)
  await until(h, () => clears.length > 0)
  await start($)
  await turnEnd($, 'answer', 't2')
  await h.clock.settle()
  expect(clears).toEqual(['clear'])
})

test('AC 2: a handover changed on disk after validation -> no /clear, NEEDS_REVIEW, said plainly', async ($, on) => {
  const { h, dir, clears } = await rotating($, on)
  h.files.set(`${dir}/history/handover-001.md`, 'edited by someone\n')
  await turnEnd($)
  await h.clock.settle()
  expect(clears).toEqual([])
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['NEEDS_REVIEW', 'HANDOVER_INVALID'])
  expect(h.toasts.at(-1)).toBe('The saved handover changed on disk, so Jeeves did not clear. Run /jeeves status.')
})

test('AC 2: no turn.complete clears before the handover is persisted', async ($, on) => {
  const { h, dir, clears } = await generating($, on)
  await turnEnd($)
  await h.clock.settle()
  expect(clears).toEqual([])
  expect(stateOf(h, dir).status).toBe('HANDOVER_GENERATING')
})

test('/clear rejected -> NEEDS_REVIEW(ROTATE_UNAVAILABLE), assisted, handover kept', async ($, on) => {
  const { h, dir, ctl } = await rotating($, on)
  ctl.rejectClear = true
  await turnEnd($)
  await until(h, () => stateOf(h, dir).status !== 'ROTATING')
  const s = stateOf(h, dir)
  expect([s.status, s.reason, s.mode]).toEqual(['NEEDS_REVIEW', 'ROTATE_UNAVAILABLE', 'assisted'])
  expect(s.lastValidatedHandover).toContain('history/handover-001.md#sha256:')
})

test('D-23: a request that lands after the turn ended gets one nudge prompt; the next Stop asks for the handover', async ($, on) => {
  const h = memHost(on)
  const prompts = bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await turnStart($)
  await $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'done', background_tasks: [], session_crons: [] })
  await turnEnd($)
  await measure($, 52)
  await until(h, () => prompts.some(p => p.text === NUDGE_PROMPT))
  expect(prompts.filter(p => p.text === NUDGE_PROMPT)).toEqual([{ text: NUDGE_PROMPT, origin: 'plugin' }])
  await measure($, 53)
  await h.clock.settle()
  expect(prompts.filter(p => p.text === NUDGE_PROMPT).length).toBe(1)
  // The nudge's own turn ends in a Stop: that Stop is the safe boundary.
  const ask = await $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'ok', background_tasks: [], session_crons: [] })
  expect(ask.block).toContain('JEEVES-HANDOVER')
  expect(stateOf(h, dir).status).toBe('HANDOVER_GENERATING')
})

test('D-23: a request during an open turn is not nudged (that turn\'s Stop asks); one left after the turn ends is', async ($, on) => {
  const h = memHost(on)
  const prompts = bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  await turnStart($)
  await measure($, 52)
  await h.clock.settle()
  expect(prompts.some(p => p.text === NUDGE_PROMPT)).toBe(false)
  await turnEnd($)
  await until(h, () => prompts.some(p => p.text === NUDGE_PROMPT))
  expect(prompts.filter(p => p.text === NUDGE_PROMPT).length).toBe(1)
})

test('an interrupted turn is never nudged: the user has the floor', async ($, on) => {
  const h = memHost(on)
  const prompts = bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  await turnStart($)
  await measure($, 52)
  await turnEnd($, 'aborted')
  await h.clock.settle()
  expect(prompts.some(p => p.text === NUDGE_PROMPT)).toBe(false)
  // ST-6.3: a reading that arrives later, with no turn open, still sends nothing.
  await measure($, 53)
  await h.clock.settle()
  expect(prompts.some(p => p.text === NUDGE_PROMPT)).toBe(false)
  expect(stateOf(h, taskDirs(h)[0]!).status).toBe('ROTATION_REQUESTED')
})

test('ST-14.3: the rotation line names the old conversation in full; resumed, it cannot drive the task', async ($, on) => {
  const g = await rotating($, on)
  const { h, dir } = g
  expect(h.notes).toContain(`Jeeves: handover validated (goal: Finish operator precedence in the calculator.), starting fresh. Previous conversation: claude --resume sess-test`)
  g.ctl.onClear = async () => { await engineClear($, h, 'sess-2') }
  await turnEnd($)
  await until(h, () => stateOf(h, dir).status === 'CONTINUING')
  await measure($, 4)
  expect([stateOf(h, dir).status, stateOf(h, dir).activeSessionId]).toEqual(['MONITORING', 'sess-2'])
  // `claude --resume sess-test`: a new process under the old id, with turns.
  const before = h.files.get(`${dir}/state.json`)
  h.sessionId = 'sess-test'
  h.turns = 12
  await start($)
  await submit($, 'carry on in the old one')
  await measure($, 70)
  for (const cmd of ['rotate', 'pause', 'later', 'threshold 60', 'retry', 'dod x']) await relay($, cmd)
  const status = await relay($, '')
  expect(status).toContain('Owned by another session')
  expect(status).toMatch(/^Auto off: /m)
  expect(h.files.get(`${dir}/state.json`)).toBe(before)
  expect(g.clears.length).toBe(1)
})
