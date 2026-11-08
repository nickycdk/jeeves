// ST-4.2: the rotation boundary. Tibbs's own /clear records the source session and writes sessions/NNN.json once;
// SessionStart(clear) gives the fresh session the task (target id, lock, RESTORING). A /clear Tibbs did not schedule
// is the user's and never counts as a rotation.
import { expect, test } from 'claude-code/testing'
import { engineClear, generating, handover, PROMPT, relay, start, stateOf, stop, submit, taskDirs, turnEnd, until, bottom, type Kit } from './kit.ts'
import { memHost } from './memfs.ts'

async function rotating($: Kit, on: Parameters<typeof memHost>[0]) {
  const g = await generating($, on)
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  return g
}
const owner = (h: ReturnType<typeof memHost>, dir: string) => JSON.parse(h.files.get(`${dir}/lock.d/owner.json`) ?? '{}').ownerSessionId

test('Tibbs /clear -> source recorded, sessions/001.json written, fresh session owns the task (RESTORING)', async ($, on) => {
  const { h, dir, ctl, rotationId, prompts } = await rotating($, on)
  h.costUsd = 0.0123
  ctl.onClear = async () => { await engineClear($, h, 'sess-2') }
  await turnEnd($)
  // RESTORING lasts until /clear resolves; then the continuation moves it on (ST-4.3).
  await until(h, () => stateOf(h, dir).status === 'CONTINUING')
  const s = stateOf(h, dir)
  expect([s.rotation.rotationId, s.rotation.sourceSessionId, s.rotation.targetSessionId]).toEqual([rotationId, 'sess-test', 'sess-2'])
  expect(s.activeSessionId).toBe('sess-2')
  expect(s.sessionStart.pct).toBe(null)
  await until(h, () => prompts.some(p => p.text.startsWith('Tibbs: you are session 2')))
  const events = h.files.get(`${dir}/events.jsonl`)!.trim().split('\n').map(l => JSON.parse(l))
  expect(events.slice(-2).map(e => [e.from, e.to, e.sessionId])).toEqual([['ROTATING', 'RESTORING', 'sess-2'], ['RESTORING', 'CONTINUING', 'sess-2']])
  expect(owner(h, dir)).toBe('sess-2')
  const rec = JSON.parse(h.files.get(`${dir}/sessions/001.json`)!)
  expect([rec.sessionId, rec.endReason, rec.endPct, rec.costUsd, rec.startedAt <= rec.endedAt]).toEqual(['sess-test', 'clear', 52, 0.0123, true])
})

test('AC 3: sessions/NNN.json is write-once: an existing file is never overwritten, the rotation still goes on', async ($, on) => {
  const { h, dir, ctl, prompts } = await rotating($, on)
  h.files.set(`${dir}/sessions/001.json`, 'earlier\n')
  ctl.onClear = async () => { await engineClear($, h, 'sess-2') }
  await turnEnd($)
  await until(h, () => stateOf(h, dir).status === 'CONTINUING')
  expect(h.files.get(`${dir}/sessions/001.json`)).toBe('earlier\n')
  await until(h, () => prompts.some(p => p.text.startsWith('Tibbs: you are session 2')))
})

test('AC 2: a /clear the user types after the handover was saved (nothing scheduled) pauses: USER_CLEAR, no rotation', async ($, on) => {
  const { h, dir, clears } = await rotating($, on)
  await engineClear($, h, 'sess-2')
  const s = stateOf(h, dir)
  expect([s.status, s.reason, s.activeSessionId]).toEqual(['PAUSED', 'USER_CLEAR', 'sess-test'])
  expect(h.files.has(`${dir}/sessions/001.json`)).toBe(false)
  await turnEnd($)
  await h.clock.settle()
  expect(clears).toEqual([])
})

test('AC 2: SessionStart(clear) with no pending rotation changes nothing but the user-clear pause', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await engineClear($, h, 'sess-2')
  const s = stateOf(h, dir)
  expect([s.status, s.reason, s.rotation, s.activeSessionId]).toEqual(['PAUSED', 'USER_CLEAR', null, 'sess-test'])
})
