// ST-4.7 / AC-15: /jeeves rotate runs the threshold's pipeline. One host runs a threshold rotation, then a manual one;
// the traces (event transitions, Jeeves's prompts, Stop blocks, /clear) are identical except the trigger code.
import type { SessionMeasureInput, ToolCallResult } from 'claude-code'
import { expect } from 'claude-code/testing'
import { NUDGE_PROMPT } from '../../src/core/handover/template.ts'
import { bottom, engineClear, handover, PROMPT, relay, ROOT, start, stateOf, stop, submit, taskDirs, turnEnd, TURN, until, type Kit, test } from './kit.ts'
import { memHost } from './memfs.ts'

const measure = ($: Kit, percent: number) =>
  $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)

test('AC-15: the manual trace equals the threshold trace except THRESHOLD -> MANUAL', async ($, on) => {
  const h = memHost(on)
  const prompts = bottom(on)
  const clears: string[] = []
  let next = 'sess-2'
  on('command.run', async (_, e) => { clears.push(e.command); await engineClear($, h, next); return { text: '' } })
  on('tool.call', () => ({ isError: true, result: 'Exit code 1', text: 'Exit code 1' }) as ToolCallResult)
  for (const f of ['src/calc.js', 'src/parse.js', 'src/tokenize.js']) h.files.set(`${ROOT}/${f}`, '// code\n')
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await until(h, () => stateOf(h, dir).ledger.length === 1)

  /** One rotation from MONITORING with Claude idle, to MONITORING in the next session. */
  async function cycle(trigger: () => Promise<unknown>, sid: string) {
    const ev0 = h.files.get(`${dir}/events.jsonl`)!.trim().split('\n').length, p0 = prompts.length, c0 = clears.length
    next = sid
    await trigger()
    await until(h, () => prompts.slice(p0).some(p => p.text === NUDGE_PROMPT))
    const s = stateOf(h, dir)
    const ask = await stop($, 'ok', { stop_hook_active: false })
    const saved = await stop($, handover(s.taskId, s.rotation.rotationId))
    await turnEnd($)
    await until(h, () => prompts.slice(p0).some(p => p.text.includes('Jeeves: you are session')))
    await measure($, 4)
    const events = h.files.get(`${dir}/events.jsonl`)!.trim().split('\n').slice(ev0).map(l => JSON.parse(l))
    return {
      events: events.map(e => `${e.from}>${e.to}:${e.code}`),
      prompts: prompts.slice(p0).map(p => (p.text === NUDGE_PROMPT ? 'nudge' : p.text.includes('Jeeves: you are session') ? 'continuation' : p.text.includes('<<<JEEVES-HANDOVER') ? 'request' : p.text)),
      blocks: [ask.block ? 'handover-request' : 'none', saved.block ? 'retry' : 'none'],
      clears: clears.slice(c0),
      final: stateOf(h, dir).status,
    }
  }

  const auto = await cycle(() => measure($, 52), 'sess-2')
  const manual = await cycle(async () => expect(await relay($, 'rotate')).toBe('Handover requested: Jeeves asks Claude for it at the next safe stop, then starts a fresh conversation.'), 'sess-3')
  expect(auto.events.some(e => e.endsWith(':THRESHOLD'))).toBe(true)
  expect(auto.events.length).toBeGreaterThan(5)
  expect(manual).toEqual({ ...auto, events: auto.events.map(e => e.replace(/:THRESHOLD$/, ':MANUAL')) })
  // Turn mode submits the request as a prompt where Stop mode blocks with it.
  expect(auto.prompts).toEqual(TURN ? ['nudge', 'request', 'continuation'] : ['nudge', 'continuation'])
  expect(auto.clears).toEqual(['clear'])
  expect([stateOf(h, dir).rotationCount, stateOf(h, dir).activeSessionId, auto.final]).toEqual([2, 'sess-3', 'MONITORING'])
})

test('AC 2: /jeeves rotate never restarts before a validated handover; refused outside MONITORING/CONTINUING', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  const clears: string[] = []
  on('command.run', (_, e) => { clears.push(e.command); return { text: '' } })
  await start($)
  expect(await relay($, 'rotate')).toBe('No managed task. Start with /jeeves on')
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await relay($, 'rotate')
  expect(await relay($, 'rotate')).toBe('No handover now: the task is ROTATION_REQUESTED. /jeeves status shows why.')
  // An invalid handover three times: nothing is cleared, ever.
  await stop($, 'ok', { stop_hook_active: false })
  for (let i = 0; i < 3; i++) await stop($, 'no block here')
  await turnEnd($)
  await h.clock.settle()
  expect(clears).toEqual([])
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['NEEDS_REVIEW', 'HANDOVER_INVALID'])
  expect(await relay($, 'rotate', 'plugin')).toBe('Only you can change a Jeeves task: type the /jeeves command yourself.')
})
