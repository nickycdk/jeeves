// ST-10.2 / ST-10.3: /jeeves retry after an invalid handover or a possible loop (ADR-009 A2, D-31).
import { expect } from 'claude-code/testing'
import { NUDGE_PROMPT } from '../../src/core/handover/template.ts'
import { generating, handover, relay, sha256, stateOf, stop, turnEnd, until, type Kit, test } from './kit.ts'

const BAD = 'no handover here'

/** Three invalid handovers: NEEDS_REVIEW(HANDOVER_INVALID), the turn ended (Claude idle). */
async function invalid($: Kit, on: Parameters<typeof generating>[1]) {
  const g = await generating($, on)
  g.h.files.set(`${g.dir}/history/handover-001.md`, 'earlier, validated\n')
  for (let i = 0; i < 3; i++) await stop($, BAD)
  await turnEnd($)
  expect([stateOf(g.h, g.dir).status, stateOf(g.h, g.dir).reason]).toEqual(['NEEDS_REVIEW', 'HANDOVER_INVALID'])
  return g
}

test('AC 1, 5: retry asks again (nudged when idle) and a valid handover then rotates; earlier handovers byte-identical', async ($, on) => {
  const { h, dir, prompts, taskId, rotationId } = await invalid($, on)
  const before = await sha256(h.files.get(`${dir}/history/handover-001.md`)!)
  expect(await relay($, 'status')).toContain('/jeeves retry')
  expect(await relay($, 'retry')).toContain('Handover requested again')
  const s = stateOf(h, dir)
  expect([s.status, s.reason]).toEqual(['ROTATION_REQUESTED', 'MANUAL'])
  expect(s.rotation.rotationId).not.toBe(rotationId)
  await until(h, () => prompts.some(p => p.text === NUDGE_PROMPT))
  const ask = await stop($, 'ok', { stop_hook_active: false })
  expect(ask.block).toContain('JEEVES-HANDOVER')
  expect(await stop($, handover(taskId, s.rotation.rotationId))).toEqual({})
  expect(stateOf(h, dir).status).toBe('ROTATING')
  expect(await sha256(h.files.get(`${dir}/history/handover-001.md`)!)).toBe(before)
})

test('AC 3: a second exhausted retry is refused and status names the limit', async ($, on) => {
  const { h, dir } = await invalid($, on)
  await relay($, 'retry')
  await stop($, 'ok', { stop_hook_active: false })
  for (let i = 0; i < 3; i++) await stop($, BAD)
  expect([stateOf(h, dir).status, stateOf(h, dir).consecutiveFailures]).toEqual(['NEEDS_REVIEW', 2])
  const before = h.files.get(`${dir}/state.json`)
  expect(await relay($, 'retry')).toContain('/jeeves off')
  expect(h.files.get(`${dir}/state.json`)).toBe(before)
  expect(await relay($, 'status')).toContain('Retries used up')
})

test('AC 2, 4: retry from another session or typed by Claude changes nothing', async ($, on) => {
  const { h, dir } = await invalid($, on)
  const before = h.files.get(`${dir}/state.json`)
  expect(await relay($, 'retry', 'plugin')).toContain('Only you can')
  h.sessionId = 'sess-other'
  expect(await relay($, 'retry')).toContain('LOCK_HELD')
  expect(h.files.get(`${dir}/state.json`)).toBe(before)
})

test('retry with nothing to retry says what it applies to', async ($, on) => {
  await generating($, on)
  expect(await relay($, 'retry')).toContain('after an invalid handover')
})
