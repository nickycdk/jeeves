// ST-3.3 / AC-07: the safe boundary at classic.Stop, the quiesce limit, interrupts, and failing open.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { bottom, PROMPT, relay, start, stateOf, submit, taskDirs, type Kit, test } from './kit.ts'
import { memHost } from './memfs.ts'

const measure = ($: Kit, percent: number) =>
  $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
const SHELL = { id: 'b1', type: 'shell', status: 'running', description: 'sleep 45' }
const CRON = { id: 'c1', schedule: '0 9 * * *', recurring: true, prompt: 'check the build' }
const stop = ($: Kit, over: { background_tasks?: typeof SHELL[]; session_crons?: typeof CRON[]; agent_id?: string } = {}) =>
  $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'done', background_tasks: [], session_crons: [], ...over })
const aborted = ($: Kit) => $.turn.complete({ answer: '', durationMs: 5, isAborted: true, turnId: 't1', reason: 'aborted' })

async function requested($: Kit, on: Parameters<typeof memHost>[0]) {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await measure($, 52)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
  return { h, dir }
}

test('safe Stop: handover requested once, with task and rotation ids; facts snapshot keeps the crons (ADR-004 A1)', async ($, on) => {
  const { h, dir } = await requested($, on)
  const r = await stop($, { session_crons: [CRON] })
  const s = stateOf(h, dir)
  expect(s.status).toBe('HANDOVER_GENERATING')
  expect(r.block).toContain(`<<<JEEVES-HANDOVER v1 task=${s.taskId} rotation=${s.rotation.rotationId}`)
  const facts = JSON.parse(h.files.get(`${dir}/history/facts-${s.rotation.rotationId}.json`)!)
  expect(facts.crons).toEqual([CRON])
  expect(facts.git.kind).toBe('none')
})

test('AC-07: a running background shell or subagent means no handover request; the next safe Stop asks', async ($, on) => {
  const { h, dir } = await requested($, on)
  expect((await stop($, { background_tasks: [SHELL] })).block).toBeUndefined()
  expect([stateOf(h, dir).status, stateOf(h, dir).rotation.quiesceCount]).toEqual(['QUIESCING', 1])
  h.agents = [{ id: 'a1', status: 'running' }]
  expect((await stop($)).block).toBeUndefined()
  expect(stateOf(h, dir).rotation.quiesceCount).toBe(2)
  h.agents = [{ id: 'a1', status: 'idle' }]
  expect((await stop($)).block).toContain('JEEVES-HANDOVER')
})

test('after quiesceMaxTurns unsafe Stops the task pauses with UNSAFE_BOUNDARY and says why', async ($, on) => {
  const { h, dir } = await requested($, on)
  for (let i = 0; i < 4; i++) expect((await stop($, { background_tasks: [SHELL] })).block).toBeUndefined()
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['PAUSED', 'UNSAFE_BOUNDARY'])
  expect(h.toasts.at(-1)).toBe('Paused: no safe point to hand over (1 background task(s)). Finish the work, then /jeeves resume.')
})

test('an interrupted turn asks for nothing; an interrupt during the handover pauses (USER_INTERRUPT)', async ($, on) => {
  const { h, dir } = await requested($, on)
  await aborted($)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
  await stop($)
  expect(stateOf(h, dir).status).toBe('HANDOVER_GENERATING')
  await aborted($)
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['PAUSED', 'USER_INTERRUPT'])
})

test('a failing Stop hook lets Claude stop and advances nothing (open for the user, closed for the rotation)', async ($, on) => {
  const { h, dir } = await requested($, on)
  h.failWrite = p => p.includes('state.json')
  expect(await stop($)).toEqual({})
  h.failWrite = null
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
})

test('a subagent Stop, a Stop outside a rotation, and a Stop without a task change nothing', async ($, on) => {
  const { h, dir } = await requested($, on)
  expect(await stop($, { agent_id: 'a1' })).toEqual({})
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
  await relay($, 'pause')
  expect(await stop($)).toEqual({})
  expect(stateOf(h, dir).status).toBe('PAUSED')
})
