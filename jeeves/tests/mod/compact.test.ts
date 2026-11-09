// ST-6.4 / ADR-006: precompute skipped only for an active managed task; manual and auto compaction run, then a handover is requested.
import type { SessionCompactTrigger } from 'claude-code'
import { expect } from 'claude-code/testing'
import { NUDGE_PROMPT } from '../../src/core/handover/template.ts'
import { bottom, PROMPT, relay, start, stateOf, submit, taskDirs, turnStart, until, type Kit, test } from './kit.ts'
import { memHost } from './memfs.ts'

const compact = ($: Kit, trigger: SessionCompactTrigger, agentId?: string) => $.session.compact({ trigger, messages: [{ role: 'user', text: 'hi', toolUses: [] }], ...(agentId ? { agentId } : {}) })

async function onTask($: Kit, on: Parameters<typeof memHost>[0]) {
  const h = memHost(on)
  const prompts = bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  return { h, prompts, dir: taskDirs(h)[0]! }
}

test('AC 2: precompute is skipped while the task is active, and runs once it is paused or without a task', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  expect((await compact($, 'precompute')).skip).toBe(undefined)
  await relay($, 'on')
  expect((await compact($, 'precompute')).skip).toContain('Jeeves')
  expect((await compact($, 'precompute', 'agent-1')).skip).toBe(undefined)
  await relay($, 'pause')
  expect((await compact($, 'precompute')).skip).toBe(undefined)
  expect(stateOf(h, taskDirs(h)[0]!).status).toBe('PAUSED')
})

test('AC 1, 3: a manual /compact is not blocked; afterwards a handover is requested (COMPACTED) and, Claude idle, nudged once', async ($, on) => {
  const { h, prompts, dir } = await onTask($, on)
  expect((await compact($, 'manual')).skip).toBe(undefined)
  const s = stateOf(h, dir)
  expect([s.status, s.reason, s.rotation.trigger]).toEqual(['ROTATION_REQUESTED', 'COMPACTED', 'COMPACTED'])
  expect(h.files.get(`${dir}/events.jsonl`)).toContain('after manual compaction')
  await until(h, () => prompts.some(p => p.text === NUDGE_PROMPT))
  expect(prompts.filter(p => p.text === NUDGE_PROMPT).length).toBe(1)
})

test('auto compaction mid-turn: not blocked, requested, no nudge (that turn\'s Stop asks); a subagent\'s compaction changes nothing', async ($, on) => {
  const { h, prompts, dir } = await onTask($, on)
  await turnStart($)
  expect((await compact($, 'auto', 'agent-1')).skip).toBe(undefined)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  expect((await compact($, 'auto')).skip).toBe(undefined)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
  await h.clock.settle()
  expect(prompts.some(p => p.text === NUDGE_PROMPT)).toBe(false)
})
