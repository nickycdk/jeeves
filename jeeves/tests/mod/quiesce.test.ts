// ST-3.2: one soft-quiesce note per rotation, at the first main-loop tool result after the request; never while paused.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { QUIESCE_NOTE } from '../../src/core/handover/template.ts'
import { bottom, PROMPT, relay, start, stateOf, submit, taskDirs, until, type Kit, test } from './kit.ts'
import { memHost } from './memfs.ts'

const measure = ($: Kit, percent: number) =>
  $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)

async function onTask($: Kit, on: Parameters<typeof memHost>[0]) {
  const h = memHost(on)
  bottom(on)
  const notes: string[] = []
  on('session.append', (_, e, next) => {
    notes.push(e.message.content.map(b => String(b.text ?? '')).join(''))
    return next(e)
  })
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  return { h, dir: taskDirs(h)[0]!, notes }
}
const bash = ($: Kit, command: string, agentId?: string) => $.tool.call({ tool: 'Bash', command, ...(agentId ? { agentId } : {}) })

test('exactly one note per rotation, however many tool results follow', async ($, on) => {
  const { h, dir, notes } = await onTask($, on)
  await bash($, 'echo before')
  await until(h, () => stateOf(h, dir).ledger.length === 1)
  expect(notes).toEqual([])
  await measure($, 52)
  for (let i = 0; i < 4; i++) await bash($, `echo ${i}`)
  await until(h, () => stateOf(h, dir).ledger.length === 5)
  expect(notes).toEqual([QUIESCE_NOTE])
  expect(stateOf(h, dir).rotation.noteAppended).toBe(true)
})

test('a subagent tool result is not the quiesce point', async ($, on) => {
  const { h, dir, notes } = await onTask($, on)
  await measure($, 52)
  await bash($, 'echo sub', 'agent-1')
  await until(h, () => stateOf(h, dir).ledger.length === 1)
  expect(notes).toEqual([])
  await bash($, 'echo main')
  await until(h, () => notes.length === 1)
})

test('never during PAUSED', async ($, on) => {
  const { h, dir, notes } = await onTask($, on)
  await measure($, 52)
  await relay($, 'pause')
  for (let i = 0; i < 3; i++) await bash($, `echo ${i}`)
  await until(h, () => stateOf(h, dir).ledger.length === 3)
  expect(stateOf(h, dir).status).toBe('PAUSED')
  expect(notes).toEqual([])
})

test('debug run 3: with no session.measure at all, the reading at a main tool result requests the rotation and the note goes out there', async ($, on) => {
  const { h, dir, notes } = await onTask($, on)
  await bash($, 'echo 1')
  await until(h, () => stateOf(h, dir).ledger.length === 1)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  h.usage = { window: 1_000_000, percent: 51, tokens: 505_000 }
  await bash($, 'echo 2')
  await until(h, () => notes.length === 1)
  const s = stateOf(h, dir)
  expect([s.status, s.lastContext.percent, s.ledger.length]).toEqual(['ROTATION_REQUESTED', 50.5, 2])
  await bash($, 'echo 3')
  await until(h, () => stateOf(h, dir).ledger.length === 3)
  expect(notes).toEqual([QUIESCE_NOTE])
})
