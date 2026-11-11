// ST-11.1: per-project defaults (ADR-009 A2): `/jeeves defaults ...`, kept in projects/<projectId>/config.json in the
// state folder, copied into a new task at /jeeves on; a running task is never changed.
import { expect } from 'claude-code/testing'
import { bottom, PROMPT, relay, start, stateOf, submit, taskDirs, test } from './kit.ts'
import { memHost } from './memfs.ts'

const configOf = (h: ReturnType<typeof memHost>) => [...h.files.keys()].find(f => /\/projects\/[^/]+\/config\.json$/.test(f))

async function setup(on: Parameters<typeof memHost>[0]) {
  const h = memHost(on)
  bottom(on)
  return h
}

test('AC 1: defaults set here apply to the next /jeeves on here (threshold, checks as revisions), not in another project', async ($, on) => {
  const h = await setup(on)
  await start($)
  expect(await relay($, 'defaults')).toContain('No defaults set')
  expect(await relay($, 'defaults threshold 65')).toContain('65%')
  expect(await relay($, 'defaults check npm test')).toContain('npm test')
  await relay($, 'defaults check npm run lint')
  const shown = await relay($, 'defaults')
  for (const want of ['Threshold: 65%', 'Handover limit: 30 (Jeeves default)', 'npm test', 'npm run lint']) expect(shown).toContain(want)
  expect(JSON.parse(h.files.get(configOf(h)!)!)).toEqual({ schemaVersion: 1, thresholdPercent: 65, verificationCommands: ['npm test', 'npm run lint'] })
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  const s = stateOf(h, dir)
  expect([s.thresholdPercent, s.taskRevision]).toEqual([65, 3])
  expect(await relay($, 'task')).toContain('npm run lint')
  // another project: nothing applies
  await relay($, 'off')
  h.dirs.add('/work/other')
  h.cwd = '/work/other'
  await start($) // a session in the other project
  expect(await relay($, 'defaults')).toContain('No defaults set')
  await relay($, 'on')
  const other = taskDirs(h).find(d => d !== dir)!
  expect(stateOf(h, other).thresholdPercent).toBe(40)
})

test('defaults limit: copied into the next /jeeves on here as the task\'s limit, not in another project; config.json is v2 while it is set', async ($, on) => {
  const h = await setup(on)
  await start($)
  for (const bad of ['0', '101', 'abc']) expect(await relay($, `defaults limit ${bad}`)).toContain('whole number from 1 to 100')
  expect(configOf(h)).toBeUndefined()
  expect(await relay($, 'defaults limit 7')).toBe('Default handover limit for this project: 7. It applies from the next /jeeves on here; running tasks are not changed.')
  expect(JSON.parse(h.files.get(configOf(h)!)!)).toEqual({ schemaVersion: 2, verificationCommands: [], maxRotations: 7 })
  const shown = await relay($, 'defaults')
  for (const want of ['Threshold: 40% (Jeeves default)', 'Handover limit: 7\n']) expect(shown).toContain(want)
  await relay($, 'on')
  const dir = taskDirs(h)[0]!
  expect([stateOf(h, dir).maxRotations, stateOf(h, dir).thresholdPercent]).toEqual([7, 40])
  expect(await relay($, 'status')).toContain('Rotations: 0/7')
  await relay($, 'off')
  h.dirs.add('/work/other')
  h.cwd = '/work/other'
  await start($)
  await relay($, 'on')
  expect('maxRotations' in stateOf(h, taskDirs(h).find(d => d !== dir)!)).toBe(false)
})

test('AC 1: with a goal the checks follow it as revisions 2..', async ($, on) => {
  const h = await setup(on)
  await start($)
  await relay($, 'defaults check npm test')
  await relay($, 'on fix the parser')
  expect(stateOf(h, taskDirs(h)[0]!).taskRevision).toBe(2)
})

