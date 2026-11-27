// The plan: Claude's JEEVES-PLAN block and JEEVES-PROGRESS markers in a main-loop answer become the task's plan, shown as
// "X/Y tasks done" in the status entry, /jeeves status and the completion summary. Display only: completion is unchanged.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { bottom, generating, PROMPT, relay, start, stateOf, stop, submit, taskDirs, TURN, until, type Kit, test } from './kit.ts'
import { memHost } from './memfs.ts'

const answers: string[] = []
let stepNo = 0
/** One main-loop model response with `text`, as the engine streams it (the bottom of the chain answers). Jeeves reads it
 *  after the stream ends, off the response's path, so the test waits for `ready` rather than a fixed number of ticks. */
async function step($: Kit, h: ReturnType<typeof memHost>, text: string, ready: () => boolean) {
  answers.push(text)
  const s = $.turn.step({ turnId: 'p1', index: stepNo++, model: 'm', messageCount: 1 })
  for await (const _ of s) { /* drain */ }
  await s.result
  await until(h, ready)
}
const engineSteps = (on: Parameters<typeof memHost>[0]) =>
  on('turn.step', async function* (_, e) { return { turnId: e.turnId, index: e.index, answer: answers.shift() ?? '', toolUses: [], stopReason: 'end_turn', usage: null } })

const compose = ($: Kit) => $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
const plan = 'Plan first.\n<<<JEEVES-PLAN\n1. Schema test\n2. Codex read test\n3. Early quality run\nJEEVES-PLAN>>>'

async function task($: Kit, on: Parameters<typeof memHost>[0]) {
  const h = memHost(on)
  bottom(on)
  engineSteps(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  return { h, dir }
}

test('a plan, then progress: stored in state, "X/Y tasks done" in the status entry and /jeeves status; the instruction stops asking for a plan', async ($, on) => {
  const { h, dir } = await task($, on)
  if (!TURN) expect((await compose($)).sections.at(-1)?.text).toContain('<<<JEEVES-PLAN\n1. <step>')
  // Mid-turn, as live: the plan comes first in a turn that then works through every step without stopping.
  await step($, h, plan, () => stateOf(h, dir).plan !== undefined)
  expect(stateOf(h, dir).plan).toEqual([{ text: 'Schema test', done: false }, { text: 'Codex read test', done: false }, { text: 'Early quality run', done: false }])
  expect(stateOf(h, dir).schemaVersion).toBe(5)
  expect(h.status.at(-1)).toContain('0/3 tasks done')
  if (!TURN) expect((await compose($)).sections.at(-1)?.text).toContain('Jeeves holds the plan')
  // A subagent's response is not Claude's plan.
  const before = JSON.stringify(stateOf(h, dir).plan)
  answers.push('<<<JEEVES-PROGRESS done=3>>>')
  const sub = $.turn.step({ turnId: 'p1', index: stepNo++, model: 'm', messageCount: 1, agentId: 'a1' })
  for await (const _ of sub) { /* drain */ }
  await h.clock.settle()
  expect(JSON.stringify(stateOf(h, dir).plan)).toBe(before)

  await step($, h, 'Schema test passes.\n<<<JEEVES-PROGRESS done=1>>>', () => stateOf(h, dir).plan?.[0]?.done === true)
  expect(h.status.at(-1)).toContain('1/3 tasks done')
  expect((await relay($, 'status')).split('\n')).toContain('Plan: 1/3 tasks done')
  expect(stateOf(h, dir).status).toBe('MONITORING')

  expect(await relay($, 'done')).toContain('marked done by you')
  expect(h.notes.at(-1)).toBe('task completed in <1m: no handovers, 1/3 tasks done, no checks set, confirmed by you.')
})

test('a tick in the handover answer counts; a plan block there does not (it would be quoted)', async ($, on) => {
  engineSteps(on)
  const g = await generating($, on)
  for (let i = 0; i < 3; i++) await g.h.clock.settle()
  g.h.files.set(`${g.dir}/state.json`, JSON.stringify({ ...stateOf(g.h, g.dir), plan: [{ text: 'A', done: false }, { text: 'B', done: false }] }, null, 2) + '\n')
  await step($, g.h, 'Not a handover yet.\n<<<JEEVES-PROGRESS done=2>>>\n<<<JEEVES-PLAN\n1. Quoted\nJEEVES-PLAN>>>', () => stateOf(g.h, g.dir).plan?.[1]?.done === true)
  expect(stateOf(g.h, g.dir).plan).toEqual([{ text: 'A', done: false }, { text: 'B', done: true }])
})

test('an unproven completion while a handover is requested: the same Stop still asks for the handover', { stopOnly: 'Stop mode returns the request as the block' }, async ($, on) => {
  const { h, dir } = await task($, on)
  await $.session.measure({ context: { window: 1_000_000, percent: 45 }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
  const taskId = stateOf(h, dir).taskId
  const r = await stop($, `Done.\n<<<JEEVES-COMPLETE v1 task=${taskId}\n## Summary\n- x\n## Checks run\n- none\n## Blockers\n- none\nJEEVES-COMPLETE>>>`, { stop_hook_active: false })
  expect(r.block).toContain('JEEVES-HANDOVER')
  expect(stateOf(h, dir).status).toBe('HANDOVER_GENERATING')
})

test('/jeeves done never completes a running task another session left behind, even with its lock gone', async ($, on) => {
  const { h, dir } = await task($, on)
  h.files.delete(`${dir}/lock.d/owner.json`)
  h.dirs.delete(`${dir}/lock.d`)
  h.sessionId = 'sess-elsewhere'
  expect(await relay($, 'done')).toBe('Nothing to mark done: no running or paused task here, or a handover is in progress.')
  expect(stateOf(h, dir).status).toBe('MONITORING')
})
