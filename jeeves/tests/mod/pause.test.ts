// ST-2.5 / AC-14: pause and resume through the hooks; a pause survives a restart.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { bottom, PROMPT, relay, start, stateOf, submit, taskDirs, type Kit, test } from './kit.ts'
import { memHost } from './memfs.ts'

const measure = ($: Kit, percent: number) =>
  $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)

async function onTask($: Kit, on: Parameters<typeof memHost>[0]) {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  return { h, dir: taskDirs(h)[0]! }
}

/** A new process for the same project: new session id, session.start again (the runtime is rebuilt). */
async function restart($: Kit, h: ReturnType<typeof memHost>, sessionId: string) {
  h.sessionId = sessionId
  await start($)
}

test('AC-14: pause at 48% -> no handover at 55%; resume at 55% -> request at the next measure', async ($, on) => {
  const { h, dir } = await onTask($, on)
  await measure($, 48)
  expect(await relay($, 'pause')).toBe('Paused: no handover until /jeeves resume. The pause is kept across restarts.')
  await measure($, 55)
  await measure($, 60)
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['PAUSED', 'USER_PAUSE'])
  expect(await relay($, 'resume')).toBe('Resumed: Jeeves hands over again at 50%.')
  expect(stateOf(h, dir).status).toBe('MONITORING')
  await measure($, 55)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
})

test('pause while a handover is only requested cancels it; resume rearms', async ($, on) => {
  const { h, dir } = await onTask($, on)
  await measure($, 52)
  const rid = stateOf(h, dir).rotation.rotationId
  expect(await relay($, 'pause')).toContain('The requested handover is cancelled.')
  expect(stateOf(h, dir).rotation).toBe(null)
  await relay($, 'resume')
  await measure($, 53)
  const s = stateOf(h, dir)
  expect(s.status).toBe('ROTATION_REQUESTED')
  expect(s.rotation.rotationId).not.toBe(rid)
})

test('pause while a handover is being written is deferred, not dropped', async ($, on) => {
  const { h, dir } = await onTask($, on)
  const s = stateOf(h, dir)
  h.files.set(`${dir}/state.json`, JSON.stringify({ ...s, status: 'HANDOVER_GENERATING', reason: 'THRESHOLD', armedFired: true, rotation: { rotationId: 'r_x', trigger: 'THRESHOLD', requestedAt: s.updatedAt, sourceSessionId: null, targetSessionId: null, step: 'HANDOVER_REQUESTED', retries: 0, quiesceCount: 0, noteAppended: false } }))
  expect(await relay($, 'pause')).toBe('A handover is under way. Jeeves pauses once the fresh conversation has your task.')
  expect([stateOf(h, dir).status, stateOf(h, dir).pauseRequested]).toEqual(['HANDOVER_GENERATING', true])
})

test('a pause survives a restart: still paused in the new process, and resume there works at once after a normal exit', async ($, on) => {
  const { h, dir } = await onTask($, on)
  await relay($, 'pause')
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sess-test', resume: { id: 'sess-test' } })
  expect(h.files.has(`${dir}/lock.d/owner.json`)).toBe(false)

  await restart($, h, 'sess-2')
  expect(await relay($, 'status')).toContain('State: PAUSED (USER_PAUSE)')
  await measure($, 70)
  expect(stateOf(h, dir).status).toBe('PAUSED')
  expect(await relay($, 'on')).toContain('/jeeves resume continues it')

  expect(await relay($, 'resume')).toContain('Resumed')
  const s = stateOf(h, dir)
  expect([s.status, s.activeSessionId]).toEqual(['MONITORING', 'sess-2'])
  expect(JSON.parse(h.files.get(`${dir}/lock.d/owner.json`)!).ownerSessionId).toBe('sess-2')
  await measure($, 70)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
})

test('after a crash (no clean exit) the old lock blocks resume until it is stale', async ($, on) => {
  const { h, dir } = await onTask($, on)
  await relay($, 'pause')
  await restart($, h, 'sess-2')
  expect(await relay($, 'resume')).toContain('(LOCK_HELD)')
  expect(stateOf(h, dir).status).toBe('PAUSED')
  await h.clock.advance(121_000)
  expect(await relay($, 'resume')).toContain('Resumed')
  expect(stateOf(h, dir).activeSessionId).toBe('sess-2')
})

test('pause and resume answer plainly when there is nothing to do', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  expect(await relay($, 'pause')).toBe('No managed task. Start with /jeeves on')
  expect(await relay($, 'resume')).toBe('No managed task. Start with /jeeves on')
  await relay($, 'on')
  expect(await relay($, 'resume')).toBe('The task is MONITORING, not paused.')
  expect(await relay($, 'pause', 'plugin')).toContain('Only you can change')
  expect(stateOf(h, taskDirs(h)[0]!).status).toBe('MONITORING')
})

test('resume from another session while the owner is alive: LOCK_HELD, and the owner\'s state is not written', async ($, on) => {
  const { h, dir } = await onTask($, on)
  await relay($, 'pause')
  const before = h.files.get(`${dir}/state.json`)
  const toasts = h.toasts.length
  h.sessionId = 'sess-other'
  expect(await relay($, 'resume')).toContain('(LOCK_HELD)')
  expect(h.files.get(`${dir}/state.json`)).toBe(before)
  expect(h.toasts.length).toBe(toasts)
})
