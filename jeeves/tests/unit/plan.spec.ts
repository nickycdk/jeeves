import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyPlan, parsePlan, parseProgress, planList, planText } from '../../src/core/plan.ts'
import { completionInstruction } from '../../src/core/completion.ts'
import { freshContext } from '../../src/core/continuation.ts'
import { reduce } from '../../src/core/machine.ts'
import { completionSummary } from '../../src/core/stats.ts'
import { DEFAULT_CONFIG, PLAN_MAX } from '../../src/core/types.ts'
import { statusLine, statusText } from '../../src/adapter/ui.ts'
import { AT, validState } from './helpers.ts'

const block = (...steps: string[]) => `Here is the plan.\n<<<JEEVES-PLAN\n${steps.join('\n')}\nJEEVES-PLAN>>>\nStarting now.`

test('parsePlan: numbered or bulleted steps of a closed block; the last block wins; none, empty or unclosed -> null', () => {
  assert.deepEqual(parsePlan(block('1. Schema test', '2) Codex read test', '3. [x] Early quality run', '', 'not a step')), ['Schema test', 'Codex read test', 'Early quality run'])
  // Sub-items, indented or not, are no steps: they would shift the numbers Claude reports.
  assert.deepEqual(parsePlan(block('1. Schema', '   - add field', '   - migrate', '- note', '2. Tests')), ['Schema', 'Tests'])
  assert.deepEqual(parsePlan(block('- A', '  - a1', '- B')), ['A', 'B'])
  assert.deepEqual(parsePlan('```\n<<<JEEVES-PLAN\n1. A\nJEEVES-PLAN>>>\n```'), ['A'])
  assert.deepEqual(parsePlan(`${block('1. Old')}\n${block('1. New', '2. Newer')}`), ['New', 'Newer'])
  assert.equal(parsePlan('no plan here'), null)
  assert.equal(parsePlan(block('just prose')), null)
  assert.equal(parsePlan('<<<JEEVES-PLAN\n1. never closed'), null)
  assert.equal(parsePlan(block(...Array.from({ length: PLAN_MAX + 5 }, (_, i) => `${i + 1}. s${i}`)))!.length, PLAN_MAX)
  assert.equal(parsePlan(block(`1. ${'x'.repeat(500)}`))![0]!.length, 200)
})

test('parseProgress: every marker, numbers ascending without repeats; anything else -> []', () => {
  assert.deepEqual(parseProgress('Done. <<<JEEVES-PROGRESS done=3, 1>>> and later <<<jeeves-progress done = 3 2>>>'), [1, 2, 3])
  assert.deepEqual(parseProgress('<<<JEEVES-PROGRESS done=<step numbers>>>>'), [])
  assert.deepEqual(parseProgress('<<<JEEVES-PROGRESS done=0>>>'), [])
  assert.deepEqual(parseProgress('step 2 is done'), [])
})

test('applyPlan: a new plan keeps ticks by text; progress ticks by number, out of range ignored; no plan stays none', () => {
  const p1 = applyPlan(undefined, ['Schema test', 'Codex read test', 'Quality run'], [1, 9])
  assert.deepEqual(p1, [{ text: 'Schema test', done: true }, { text: 'Codex read test', done: false }, { text: 'Quality run', done: false }])
  assert.deepEqual(applyPlan(p1, ['New first step', 'schema  TEST', 'Quality run'], [3]), [
    { text: 'New first step', done: false }, { text: 'schema  TEST', done: true }, { text: 'Quality run', done: true },
  ])
  assert.equal(applyPlan(undefined, null, [1]), undefined)
  assert.equal(planText(p1), '1/3 tasks done')
  assert.equal(planText(undefined), null)
  assert.deepEqual(planList(p1), ['1. [x] Schema test', '2. [ ] Codex read test', '3. [ ] Quality run'])
})

test('PLAN input: a running task stores the plan and logs it from = to; unchanged or inert -> ignored', () => {
  const ctx = { now: Date.parse(AT) + 1000, config: DEFAULT_CONFIG, newRotationId: 'r_new' }
  const o = reduce(validState({ status: 'MONITORING' }), { type: 'PLAN', steps: ['A', 'B'], done: [1] }, ctx)
  assert.deepEqual(o.state.plan, [{ text: 'A', done: true }, { text: 'B', done: false }])
  const e = o.effects.find(x => x.type === 'LOG_EVENT')
  assert.ok(e?.type === 'LOG_EVENT' && e.from === 'MONITORING' && e.to === 'MONITORING' && e.detail === 'plan: 1/2 tasks done')
  assert.ok(reduce(o.state, { type: 'PLAN', steps: null, done: [1] }, ctx).ignored)
  assert.ok(reduce(validState({ status: 'COMPLETED', reason: 'COMPLETED' }), { type: 'PLAN', steps: ['A'], done: [] }, ctx).ignored)
})

test('the instruction asks for a plan until Jeeves holds one, then only for progress; it never carries the ticks', () => {
  const ask = completionInstruction('t_1', [])
  assert.ok(ask.includes('<<<JEEVES-PLAN\n1. <step>') && ask.includes('<<<JEEVES-PROGRESS done=2>>>'))
  const held = completionInstruction('t_1', [], true)
  assert.ok(!held.includes('1. <step>') && held.includes('Jeeves holds the plan') && held.includes('JEEVES-PROGRESS'))
})

test('a fresh conversation gets the plan with its ticks; without one, no plan section', () => {
  const view = { original: 'Build it.', dod: [], checks: [], changes: [] }
  const plan = [{ text: 'A', done: true }, { text: 'B', done: false }]
  const c = freshContext({ taskId: 't_x', session: 2, view, handover: null, plan })
  assert.ok(c.includes('## Plan (1/2 tasks done; [x] = done, keep these step numbers)\n1. [x] A\n2. [ ] B'))
  assert.ok(!freshContext({ taskId: 't_x', session: 2, view, handover: null }).includes('## Plan'))
})

test('status entry, /jeeves status and the completion summary show X/Y tasks done', () => {
  const plan = [{ text: 'A', done: true }, { text: 'B', done: false }, { text: 'C', done: false }]
  const at = '2026-11-07T10:00:00.000Z'
  assert.equal(statusLine(validState({ status: 'MONITORING', plan, lastContext: { window: 1_000_000, percent: 10, at } }), 40), 'Jeeves 10%/40%, 1/3 tasks done')
  assert.equal(statusLine(validState({ status: 'MONITORING', origin: 'auto', plan, lastContext: { window: 1_000_000, percent: 10, at } }), 40), 'Jeeves on, 1/3 tasks done')
  const s = validState({ status: 'MONITORING', plan })
  const probe = { mode: 'full' as const, missing: [], version: '2.1.332', boundary: 'stop' as const }
  assert.ok(statusText({ probe, stateRoot: '/r', stateRootError: null, task: { state: s, dir: '/d' }, taskError: null } as Parameters<typeof statusText>[0]).split('\n').includes('Plan: 1/3 tasks done'))
  const line = completionSummary({ state: validState({ plan }), sessions: [], events: [], liveCostUsd: null, commits: null, how: 'user', checks: 0, now: Date.parse(at) })[0]
  assert.match(line!, /: no handovers, 1\/3 tasks done, no checks set, confirmed by you\.$/)
})
