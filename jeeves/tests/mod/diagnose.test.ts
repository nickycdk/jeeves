// ST-8.3: /jeeves status --diagnose gives versions, probe mode, state folder (source, writable), git, task and lock,
// with the home folder shown as ~ and secrets redacted; it only reads, so anyone may call it.
import { expect, test } from 'claude-code/testing'
import { bottom, fakeGit, PROMPT, relay, start, submit } from './kit.ts'
import { memHost } from './memfs.ts'

test('a running task: every line present, home as ~, no session id in full, nothing changed', async ($, on) => {
  const h = memHost(on, { HOME: '/home/t' })
  fakeGit(h)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const files = new Map(h.files)
  const text = await relay($, 'status --diagnose', 'plugin')
  const lines = text.split('\n')
  expect(lines[0]).toBe('Jeeves diagnose (safe to paste: home folder shown as ~, secrets redacted)')
  expect(lines).toContain('Claude Code: 2.1.319, needs 2.1.319+')
  expect(lines).toContain('Mode: full')
  expect(lines).toContain('OS: Linux')
  expect(lines).toContain('State folder: ~/.local/state/jeeves (os-default), writable: yes')
  expect(text).toMatch(/\nGit: not found; this folder: repository, project [0-9a-f]{16}\n/)
  expect(text).toMatch(/\nTask: t_\d{8}_[a-z0-9]{6} MONITORING, mode full, schema 2, rotations 0, session 1\n/)
  expect(lines).toContain('Lock: this session')
  expect(lines.at(-1)).toBe('Last error: none')
  expect(text).not.toContain('/home/t')
  expect(h.files).toEqual(files)
})

test('the home folder is replaced only as a whole path segment', async ($, on) => {
  const h = memHost(on, { HOME: '/home/t', JEEVES_TEST: '1', JEEVES_STATE_DIR: '/home/tom/jeeves' })
  bottom(on)
  await start($)
  expect(await relay($, 'status --diagnose')).toContain('State folder: /home/tom/jeeves (test-env)')
  void h
})

test('a secret in the state folder path is redacted; an unwritable folder and a missing primitive say so', async ($, on) => {
  const h = memHost(on, { HOME: '/home/t', JEEVES_TEST: '1', JEEVES_STATE_DIR: '/data/sk-ant-api03-abcdefghijklmnop/state' })
  bottom(on)
  h.failProcess = true
  await start($)
  const text = await relay($, 'status --diagnose')
  expect(text).not.toContain('sk-ant-api03-abcdefghijklmnop')
  expect(text).toContain('Mode: assisted, missing $.process.run')
  expect(text).toContain('Hint: plugins cannot start processes (an organization policy or a sandbox may block them)')
  expect(text).toContain('Task: none')
})
