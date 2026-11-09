// ST-6.5 / AC-23: a failed state write blocks the task (DISK) with the folder and the fix, keeping the last checkpoint;
// a switched branch or a moved repository is never continued without the user's /jeeves recover --relink.
import { expect } from 'claude-code/testing'
import { bottom, generating, handover, PROMPT, relay, start, stateOf, stop, submit, taskDirs, until, type Kit, test } from './kit.ts'
import { projectId } from '../../src/adapter/git.ts'
import { memHost, type MemHost } from './memfs.ts'

async function restart($: Kit, h: MemHost, sessionId = 'sess-2') {
  h.sessionId = sessionId
  await start($)
  await h.clock.advance(121_000)
}
const continuations = (prompts: { text: string }[]) => prompts.filter(p => p.text.includes('Jeeves: you are session'))

test('DISK: a failed state write -> BLOCKED(DISK), the toast names the folder and the fix; nothing rotates; /jeeves resume continues', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  let failures = 1
  h.failWrite = p => p.includes('state.json.tmp') && failures-- > 0
  await $.session.measure({ context: { window: 1_000_000, percent: 30 }, rateLimits: [], changed: ['context'] })
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['BLOCKED', 'DISK'])
  expect(h.toasts.at(-1)).toContain(`Blocked (DISK): Jeeves could not write its task files in ${dir}`)
  expect(h.notes.at(-1)).toMatch(/^Jeeves: blocked \(DISK\)/)
  expect(h.status.at(-1)).toBe('Jeeves: blocked (DISK)')
  expect(h.toasts.at(-1)).toContain('Free disk space or fix that folder\'s permissions, then type /jeeves resume.')
  await $.session.measure({ context: { window: 1_000_000, percent: 80 }, rateLimits: [], changed: ['context'] })
  expect(stateOf(h, dir).status).toBe('BLOCKED')
  expect(await relay($, 'resume')).toContain('Resumed')
  expect(stateOf(h, dir).status).toBe('MONITORING')
})

test('DISK: when even the BLOCKED write fails, the last checkpoint stays as it was and the status line says so', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  const before = h.files.get(`${dir}/state.json`)
  h.failWrite = p => p.includes('state.json.tmp')
  await $.session.measure({ context: { window: 1_000_000, percent: 30 }, rateLimits: [], changed: ['context'] })
  expect(h.files.get(`${dir}/state.json`)).toBe(before)
  expect(h.status.at(-1)).toBe('Jeeves: blocked, cannot write (DISK)')
})

test('REPO_MISMATCH: recover on another branch than the handover\'s -> BLOCKED, no continuation; --relink continues once', async ($, on) => {
  const g = await generating($, on, { git: true })
  const { h, dir, prompts } = g
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  expect(h.files.get(`${dir}/history/handover-001.md`)).toContain('- Branch: main')
  g.branch.name = 'feature/x'
  await restart($, h)
  const said = await relay($, 'recover')
  expect(said).toBe('Blocked (REPO_MISMATCH): the handover was written on branch main, but the repository is on feature/x. Nothing was continued. Switch back to main and type /jeeves recover, or type /jeeves recover --relink to continue on feature/x.')
  expect([stateOf(h, dir).status, stateOf(h, dir).reason, stateOf(h, dir).activeSessionId]).toEqual(['BLOCKED', 'REPO_MISMATCH', 'sess-2'])
  expect(await relay($, 'recover')).toContain('(REPO_MISMATCH)')
  await h.clock.settle()
  expect(continuations(prompts).length).toBe(0)
  expect(await relay($, 'recover --relink')).toContain('Recovering task')
  await until(h, () => continuations(prompts).length > 0)
  await h.clock.settle()
  expect(continuations(prompts).length).toBe(1)
  expect(stateOf(h, dir).status).toBe('CONTINUING')
})

test('REPO_MISMATCH: switching back to the handover\'s branch lets a plain /jeeves recover continue', async ($, on) => {
  const g = await generating($, on, { git: true })
  const { h, prompts } = g
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  g.branch.name = 'other'
  await restart($, h)
  expect(await relay($, 'recover')).toContain('(REPO_MISMATCH)')
  g.branch.name = 'main'
  expect(await relay($, 'recover')).toContain('Recovering task')
  await until(h, () => continuations(prompts).length === 1)
})

test('moved repository: the task is found by its old folder, named with the fix, and moved here only with --relink', async ($, on) => {
  const g = await generating($, on)
  const { h, dir, prompts } = g
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  h.dirs.delete('/work/proj')
  h.dirs.add('/work/moved')
  h.cwd = '/work/moved'
  await restart($, h)
  expect(await relay($, 'recover')).toBe(`Task ${g.taskId} was started in /work/proj, which no longer exists (REPO_MISMATCH). If you moved the repository here, type /jeeves recover --relink to continue it here.`)
  expect(h.files.has(`${dir}/state.json`)).toBe(true)
  const said = await relay($, 'recover --relink')
  expect(said).toContain(`Task ${g.taskId} moved here from /work/proj.`)
  expect(said).toContain('Recovering task')
  expect(h.files.has(`${dir}/state.json`)).toBe(false)
  const [moved] = taskDirs(h).filter(d => d !== dir)
  expect(moved!.endsWith(`/tasks/${g.taskId}`)).toBe(true)
  expect(JSON.parse(h.files.get(moved!.replace(/\/tasks\/.*$/, '/project.json'))!).worktree).toBe('/work/moved')
  await until(h, () => continuations(prompts).length > 0)
  expect(continuations(prompts)[0]!.text).toContain('history/handover-001.md')
  expect([stateOf(h, moved!).status, stateOf(h, moved!).projectId]).toEqual(['CONTINUING', moved!.split('/').at(-3)])
})

test('review fix 3: relink refuses when the task already exists in this project; both folders untouched, lock given back', async ($, on) => {
  const g = await generating($, on)
  const { h, dir } = g
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  h.dirs.delete('/work/proj')
  h.dirs.add('/work/moved')
  h.cwd = '/work/moved'
  const target = `/home/t/.local/state/jeeves/projects/${await projectId({ kind: 'none', cwd: '/work/moved' })}/tasks/${g.taskId}`
  h.files.set(`${target}/note.txt`, 'already here')
  h.dirs.add(target)
  await restart($, h)
  const before = h.files.get(`${dir}/state.json`)
  expect(await relay($, 'recover --relink')).toBe(`Not relinked: ${target} already exists. Nothing was changed.`)
  expect(h.files.get(`${dir}/state.json`)).toBe(before)
  expect(h.files.get(`${target}/note.txt`)).toBe('already here')
  expect(h.files.has(`${dir}/lock.d/owner.json`)).toBe(false)
})
