import { expect, test } from 'claude-code/testing'
import { memHost } from './memfs.ts'
import type { SessionMeasureInput } from 'claude-code'
import { bottom, PROMPT, relay, start as kitStart, stateOf, stop, submit, taskDirs, turnEnd, turnStart } from './kit.ts'

const SKIPPED = 'Jeeves cannot hand over in this session: its Stop hook does not run (a plugin above it, such as cc-plugin-sec-default on Team accounts, skips it). Automatic rotation is off. See troubleshooting.'

const start = ($: { session: { start: (e: { cwd: string; surface: 'terminal'; isInteractive: boolean }) => Promise<unknown> } }) =>
  $.session.start({ cwd: '/work/proj', surface: 'terminal', isInteractive: true })

test('supported version: mode full, no warning, state folder created user-only', async ($, on) => {
  const h = memHost(on, { HOME: '/home/t' })
  await start($)
  expect(h.toasts).toEqual([])
  expect(h.status).toEqual([])
  expect(h.argv).toContainEqual(['mkdir', '-p', '/home/t/.local/state/jeeves'])
  expect(h.argv).toContainEqual(['chmod', '700', '/home/t/.local/state/jeeves'])
})

test('below the supported range: unsupported, with the exact required version, and no automation', async ($, on) => {
  const h = memHost(on)
  h.version = '2.1.300'
  await start($)
  expect(h.toasts).toEqual(['Jeeves needs Claude Code 2.1.319 or later (this is 2.1.300). Automatic rotation is off. Update Claude Code (claude update) and restart the session.'])
  expect(h.status).toEqual(['off: needs Claude Code 2.1.319+'])
})

test('a primitive that fails its harmless probe call: assisted, said plainly', async ($, on) => {
  const h = memHost(on)
  h.failProcess = true
  await start($)
  expect(h.status).toEqual(['assisted mode'])
  expect(h.toasts[0]).toContain('assisted mode: this Claude Code lacks $.process.run')
})

test('never edits Claude settings', async ($, on) => {
  memHost(on)
  const writes: string[] = []
  on('config.set', (_, e) => { writes.push(JSON.stringify(e)); return { value: undefined } as never })
  await start($)
  expect(writes).toEqual([])
})

// R-25: a plugin in a higher tier (cc-plugin-sec-default on Team orgs, 2.1.319) passes classic.Stop on past Jeeves.
test('a main turn that answers without reaching the Stop hook: unsupported, said once, /jeeves on refused', async ($, on) => {
  const h = memHost(on)
  await start($)
  await turnStart($); await turnEnd($)
  await turnStart($, 't2'); await turnEnd($, 'answer', 't2')
  expect(h.status).toEqual(['off: Stop hook skipped'])
  expect(h.toasts).toEqual([SKIPPED])
  expect(await relay($, 'status')).toContain('mode: unsupported')
  expect(await relay($, 'on')).toBe(SKIPPED)
})

test('a turn whose Stop reaches Jeeves, an aborted turn, or a subagent turn: still full', async ($, on) => {
  const h = memHost(on)
  await start($)
  await turnStart($); await stop($, 'done'); await turnEnd($)
  await turnStart($, 't2'); await turnEnd($, 'aborted', 't2')
  await $.turn.start({ text: 'x', turnId: 't3', agentId: 'a1' }); await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer', agentId: 'a1' })
  expect(h.status).toEqual([])
  expect(h.toasts).toEqual([])
  expect(await relay($, 'status')).toContain('mode: full')
})

test('review fix: a task started before the skip was found never requests, holds a prompt or rotates; an interrupt is no skip', async ($, on) => {
  const h = memHost(on)
  const got = bottom(on)
  await kitStart($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await turnStart($); await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'answer' })
  expect(await relay($, 'status')).toContain('mode: full')
  await turnStart($, 't2'); await turnEnd($, 'answer', 't2')
  await $.session.measure({ context: { window: 1_000_000, percent: 95 }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  await submit($, 'next step')
  expect(got.map(g => g.text)).toContain('next step')
  for (const cmd of ['rotate', 'retry', 'resume']) expect(await relay($, cmd)).toBe(SKIPPED)
  expect(stateOf(h, dir).status).toBe('MONITORING')
})
