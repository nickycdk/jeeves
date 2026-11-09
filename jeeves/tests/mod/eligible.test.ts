// ST-13.3 (spec §5.1, D-42, AC-36, AC-37): eligibility decided once at session.start, the reasons status shows, and the
// two endings of an auto task (model switch, R-25 re-check). No auto task starts before ST-13.4, so the auto task here
// is an explicit one whose state says `origin: auto`.
import type { SessionMeasureInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { bottom, engineClear, fakeGit, PROMPT, relay, stateOf, stop, submit, taskDirs, turnEnd, turnStart, type Kit } from './kit.ts'
import { memHost, type MemHost } from './memfs.ts'

const SWITCHED = "Jeeves: not watching any more (this model's window is 200K); /jeeves on to watch anyway"
const start = ($: Kit, isInteractive = true) => $.session.start({ cwd: '/work/proj', surface: 'terminal', isInteractive })
const taskFiles = (h: MemHost) => [...h.files.keys()].filter(f => f.includes('/tasks/'))
const autoLine = async ($: Kit) => (await relay($, 'status')).split('\n').find(l => l.startsWith('Auto'))
const diagnoseLine = async ($: Kit) => (await relay($, 'status --diagnose')).split('\n').find(l => l.startsWith('Auto-start:'))

/** An eligible session: git work tree, 1M window, fresh conversation, fresh install. */
function eligibleHost(on: Parameters<typeof memHost>[0]) {
  const h = memHost(on)
  fakeGit(h)
  h.usage = { window: 1_000_000 }
  return h
}

const measure = ($: Kit, window: number, percent: number) =>
  $.session.measure({ context: { window, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)

/** A task this session owns, marked as auto-started. */
async function autoTask($: Kit, h: MemHost, origin: 'auto' | 'explicit' = 'auto') {
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  h.files.set(`${dir}/state.json`, JSON.stringify({ ...stateOf(h, dir), origin }, null, 2) + '\n')
  return dir
}

test('eligible: status names where auto-start came from; diagnose says eligible; nothing written to task state (AC 1)', async ($, on) => {
  const h = eligibleHost(on)
  bottom(on)
  await start($)
  expect(await autoLine($)).toBe('Auto-start: on (fresh install)')
  expect(await diagnoseLine($)).toBe('Auto-start: on (fresh install); this session is eligible')
  expect(taskFiles(h)).toEqual([])
})

const NOT_ELIGIBLE: [string, (h: MemHost) => void, boolean, string][] = [
  ['-p or SDK', () => {}, false, 'Auto off: -p or SDK'],
  // No process.run: git cannot answer and no state folder is made, so the upgrade check waits (off) too.
  ['assisted', h => { h.failProcess = true }, true, 'Auto off: assisted mode (+2 more)'],
  ['unsupported', h => { h.version = '2.1.300' }, true, 'Auto off: unsupported'],
  ['outside git', h => { h.git = undefined; h.dirs.delete('/work/proj/.git') }, true, 'Auto off: not a git repository'],
  ['200K window at start', h => { h.usage = { window: 200_000 } }, true, 'Auto off: 200K window at start'],
  ['resumed', h => { h.turns = 4 }, true, 'Auto off: resumed conversation'],
]
for (const [why, seed, interactive, line] of NOT_ELIGIBLE) {
  test(`not eligible: ${why}; status shows the reason, no task file is written (AC 1)`, async ($, on) => {
    const h = eligibleHost(on)
    seed(h)
    bottom(on)
    await start($, interactive)
    await submit($, 'a first prompt')
    expect(await autoLine($)).toBe(line)
    expect(taskFiles(h)).toEqual([])
  })
}

test('decided once: a later switch to 1M does not make the session eligible; the reason stays "200K window at start" (AC 2)', async ($, on) => {
  const h = eligibleHost(on)
  h.usage = { window: 200_000 }
  await start($)
  h.usage = { window: 1_000_000, percent: 5 }
  await measure($, 1_000_000, 5)
  expect(await autoLine($)).toBe('Auto off: 200K window at start')
  // A reload reruns session.start with turns > 0: the decision of this session is kept, not made again.
  h.turns = 3
  await start($)
  expect(await autoLine($)).toBe('Auto off: 200K window at start')
})

test('a reload keeps an eligible decision; a /clear carries it to the fresh conversation; an exit forgets it', async ($, on) => {
  const h = eligibleHost(on)
  bottom(on)
  await start($)
  h.turns = 3
  await start($)
  expect(await autoLine($)).toBe('Auto-start: on (fresh install)')
  await engineClear($, h, 'sess-2')
  h.turns = 0
  expect(await autoLine($)).toBe('Auto-start: on (fresh install)')
  // `claude --resume sess-2` in a new process: turns > 0, so it decides again and finds a resumed conversation.
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sess-2', resume: { id: 'sess-2' } })
  h.turns = 7
  await start($)
  expect(await autoLine($)).toBe('Auto off: resumed conversation')
})

test('several reasons: the first in the §5.1 order with (+N more); diagnose lists them all; /jeeves off adds "this session" (AC 3)', async ($, on) => {
  const h = memHost(on) // no git, 200K window
  h.turns = 2
  bottom(on)
  await start($)
  expect(await autoLine($)).toBe('Auto off: resumed conversation (+2 more)')
  expect(await diagnoseLine($)).toBe('Auto-start: on (fresh install); not watched: resumed conversation, not a git repository, 200K window at start')
  await relay($, 'off')
  expect(await autoLine($)).toBe('Auto off: this session (+3 more)')
  expect(await diagnoseLine($)).toBe('Auto-start: off (this session); not watched: this session, resumed conversation, not a git repository, 200K window at start')
})

test('auto-start off by level: project, everywhere; each shows its own reason', async ($, on) => {
  eligibleHost(on)
  bottom(on)
  await start($)
  await relay($, 'auto off')
  expect(await autoLine($)).toBe('Auto off: everywhere')
  await relay($, 'defaults auto off')
  expect(await autoLine($)).toBe('Auto off: this project')
})

test('auto-start off as the upgrade default (3b): its own reason', async ($, on) => {
  const h = memHost(on, undefined, { upgradeCheck: 'upgrader' })
  fakeGit(h)
  h.usage = { window: 1_000_000 }
  await start($)
  expect(await autoLine($)).toBe('Auto off: upgraded from 0.2')
})

test('status in a task of this session shows the task, not the auto-start line', async ($, on) => {
  const h = eligibleHost(on)
  bottom(on)
  await start($)
  await autoTask($, h, 'explicit')
  expect(await autoLine($)).toBeUndefined()
})

test('model switch: a reading with a 200K window ends an auto task (DISABLED, files kept, lock released) with its message (AC 4)', async ($, on) => {
  const h = eligibleHost(on)
  bottom(on)
  await start($)
  const dir = await autoTask($, h)
  const kept = () => taskFiles(h).filter(f => !f.includes('/lock.d/'))
  const before = kept()
  expect(taskFiles(h).some(f => f.includes('/lock.d/'))).toBe(true)
  await measure($, 1_000_000, 10)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  await measure($, 200_000, 30)
  expect(stateOf(h, dir).status).toBe('DISABLED')
  expect(h.toasts).toContain(SWITCHED)
  expect(taskFiles(h).some(f => f.includes('/lock.d/'))).toBe(false)
  for (const f of before) expect(h.files.has(f)).toBe(true)
})

test('model switch: an explicit task keeps watching with its threshold (AC 5)', async ($, on) => {
  const h = eligibleHost(on)
  bottom(on)
  await start($)
  const dir = await autoTask($, h, 'explicit')
  const threshold = stateOf(h, dir).thresholdPercent
  await measure($, 200_000, 30)
  expect(stateOf(h, dir).status).toBe('MONITORING')
  expect(stateOf(h, dir).thresholdPercent).toBe(threshold)
  expect(h.toasts).not.toContain(SWITCHED)
})

for (const origin of ['auto', 'explicit'] as const) {
  test(`ST-16.1: the Stop skip ends no ${origin} task (turn mode); the auto line is unchanged (AC 4)`, async ($, on) => {
    const h = eligibleHost(on)
    bottom(on)
    await start($)
    const dir = await autoTask($, h, origin)
    const line = await autoLine($)
    await turnStart($); await turnEnd($)
    expect(stateOf(h, dir).status).toBe('MONITORING')
    expect(h.toasts.filter(t => t.includes("isn't supported") || t.includes('Automatic rotation is off'))).toEqual([])
    expect(await autoLine($)).toBe(line)
    expect(await relay($, 'status')).toContain('mode: full (turn)')
  })
}

test('two sessions at once (one plugin store): each keeps its own decision and its own /jeeves off', async ($, on) => {
  const h = eligibleHost(on)
  bottom(on)
  h.sessionId = 'sess-a'
  await start($)
  h.sessionId = 'sess-b'
  h.usage = { window: 200_000 }
  await start($)
  await relay($, 'off')
  h.sessionId = 'sess-a'
  expect(await autoLine($)).toBe('Auto-start: on (fresh install)')
  await relay($, 'off')
  h.sessionId = 'sess-b'
  await relay($, 'auto on')
  expect(await autoLine($)).toBe('Auto off: this session (+1 more)')
  h.sessionId = 'sess-a'
  expect(await autoLine($)).toBe('Auto off: this session')
})

test('a /clear carries /jeeves off to the fresh conversation; an exit forgets it', async ($, on) => {
  const h = eligibleHost(on)
  bottom(on)
  await start($)
  await relay($, 'off')
  await engineClear($, h, 'sess-2')
  expect(await autoLine($)).toBe('Auto off: this session')
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sess-2', resume: { id: 'sess-2' } })
  await start($)
  expect(await autoLine($)).toBe('Auto-start: on (fresh install)')
})

test('after an auto task of this session ended (model switch), status says off for this session, not on', async ($, on) => {
  const h = eligibleHost(on)
  bottom(on)
  await start($)
  await autoTask($, h)
  await measure($, 200_000, 30)
  expect(h.toasts).toContain(SWITCHED)
  expect(await autoLine($)).toBe('Auto off: this session')
})
