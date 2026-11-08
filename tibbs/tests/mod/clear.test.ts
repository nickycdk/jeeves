// Review fix 1: a user's /clear pauses the task (USER_CLEAR) instead of leaving it to a session id that no longer exists.
import type { SessionMeasureInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { bottom, engineClear, generating, PROMPT, relay, start, stateOf, submit, taskDirs, turnEnd, turnStart, until, type Kit } from './kit.ts'
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
  expect(h.toasts).toContain('You cleared the conversation, so Tibbs paused this task. /tibbs status shows it.')

  const status = await relay($, 'status')
  expect(status).toContain('State: PAUSED (USER_CLEAR)')
  expect(status).toContain('You cleared the conversation.')
  await measure($, 80)
  expect(stateOf(h, dir!).status).toBe('PAUSED')
  expect(await relay($, 'on')).toBe(`Task ${stateOf(h, dir!).taskId} from an earlier session is PAUSED here. /tibbs resume continues it, or /tibbs off ends it.`)
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
  test(`ST-6.3: a user /clear in ${at} pauses and never auto-continues; /tibbs resume does, once`, async ($, on) => {
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
    await turnEnd($)
    await h.clock.advance(5_000)
    await until(h, () => true)
    expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['PAUSED', 'USER_CLEAR'])
    expect(prompts.length).toBe(before)
    expect(await relay($, 'resume')).toContain('Continuing task')
    await until(h, () => prompts.length > before)
    await h.clock.settle()
    expect(prompts.filter(p => p.text.includes('Tibbs: you are session')).length).toBe(1)
  })
}
