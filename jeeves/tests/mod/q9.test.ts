// ST-12.3 / Q-9: a second blocking Stop hook beneath Jeeves (a user's settings Stop hook, or a plugin below) while a
// handover is due.
// Jeeves asks only at a stop no other hook blocked, so neither block is lost and the rotation happens once.
import type { SessionMeasureInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { bottom, engineClear, handover, PROMPT, relay, start, stateOf, stop, ROOT, submit, taskDirs, turnEnd, turnStart, until, type Kit } from './kit.ts'
import { memHost } from './memfs.ts'

const OTHER = 'Other plugin: run the linter before stopping.'
const safeStop = ($: Kit) =>
  $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'step done', background_tasks: [], session_crons: [] })

test('Q-9: the other hook blocks once; Jeeves waits that stop out, then asks; one rotation, one handover file', async ($, on) => {
  const h = memHost(on)
  let otherBlocks = 1
  h.stopBlock = () => (otherBlocks-- > 0 ? OTHER : undefined)
  for (const f of ['src/calc.js', 'src/parse.js', 'src/tokenize.js']) h.files.set(`${ROOT}/${f}`, '// code\n')
  bottom(on)
  const clears: string[] = []
  on('command.run', async (_, e) => { clears.push(e.command); await engineClear($, h, 'sess-2'); return { text: '' } })
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await turnStart($)
  await $.session.measure({ context: { window: 1_000_000, percent: 52 }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
  // 1: the other plugin blocks: its block reaches Claude unchanged; Jeeves treats it as no boundary.
  expect((await safeStop($)).block).toBe(OTHER)
  expect(stateOf(h, dir).status).toBe('ROTATION_REQUESTED')
  // 2: nobody else blocks: Jeeves asks for the handover.
  expect((await safeStop($)).block).toContain('JEEVES-HANDOVER')
  const s = stateOf(h, dir)
  expect(await stop($, handover(s.taskId, s.rotation.rotationId))).toEqual({})
  await turnEnd($)
  await until(h, () => stateOf(h, dir).status === 'CONTINUING')
  expect(clears).toEqual(['clear'])
  expect([...h.files.keys()].filter(f => /\/history\/handover-\d+\.md$/.test(f)).length).toBe(1)
})

test('Q-9: the other hook blocking the handover answer is not counted as an invalid handover', async ($, on) => {
  const h = memHost(on)
  let block = false
  h.stopBlock = () => (block ? OTHER : undefined)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await turnStart($)
  await $.session.measure({ context: { window: 1_000_000, percent: 52 }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
  expect((await safeStop($)).block).toContain('JEEVES-HANDOVER')
  block = true
  expect((await stop($, 'not a handover yet')).block).toBe(OTHER)
  expect([stateOf(h, dir).status, stateOf(h, dir).rotation.retries]).toEqual(['HANDOVER_GENERATING', 0])
})
