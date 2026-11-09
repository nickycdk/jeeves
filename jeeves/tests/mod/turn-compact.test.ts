// ST-16.5 / ADR-006 A1: in turn mode a sharp fall in the context reading, within one conversation, is a compaction.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { bottom, handover, PROMPT, relay, start, stateOf, submit, taskDirs, test, turnEnd, turnGenerating, turnStart, until, wholeTurn, type Kit } from './kit.ts'
import { memHost } from './memfs.ts'

const tokens = ($: Kit, n: number) =>
  $.session.measure({ context: { window: 1_000_000, tokens: n, percent: n / 10_000 }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)

/** A turn-mode task at MONITORING; `read` gives one reading inside a turn that then ends. */
async function watching($: Kit, on: Parameters<typeof memHost>[0]) {
  const g = await turnGenerating($, on, { ask: false })
  let n = 0
  const read = async (t: number) => { const id = `r${++n}`; await turnStart($, id); await tokens($, t); await turnEnd($, 'answer', id) }
  return { ...g, read }
}

test('AC 1: the probe\'s /compact fall (70,222 -> 57,907) -> COMPACTED, one request at that turn\'s end, one rotation', async ($, on) => {
  const g = await watching($, on)
  const { h, dir, prompts } = g
  await g.read(70_222)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  await g.read(57_907)
  expect(h.logs).toContain('jeeves: context fell 70222 -> 57907 tokens: compaction')
  expect(stateOf(h, dir).status).toBe('HANDOVER_GENERATING')
  expect(stateOf(h, dir).rotation.trigger).toBe('COMPACTED')
  await until(h, () => prompts.some(p => p.text.includes('JEEVES-HANDOVER')))
  await wholeTurn($, handover(g.taskId, stateOf(h, dir).rotation.rotationId))
  await until(h, () => stateOf(h, dir).status === 'CONTINUING')
  // The fresh conversation's readings are never compared with the old one's.
  await g.read(60_000)
  await g.read(58_000)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  expect(stateOf(h, dir).rotationCount).toBe(1)
  expect(prompts.some(p => p.text.includes('Jeeves: you are session 3'))).toBe(false)
})

test('AC 2: a fall of less than the amount, or a rewind-sized one (~300 tokens), does nothing', async ($, on) => {
  const g = await watching($, on)
  await g.read(70_222)
  await g.read(69_900)
  await g.read(61_000)
  expect(stateOf(g.h, g.dir).status).toBe('MONITORING')
})

test('AC 2: a fall after the user\'s /clear (a new conversation) does nothing', async ($, on) => {
  const g = await watching($, on)
  await g.read(300_000)
  await $.session.end({ reason: 'clear', sessionId: g.h.sessionId, resume: { id: g.h.sessionId } })
  g.h.sessionId = 'sess-user'
  expect(stateOf(g.h, g.dir).reason).toBe('USER_CLEAR')
  await relay($, 'resume')
  await g.read(60_000)
  expect(g.h.logs.some(l => l.includes('compaction'))).toBe(false)
  expect(stateOf(g.h, g.dir).status).toBe('MONITORING')
})

test('Stop mode: a fall is not read as a compaction (session.compact is the path there)', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await tokens($, 70_222)
  await tokens($, 20_000)
  expect(stateOf(h, dir).status).toBe('MONITORING')
})
