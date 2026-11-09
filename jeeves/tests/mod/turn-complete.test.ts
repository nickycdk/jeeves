// ST-16.6 / ADR-007 A1: in turn mode the completion rules go in as a hidden row, and the completion block is read
// from turn.complete's answer; missing checks go out as one prompt, then NEEDS_REVIEW as in Stop mode.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { ROW_EVERY } from '../../src/adapter/task.ts'
import { bottom, handover, PROMPT, relay, start, stateOf, submit, taskDirs, test, turnEnd, turnGenerating, turnStart, until, wholeTurn, type Kit } from './kit.ts'
import { memHost } from './memfs.ts'

const RULES = 'Saying "done" does not finish it.'
const rules = (rows: string[]) => rows.filter(r => r.includes(RULES)).length
const complete = (taskId: string) => `Finished.\n<<<JEEVES-COMPLETE v1 task=${taskId}\n## Summary\n- all of it\n## Checks run\n- \`npm run lint\`\n## Blockers\n- none\nJEEVES-COMPLETE>>>`
const tokens = ($: Kit, n: number) =>
  $.session.measure({ context: { window: 1_000_000, tokens: n, percent: n / 10_000 }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)

test('AC 1: a row at the task\'s first turn, again after 10 turns, at once after a recognised compaction, after a continuation; no more', async ($, on) => {
  const g = await turnGenerating($, on, { ask: false })
  const { h, dir, rows } = g
  expect(rules(rows)).toBe(0)
  await wholeTurn($)
  expect(rules(rows)).toBe(1)
  expect(rows.at(-1)).toContain(`(${g.taskId})`)
  for (let i = 1; i < ROW_EVERY; i++) await wholeTurn($)
  expect(rules(rows)).toBe(1)
  await wholeTurn($)
  expect(rules(rows)).toBe(2)
  // A recognised compaction (mid-turn): a row at once, then the rotation; the fresh conversation's first turn gets one.
  await turnStart($, 'c1'); await tokens($, 70_222); await turnEnd($, 'answer', 'c1')
  expect(rules(rows)).toBe(2)
  await turnStart($, 'c2'); await tokens($, 57_907)
  expect(rules(rows)).toBe(3)
  await turnEnd($, 'answer', 'c2')
  await until(h, () => g.prompts.some(p => p.text.includes('JEEVES-HANDOVER')))
  await wholeTurn($, handover(g.taskId, stateOf(h, dir).rotation.rotationId))
  await until(h, () => stateOf(h, dir).status === 'CONTINUING')
  expect(rules(rows)).toBe(3)
  await wholeTurn($)
  expect(rules(rows)).toBe(4)
  await wholeTurn($)
  expect(rules(rows)).toBe(4)
})

test('AC 2: a claimed completion without its check gets one prompt listing it; claimed again still missing -> NEEDS_REVIEW', async ($, on) => {
  const g = await turnGenerating($, on, { ask: false })
  await relay($, 'check npm run lint')
  await wholeTurn($, complete(g.taskId))
  await until(g.h, () => g.prompts.some(p => p.text.startsWith('Jeeves: not marked done yet.')))
  const ask = g.prompts.filter(p => p.text.startsWith('Jeeves: not marked done yet.'))
  expect(ask.length).toBe(1)
  expect(ask[0]!.text).toContain('`npm run lint`')
  expect(stateOf(g.h, g.dir).status).toBe('MONITORING')
  await wholeTurn($, complete(g.taskId))
  await g.h.clock.settle()
  expect([stateOf(g.h, g.dir).status, stateOf(g.h, g.dir).reason]).toEqual(['NEEDS_REVIEW', 'DOD_UNMET'])
  expect(g.prompts.filter(p => p.text.startsWith('Jeeves: not marked done yet.')).length).toBe(1)
})

test('AC 3: a passing completion -> COMPLETED', async ($, on) => {
  const g = await turnGenerating($, on, { ask: false })
  await relay($, 'check npm run lint')
  await $.tool.call({ tool: 'Bash', command: 'npm run lint' })
  await until(g.h, () => stateOf(g.h, g.dir).ledger.length === 2)
  await wholeTurn($, complete(g.taskId))
  expect(stateOf(g.h, g.dir).status).toBe('COMPLETED')
})

test('Stop mode: no completion row (prompt.compose carries the rules there)', { stopOnly: 'asserts Stop mode itself' }, async ($, on) => {
  const h = memHost(on)
  bottom(on)
  const rows: string[] = []
  on('session.append', (_, e, next) => { rows.push(e.message.content.map(b => String((b as { text?: string }).text ?? '')).join('')); return next(e) })
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  expect(taskDirs(h).length).toBe(1)
  for (let i = 0; i < ROW_EVERY + 1; i++) {
    await turnStart($, `s${i}`)
    await $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'ok', background_tasks: [], session_crons: [] })
    await turnEnd($, 'answer', `s${i}`)
  }
  expect(rules(rows)).toBe(0)
})
