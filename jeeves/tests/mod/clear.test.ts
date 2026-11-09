// Review fix 1: a user's /clear pauses the task (USER_CLEAR) instead of leaving it to a session id that no longer exists.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { bottom, engineClear, fakeGit, generating, handover, PROMPT, relay, start, stateOf, stop, submit, taskDirs, turnEnd, turnStart, until, type Kit, test } from './kit.ts'
import { memHost } from './memfs.ts'

const measure = ($: Kit, percent: number) =>
  $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)

test('after /clear: task PAUSED(USER_CLEAR), lock given up, said plainly; off works at once', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const [dir] = taskDirs(h)
  // /clear: session.end(clear) for the old id, then the process goes on under a new id (no session.start).
  await $.session.end({ reason: 'clear', sessionId: 'sess-test', resume: { id: 'sess-test' } })
  h.sessionId = 'sess-after-clear'
  expect([stateOf(h, dir!).status, stateOf(h, dir!).reason]).toEqual(['PAUSED', 'USER_CLEAR'])
  expect(h.files.has(`${dir}/lock.d/owner.json`)).toBe(false)
  expect(h.toasts).toContain('Jeeves: paused (you cleared the conversation); /jeeves resume continues the task')

  const status = await relay($, 'status')
  expect(status).toContain('State: PAUSED (USER_CLEAR)')
  expect(status).toContain('You cleared the conversation.')
  await measure($, 80)
  expect(stateOf(h, dir!).status).toBe('PAUSED')
  expect(await relay($, 'on')).toBe(`Task ${stateOf(h, dir!).taskId} from an earlier session is PAUSED here. /jeeves resume continues it, or /jeeves off ends it.`)
  expect(stateOf(h, dir!).status).toBe('PAUSED')
  expect(await relay($, 'off')).toContain('nothing was deleted')
  expect(stateOf(h, dir!).status).toBe('DISABLED')
})

test('a /clear with no task changes nothing', async ($, on) => {
  const h = memHost(on)
  await start($)
  await $.session.end({ reason: 'clear', sessionId: 'sess-test', resume: { id: 'sess-test' } })
  expect(taskDirs(h)).toEqual([])
  expect(h.toasts).toEqual([])
})

// ST-6.3: a /clear typed during a requested or running handover pauses (USER_CLEAR); the fresh conversation gets nothing unasked.
for (const at of ['ROTATION_REQUESTED', 'HANDOVER_GENERATING'] as const) {
  test(`ST-6.3: a user /clear in ${at} pauses and never auto-continues; /jeeves resume does, once`, async ($, on) => {
    let h: ReturnType<typeof memHost>, dir: string, prompts: { text: string }[]
    if (at === 'HANDOVER_GENERATING') ({ h, dir, prompts } = await generating($, on))
    else {
      h = memHost(on)
      prompts = bottom(on)
      on('command.run', () => ({ text: '' }))
      await start($)
      await relay($, 'on')
      await submit($, PROMPT)
      dir = taskDirs(h)[0]!
      await turnStart($)
      await measure($, 60)
      expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
    }
    const before = prompts.length
    await engineClear($, h, 'sess-fresh')
    await stop($, 'ok') // the engine raises Stop before every answered turn's end
    await turnEnd($)
    await h.clock.advance(5_000)
    await until(h, () => true)
    expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['PAUSED', 'USER_CLEAR'])
    expect(prompts.length).toBe(before)
    expect(await relay($, 'resume')).toContain('Continuing task')
    await until(h, () => prompts.length > before)
    await h.clock.settle()
    expect(prompts.filter(p => p.text.includes('Jeeves: you are session')).length).toBe(1)
  })
}

// ---- ST-13.7 (spec §5.7, ADR-010 A2): a user /clear in an auto task, and auto -> explicit ----
const ended = 'Jeeves: task ended (new conversation); the next prompt starts a new one'
async function autoSession($: Kit, on: Parameters<typeof memHost>[0]) {
  const h = memHost(on)
  fakeGit(h)
  h.usage = { window: 1_000_000 }
  const prompts = bottom(on)
  await start($)
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  expect(stateOf(h, dir).origin).toBe('auto')
  return { h, dir, prompts }
}

