// ST-6.6 / AC-18 (I layer): sessions in one project, in two worktrees and in two repositories never touch each other's
// task files (path audit), and a task has one owner. Discovery reads another task's state.json and lock owner only.
import { expect } from 'claude-code/testing'
import { bottom, engineClear, fakeGit, PROMPT, relay, start, stateOf, submit, taskDirs, type Kit, test } from './kit.ts'
import { memHost, type MemHost } from './memfs.ts'

const measure = ($: Kit, percent: number) => $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] })
const as = (h: MemHost, sid: string) => { h.sessionId = sid }
const taskOf = (h: MemHost, sid: string) => taskDirs(h).find(d => stateOf(h, d).activeSessionId === sid)!

/** Every access by `sid` that lands in another task's folder, other than the discovery reads (state.json, lock owner). */
function crossings(h: MemHost, sid: string, own: string) {
  return h.access.filter(a => a.sid === sid && a.path.includes('/tasks/') && !a.path.startsWith(`${own}/`) && a.path !== own)
    .filter(a => !(a.op === 'read' && /\/tasks\/[^/]+\/(state\.json|lock\.d\/owner\.json)$/.test(a.path)))
}

async function twoTasks($: Kit, h: MemHost) {
  await start($)
  as(h, 'A')
  await relay($, 'on')
  await submit($, PROMPT)
  as(h, 'B')
  expect(await relay($, 'on')).toContain('Starting a separate task')
  await submit($, 'task B, word for word')
  return { a: taskOf(h, 'A'), b: taskOf(h, 'B') }
}

test('AC-18: two sessions in one project: separate tasks, interleaved work, no write or read into the other task beyond discovery', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  const { a, b } = await twoTasks($, h)
  h.access.length = 0
  for (const [sid, pct] of [['A', 20], ['B', 30], ['A', 46], ['B', 47], ['A', 21]] as const) { as(h, sid); await measure($, pct) }
  as(h, 'B')
  await relay($, 'dod tests pass')
  await relay($, 'pause')
  as(h, 'A')
  await relay($, 'check npm test')
  expect(crossings(h, 'A', a)).toEqual([])
  expect(crossings(h, 'B', b)).toEqual([])
  // The audit saw real work: each session wrote its own task and read the other's state.json to find its own.
  for (const [sid, own, other] of [['A', a, b], ['B', b, a]] as const) {
    expect(h.access.some(x => x.sid === sid && x.op === 'write' && x.path.startsWith(`${own}/`))).toBe(true)
    expect(h.access.some(x => x.sid === sid && x.op === 'read' && x.path === `${other}/state.json`)).toBe(true)
  }
  expect([stateOf(h, a).status, stateOf(h, a).taskRevision, stateOf(h, b).status, stateOf(h, b).taskRevision]).toEqual(['MONITORING', 2, 'PAUSED', 2])
  expect(h.files.get(`${a}/task-rev-001.md`)).toBe(PROMPT)
  expect(h.files.get(`${b}/task-rev-001.md`)).toBe('task B, word for word')
})

test('AC-18: same task twice -> LOCK_HELD for every change from the other session; its state is not written', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  const { a } = await twoTasks($, h)
  const before = h.files.get(`${a}/state.json`)
  as(h, 'B')
  await relay($, 'off')
  expect(await relay($, 'off')).toContain('(LOCK_HELD)')
  expect(await relay($, 'recover')).toContain('(LOCK_HELD)')
  expect(h.files.get(`${a}/state.json`)).toBe(before)
})

test('process identity: a fresh session after a /clear this process did not make never takes another process\'s clearing rotation', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  const { a } = await twoTasks($, h)
  // Process A (elsewhere) is mid-rotation: handover saved, its /clear scheduled.
  const s = stateOf(h, a)
  h.files.set(`${a}/state.json`, JSON.stringify({ ...s, status: 'ROTATING', reason: 'THRESHOLD', rotation: { rotationId: 'r_x', trigger: 'THRESHOLD', requestedAt: s.updatedAt, sourceSessionId: null, targetSessionId: null, step: 'CLEAR_SCHEDULED', retries: 0, quiesceCount: 0, noteAppended: false } }))
  const before = h.files.get(`${a}/state.json`)
  // This process (session B) gets a /clear of its own.
  as(h, 'B')
  const r = await engineClear($, h, 'B2')
  expect(r.additionalContext ?? []).toEqual([])
  expect(h.files.get(`${a}/state.json`)).toBe(before)
})

test('AC-18: two worktrees of one repository and a second repository get separate project folders; no cross writes', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  fakeGit(h)
  const main = h.git!
  await start($)
  as(h, 'A')
  await relay($, 'on')
  // A linked worktree: same common dir, its own top level.
  h.dirs.add('/work/wt')
  h.git = args => (args.join(' ') === 'rev-parse --git-common-dir --show-toplevel' ? { exitCode: 0, stdout: '/work/proj/.git\n/work/wt\n' } : main(args))
  h.cwd = '/work/wt'
  as(h, 'B')
  await start($)
  expect(await relay($, 'on')).not.toContain('LOCK_HELD')
  // A second repository.
  h.dirs.add('/work/other')
  h.git = undefined
  h.cwd = '/work/other'
  as(h, 'C')
  await start($)
  await relay($, 'on')
  const projects = new Set(taskDirs(h).map(d => d.replace(/\/tasks\/.*$/, '')))
  expect(projects.size).toBe(3)
  for (const sid of ['A', 'B', 'C']) {
    const own = taskOf(h, sid).replace(/\/tasks\/.*$/, '')
    const writes = h.access.filter(x => x.sid === sid && x.op !== 'read' && x.path.includes('/projects/'))
    expect(writes.filter(x => !x.path.startsWith(`${own}/`) && x.path !== own)).toEqual([])
  }
})
