// ST-5.2 / AC-13: completion only on verified DoD. "Done" text does nothing; a JEEVES-COMPLETE block without
// evidence gets one block listing the checks; still missing -> NEEDS_REVIEW(DOD_UNMET); evidence after the last edit
// -> COMPLETED with a summary, the lock released and no rotation after. /jeeves done is the user's own decision.
import type { SessionMeasureInput, ToolCallResult } from 'claude-code'
import { expect } from 'claude-code/testing'
import { bottom, fakeGit, PROMPT, relay, start, stateOf, stop, submit, taskDirs, TURN, until, type Kit, test } from './kit.ts'
import { memHost } from './memfs.ts'

const exits: Record<string, number> = {}
const stopWith = ($: Kit, message: string, active = false) => stop($, message, { stop_hook_active: active })
const complete = (taskId: string, blockers = '- none') => `Finished.\n<<<JEEVES-COMPLETE v1 task=${taskId}\n## Summary\n- all six steps\n## Checks run\n- \`npm test\`\n## Blockers\n${blockers}\nJEEVES-COMPLETE>>>`
const compose = ($: Kit) => $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })

async function task($: Kit, on: Parameters<typeof memHost>[0], check: string | null = 'npm test', setup?: (h: ReturnType<typeof memHost>) => void) {
  const h = memHost(on)
  setup?.(h)
  bottom(on)
  on('tool.call', (_, e) => {
    const code = exits[(e as { command?: string }).command ?? ''] ?? 0
    return (code === 0 ? { result: { stdout: '', stderr: '', interrupted: false }, text: 'ok' } : { isError: true, result: `Exit code ${code}`, text: `Exit code ${code}` }) as ToolCallResult
  })
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  if (check) await relay($, `check ${check}`)
  const dir = taskDirs(h)[0]!
  return { h, dir, taskId: stateOf(h, dir).taskId as string }
}
const ledgerLen = (h: ReturnType<typeof memHost>, dir: string) => stateOf(h, dir).ledger.length

test('AC-13: "done" alone does nothing; a block before the check runs is blocked once with the list; after a passing run -> COMPLETED', async ($, on) => {
  const { h, dir, taskId } = await task($, on)
  expect(await stopWith($, 'The task is done. Everything passes.')).toEqual({})
  expect(stateOf(h, dir).status).toBe('MONITORING')

  await $.tool.call({ tool: 'Edit', file_path: '/work/proj/src/a.js', old_string: 'a', new_string: 'b' })
  await until(h, () => ledgerLen(h, dir) === 1)
  const ask = await stopWith($, complete(taskId))
  expect(ask.block).toContain('Jeeves: not marked done yet.')
  expect(ask.block).toContain('- `npm test`: never run (run it exactly as written)')
  expect(stateOf(h, dir).status).toBe('MONITORING')

  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await until(h, () => ledgerLen(h, dir) === 2)
  expect(await stopWith($, complete(taskId), true)).toEqual({})
  const s = stateOf(h, dir)
  expect([s.status, s.reason]).toEqual(['COMPLETED', 'COMPLETED'])
  expect(h.files.has(`${dir}/lock.d/owner.json`)).toBe(false)
  expect(h.toasts.some(t => t.includes('completed'))).toBe(false)
  expect(h.notes.at(-1)).toBe('task completed in <1m: no handovers, 1/1 checks passed.')
  // COMPLETED stops all rotation, and the session may start a new task.
  await $.session.measure({ context: { window: 1_000_000, percent: 90 }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
  expect(stateOf(h, dir).status).toBe('COMPLETED')
  expect(await relay($, 'status')).toContain('State: done')
  expect(await relay($, 'on')).toContain('Jeeves on: task')
})

test('AC-13: an edit after the passing check invalidates it; still missing after the one block -> NEEDS_REVIEW(DOD_UNMET); /jeeves done confirms', async ($, on) => {
  const { h, dir, taskId } = await task($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'Edit', file_path: '/work/proj/src/a.js', old_string: 'a', new_string: 'b' })
  await until(h, () => ledgerLen(h, dir) === 2)
  expect((await stopWith($, complete(taskId))).block).toContain('`npm test`: ran before the last edit (/work/proj/src/a.js)')
  exits['npm test'] = 1
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await until(h, () => ledgerLen(h, dir) === 3)
  expect(await stopWith($, complete(taskId), true)).toEqual({})
  delete exits['npm test']
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['NEEDS_REVIEW', 'DOD_UNMET'])
  expect(h.toasts.at(-1)).toContain('Not marked done: 1 check(s) missing or failing.')

  expect(await relay($, 'done', 'plugin')).toBe('Only you can change a Jeeves task: type the /jeeves command yourself.')
  expect(await relay($, 'done')).toBe(`Task ${taskId} marked done by you (recorded as your decision, not verified by checks).`)
  expect(h.notes.at(-1)).toBe('task completed in <1m: no handovers, confirmed by you.')
  const last = h.files.get(`${dir}/events.jsonl`)!.trim().split('\n').map(l => JSON.parse(l)).at(-1)
  expect([last.from, last.to, last.code, last.detail]).toEqual(['NEEDS_REVIEW', 'COMPLETED', 'COMPLETED', 'approved by the user with /jeeves done (not verified by checks)'])
  expect(await relay($, 'done')).toBe('Nothing waits for /jeeves done: only a task stopped as DOD_UNMET can be confirmed by hand.')
})

