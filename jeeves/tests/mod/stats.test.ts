// ST-11.4: /jeeves stats through the hooks: after a real rotation, with an unreadable task, and over 50 tasks.
import { expect, test } from 'claude-code/testing'
import { bottom, engineClear, generating, handover, relay, start, stateOf, stop, turnEnd, until } from './kit.ts'
import { memHost } from './memfs.ts'

test('after one rotation: project and task figures; an unreadable task is counted as such; anyone may read', async ($, on) => {
  const g = await generating($, on)
  const { h, dir, ctl } = g
  h.costUsd = 0.42
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  ctl.onClear = async () => { await engineClear($, h, 'sess-2') }
  await turnEnd($)
  await until(h, () => stateOf(h, dir).status === 'CONTINUING')
  h.files.set(dir.replace(/[^/]+$/, 't_broken/state.json'), '{ nope')
  const text = await relay($, 'stats', 'plugin')
  for (const want of ['Jeeves stats, this project:', 'Tasks: 1 (1 unreadable, not counted)', 'Rotations: 1  Sessions: 1', 'Cost: $0.42 over 1 session(s)', `Task ${g.taskId}:`]) expect(text).toContain(want)
  expect(text.toLowerCase()).not.toContain('saved')
})

test('P: stats over 50 tasks answers in < 100 ms', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  const first = [...h.files.keys()].find(f => f.endsWith('/state.json'))!
  const state = JSON.parse(h.files.get(first)!)
  const base = first.replace(/\/[^/]+\/state\.json$/, '')
  for (let i = 0; i < 50; i++) {
    const d = `${base}/t_20261108_${String(i).padStart(6, '0')}`
    h.files.set(`${d}/state.json`, JSON.stringify({ ...state, taskId: `t_20261108_${String(i).padStart(6, '0')}`, status: 'DISABLED', activeSessionId: null, rotationCount: 2 }))
    h.files.set(`${d}/events.jsonl`, '')
    for (const n of [1, 2]) h.files.set(`${d}/sessions/00${n}.json`, JSON.stringify({ schemaVersion: 1, sessionId: `s${n}`, startedAt: `2026-11-08T1${n}:00:00.000Z`, endedAt: null, endReason: 'clear', startPct: 4, endPct: 50, costUsd: 0.1 }))
  }
  const t0 = performance.now()
  const text = await relay($, 'stats')
  const ms = performance.now() - t0
  expect(text).toContain('Tasks: 51')
  expect(text).toContain('Rotations: 100  Sessions: 100')
  expect(ms).toBeLessThan(100)
})
