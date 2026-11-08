// ST-8.1: /jeeves purge deletes task files only after a typed code, only under <state root>/projects, never a task
// running here or held by another live session; only the user can start it.
import { expect, test } from 'claude-code/testing'
import { bottom, relay, start, taskDirs } from './kit.ts'
import { memHost } from './memfs.ts'

const ROOT = '/home/t/.local/state/jeeves'
const codeOf = (text: string) => /purge confirm ([0-9a-f]{4})/.exec(text)![1]!

async function endedTask($: Parameters<typeof start>[0], on: Parameters<typeof memHost>[0]) {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  const dir = taskDirs(h)[0]!
  return { h, dir, id: dir.split('/').at(-1)! }
}

test('--task: lists the folder and a code; nothing goes until the code is typed; then only that folder goes', async ($, on) => {
  const { h, dir, id } = await endedTask($, on)
  expect(await relay($, `purge --task ${id}`)).toBe(`Task ${id} is still running in this session: /jeeves off first. Nothing was deleted.`)
  await relay($, 'off')
  const asked = await relay($, `purge --task ${id}`)
  expect(asked.split('\n')[0]).toBe(`This deletes task ${id}, for good:`)
  expect(asked).toContain(`  ${dir}`)
  expect(h.files.has(`${dir}/state.json`)).toBe(true)
  expect(await relay($, 'purge confirm 0000')).toBe('No purge waits for that code (codes last 2 minutes). Start again with /jeeves purge.')
  expect(await relay($, `purge confirm ${codeOf(asked)}`)).toBe('No purge waits for that code (codes last 2 minutes). Start again with /jeeves purge.')
  const again = await relay($, `purge --task ${id}`)
  expect(await relay($, `purge confirm ${codeOf(again)}`, 'plugin')).toBe('Only you can change a Jeeves task: type the /jeeves command yourself.')
  expect(await relay($, `purge confirm ${codeOf(again)}`)).toBe(`Deleted task ${id}.`)
  expect([...h.files.keys()].some(f => f.startsWith(dir))).toBe(false)
  expect([...h.files.keys()].some(f => f.startsWith(`${ROOT}/projects/`))).toBe(true)
})

test('a code expires after 2 minutes; a path in --task is never used; no scope gives the usage', async ($, on) => {
  const { h, id } = await endedTask($, on)
  await relay($, 'off')
  const asked = await relay($, `purge --task ${id}`)
  await h.clock.advance(121_000)
  expect(await relay($, `purge confirm ${codeOf(asked)}`)).toContain('No purge waits for that code')
  expect(await relay($, 'purge --task ../../..')).toBe('No task ../../.. in this project. /jeeves history shows the current one.')
  expect(await relay($, 'purge')).toMatch(/^Usage: \/jeeves purge --task <id> \| --project \| --all/)
  expect(h.argv.some(a => a[0] === 'rm' && !a[2]!.endsWith('/lock.d'))).toBe(false)
})

test('--all removes every project folder but keeps the state root; a live lock in another project stops it', async ($, on) => {
  const { h } = await endedTask($, on)
  await relay($, 'off')
  const other = `${ROOT}/projects/0123456789abcdef/tasks/t_20261107_aaaaaa`
  h.files.set(`${other}/lock.d/owner.json`, JSON.stringify({ schemaVersion: 1, ownerSessionId: 'sess-other', acquiredAt: '2026-11-07T08:00:00.000Z', heartbeatAt: '2026-11-07T08:00:00.000Z' }) + '\n')
  for (const d of [`${ROOT}/projects/0123456789abcdef`, `${ROOT}/projects/0123456789abcdef/tasks`, other, `${other}/lock.d`]) h.dirs.add(d)
  expect(await relay($, 'purge --all')).toBe('Task t_20261107_aaaaaa is held by a running session (LOCK_HELD). Nothing was deleted.')
  await h.clock.advance(121_000)
  const asked = await relay($, 'purge --all')
  expect(asked.split('\n').filter(l => l.startsWith('  ')).length).toBe(2)
  expect(await relay($, `purge confirm ${codeOf(asked)}`)).toBe('Deleted every Jeeves task on this machine.')
  expect([...h.files.keys()].some(f => f.startsWith(`${ROOT}/projects/`))).toBe(false)
  expect(h.dirs.has(ROOT)).toBe(true)
})
