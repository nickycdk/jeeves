import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLookup, outputTail, pruneTails, toolRecord, type ToolOutcome } from '../../src/core/evidence.ts'
import { reduce } from '../../src/core/machine.ts'
import { check } from '../../src/core/schema.ts'
import { DEFAULT_CONFIG, LEDGER_MAX, type CommandEntry, type LedgerEntry } from '../../src/core/types.ts'
import { AT, validState } from './helpers.ts'

const call = (over: Partial<ToolOutcome>): ToolOutcome => ({ tool: 'Bash', args: {}, denied: false, isError: false, backgrounded: false, ...over })
const ctx = { now: Date.parse(AT) + 1000, config: DEFAULT_CONFIG, newRotationId: 'r_new' }

test('Bash: success is exit 0; a failed test command is recorded as failed with its exit code (AC-09)', () => {
  assert.deepEqual(toolRecord(call({ args: { command: 'npm test' } })), { kind: 'cmd', command: 'npm test', ok: true, exit: 0, agent: null })
  assert.deepEqual(toolRecord(call({ args: { command: 'npm test' }, isError: true, text: 'Exit code 1\n> fail' })), { kind: 'cmd', command: 'npm test', ok: false, exit: 1, agent: null, tail: '> fail' })
  assert.deepEqual(toolRecord(call({ args: { command: 'x' }, isError: true, text: 'interrupted' })), { kind: 'cmd', command: 'x', ok: false, exit: null, agent: null, tail: 'interrupted' })
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
    // Every other call fails with ~10K characters of output (the most the hook gets, docs/compatibility.md).
    const entry = toolRecord(call({ args: { command: `npm test -- --grep case${i % 7} API_KEY=abc123456789` }, ...(i % 2 ? { isError: true, text: `Exit code 1\n${'FAIL x.spec.ts token=abc\n'.repeat(400)}` } : {}) }))!
    s = reduce(s, { type: 'TOOL_RESULT', main: true, entry }, ctx).state
    times.push(performance.now() - t)
  }
  times.sort((a, b) => a - b)
  const p95 = times[Math.floor(times.length * 0.95)]!
  console.log(`# ledger p95 ${p95.toFixed(3)} ms`)
  assert.ok(p95 < 5, `p95 ${p95} ms`)
})

// Plan 11: the last output lines of failed commands.
const run = (s: ReturnType<typeof validState>, command: string, over: Partial<ToolOutcome> = {}) =>
  reduce(s, { type: 'TOOL_RESULT', main: true, entry: toolRecord(call({ args: { command }, ...over }))! }, ctx).state
const fail = (text: string, over: Partial<ToolOutcome> = {}): Partial<ToolOutcome> => ({ isError: true, text: `Exit code 1\n${text}`, ...over })
const tails = (l: readonly LedgerEntry[]) => l.flatMap(e => (e.kind === 'cmd' && e.tail !== undefined ? [`${e.command}: ${e.tail}`] : []))

test('tails: a failed command keeps one; passing, denied, backgrounded and lookup calls keep none; any other failure text keeps one', () => {
  const tail = (over: Partial<ToolOutcome>, command = 'npm test') => (toolRecord(call({ args: { command }, ...over })) as CommandEntry).tail
  assert.equal(tail(fail('FAIL a.spec.ts')), 'FAIL a.spec.ts')
  assert.equal(tail({ text: 'ok' }), undefined)
  assert.equal(tail(fail('x', { denied: true })), undefined)
  assert.equal(tail(fail('x', { backgrounded: true })), undefined)
  // A failure without an exit code (a timeout, an interrupt) keeps its text too; the exact wording was not checked live.
  assert.equal(tail({ isError: true, text: 'stopped early\nstill running' }), 'stopped early\nstill running')
  assert.equal(tail(fail('')), undefined)
  assert.equal(tail(fail('nothing'), 'grep -r foo src'), undefined)
})

test('tails: the lookup rule reads the last command', () => {
  assert.equal(isLookup('npm test | grep FAIL'), true)
  assert.equal(isLookup('cd pkg && npm test'), false)
  assert.equal(isLookup('cd pkg && grep x f'), true)
  assert.equal(isLookup('cd pkg; ls missing'), true)
  assert.equal(isLookup('npm test'), false)
  assert.equal(isLookup('test -f package.json && npm test'), false)
  assert.equal(isLookup('ls dist || npm run build'), false)
  assert.equal(isLookup('npm test; grep FAIL log'), true)
})