test('AC 2, 3: a running task is unchanged when defaults change; invalid values are refused with the range', async ($, on) => {
  const h = await setup(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  const before = h.files.get(`${dir}/state.json`)
  await relay($, 'defaults threshold 70')
  await relay($, 'defaults check npm test')
  expect(h.files.get(`${dir}/state.json`)).toBe(before)
  expect(await relay($, 'defaults threshold 95')).toContain('20 to 90')
  expect(await relay($, 'defaults threshold abc')).toContain('20 to 90')
  expect(await relay($, 'defaults check')).toContain('Usage')
  expect(await relay($, 'defaults nonsense')).toContain('Usage')
})

test('AC 4: a corrupt config.json is ignored with a warning; the task still starts', async ($, on) => {
  const h = await setup(on)
  await start($)
  await relay($, 'defaults threshold 70')
  h.files.set(configOf(h)!, '{ not json')
  expect(await relay($, 'defaults')).toContain('unreadable')
  const reply = await relay($, 'on')
  expect(reply).toContain('Jeeves on')
  expect(reply).toContain('defaults unreadable')
  expect(stateOf(h, taskDirs(h)[0]!).thresholdPercent).toBe(40)
  expect(await relay($, 'status')).toContain('defaults unreadable')
  // review fix: a change never overwrites the unreadable file (it may be a newer Jeeves's); clear still resets it
  for (const cmd of ['defaults threshold 60', 'defaults check npm test']) expect(await relay($, cmd)).toContain('unreadable')
  expect(h.files.get(configOf(h)!)).toBe('{ not json')
  await relay($, 'defaults clear')
  expect(await relay($, 'defaults threshold 60')).not.toContain('unreadable')
})

test('AC 5, 6: clear removes them; purge --project removes the file; only typed commands change them', async ($, on) => {
  const h = await setup(on)
  await start($)
  expect(await relay($, 'defaults threshold 70', 'plugin')).toContain('Only you can')
  expect(configOf(h)).toBeUndefined()
  expect(await relay($, 'defaults', 'plugin')).toContain('No defaults set')
  await relay($, 'defaults threshold 70')
  expect(await relay($, 'defaults clear')).toContain('cleared')
  expect(await relay($, 'defaults')).toContain('No defaults set')
  await relay($, 'defaults threshold 70')
  const code = /purge confirm (\S+)/.exec(await relay($, 'purge --project'))![1]
  await relay($, `purge confirm ${code}`)
  expect(configOf(h)).toBeUndefined()
})

test('ST-11.2: /jeeves on suggests checks from package.json and Makefile when none are set; never adds them', async ($, on) => {
  const h = await setup(on)
  h.files.set('/work/proj/package.json', JSON.stringify({ scripts: { test: 'node --test', typecheck: 'tsc', 'bad;name': 'x' } }))
  await start($)
  const reply = await relay($, 'on')
  expect(reply).toContain('Suggested checks: /jeeves check npm test, /jeeves check npm run typecheck')
  expect(reply).not.toContain('bad')
  expect(stateOf(h, taskDirs(h)[0]!).pendingChanges ?? []).toEqual([])
})

test('ST-11.2: the lockfile picks the runner; Go and Python with uv are suggested too', async ($, on) => {
  const h = await setup(on)
  h.files.set('/work/proj/package.json', JSON.stringify({ scripts: { test: 'vitest' } }))
  h.files.set('/work/proj/pnpm-lock.yaml', 'lockfileVersion: 9')
  h.files.set('/work/proj/go.mod', 'module x')
  h.files.set('/work/proj/pyproject.toml', 'dev = ["pytest"]')
  h.files.set('/work/proj/uv.lock', '')
  await start($)
  expect(await relay($, 'on')).toContain('Suggested checks: /jeeves check pnpm test, /jeeves check uv run pytest, /jeeves check go test ./..., /jeeves check go vet ./...')
})

test('ST-11.2: no suggestion line when defaults set checks, or the repository has nothing to suggest', async ($, on) => {
  const h = await setup(on)
  await start($)
  expect(await relay($, 'on')).not.toContain('Suggested')
  await relay($, 'off')
  h.files.set('/work/proj/package.json', JSON.stringify({ scripts: { test: 'x' } }))
  await relay($, 'defaults check make test')
  expect(await relay($, 'on')).not.toContain('Suggested')
})
