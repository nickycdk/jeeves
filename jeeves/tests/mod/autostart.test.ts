// ST-13.4 (spec §5.2, §5.4, AC-35, AC-37): the first-run notice at session.start, the auto task at the first typed
// prompt (word for word), never from any other origin kind, the near-threshold end and the 3-turn grace period.
import type { PromptOrigin, SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { bottom, engineTest as test, fakeGit, PROMPT, relay, start, stateOf, stop, submit, taskDirs, turnEnd, turnStart, type Kit } from './kit.ts'
import { memHost, type MemHost } from './memfs.ts'

const STATE = '/home/t/.local/state/jeeves'
const NOTICE = 'Jeeves watches long sessions here. At 40% context (~400K tokens) it saves a handover and continues in a fresh conversation.\n/jeeves later postpones a handover, /jeeves off stops it for this session, /jeeves auto off turns it off.'
const NEAR = 'Jeeves: not watching this session, context already at 35%; /jeeves on to watch anyway'

function eligibleHost(on: Parameters<typeof memHost>[0], store: Record<string, unknown> = {}) {
  const h = memHost(on, undefined, store)
  fakeGit(h)
  h.usage = { window: 1_000_000 }
  return h
}
const stateFiles = (h: MemHost) => new Map([...h.files].filter(([f]) => f.startsWith(STATE)))
const measure = ($: Kit, h: MemHost, percent: number) => {
  h.usage = { window: 1_000_000, percent }
  return $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
}
/** One main turn as the engine runs it, with the Stop reaching Jeeves (else R-25 would read it as skipped). */
async function mainTurn($: Kit, h: MemHost, id: string, percent: number) {
  await turnStart($, id)
  await measure($, h, percent)
  await stop($, 'step done')
  await turnEnd($, 'answer', id)
}

test('fresh install, eligible: the notice at session.start, nothing written; the first typed prompt is the auto task, word for word (AC 1, 2)', async ($, on) => {
  const h = eligibleHost(on)
  const got = bottom(on)
  const before = stateFiles(h)
  await start($)
  expect(h.toasts).toEqual([NOTICE])
  expect(stateFiles(h)).toEqual(before)
  await submit($, PROMPT)
  const [dir] = taskDirs(h)
  expect(h.files.get(`${dir}/task-rev-001.md`)).toBe(PROMPT)
  const s = stateOf(h, dir!)
  expect(s.origin).toBe('auto')
  expect(s.status).toBe('MONITORING')
  expect(s.thresholdPercent).toBe(40)
  expect(got).toEqual([{ text: PROMPT, origin: 'composer' }]) // the prompt goes on unchanged
  // One task per session: the next prompt changes nothing.
  await submit($, 'and another thing')
  expect(taskDirs(h)).toEqual([dir])
})

test('the notice shows once (autoNoticeShown), not in a session that is not eligible, and the /jeeves on notice stays its own', async ($, on) => {
  const h = eligibleHost(on)
  bottom(on)
  h.usage = { window: 200_000 }
  await start($)
  expect(h.toasts).toEqual([])
  h.sessionId = 'sess-2'
  h.usage = { window: 1_000_000 }
  await start($)
  expect(h.toasts).toEqual([NOTICE])
  h.sessionId = 'sess-3'
  await start($)
  expect(h.toasts).toEqual([NOTICE])
  expect(await relay($, 'on')).toContain('keeps task state on this machine only')
})

test('the notice names the threshold that applies: a project default', async ($, on) => {
  const h = eligibleHost(on, { autoNoticeShown: true })
  bottom(on)
  await start($)
  await relay($, 'defaults threshold 60')
  await relay($, 'defaults check npm test')
  await submit($, PROMPT)
  const [dir] = taskDirs(h)
  expect(stateOf(h, dir!).thresholdPercent).toBe(60)
  expect(h.files.get(`${dir}/task-rev-002.md`)).toContain('npm test')
  expect(h.toasts).toEqual([])
})

const ORIGINS: PromptOrigin[] = [
  { kind: 'bridge' }, { kind: 'sdk' }, { kind: 'task-notification' }, { kind: 'scheduled-trigger' }, { kind: 'peer' },
  { kind: 'peer-send-message' }, { kind: 'projects-relay' }, { kind: 'channel', server: 'slack' }, { kind: 'coordinator' },
  { kind: 'observer' }, { kind: 'observer-activity' }, { kind: 'auto-continuation' }, { kind: 'unclassified' }, { kind: 'slack-ping' },
  { kind: 'plugin', name: 'other' },
] as PromptOrigin[]
for (const origin of ORIGINS) {
  test(`a ${origin.kind} prompt never starts an auto task; the next typed one does (AC 3)`, async ($, on) => {
    const h = eligibleHost(on)
    bottom(on)
    await start($)
    await submit($, 'not typed here', origin)
    expect(taskDirs(h)).toEqual([])
    await submit($, PROMPT)
    expect(h.files.get(`${taskDirs(h)[0]}/task-rev-001.md`)).toBe(PROMPT)
  })
}

test('a slash command or a meta prompt never starts an auto task (AC 3)', async ($, on) => {
  const h = eligibleHost(on)
  bottom(on)
  await start($)
  await submit($, '/review', { kind: 'composer' }, { name: 'review', args: '' })
  await $.prompt.submit({ text: 'meta', origin: { kind: 'composer' }, wait: false, isMeta: true })
  expect(taskDirs(h)).toEqual([])
})

test('not eligible (200K window at start): the first typed prompt passes and nothing is written', async ($, on) => {
  const h = eligibleHost(on)
  bottom(on)
  h.usage = { window: 200_000 }
  const before = stateFiles(h)
  await start($)
  await submit($, PROMPT)
  expect(stateFiles(h)).toEqual(before)
})

test('near-threshold: a first reading within 10 points ends the auto task with its message; no new one this session (AC 4)', async ($, on) => {
  const h = eligibleHost(on, { autoNoticeShown: true })
  bottom(on)
  await start($)
  await submit($, PROMPT)
  const [dir] = taskDirs(h)
  await turnStart($)
  await measure($, h, 35)
  expect(stateOf(h, dir!).status).toBe('DISABLED')
  expect(h.toasts).toContain(NEAR)
  expect(h.files.get(`${dir}/task-rev-001.md`)).toBe(PROMPT) // files kept
  await stop($, 'done'); await turnEnd($)
  await submit($, 'next prompt')
  expect(taskDirs(h)).toEqual([dir])
})

test('grace: no rotation in turns 1-3 past the threshold (below +10); the handover is requested in turn 4 (AC 5)', async ($, on) => {
  const h = eligibleHost(on, { autoNoticeShown: true })
  bottom(on)
  await start($)
  await submit($, PROMPT)
  const [dir] = taskDirs(h)
  await mainTurn($, h, 't1', 20)
  await mainTurn($, h, 't2', 45)
  await mainTurn($, h, 't3', 49) // below threshold + 10: grace still holds
  expect(stateOf(h, dir!).status).toBe('MONITORING')
  expect(stateOf(h, dir!).graceTurns).toBe(3)
  await turnStart($, 't4')
  await measure($, h, 52)
  expect(stateOf(h, dir!).status).toBe('ROTATION_REQUESTED')
})

test('grace ends at threshold + 10: a one-turn task is handed over within its first turn (AC-41 1M run)', async ($, on) => {
  const h = eligibleHost(on, { autoNoticeShown: true })
  bottom(on)
  await start($)
  await submit($, PROMPT)
  const [dir] = taskDirs(h)
  await turnStart($, 't1')
  await measure($, h, 20)
  await measure($, h, 49)
  expect(stateOf(h, dir!).status).toBe('MONITORING')
  await measure($, h, 50)
  expect(stateOf(h, dir!).status).toBe('ROTATION_REQUESTED')
})

test('a session that owns a task already starts no auto task (AC 6)', async ($, on) => {
  const h = eligibleHost(on, { autoNoticeShown: true })
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  expect(taskDirs(h).length).toBe(1)
  expect(stateOf(h, taskDirs(h)[0]!).origin).toBe('explicit')
  await submit($, 'more')
  expect(taskDirs(h).length).toBe(1)
})

test('after /jeeves off the next typed prompt starts no auto task (off for the session)', async ($, on) => {
  const h = eligibleHost(on, { autoNoticeShown: true })
  bottom(on)
  await start($)
  await relay($, 'off')
  await submit($, PROMPT)
  expect(taskDirs(h)).toEqual([])
})

test('review fix: an auto task whose session simply ended is not offered back or recovered; the next session starts its own (spec §5.8)', { options: { autoStart: 'on', autoRecover: true } }, async ($, on) => {
  const h = eligibleHost(on, { autoNoticeShown: true })
  const got = bottom(on)
  await start($)
  await submit($, PROMPT)
  const [old] = taskDirs(h)
  await measure($, h, 10)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sess-test', resume: { id: 'sess-test' } })
  expect(stateOf(h, old!).status).toBe('MONITORING')
  h.sessionId = 'sess-2'
  const before = h.files.get(`${old}/state.json`)
  await start($)
  expect(h.toasts).toEqual([])
  expect(got.length).toBe(1) // no continuation sent
  await submit($, 'a new task')
  expect(taskDirs(h).length).toBe(2)
  expect(h.files.get(`${old}/state.json`)).toBe(before)
  const fresh = taskDirs(h).find(d => d !== old)!
  expect([stateOf(h, fresh).origin, stateOf(h, fresh).activeSessionId]).toEqual(['auto', 'sess-2'])
})

test('review fix: /jeeves on does not offer back an auto task left MONITORING', { options: { autoStart: 'on' } }, async ($, on) => {
  const h = eligibleHost(on, { autoNoticeShown: true })
  bottom(on)
  await start($)
  await submit($, PROMPT)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sess-test', resume: { id: 'sess-test' } })
  h.sessionId = 'sess-2'
  h.turns = 3 // resumed: not auto-watched
  await start($)
  expect(await relay($, 'on')).toContain('Jeeves on: task')
  expect(taskDirs(h).length).toBe(2)
})
