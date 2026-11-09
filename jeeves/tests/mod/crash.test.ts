// ST-6.7 / AC-16 crash matrix (I layer): the process dies at each named point of a rotation (JEEVES_TEST_CRASH, test
// only: the plugin stops dead there). A new session starts, waits out the dead session's lock and types /jeeves recover.
// Each point must give exactly one continuation, from the right handover, and no handover written twice.
import { expect } from 'claude-code/testing'
import { CRASH_POINTS, type CrashPoint } from '../../src/adapter/runtime.ts'
import { bottom, engineClear, generating, handover, PROMPT, relay, sha256, start, stateOf, stop, submit, taskDirs, turnEnd, turnStart, until, type Kit, test } from './kit.ts'
import { memHost, type MemHost } from './memfs.ts'

const env = (point: CrashPoint) => ({ HOME: '/home/t', JEEVES_TEST: '1', JEEVES_TEST_CRASH: point })
const continuations = (prompts: { text: string }[]) => prompts.filter(p => p.text.includes('Jeeves: you are session'))
const measure = ($: Kit, percent: number) => $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] })
const unsafeStop = ($: Kit) => $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'step done', background_tasks: [], session_crons: [] })

/** Drive the rotation until the process dies at `point`; the dead process's pending hooks never return. */
async function dieAt($: Kit, on: Parameters<typeof memHost>[0], point: CrashPoint) {
  if (point === 'threshold' || point === 'mid-handover') {
    const h = memHost(on, env(point))
    const prompts = bottom(on)
    on('command.run', () => ({ text: '' }))
    await start($)
    await relay($, 'on')
    await submit($, PROMPT)
    const dir = taskDirs(h)[0]!
    await turnStart($)
    if (point === 'threshold') void measure($, 52)
    else { await measure($, 52); void unsafeStop($) }
    await until(h, () => stateOf(h, dir).status === (point === 'threshold' ? 'ROTATION_REQUESTED' : 'HANDOVER_GENERATING'))
    await until(h, () => h.logs.includes(`jeeves: crash point ${point}`))
    return { h, dir, prompts, handovers: 0 }
  }
  const g = await generating($, on, { env: env(point) })
  const { h, dir, ctl } = g
  ctl.onClear = async () => { await engineClear($, h, 'sess-fresh') }
  if (point === 'after-persist' || point === 'before-clear') void stop($, handover(g.taskId, g.rotationId))
  else {
    await stop($, handover(g.taskId, g.rotationId))
    void turnEnd($)
  }
  await until(h, () => h.logs.includes(`jeeves: crash point ${point}`))
  await h.clock.settle()
  return { h, dir, prompts: g.prompts, handovers: 1 }
}

/** What the dead process left, per point (02 §8). */
const LEFT: Record<CrashPoint, string> = {
  'threshold': 'ROTATION_REQUESTED', 'mid-handover': 'HANDOVER_GENERATING', 'after-persist': 'VALIDATING',
  'before-clear': 'ROTATING', 'before-inject': 'ROTATING', 'before-submit': 'RESTORING',
}

async function restartAndRecover($: Kit, h: MemHost) {
  delete h.env.JEEVES_TEST_CRASH
  h.sessionId = 'sess-new'
  await start($)
  await h.clock.advance(121_000)
  return relay($, 'recover')
}

for (const point of CRASH_POINTS) {
  test(`AC-16 crash point "${point}": restart + /jeeves recover -> exactly one continuation, no handover written twice`, async ($, on) => {
    const { h, dir, prompts, handovers } = await dieAt($, on, point)
    expect(stateOf(h, dir).status).toBe(LEFT[point])
    if (point === 'before-inject') expect(stateOf(h, dir).rotation.step).toBe('CLEARED')
    expect(continuations(prompts).length).toBe(0)

    expect(await restartAndRecover($, h)).toContain('Recovering task')
    await until(h, () => continuations(prompts).length > 0)
    // Let every timer of both processes run out: still exactly one.
    await h.clock.advance(10_000)
    await h.clock.settle()
    const cont = continuations(prompts)
    expect(cont.length).toBe(1)
    const s = stateOf(h, dir)
    expect([s.status, s.activeSessionId]).toEqual(['CONTINUING', 'sess-new'])
    const files = [...h.files.keys()].filter(f => f.startsWith(`${dir}/history/handover-`))
    expect(files.length).toBe(handovers)
    if (handovers) {
      // Continued from the handover the dead process saved, exactly as saved.
      const text = h.files.get(`${dir}/history/handover-001.md`)!
      expect(s.lastValidatedHandover).toBe(`history/handover-001.md#sha256:${await sha256(text)}`)
      expect(cont[0]!.text).toContain('## Latest validated handover (history/handover-001.md)')
      expect(cont[0]!.text).not.toContain('stopped unexpectedly')
    } else {
      expect(cont[0]!.text).toContain('stopped unexpectedly')
      expect(cont[0]!.text).toContain('There is no validated handover yet')
    }
    expect(await relay($, 'recover')).toContain('nothing to recover')
    await h.clock.settle()
    expect(continuations(prompts).length).toBe(1)
  })
}

test('the crash flag does nothing without JEEVES_TEST=1', async ($, on) => {
  const g = await generating($, on, { env: { HOME: '/home/t', JEEVES_TEST_CRASH: 'after-persist' } })
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  expect(stateOf(g.h, g.dir).status).toBe('ROTATING')
  expect(g.h.logs.some(l => l.includes('crash point'))).toBe(false)
})