test('tails: one per command, newest run only; a pass removes it', () => {
  let s = validState()
  for (const n of [1, 2, 3]) s = run(s, 'npm test', fail(`run ${n}`))
  s = run(s, 'npm run lint', fail('lint error'))
  assert.deepEqual(tails(s.ledger), ['npm test: run 3', 'npm run lint: lint error'])
  s = run(s, 'npm test')
  assert.deepEqual(tails(s.ledger), ['npm run lint: lint error'])
  // A failed run with nothing to keep leaves the earlier tail: not seen passing since.
  s = run(s, 'npm run lint', fail(''))
  assert.deepEqual(tails(s.ledger), ['npm run lint: lint error'])
  assert.ok(check('state', s).ok)
})

test('tails: at most three; subagent tails go first, then the oldest', () => {
  let s = validState()
  s = run(s, 'a', fail('a'))
  s = run(s, 'b', fail('b', { agentId: 'sub1' }))
  s = run(s, 'c', fail('c'))
  s = run(s, 'd', fail('d'))
  assert.deepEqual(tails(s.ledger), ['a: a', 'c: c', 'd: d'])
  s = run(s, 'e', fail('e'))
  assert.deepEqual(tails(s.ledger), ['c: c', 'd: d', 'e: e'])
  assert.deepEqual(pruneTails(s.ledger), s.ledger, 'pruning is idempotent')
})

test('tails: two commands equal in their first 300 characters count as one', () => {
  const long = 'x'.repeat(300)
  let s = run(validState(), `${long} one`, fail('first'))
  s = run(s, `${long} two`, fail('second'))
  assert.deepEqual(tails(s.ledger).map(t => t.slice(-6)), ['second'])
})

test('outputTail: a secret or key block cut at 8,000 characters is not left partly visible', () => {
  const secret = 'AKIAIOSFODNN7EXAMPLE'
  // The 8,000-character cut lands inside the secret: what is left of it no longer matches a pattern.
  const raw = `Exit code 1\nkey=${secret}\n${'y'.repeat(7980)}\nend`
  assert.ok(raw.length - 8000 > 16 && raw.length - 8000 < 16 + secret.length)
  const cut = outputTail(raw)!
  assert.ok(!cut.includes('FODNN7'), cut.slice(0, 60))
  const key = `-----BEGIN RSA PRIVATE KEY-----\n${'MIIEowIBAAKCAQEA1234567890abcdef\n'.repeat(400)}-----END RSA PRIVATE KEY-----\nFAIL after key`
  const t = outputTail(`Exit code 1\n${key}`)!
  assert.ok(!t.includes('MIIEow'), t.slice(0, 80))
  assert.match(t, /^\[REDACTED:private-key\]\nFAIL after key$/)
})

test('outputTail: progress frames, colours and blank lines give clean lines; at most 20 lines', () => {
  assert.equal(outputTail('Exit code 3\nOUT-1\nERR-1\nprogress 10%\rprogress 100%\n\x1b[31mERR-2\x1b[0m\r\n\n'), 'OUT-1\nERR-1\nprogress 100%\nERR-2')
  const many = outputTail(Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n'))!.split('\n')
  assert.deepEqual([many.length, many[0], many.at(-1)], [20, 'line 30', 'line 49'])
})

test('outputTail: emoji and CJK at the cap stay within 1,200 code units with no lone surrogate, and the state stays valid', () => {
  for (const raw of ['😀测试'.repeat(600), Array.from({ length: 20 }, () => '😀测'.repeat(40)).join('\n')]) {
    const t = outputTail(raw)!
    assert.ok(t.length <= 1200, String(t.length))
    assert.ok(!/^[\udc00-\udfff]/.test(t) && !/[\ud800-\udbff]$/.test(t))
    assert.equal(t, t.toWellFormed())
    const s = validState({ ledger: [{ kind: 'cmd', command: 'x', ok: false, exit: 1, at: AT, agent: null, tail: t }] })
    assert.ok(check('state', s).ok)
  }
})

