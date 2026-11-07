import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toolRecord, type ToolOutcome } from '../../src/core/evidence.ts'
import { reduce } from '../../src/core/machine.ts'
import { check } from '../../src/core/schema.ts'
import { DEFAULT_CONFIG, LEDGER_MAX } from '../../src/core/types.ts'
import { AT, validState } from './helpers.ts'

const call = (over: Partial<ToolOutcome>): ToolOutcome => ({ tool: 'Bash', args: {}, denied: false, isError: false, backgrounded: false, ...over })
const ctx = { now: Date.parse(AT) + 1000, config: DEFAULT_CONFIG, newRotationId: 'r_new' }

test('Bash: success is exit 0; a failed test command is recorded as failed with its exit code (AC-09)', () => {
  assert.deepEqual(toolRecord(call({ args: { command: 'npm test' } })), { kind: 'cmd', command: 'npm test', ok: true, exit: 0, agent: null })
  assert.deepEqual(toolRecord(call({ args: { command: 'npm test' }, isError: true, text: 'Exit code 1\n> fail' })), { kind: 'cmd', command: 'npm test', ok: false, exit: 1, agent: null })
  assert.deepEqual(toolRecord(call({ args: { command: 'x' }, isError: true, text: 'interrupted' })), { kind: 'cmd', command: 'x', ok: false, exit: null, agent: null })
})

test('Bash: denied and backgrounded calls have no exit status; subagent calls are tagged', () => {
  assert.deepEqual(toolRecord(call({ args: { command: 'rm -rf /' }, denied: true })), { kind: 'cmd', command: 'rm -rf /', ok: false, exit: null, agent: null })
  assert.deepEqual(toolRecord(call({ args: { command: 'sleep 9' }, backgrounded: true, agentId: 'a1' })), { kind: 'cmd', command: 'sleep 9', ok: true, exit: null, agent: 'a1' })
})

test('Bash: the command is redacted, flattened and capped at 300 characters', () => {
  const r = toolRecord(call({ args: { command: `curl -H "Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123" \\\n  ${'x'.repeat(400)}` } }))
  assert.ok(r && r.kind === 'cmd')
  assert.ok(!r.command.includes('abcdefghijklmnop'), r.command)
  assert.ok(r.command.length <= 300)
  assert.ok(!r.command.includes('\n'))
})

test('edits: Edit/Write/NotebookEdit paths when they succeeded; nothing for denied, failed or other tools', () => {
  assert.deepEqual(toolRecord(call({ tool: 'Edit', args: { file_path: '/r/a.ts' } })), { kind: 'edit', path: '/r/a.ts', agent: null })
  assert.deepEqual(toolRecord(call({ tool: 'Write', args: { file_path: '/r/b.ts' }, agentId: 'a2' })), { kind: 'edit', path: '/r/b.ts', agent: 'a2' })
  assert.deepEqual(toolRecord(call({ tool: 'NotebookEdit', args: { notebook_path: '/r/n.ipynb' } })), { kind: 'edit', path: '/r/n.ipynb', agent: null })
  assert.equal(toolRecord(call({ tool: 'Edit', args: { file_path: '/r/a.ts' }, denied: true })), null)
  assert.equal(toolRecord(call({ tool: 'Edit', args: { file_path: '/r/a.ts' }, isError: true })), null)
  assert.equal(toolRecord(call({ tool: 'Read', args: { file_path: '/r/a.ts' } })), null)
  assert.equal(toolRecord(call({ tool: 'Edit', args: {} })), null)
})

test('reducer: the ledger keeps the last 200 entries, stamps the time, logs no event, and stays a valid state', () => {
  let s = validState()
  for (let i = 0; i < LEDGER_MAX + 5; i++) {
    const o = reduce(s, { type: 'TOOL_RESULT', main: true, entry: { kind: 'cmd', command: `c${i}`, ok: true, exit: 0, agent: null } }, ctx)
    assert.deepEqual(o.effects, [])
    s = o.state
  }
  assert.equal(s.ledger.length, LEDGER_MAX)
  assert.equal(s.ledger[0]!.kind === 'cmd' && s.ledger[0]!.command, 'c5')
  assert.equal(s.ledger.at(-1)!.at, new Date(ctx.now).toISOString())
  assert.ok(check('state', s).ok)
})

test('reducer: recorded while paused, ignored without an active task, and a bare result outside rotation changes nothing', () => {
  const entry = { kind: 'edit' as const, path: '/r/a', agent: null }
  assert.equal(reduce(validState({ status: 'PAUSED', reason: 'USER_PAUSE' }), { type: 'TOOL_RESULT', main: true, entry }, ctx).state.ledger.length, 1)
  assert.ok(reduce(validState({ status: 'DISABLED' }), { type: 'TOOL_RESULT', main: true, entry }, ctx).ignored)
  assert.ok(reduce(validState(), { type: 'TOOL_RESULT', main: true }, ctx).ignored)
})

test('NFR-03 micro-benchmark: entry + reduce p95 < 5 ms per call (the disk write runs after the hook returns)', () => {
  let s = validState({ ledger: Array.from({ length: LEDGER_MAX }, (_, i) => ({ kind: 'cmd' as const, command: `c${i}`, ok: true, exit: 0, at: AT, agent: null })) })
  const times: number[] = []
  for (let i = 0; i < 2000; i++) {
    const t = performance.now()
    const entry = toolRecord(call({ args: { command: `npm test -- --grep case${i} API_KEY=abc123456789` } }))!
    s = reduce(s, { type: 'TOOL_RESULT', main: true, entry }, ctx).state
    times.push(performance.now() - t)
  }
  times.sort((a, b) => a - b)
  const p95 = times[Math.floor(times.length * 0.95)]!
  console.log(`# ledger p95 ${p95.toFixed(3)} ms`)
  assert.ok(p95 < 5, `p95 ${p95} ms`)
})
