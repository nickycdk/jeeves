// ST-2.1: /tibbs on|off and verbatim capture of the first prompt, through the plugin's own hooks.
import { expect, test } from 'claude-code/testing'
import { bottom, PROMPT, relay, start, stateOf, submit, taskDirs, until } from './kit.ts'
import { memHost, T0 } from './memfs.ts'

test('/tibbs on, then the next typed prompt is stored byte for byte as task-rev-001.md and passes unchanged', async ($, on) => {
  const h = memHost(on)
  const engine = bottom(on)
  await start($)
  const reply = await relay($, 'on')
  expect(reply).toContain('Your next prompt is saved word for word as the task.')
  const [dir] = taskDirs(h)
  expect(stateOf(h, dir!)).toMatchObject({ status: 'MONITORING', taskRevision: 0, activeSessionId: 'sess-test', mode: 'full' })
  expect(h.files.has(`${dir}/task-rev-001.md`)).toBe(false)
  expect(h.files.has(`${dir}/lock.d/owner.json`)).toBe(true)
  expect(await relay($, 'status')).toContain('Waiting for your first prompt')

  await submit($, PROMPT)
  expect(h.files.get(`${dir}/task-rev-001.md`)).toBe(PROMPT)
  expect(engine).toEqual([{ text: PROMPT, origin: 'composer' }])
  expect(stateOf(h, dir!).taskRevision).toBe(1)

  await submit($, 'a later prompt')
  expect(h.files.get(`${dir}/task-rev-001.md`)).toBe(PROMPT)
  expect(stateOf(h, dir!).taskRevision).toBe(1)
  expect(await relay($, 'status')).not.toContain('Waiting')
})

test('slash commands, meta prompts and prompts from anyone but the person are never captured', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, '/compact now', { kind: 'composer' }, { name: 'compact', args: 'now' })
  await submit($, 'from a plugin', { kind: 'plugin', name: 'other' })
  await submit($, 'a peer said', { kind: 'peer' })
  const [dir] = taskDirs(h)
  expect(h.files.has(`${dir}/task-rev-001.md`)).toBe(false)
  await submit($, 'the real task')
  expect(h.files.get(`${dir}/task-rev-001.md`)).toBe('the real task')
})

test('/tibbs on <goal>: the goal is rev 1 as typed and is sent as the first prompt', async ($, on) => {
  const h = memHost(on)
  const engine = bottom(on)
  await start($)
  const goal = 'Fix the 🚀 launcher\nand add tests'
  expect(await relay($, `on ${goal}`)).toContain('Your goal is saved word for word and sent as the first prompt.')
  await h.clock.settle()
  const [dir] = taskDirs(h)
  expect(h.files.get(`${dir}/task-rev-001.md`)).toBe(goal)
  expect(stateOf(h, dir!).taskRevision).toBe(1)
  expect(h.toasts).toEqual([])
  expect(engine).toEqual([{ text: goal, origin: 'plugin' }])
})

test('AC-03: without /tibbs on there are no task files and prompts pass untouched', async ($, on) => {
  const h = memHost(on)
  const engine = bottom(on)
  await start($)
  await submit($, PROMPT)
  await h.clock.advance(120_000)
  expect(taskDirs(h)).toEqual([])
  expect(engine).toEqual([{ text: PROMPT, origin: 'composer' }])
})

test('/tibbs off: DISABLED, lock released, every file kept (FR-11)', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const [dir] = taskDirs(h)
  const reply = await relay($, 'off')
  expect(reply).toContain('nothing was deleted')
  expect(stateOf(h, dir!).status).toBe('DISABLED')
  expect(h.files.has(`${dir}/lock.d/owner.json`)).toBe(false)
  expect(h.files.get(`${dir}/task-rev-001.md`)).toBe(PROMPT)
  const events = h.files.get(`${dir}/events.jsonl`)!.trim().split('\n').map(l => JSON.parse(l))
  expect(events.map(e => `${e.from}>${e.to}`)).toEqual(['DISABLED>MONITORING', 'MONITORING>MONITORING', 'MONITORING>DISABLED'])
  expect(await relay($, 'off')).toBe('No managed task. Start with /tibbs on')
  // Turning on again starts a new task; the old one stays.
  await relay($, 'on')
  expect(taskDirs(h).length).toBe(2)
})

test('LOCK_HELD: another live session\'s task stays its own; on starts a separate task (ST-6.6), off cannot end the other', async ($, on) => {
  const h = memHost(on)
  await start($)
  h.sessionId = 'sess-other'
  await relay($, 'on')
  const [dir] = taskDirs(h)
  h.sessionId = 'sess-test'
  const said = await relay($, 'on')
  expect(said).toContain(`Another running session owns task ${stateOf(h, dir!).taskId} here (LOCK_HELD); it stays that session's. Starting a separate task`)
  const mine = taskDirs(h).find(d => d !== dir)!
  expect(stateOf(h, mine).activeSessionId).toBe('sess-test')
  expect(await relay($, 'off')).toContain(stateOf(h, mine).taskId)
  expect(await relay($, 'off')).toContain('(LOCK_HELD)')
  expect(stateOf(h, dir!).status).toBe('MONITORING')
  // Once the owner is silent past 120 s, the lock is stale and off may take it.
  await h.clock.advance(121_000)
  expect(await relay($, 'off')).toContain('nothing was deleted')
  expect(stateOf(h, dir!).status).toBe('DISABLED')
})

test('only the person may change a task: a plugin-run /tibbs on is refused, status still answers', async ($, on) => {
  const h = memHost(on)
  await start($)
  expect(await relay($, 'on take over', 'plugin')).toBe('Only you can change a Tibbs task: type the /tibbs command yourself.')
  expect(taskDirs(h)).toEqual([])
  expect(await relay($, 'status', 'plugin')).toContain('No managed task.')
})

test('the lock heartbeat runs every 30 s while this session owns a task', async ($, on) => {
  const h = memHost(on)
  await start($)
  await relay($, 'on')
  const [dir] = taskDirs(h)
  const beat = () => JSON.parse(h.files.get(`${dir}/lock.d/owner.json`)!).heartbeatAt
  expect(beat()).toBe(new Date(T0).toISOString())
  await h.clock.advance(30_000)
  await until(h, () => beat() !== new Date(T0).toISOString())
  expect(beat()).toBe(new Date(T0 + 30_000).toISOString())
})

test('a disk error while capturing never blocks the prompt; the task keeps waiting for one', async ($, on) => {
  const h = memHost(on)
  const engine = bottom(on)
  await start($)
  await relay($, 'on')
  h.failWrite = p => p.endsWith('task-rev-001.md')
  await submit($, PROMPT)
  expect(engine).toEqual([{ text: PROMPT, origin: 'composer' }])
  const [dir] = taskDirs(h)
  expect(stateOf(h, dir!).taskRevision).toBe(0)
})
