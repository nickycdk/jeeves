// AC-32 P (ST-11.4): /jeeves stats over 50 tasks in < 100 ms. Timing only, so it runs locally (`claude plugin test .`,
// scripts/check-all.sh) and not in CI, where shared runners make the time noise (failed and passed on the same code).
import { expect, test } from 'claude-code/testing'
import { bottom, relay, start } from '../mod/kit.ts'
import { memHost } from '../mod/memfs.ts'

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
    h.files.set(`${d}/events.jsonl`, [1, 2].map(n => JSON.stringify({ v: 1, at: '2026-11-08T10:00:00.000Z', taskId: 'x', rotationId: `r${n}`, from: 'ROTATING', to: 'RESTORING', code: 'THRESHOLD', pct: 50, sessionId: null, detail: '' })).join('\n') + '\n')
    for (const n of [1, 2]) h.files.set(`${d}/sessions/00${n}.json`, JSON.stringify({ schemaVersion: 1, sessionId: `s${n}`, startedAt: `2026-11-08T1${n}:00:00.000Z`, endedAt: null, endReason: 'clear', startPct: 4, endPct: 50, costUsd: 0.1 }))
  }
  // Best of 3: this machine runs at high load averages, so one sample measures the scheduler, not the code.
  let ms = Infinity, text = ''
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now()
    text = await relay($, 'stats')
    ms = Math.min(ms, performance.now() - t0)
  }
  expect(text).toContain('Tasks: 51')
  expect(text).toContain('Rotations: 100  Sessions: 100')
  expect(ms).toBeLessThan(100)
})
