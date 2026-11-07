// ST-3.1: the evidence ledger through the tool.call hook. The call's result is never changed, delayed or blocked.
import type { ToolCallResult } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { bottom, PROMPT, relay, start, stateOf, submit, taskDirs, until, type Kit } from './kit.ts'
import { memHost } from './memfs.ts'

/** The engine beneath the plugin: Bash `fail*` exits 1, `deny*` is refused; everything else succeeds. */
function tools(on: Parameters<typeof memHost>[0]) {
  const answers: ToolCallResult[] = []
  on('tool.call', (_, e) => {
    const cmd = (e as { command?: string }).command ?? ''
    const r = (cmd.startsWith('deny') ? { deny: 'not allowed' }
      : cmd.startsWith('fail') ? { isError: true, result: 'Exit code 1', text: 'Exit code 1\nFAIL' }
      : { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }) as ToolCallResult
    answers.push(r)
    return r
  })
  return answers
}

async function onTask($: Kit, on: Parameters<typeof memHost>[0]) {
  const h = memHost(on)
  bottom(on)
  const answers = tools(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  return { h, dir: taskDirs(h)[0]!, answers }
}
const ledger = (h: ReturnType<typeof memHost>, dir: string) => stateOf(h, dir).ledger as { kind: string; command?: string; path?: string; ok?: boolean; exit?: number | null; agent: string | null }[]

test('success, failure and deny are recorded as they ended; edits by path; subagent calls tagged', async ($, on) => {
  const { h, dir } = await onTask($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'Bash', command: 'fail npm test' })
  await $.tool.call({ tool: 'Bash', command: 'deny rm -rf /' })
  await $.tool.call({ tool: 'Edit', file_path: '/work/proj/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Write', file_path: '/work/proj/b.ts', content: 'x', agentId: 'agent-1' })
  await until(h, () => ledger(h, dir).length === 5)
  expect(ledger(h, dir).map(({ at: _at, ...e }: Record<string, unknown>) => e)).toEqual([
    { kind: 'cmd', command: 'npm test', ok: true, exit: 0, agent: null },
    { kind: 'cmd', command: 'fail npm test', ok: false, exit: 1, agent: null },
    { kind: 'cmd', command: 'deny rm -rf /', ok: false, exit: null, agent: null },
    { kind: 'edit', path: '/work/proj/a.ts', agent: null },
    { kind: 'edit', path: '/work/proj/b.ts', agent: 'agent-1' },
  ])
})

test('the plugin hands back exactly what the engine answered, deny included', async ($, on) => {
  const { answers } = await onTask($, on)
  for (const command of ['npm test', 'fail x', 'deny y']) expect(await $.tool.call({ tool: 'Bash', command })).toEqual(answers.at(-1))
})

test('a ledger failure (state cannot be written) never changes or blocks the tool call', async ($, on) => {
  const { h, dir, answers } = await onTask($, on)
  h.failWrite = p => p.includes('state.json')
  expect(await $.tool.call({ tool: 'Bash', command: 'npm test' })).toEqual(answers.at(-1))
  expect(await $.tool.call({ tool: 'Bash', command: 'deny z' })).toEqual({ deny: 'not allowed' })
  await h.clock.settle()
  h.failWrite = null
  expect(ledger(h, dir)).toEqual([])
})

test('without a task nothing is written, and the call still goes through', async ($, on) => {
  const h = memHost(on)
  const answers = tools(on)
  await start($)
  expect(await $.tool.call({ tool: 'Bash', command: 'npm test' })).toEqual(answers.at(-1))
  await h.clock.settle()
  expect(taskDirs(h)).toEqual([])
})

test('NFR-03: the ledger write is off the call path: the call returns before its entry lands (p95 sanity bound 50 ms under load)', async ($, on) => {
  const { h, dir } = await onTask($, on)
  const times: number[] = []
  for (let i = 0; i < 50; i++) {
    const t = performance.now()
    await $.tool.call({ tool: 'Bash', command: `npm test ${i}` })
    times.push(performance.now() - t)
    expect(ledger(h, dir).length).toBe(i)
    await until(h, () => ledger(h, dir).length === i + 1)
  }
  times.sort((a, b) => a - b)
  // The strict 5 ms budget is checked on the hook's own work in tests/unit/evidence.spec.ts; this one includes the test kit and machine load.
  expect(times[47]!).toBeLessThan(50)
})