test('no verification commands -> NEEDS_REVIEW at once, and the system prompt says /jeeves done confirms', async ($, on) => {
  const { h, dir, taskId } = await task($, on, null)
  // Turn mode has no prompt.compose; the same text goes in as a hidden row (turn-complete.test.ts).
  if (!TURN) {
    const sections = (await compose($)).sections
    expect(sections.at(-1)?.id).toBe('jeeves:task')
    expect(sections.at(-1)?.text).toContain('the user confirms completion with /jeeves done')
  }
  expect(await stopWith($, complete(taskId))).toEqual({})
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['NEEDS_REVIEW', 'DOD_UNMET'])
  expect(h.toasts.at(-1)).toBe('Claude says the task is done. It has no verification commands, so confirm with /jeeves done.')
})

test('the system prompt carries the completion block with the exact checks while a task is active, and nothing otherwise', { stopOnly: 'no prompt.compose; the hidden row is in turn-complete.test.ts' }, async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  expect((await compose($)).sections.map(s => s.id)).toEqual(['intro'])
  await relay($, 'on')
  expect((await compose($)).sections.map(s => s.id)).toEqual(['intro'])
  await submit($, PROMPT)
  await relay($, 'check ./verify.sh')
  const s = (await compose($)).sections.at(-1)!
  expect([s.id, s.scope]).toEqual(['jeeves:task', 'session'])
  expect(s.text).toContain(`<<<JEEVES-COMPLETE v1 task=${stateOf(h, taskDirs(h)[0]!).taskId}`)
  expect(s.text).toContain('- `./verify.sh`')
  await relay($, 'pause')
  expect((await compose($)).sections.map(s => s.id)).toEqual(['intro'])
})

test('review fix 2: /jeeves done from another live session is LOCK_HELD; after this process\'s own /clear it hands the lock on', async ($, on) => {
  const { h, dir, taskId } = await task($, on, null)
  await stopWith($, complete(taskId))
  expect(stateOf(h, dir).reason).toBe('DOD_UNMET')
  h.sessionId = 'sess-other-process'
  expect(await relay($, 'done')).toBe(`Another running session owns task ${taskId} here. /jeeves status shows it read-only.`)
  expect(stateOf(h, dir).status).toBe('NEEDS_REVIEW')
  h.sessionId = 'sess-test'
  await $.session.end({ reason: 'clear', sessionId: 'sess-test', resume: { id: 'sess-test' } })
  h.sessionId = 'sess-2'
  expect(await relay($, 'done')).toBe(`Task ${taskId} marked done by you (recorded as your decision, not verified by checks).`)
})

/** A git repository whose `git log <start>..HEAD` lists `commits`, or fails (exit 1) when null. */
const gitWith = (commits: string[] | null) => (h: ReturnType<typeof memHost>) => {
  fakeGit(h)
  const base = h.git!
  h.git = args => (args[0] === 'log' && commits ? { exitCode: 0, stdout: commits.join('\n') + '\n' } : base(args))
}
async function completeWithCheck($: Kit, on: Parameters<typeof memHost>[0], setup: (h: ReturnType<typeof memHost>) => void) {
  const t = await task($, on, 'npm test', setup)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await until(t.h, () => ledgerLen(t.h, t.dir) === 1)
  return t
}

test('plan 12: a passing completion block shows the summary in the transcript and the notification', async ($, on) => {
  const { h, dir, taskId } = await completeWithCheck($, on, h => { gitWith(['a1 one', 'b2 two'])(h); h.costUsd = 0.5 })
  expect(await stopWith($, complete(taskId))).toEqual({})
  expect(stateOf(h, dir).status).toBe('COMPLETED')
  expect(h.notes.slice(-2)).toEqual(['task completed in <1m: no handovers, 2 commits, 1/1 checks passed.', 'Cost: $0.50.'])
  expect(h.notes).not.toContain('task completed')
  expect(h.notifications.at(-1)?.text).toBe('task completed in <1m: no handovers, 2 commits, 1/1 checks passed.')
})

test('plan 12: git log failing leaves the commits out; the task still completes', async ($, on) => {
  const { h, dir, taskId } = await completeWithCheck($, on, gitWith(null))
  expect(await stopWith($, complete(taskId))).toEqual({})
  expect(stateOf(h, dir).status).toBe('COMPLETED')
  expect(h.notes.at(-1)).toBe('task completed in <1m: no handovers, 1/1 checks passed.')
})

test('plan 12: a summary whose data cannot be read falls back to "task completed"', async ($, on) => {
  const { h, dir, taskId } = await completeWithCheck($, on, gitWith(null))
  h.failRead = path => path.endsWith('/events.jsonl')
  expect(await stopWith($, complete(taskId))).toEqual({})
  h.failRead = undefined
  expect(stateOf(h, dir).status).toBe('COMPLETED')
  expect(h.notes.at(-1)).toBe('task completed')
  expect(h.notifications.at(-1)?.text).toBe('task completed')
})
