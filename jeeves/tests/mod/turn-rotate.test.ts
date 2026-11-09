// ST-16.4 / ADR-003 A2: in turn mode no SessionStart follows Jeeves's /clear; the resolved /clear reads the new id,
// takes the lock and sends the continuation with task and handover in the prompt itself.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { CRASH_POINTS, type CrashPoint } from '../../src/adapter/runtime.ts'
import { FRESH_CONTINUE_MS } from '../../src/adapter/task.ts'
import { handover, PROMPT, relay, start, stateOf, submit, test, turnGenerating, until, wholeTurn, type Kit } from './kit.ts'

const measure = ($: Kit, percent: number) =>
  $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
const session = (n: number) => `Jeeves: you are session ${n}`
const owner = (h: { files: Map<string, string> }, dir: string) => JSON.parse(h.files.get(`${dir}/lock.d/owner.json`)!).ownerSessionId

test('AC 1: two rotations in a row with nothing typed: each continuation carries task and handover; lock follows the id', async ($, on) => {
  const g = await turnGenerating($, on)
  const { h, dir, prompts } = g
  const typed = prompts.filter(p => p.origin === 'composer').length
  await wholeTurn($, handover(g.taskId, g.rotationId))
  await until(h, () => prompts.some(p => p.text.includes(session(2))))
  const cont = prompts.filter(p => p.text.includes(session(2)))
  expect(cont.length).toBe(1)
  expect(cont[0]!.text).toContain(`Jeeves managed task ${g.taskId}, session 2.`)
  expect(cont[0]!.text).toContain(PROMPT)
  expect(cont[0]!.text).toContain(`## Latest validated handover (history/handover-001.md)\n${h.files.get(`${dir}/history/handover-001.md`)}`)
  expect([stateOf(h, dir).status, stateOf(h, dir).activeSessionId, owner(h, dir)]).toEqual(['CONTINUING', 'sess-2', 'sess-2'])
  await h.clock.advance(FRESH_CONTINUE_MS)
  await h.clock.settle()
  expect(prompts.filter(p => p.text.includes(session(2))).length).toBe(1)

  await measure($, 4)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  await g.request()
  await wholeTurn($, handover(g.taskId, g.rotationId))
  await until(h, () => prompts.some(p => p.text.includes(session(3))))
  expect(prompts.filter(p => p.text.includes(session(3)))[0]!.text).toContain('## Latest validated handover (history/handover-002.md)')
  expect([stateOf(h, dir).rotationCount, stateOf(h, dir).activeSessionId, owner(h, dir)]).toEqual([2, 'sess-3', 'sess-3'])
  expect(prompts.filter(p => p.origin === 'composer').length).toBe(typed)
})

test('AC 2: a /clear that leaves the session id unchanged fails the rotation as a refused /clear does', async ($, on) => {
  const g = await turnGenerating($, on)
  g.ctl.sameId = true
  await wholeTurn($, handover(g.taskId, g.rotationId))
  await until(g.h, () => stateOf(g.h, g.dir).status === 'NEEDS_REVIEW')
  expect(stateOf(g.h, g.dir).reason).toBe('ROTATE_UNAVAILABLE')
  expect(g.h.logs).toContain('jeeves: /clear resolved but the session id did not change')
  expect(g.prompts.some(p => p.text.includes(session(2)))).toBe(false)
})

test('ST-16.3 AC 2: a prompt typed during the request is quoted in the continuation, after the request', async ($, on) => {
  const g = await turnGenerating($, on)
  await submit($, 'also fix the README')
  await wholeTurn($, handover(g.taskId, g.rotationId))
  await until(g.h, () => g.prompts.some(p => p.text.includes(session(2))))
  const i = g.prompts.findIndex(p => p.text.includes('JEEVES-HANDOVER')), j = g.prompts.findIndex(p => p.text.includes(session(2)))
  expect(i < j).toBe(true)
  expect(g.prompts[j]!.text).toContain('also fix the README')
  expect(g.prompts.some(p => p.text === 'also fix the README')).toBe(false)
})

/** AC 3: the crash matrix in turn mode (ST-6.7's points): restart + /jeeves recover -> exactly one continuation. */
const LEFT: Record<CrashPoint, string> = {
  'threshold': 'ROTATION_REQUESTED', 'mid-handover': 'HANDOVER_GENERATING', 'after-persist': 'VALIDATING',
  'before-clear': 'ROTATING', 'before-inject': 'ROTATING', 'before-submit': 'RESTORING',
}
for (const point of CRASH_POINTS) {
  test(`AC 3 crash point "${point}" in turn mode: restart + /jeeves recover -> exactly one continuation`, async ($, on) => {
    const early = point === 'threshold' || point === 'mid-handover'
    const g = await turnGenerating($, on, { env: { HOME: '/home/t', JEEVES_TEST: '1', JEEVES_TEST_CRASH: point }, ask: !early })
    const { h, dir, prompts } = g
    // The dead process's pending hooks never return.
    void (early ? g.request() : wholeTurn($, handover(g.taskId, g.rotationId)))
    await until(h, () => h.logs.includes(`jeeves: crash point ${point}`))
    await h.clock.settle()
    expect(stateOf(h, dir).status).toBe(LEFT[point])
    delete h.env.JEEVES_TEST_CRASH
    h.sessionId = 'sess-new'
    await start($)
    await h.clock.advance(121_000)
    expect(await relay($, 'recover')).toContain('Recovering task')
    await until(h, () => prompts.some(p => p.text.includes('Jeeves: you are session')))
    await h.clock.advance(10_000)
    await h.clock.settle()
    expect(prompts.filter(p => p.text.includes('Jeeves: you are session')).length).toBe(1)
    expect([stateOf(h, dir).status, stateOf(h, dir).activeSessionId]).toEqual(['CONTINUING', 'sess-new'])
  })
}
