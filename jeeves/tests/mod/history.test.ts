// ST-7.2: /jeeves history lists the last 20 state changes (time, from > to, code, %) and a rotations summary,
// readable at 80 columns, with no secrets; it only reads, so anyone may call it.
import type { SessionMeasureInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { bottom, engineClear, generating, handover, relay, start, stateOf, stop, turnEnd, until } from './kit.ts'
import { memHost } from './memfs.ts'

test('after a rotation: summary, every change in order with code and %, each line <= 80 columns', async ($, on) => {
  const g = await generating($, on)
  const { h, dir, ctl } = g
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  ctl.onClear = async () => { await engineClear($, h, 'sess-2') }
  await turnEnd($)
  await until(h, () => stateOf(h, dir).status === 'CONTINUING')
  await $.session.measure({ context: { window: 1_000_000, percent: 4 }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
  const text = await relay($, 'history', 'plugin')
  const lines = text.split('\n')
  expect(lines[0]).toBe(`Task ${g.taskId}: MONITORING`)
  expect(lines[1]).toBe('Rotations: 1  Session: 2  Failed handovers in a row: 0')
  expect(lines[2]).toBe('State changes (times in UTC):')
  expect(lines.slice(3).map(l => l.replace(/^\d\d-\d\d \d\d:\d\d /, '').replace(/  .*$/, ''))).toEqual([
    'DISABLED > MONITORING',
    'MONITORING > ROTATION_REQUESTED THRESHOLD 52%',
    'ROTATION_REQUESTED > HANDOVER_GENERATING THRESHOLD 52%',
    'HANDOVER_GENERATING > VALIDATING THRESHOLD 52%',
    'VALIDATING > ROTATING THRESHOLD 52%',
    'ROTATING > RESTORING THRESHOLD 52%',
    'RESTORING > CONTINUING THRESHOLD 52%',
    'CONTINUING > MONITORING 4%',
  ])
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(80)
})

test('more than 20 changes: only the last 20, said so; a secret in an event detail stays redacted; no task says so', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  expect(await relay($, 'history')).toBe('No managed task. Start with /jeeves on')
  await relay($, 'on')
  const dir = Object.keys(Object.fromEntries(h.files)).find(f => f.endsWith('/state.json'))!.replace('/state.json', '')
  for (let i = 0; i < 12; i++) { await relay($, 'pause'); await relay($, 'resume') }
  const ev = `${dir}/events.jsonl`
  h.files.set(ev, h.files.get(ev)! + JSON.stringify({ v: 1, at: '2026-11-08T10:00:00.000Z', taskId: 'x', rotationId: null, from: 'MONITORING', to: 'PAUSED', code: 'USER_PAUSE', pct: null, sessionId: null, detail: 'token [REDACTED:api-key] '.repeat(10) }) + '\n')
  const lines = (await relay($, 'history')).split('\n')
  expect(lines[2]).toBe('Last 20 of 26 state changes (times in UTC):')
  expect(lines.length).toBe(23)
  expect(lines.at(-1)).toMatch(/^11-08 10:00 MONITORING > PAUSED USER_PAUSE  token \[REDACTED:api-key\]/)
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(80)
  await relay($, 'off')
  expect((await relay($, 'history')).split('\n')[0]).toMatch(/: DISABLED$/)
})
