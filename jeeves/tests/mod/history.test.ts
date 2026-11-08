// ST-7.2: /jeeves history lists the last 20 state changes (time, from > to, code, %) and a rotations summary,
// readable at 80 columns, with no secrets; it only reads, so anyone may call it.
import type { SessionMeasureInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { bottom, engineClear, generating, handover, relay, sha256, start, stateOf, stop, turnEnd, until, type Kit } from './kit.ts'
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
  // ST-11.3: the live event carries the handover's hash, unredacted, so --full can check it.
  expect((await relay($, 'history --full')).split('\n')).toContain('  history/handover-001.md')
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

// ---- ST-11.3: /jeeves history --full ----

const hoText = (n: number, next: string) => `# Jeeves handover ${String(n).padStart(3, '0')}\n\n## Exact next actions\n1. [inferred] ${next}\n2. [inferred] Then run the tests.\n3. [inferred] Third.\n4. [inferred] Fourth.\n\n## Do not repeat / do not change\n- x\n`
const sess = (n: number, startPct: number | null, endPct: number | null, cost?: number) => JSON.stringify({ schemaVersion: 1, sessionId: `s${n}`, startedAt: '2026-11-08T10:00:00.000Z', endedAt: '2026-11-08T11:00:00.000Z', endReason: 'clear', startPct, endPct, ...(cost === undefined ? {} : { costUsd: cost }) })

async function twoRotations($: Kit, on: Parameters<typeof memHost>[0]) {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  const dir = [...h.files.keys()].find(f => f.endsWith('/state.json'))!.replace('/state.json', '')
  const refs: string[] = []
  for (const [n, next] of [[1, 'Fix precedence in src/parse.js — café'], [2, 'Add the CLI flag']] as const) {
    const text = hoText(n, next)
    h.files.set(`${dir}/history/handover-00${n}.md`, text)
    refs.push(`history/handover-00${n}.md#sha256:${await sha256(text)}`)
    const ev = { v: 1, at: '2026-11-08T10:00:00.000Z', taskId: 'x', rotationId: `r${n}`, from: 'VALIDATING', to: 'ROTATING', code: 'THRESHOLD', pct: 52, sessionId: null, detail: refs.at(-1) }
    h.files.set(`${dir}/events.jsonl`, h.files.get(`${dir}/events.jsonl`)! + JSON.stringify(ev) + '\n')
  }
  h.files.set(`${dir}/sessions/001.json`, sess(1, 3, 52, 0.4213))
  h.files.set(`${dir}/sessions/002.json`, sess(2, 4.5, 51))
  return { h, dir }
}

test('ST-11.3 AC 1, 4: --full lists each rotation: sessions, context, cost or unknown, end reason, file and next actions; ASCII, 50 columns', async ($, on) => {
  await twoRotations($, on)
  const plain = await relay($, 'history')
  const full = await relay($, 'history --full')
  expect(full.startsWith(plain)).toBe(true)
  const extra = full.slice(plain.length)
  for (const want of ['Rotation 1: session 1 > 2', 'context 3% > 52%, cost $0.42', 'ended: clear', 'history/handover-001.md', '1. [inferred] Fix precedence', 'Rotation 2: session 2 > 3', 'cost unknown', 'Add the CLI flag']) expect(extra).toContain(want)
  expect(extra).not.toContain('Fourth')
  for (const l of extra.split('\n')) { expect(l.length).toBeLessThanOrEqual(50); expect(/^[\x20-\x7e]*$/.test(l)).toBe(true) }
})

test('ST-11.3 AC 2, 3: a missing or changed handover is reported, not printed; without --full nothing changes', async ($, on) => {
  const { h, dir } = await twoRotations($, on)
  const plain = await relay($, 'history')
  h.files.delete(`${dir}/history/handover-001.md`)
  h.files.set(`${dir}/history/handover-002.md`, hoText(2, 'edited later'))
  const full = await relay($, 'history --full')
  expect(full).toContain('handover-001.md: missing')
  expect(full).toContain('handover-002.md: changed since saved')
  expect(full).not.toContain('edited later')
  expect(await relay($, 'history')).toBe(plain)
})
