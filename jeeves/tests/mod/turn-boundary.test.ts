// ST-16.2 / ADR-004 A2: turn mode's safe boundary on turn.complete, with Jeeves's own background record.
import type { PromptOrigin, SessionMeasureInput, ToolCallResult } from 'claude-code'
import { expect } from 'claude-code/testing'
import { bottom, PROMPT, relay, start, stateOf, submit, taskDirs, turnEnd, turnStart, type Kit, test } from './kit.ts'
import { memHost } from './memfs.ts'

const measure = ($: Kit, percent: number) =>
  $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
const NOTE: PromptOrigin = { kind: 'task-notification' } as PromptOrigin
const notify = ($: Kit, id: string) => submit($, `<task-notification>\n<task-id>${id}</task-id>\n<status>completed</status>\n</task-notification>`, NOTE)
let turns = 0
/** One main turn that answers; no classic.Stop reaches Jeeves (the skip). */
const turn = async ($: Kit, reason: 'answer' | 'aborted' = 'answer') => { const id = `t${++turns}`; await turnStart($, id); await turnEnd($, reason, id) }

/** A process in turn mode, a task at ROTATION_REQUESTED; `bg`: a tool call that starts work in the background. */
async function requested($: Kit, on: Parameters<typeof memHost>[0]) {
  const h = memHost(on)
  bottom(on)
  on('tool.call', (_, e) => ({ result: (e as { run_in_background?: boolean }).run_in_background ? { backgroundTaskId: (e as { command: string }).command } : {}, text: '' }) as ToolCallResult)
  await start($)
  await turn($)
  expect(await relay($, 'status')).toContain('mode: full (turn)')
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  const bg = (id: string) => $.tool.call({ tool: 'Bash', command: id, run_in_background: true } as never)
  return { h, dir, bg, request: async () => { await turnStart($, 'req'); await measure($, 52); expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED') } }
}

test('AC 1: the request waits while background work runs, a subagent runs, or the turn was aborted; then the next answered turn asks', async ($, on) => {
  const { h, dir, bg, request } = await requested($, on)
  await request()
  await bg('b1')
  await turnEnd($, 'answer', 'req')
  expect([stateOf(h, dir).status, stateOf(h, dir).rotation.quiesceCount]).toEqual(['QUIESCING', 1])
  await notify($, 'b1')
  h.agents = [{ id: 'a1', status: 'running' }]
  await turn($)
  expect(stateOf(h, dir).rotation.quiesceCount).toBe(2)
  h.agents = []
  await turn($, 'aborted')
  expect(stateOf(h, dir).status).toBe('QUIESCING')
  await turn($)
  expect(stateOf(h, dir).status).toBe('HANDOVER_GENERATING')
})

test('AC 2: a lost notification costs one PAUSED(UNSAFE_BOUNDARY); after resume the next request is not blocked by it', async ($, on) => {
  const { h, dir, bg, request } = await requested($, on)
  await request()
  await bg('lost')
  await turnEnd($, 'answer', 'req')
  for (let i = 0; i < 3; i++) await turn($)
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['PAUSED', 'UNSAFE_BOUNDARY'])
  expect(h.toasts.at(-1)).toBe('Paused: no safe point to hand over (1 background task(s)). Finish the work, then /jeeves resume.')
  await relay($, 'resume')
  expect(stateOf(h, dir).status).not.toBe('PAUSED')
  await measure($, 10)
  await request()
  await turnEnd($, 'answer', 'req')
  expect(stateOf(h, dir).status).toBe('HANDOVER_GENERATING')
})

test('AC 3: a notification for work never counted does not go below zero; work started after it still counts', async ($, on) => {
  const { h, dir, bg, request } = await requested($, on)
  await notify($, 'before')
  await submit($, '<task-notification>no id</task-notification>', NOTE)
  await request()
  await bg('b2')
  await turnEnd($, 'answer', 'req')
  expect(stateOf(h, dir).status).toBe('QUIESCING')
  await notify($, 'b2')
  await turn($)
  expect(stateOf(h, dir).status).toBe('HANDOVER_GENERATING')
})

test('AC 4: a reading mid-turn (a permission dialog may be open) asks nothing until the turn has ended', async ($, on) => {
  const { h, dir, request } = await requested($, on)
  await request()
  await $.tool.call({ tool: 'Bash', command: 'rm -rf build' } as never)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
  await turnEnd($, 'answer', 'req')
  expect(stateOf(h, dir).status).toBe('HANDOVER_GENERATING')
})

test('ADR-002 A3: a rotation requested before the skip is seen is taken over at that same turn.complete', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await turnStart($, 'x')
  await measure($, 52)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
  await turnEnd($, 'answer', 'x')
  expect(await relay($, 'status')).toContain('mode: full (turn)')
  expect(stateOf(h, dir).status).toBe('HANDOVER_GENERATING')
})

test('stop mode: turn.complete is no boundary; a waiting rotation is judged only at classic.Stop', { stopOnly: 'asserts Stop mode itself' }, async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await turnStart($, 'x')
  await measure($, 52)
  await $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'done', background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 's' }], session_crons: [] })
  await turnEnd($, 'answer', 'x')
  expect([stateOf(h, dir).status, stateOf(h, dir).rotation.quiesceCount]).toEqual(['QUIESCING', 1])
  expect(await relay($, 'status')).not.toContain('(turn)')
})
