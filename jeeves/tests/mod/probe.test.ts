import { expect } from 'claude-code/testing'
import { memHost } from './memfs.ts'
import type { SessionMeasureInput } from 'claude-code'
import { bottom, PROMPT, relay, start as kitStart, stateOf, stop, submit, taskDirs, turnEnd, turnStart, test, until } from './kit.ts'

const REFUSED = 'Jeeves cannot ask for a handover in this session: its Stop hook does not run here and Claude Code refused a prompt Jeeves sent. Automatic rotation is off. See troubleshooting.'

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

// R-25 / ADR-002 A3: a plugin in a higher tier (cc-plugin-sec-default on Team orgs, 2.1.319) passes classic.Stop on past Jeeves.
test('ST-16.1: a main turn that answers without reaching the Stop hook: turn mode, mode stays full, every command accepted', async ($, on) => {
  const h = memHost(on)
  await start($)
  await turnStart($); await turnEnd($)
  await turnStart($, 't2'); await turnEnd($, 'answer', 't2')
  expect(h.status).toEqual([])
  expect(h.toasts).toEqual([])
  expect(await relay($, 'status')).toContain('mode: full (turn)')
  expect(await relay($, 'status --diagnose')).toContain('Mode: full (turn: Stop hook skipped)')
  expect(await relay($, 'on')).toContain('Jeeves on: task')
})

test('ST-16.1: a turn whose Stop reaches Jeeves, an aborted turn, or a subagent turn: stop mode', async ($, on) => {
  const h = memHost(on)
  await start($)
  await turnStart($); await stop($, 'done'); await turnEnd($)
  await turnStart($, 't2'); await turnEnd($, 'aborted', 't2')
  await $.turn.start({ text: 'x', turnId: 't3', agentId: 'a1' }); await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer', agentId: 'a1' })
  expect(h.status).toEqual([])
  expect(h.toasts).toEqual([])
  const s = await relay($, 'status')
  expect(s).toContain('mode: full')
  expect(s).not.toContain('(turn)')
})

test('ST-16.1: a task started before the skip carries on in turn mode; rotate, retry and resume are answered, not refused', async ($, on) => {
  const h = memHost(on)
  const got = bottom(on)
  await kitStart($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await turnStart($); await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'answer' })
  expect(await relay($, 'status')).not.toContain('(turn)')
  await turnStart($, 't2'); await turnEnd($, 'answer', 't2')
  expect(await relay($, 'status')).toContain('mode: full (turn)')
  await submit($, 'next step')
  expect(got.map(g => g.text)).toContain('next step')
  expect(stateOf(h, dir).status).toBe('MONITORING')
  for (const cmd of ['rotate', 'retry', 'resume']) expect(await relay($, cmd)).not.toContain('Automatic rotation is off')
})

test('ST-16.1: a later session start in the same process keeps turn mode, no toast', async ($, on) => {
  const h = memHost(on)
  await start($)
  await turnStart($); await turnEnd($)
  await start($)
  expect(h.status).toEqual([])
  expect(h.toasts).toEqual([])
  expect(await relay($, 'status')).toContain('mode: full (turn)')
})

test('ST-16.1 (ADR-002 A3): a refused submit in turn mode -> unsupported, said once, then nothing starts; in stop mode it stays full', async ($, on) => {
  const h = memHost(on)
  const refuse: { drop?: (text: string) => boolean } = {}
  bottom(on, refuse)
  await start($)
  refuse.drop = t => t === 'stop goal'
  await relay($, 'on stop goal')
  await until(h, () => h.toasts.some(t => t.startsWith('Jeeves could not send your goal')))
  await relay($, 'off')
  expect(await relay($, 'status')).toContain('mode: full')
  await turnStart($); await turnEnd($)
  refuse.drop = t => t === 'turn goal'
  await relay($, 'on turn goal')
  await until(h, () => h.toasts.includes(REFUSED))
  expect(h.status.at(-1)).toBe('off: prompt refused')
  expect(h.toasts.filter(t => t === REFUSED)).toHaveLength(1)
  expect(await relay($, 'status')).toContain('mode: unsupported (turn)')
  expect(await relay($, 'rotate')).toBe(REFUSED)
  await start($)
  expect(h.toasts.filter(t => t === REFUSED)).toHaveLength(1)
  expect(h.status.at(-1)).toBe('off: prompt refused')
})
