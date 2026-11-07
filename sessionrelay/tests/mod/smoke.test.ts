import { expect, test } from 'claude-code/testing'

test('the module loads and session.start passes through', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const r = await $.session.start({ cwd: '/tmp/x', surface: 'terminal', isInteractive: true })
  expect(r.cwd).toBe('/tmp/x')
})
