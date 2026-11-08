// ST-5.2 / AC-13: completion only on verified DoD. "Done" text does nothing; a TIBBS-COMPLETE block without
// evidence gets one block listing the checks; still missing -> NEEDS_REVIEW(DOD_UNMET); evidence after the last edit
// -> COMPLETED with a summary, the lock released and no rotation after. /tibbs done is the user's own decision.
import type { SessionMeasureInput, ToolCallResult } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { bottom, PROMPT, relay, start, stateOf, submit, taskDirs, until, type Kit } from './kit.ts'
import { memHost } from './memfs.ts'

const exits: Record<string, number> = {}
const stopWith = ($: Kit, message: string, active = false) => $.classic.Stop({ stop_hook_active: active, last_assistant_message: message, background_tasks: [], session_crons: [] })
const complete = (taskId: string, blockers = '- none') => `Finished.\n<<<TIBBS-COMPLETE v1 task=${taskId}\n## Summary\n- all six steps\n## Checks run\n- \`npm test\`\n## Blockers\n${blockers}\nTIBBS-COMPLETE>>>`
const compose = ($: Kit) => $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })

async function task($: Kit, on: Parameters<typeof memHost>[0], check: string | null = 'npm test') {
  const h = memHost(on)
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
  expect(ask.block).toContain('Tibbs: not marked done yet.')
  expect(ask.block).toContain('- `npm test`: never run (run it exactly as written)')
  expect(stateOf(h, dir).status).toBe('MONITORING')

  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await until(h, () => ledgerLen(h, dir) === 2)
  expect(await stopWith($, complete(taskId), true)).toEqual({})
  const s = stateOf(h, dir)
  expect([s.status, s.reason]).toEqual(['COMPLETED', 'COMPLETED'])
  expect(h.files.has(`${dir}/lock.d/owner.json`)).toBe(false)
  expect(h.toasts.at(-1)).toBe(`Task ${taskId} completed after 0 rotation(s) in 1 session(s); checks passed: \`npm test\`.`)
  // COMPLETED stops all rotation, and the session may start a new task.
  await $.session.measure({ context: { window: 1_000_000, percent: 90 }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
  expect(stateOf(h, dir).status).toBe('COMPLETED')
  expect(await relay($, 'status')).toContain('State: COMPLETED')
  expect(await relay($, 'on')).toContain('Tibbs on: task')
})

test('AC-13: an edit after the passing check invalidates it; still missing after the one block -> NEEDS_REVIEW(DOD_UNMET); /tibbs done confirms', async ($, on) => {
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

  expect(await relay($, 'done', 'plugin')).toBe('Only you can change a Tibbs task: type the /tibbs command yourself.')
  expect(await relay($, 'done')).toBe(`Task ${taskId} marked done by you (recorded as your decision, not verified by checks).`)
  const last = h.files.get(`${dir}/events.jsonl`)!.trim().split('\n').map(l => JSON.parse(l)).at(-1)
  expect([last.from, last.to, last.code, last.detail]).toEqual(['NEEDS_REVIEW', 'COMPLETED', 'COMPLETED', 'approved by the user with /tibbs done (not verified by checks)'])
  expect(await relay($, 'done')).toBe('Nothing waits for /tibbs done: only a task stopped as DOD_UNMET can be confirmed by hand.')
})

test('no verification commands -> NEEDS_REVIEW at once, and the system prompt says /tibbs done confirms', async ($, on) => {
  const { h, dir, taskId } = await task($, on, null)
  const sections = (await compose($)).sections
  expect(sections.at(-1)?.id).toBe('tibbs:task')
  expect(sections.at(-1)?.text).toContain('the user confirms completion with /tibbs done')
  expect(await stopWith($, complete(taskId))).toEqual({})
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['NEEDS_REVIEW', 'DOD_UNMET'])
  expect(h.toasts.at(-1)).toBe('Claude says the task is done. It has no verification commands, so confirm with /tibbs done.')
})

test('the system prompt carries the completion block with the exact checks while a task is active, and nothing otherwise', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  expect((await compose($)).sections.map(s => s.id)).toEqual(['intro'])
  await relay($, 'on')
  expect((await compose($)).sections.map(s => s.id)).toEqual(['intro'])
  await submit($, PROMPT)
  await relay($, 'check ./verify.sh')
  const s = (await compose($)).sections.at(-1)!
  expect([s.id, s.scope]).toEqual(['tibbs:task', 'session'])
  expect(s.text).toContain(`<<<TIBBS-COMPLETE v1 task=${stateOf(h, taskDirs(h)[0]!).taskId}`)
  expect(s.text).toContain('- `./verify.sh`')
  await relay($, 'pause')
  expect((await compose($)).sections.map(s => s.id)).toEqual(['intro'])
})

test('review fix 2: /tibbs done from another live session is LOCK_HELD; after this process\'s own /clear it hands the lock on', async ($, on) => {
  const { h, dir, taskId } = await task($, on, null)
  await stopWith($, complete(taskId))
  expect(stateOf(h, dir).reason).toBe('DOD_UNMET')
  h.sessionId = 'sess-other-process'
  expect(await relay($, 'done')).toBe(`Another running session owns task ${taskId} here (LOCK_HELD). /tibbs status shows it read-only.`)
  expect(stateOf(h, dir).status).toBe('NEEDS_REVIEW')
  h.sessionId = 'sess-test'
  await $.session.end({ reason: 'clear', sessionId: 'sess-test', resume: { id: 'sess-test' } })
  h.sessionId = 'sess-2'
  expect(await relay($, 'done')).toBe(`Task ${taskId} marked done by you (recorded as your decision, not verified by checks).`)
})
