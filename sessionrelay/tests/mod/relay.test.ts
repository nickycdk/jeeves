import { expect, test } from 'claude-code/testing'
import { memHost } from './memfs.ts'

const ROOT = '/home/t/.local/state/sessionrelay'
const startSession = (t: { session: { start: (e: { cwd: string; surface: 'terminal'; isInteractive: boolean }) => Promise<unknown> } }) =>
  t.session.start({ cwd: '/work/proj', surface: 'terminal', isInteractive: true })
// What the person typing `/<command> <args>` at an 80-column prompt sends.
const typed = (command: string, args: string) => ({ command, args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } })
const sha16 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)

test('/relay status with no task: mode full and how to start, within 8 lines x 40 columns', async ($, on) => {
  const h = memHost(on, { HOME: '/home/t' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await startSession($)
  expect(h.registered).toEqual(['relay'])
  const r = await $.command.run(typed('relay', 'status'))
  const lines = (r.text ?? '').split('\n')
  expect(lines[0]).toBe('SessionRelay  mode: full')
  expect(lines).toContain('No managed task. Start with /relay on')
  expect(lines.length).toBeLessThanOrEqual(8)
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(40)
})

test('/relay status reads the task state through $.fs', async ($, on) => {
  const h = memHost(on, { HOME: '/home/t' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const dir = `${ROOT}/projects/${await sha16('nogit|/work/proj')}/tasks/t_20261107_k3m9qa`
  h.files.set(`${dir}/state.json`, JSON.stringify({
    schemaVersion: 1, taskId: 't_20261107_k3m9qa', projectId: 'p', status: 'MONITORING', reason: null, mode: 'full', taskRevision: 1,
    sessionSequence: 1, activeSessionId: 'sess-test', rotation: null, lastValidatedHandover: null, rotationCount: 0, consecutiveFailures: 0,
    thresholdPercent: 50, lastContext: { window: 1000000, percent: 18, at: '2026-11-07T08:00:00Z' }, armedFired: false, warnedSessionId: null,
    heldPrompts: [], taskStartHead: null, lastErrorCode: null, updatedAt: '2026-11-07T08:00:00Z',
  }))
  h.dirs.add(dir)
  await startSession($)
  const text = (await $.command.run(typed('relay', ''))).text ?? ''
  expect(text).toContain('Task: t_20261107_k3m9qa')
  expect(text).toContain('State: MONITORING')
  expect(text).toContain('Context: 18%  Threshold: 50%')
})

test('unknown subcommand shows help; help lists the commands', async ($, on) => {
  memHost(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await startSession($)
  const unknown = (await $.command.run(typed('relay', 'frobnicate now'))).text ?? ''
  expect(unknown).toContain('Unknown command "frobnicate".')
  expect(unknown).toContain('/relay status')
  expect((await $.command.run(typed('relay', 'help'))).text).toContain('SessionRelay commands:')
})

test('name collision: falls back to /sessionrelay and says so; /relay stays the other owner\'s', async ($, on) => {
  const h = memHost(on)
  h.commands = [{ name: 'relay', description: 'someone else', source: 'plugin', plugin: 'other' }]
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', (_, e) => ({ text: `engine ran /${e.command}` }))
  await startSession($)
  expect(h.registered).toEqual(['sessionrelay'])
  expect(h.toasts).toContain('/relay is taken by another command, so SessionRelay uses /sessionrelay.')
  expect((await $.command.run(typed('relay', 'status'))).text).toBe('engine ran /relay')
  expect((await $.command.run(typed('sessionrelay', 'status'))).text).toContain('mode: full')
})

test('a state root failure is reported in status, not thrown', async ($, on) => {
  memHost(on, {})
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await startSession($)
  const text = (await $.command.run(typed('relay', 'status'))).text ?? ''
  expect(text).toContain('State folder: error')
})