test('ST-13.7 AC 1, 2: a user /clear ends an auto task (files kept, lock given up); the next typed prompt starts a new auto task', { options: { autoStart: 'on' } }, async ($, on) => {
  const { h, dir } = await autoSession($, on)
  expect(await relay($, 'status')).toContain(`Task: ${stateOf(h, dir).taskId} (auto)`)
  await engineClear($, h, 'sess-2')
  const s = stateOf(h, dir)
  expect([s.status, s.reason]).toEqual(['DISABLED', 'USER_CLEAR'])
  expect(h.toasts).toContain(ended)
  expect(h.notes).toContain('Jeeves: off (task files kept)')
  expect(h.files.has(`${dir}/lock.d/owner.json`)).toBe(false)
  expect(h.files.get(`${dir}/task-rev-001.md`)).toBe(PROMPT)
  await submit($, 'Now the CSV export.')
  const next = taskDirs(h).find(d => d !== dir)!
  expect(h.files.get(`${next}/task-rev-001.md`)).toBe('Now the CSV export.')
  expect([stateOf(h, next).origin, stateOf(h, next).status, stateOf(h, next).activeSessionId]).toEqual(['auto', 'MONITORING', 'sess-2'])
})

test('ST-13.7 AC 3: /jeeves on <goal> in an auto task makes it explicit with a goal revision; a /clear then pauses it', { options: { autoStart: 'on' } }, async ($, on) => {
  const { h, dir } = await autoSession($, on)
  const answer = await relay($, 'on finish the CSV parser')
  expect(answer).toBe(`Task ${stateOf(h, dir).taskId} is now explicit: your goal is task revision 2, and a /clear pauses it instead of ending it.`)
  expect([stateOf(h, dir).origin, stateOf(h, dir).taskRevision, stateOf(h, dir).status]).toEqual(['explicit', 2, 'MONITORING'])
  expect(h.files.get(`${dir}/task-rev-002.md`)).toMatch(/^Jeeves task revision 2\nKind: goal\nMeaning: Goal\nAdded by: \/jeeves on, typed by the user\n.*\n\nfinish the CSV parser$/)
  expect(await relay($, 'task')).toContain('task-rev-002.md  goal: finish the CSV parser')
  expect(await relay($, 'status')).toContain('(explicit)')
  expect(taskDirs(h)).toEqual([dir])
  await engineClear($, h, 'sess-2')
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['PAUSED', 'USER_CLEAR'])
  expect(h.toasts).toContain('Jeeves: paused (you cleared the conversation); /jeeves resume continues the task')
})

test('ST-13.7 AC 6: Jeeves\'s own /clear in an auto task rotates as before; the task is not ended', async ($, on) => {
  const g = await generating($, on)
  const { h, dir, ctl } = g
  h.files.set(`${dir}/state.json`, JSON.stringify({ ...stateOf(h, dir), origin: 'auto' }, null, 2) + '\n')
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  ctl.onClear = async () => { await engineClear($, h, 'sess-2') }
  await turnEnd($)
  await until(h, () => stateOf(h, dir).status === 'CONTINUING')
  expect([stateOf(h, dir).origin, stateOf(h, dir).activeSessionId]).toEqual(['auto', 'sess-2'])
  expect(h.toasts).not.toContain(ended)
})

test('review fix 3: after a /clear paused an explicit task in an eligible session, the next prompt starts no auto task and /jeeves resume continues it', { options: { autoStart: 'on' } }, async ($, on) => {
  const { h, dir } = await autoSession($, on)
  await relay($, 'on finish the CSV parser')
  await engineClear($, h, 'sess-2')
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['PAUSED', 'USER_CLEAR'])
  await submit($, 'what next?')
  expect(taskDirs(h)).toEqual([dir])
  expect(await relay($, 'status')).toMatch(/^Auto off: this session/m)
  expect(await relay($, 'resume')).toContain(stateOf(h, dir).taskId)
  expect(stateOf(h, dir).activeSessionId).toBe('sess-2')
})

test('audit 1: the auto-off after a /clear paused a task holds for that session only; a later session auto-starts and the paused task waits', { options: { autoStart: 'on' } }, async ($, on) => {
  const { h, dir } = await autoSession($, on)
  await relay($, 'on finish the CSV parser')
  await engineClear($, h, 'sess-2')
  expect(await relay($, 'status')).toMatch(/^Auto off: this session/m)
  // The user quits; a new `claude` in the same project is a fresh session in a new process.
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sess-2', resume: { id: 'sess-2' } })
  h.sessionId = 'sess-3'
  await start($)
  await submit($, 'Now the CSV export.')
  const next = taskDirs(h).find(d => d !== dir)!
  expect([stateOf(h, next).origin, stateOf(h, next).activeSessionId]).toEqual(['auto', 'sess-3'])
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['PAUSED', 'USER_CLEAR'])
})
