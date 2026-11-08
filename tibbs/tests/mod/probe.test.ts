import { expect, test } from 'claude-code/testing'
import { memHost } from './memfs.ts'

const start = ($: { session: { start: (e: { cwd: string; surface: 'terminal'; isInteractive: boolean }) => Promise<unknown> } }) =>
  $.session.start({ cwd: '/work/proj', surface: 'terminal', isInteractive: true })

test('supported version: mode full, no warning, state folder created user-only', async ($, on) => {
  const h = memHost(on, { HOME: '/home/t' })
  await start($)
  expect(h.toasts).toEqual([])
  expect(h.status).toEqual([])
  expect(h.argv).toContainEqual(['mkdir', '-p', '/home/t/.local/state/tibbs'])
  expect(h.argv).toContainEqual(['chmod', '700', '/home/t/.local/state/tibbs'])
})

test('below the supported range: unsupported, with the exact required version, and no automation', async ($, on) => {
  const h = memHost(on)
  h.version = '2.1.300'
  await start($)
  expect(h.toasts).toEqual(['Tibbs needs Claude Code 2.1.319 or later (this is 2.1.300). Automatic rotation is off. Update Claude Code (claude update) and restart the session.'])
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
