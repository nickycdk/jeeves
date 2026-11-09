import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completionInstruction, evaluate, parseComplete } from '../../src/core/completion.ts'
import { toolRecord } from '../../src/core/evidence.ts'
import type { LedgerEntry } from '../../src/core/types.ts'
import { AT } from './helpers.ts'

const block = (body = '## Summary\n- built it\n## Checks run\n- `./verify.sh`\n## Blockers\n- none', task = 't_1') => `All done.\n<<<JEEVES-COMPLETE v1 task=${task}\n${body}\nJEEVES-COMPLETE>>>\n`
const cmd = (command: string, exit: number | null): LedgerEntry => ({ kind: 'cmd', command, ok: exit === 0, exit, at: AT, agent: null })
const edit = (path: string): LedgerEntry => ({ kind: 'edit', path, at: AT, agent: null })

test('AC 1: "done" without a block -> nothing (null); two blocks or an unclosed one -> null', () => {
  for (const t of ['done', 'The task is done. All tests pass.', 'JEEVES-COMPLETE', block() + block(), '<<<JEEVES-COMPLETE v1 task=t_1\n## Summary\n- x']) assert.equal(parseComplete(t), null, t)
})

test('the block parses tolerantly: CRLF, a code fence, heading case; backticks dropped; "none" is no blocker', () => {
  const b = parseComplete('```\r\n' + block('## summary:\r\n- built it\r\n## CHECKS RUN\r\n- `./verify.sh`\r\n- npm test\r\n## Blockers\r\n- None.').replace(/\n/g, '\r\n') + '```')
  assert.deepEqual(b, { taskId: 't_1', summary: ['built it'], checks: ['./verify.sh', 'npm test'], blockers: [] })
  assert.deepEqual(parseComplete(block('## Summary\n- x\n## Checks run\n- `a`\n## Blockers\n- the API key is missing'))?.blockers, ['the API key is missing'])
})

test('AC 2: a block without evidence -> the missing list, each with why', () => {
  const e = evaluate(['./verify.sh', 'npm test', 'npm run lint'], [cmd('npm test', 1), cmd('npm run lint', null)], [])
  assert.equal(e.ok, false)
  assert.deepEqual(e.missing, [
    { command: './verify.sh', why: 'never run (run it exactly as written)' },
    { command: 'npm test', why: 'last run exited 1' },
    { command: 'npm run lint', why: 'did not finish' },
  ])
})

test('AC 3: an edit after the passing run invalidates it; a later passing run counts again', () => {
  const pass = cmd('./verify.sh', 0)
  assert.equal(evaluate(['./verify.sh'], [edit('/r/a.js'), pass], []).ok, true)
  const stale = evaluate(['./verify.sh'], [edit('/r/a.js'), pass, edit('/r/b.js')], [])
  assert.deepEqual(stale.missing, [{ command: './verify.sh', why: 'ran before the last edit (/r/b.js)' }])
  assert.equal(evaluate(['./verify.sh'], [pass, edit('/r/b.js'), cmd('./verify.sh', 0)], []).ok, true)
})

test('the latest run decides; exact text only (trimmed); blockers or no commands never pass', () => {
  assert.equal(evaluate(['./verify.sh'], [cmd('./verify.sh', 0), cmd('./verify.sh', 1)], []).ok, false)
  assert.equal(evaluate(['./verify.sh'], [cmd('bash verify.sh', 0), cmd('./verify.sh 2>&1', 0)], []).ok, false)
  assert.equal(evaluate([' ./verify.sh '], [cmd('./verify.sh', 0)], []).ok, true)
  assert.equal(evaluate(['./verify.sh'], [cmd('./verify.sh', 0)], ['flaky test']).ok, false)
  assert.equal(evaluate([], [cmd('./verify.sh', 0)], []).ok, false)
})

test('the instruction names the task, the exact commands and the block lines; deterministic', () => {
  const t = completionInstruction('t_1', ['./verify.sh'])
  assert.ok(t.includes('<<<JEEVES-COMPLETE v1 task=t_1') && t.includes('JEEVES-COMPLETE>>>') && t.includes('- `./verify.sh`'))
  assert.equal(completionInstruction('t_1', ['./verify.sh']), t)
  assert.match(completionInstruction('t_1', []), /\/jeeves done/)
  // The template itself parses back as a block with the commands as checks.
  assert.deepEqual(parseComplete(t)?.checks, ['./verify.sh'])
})

test('audit 5: a check is compared in the ledger\'s form: a secret, a whitespace run, past the 300-character cap', () => {
  const recorded = (command: string) => ({ ...toolRecord({ tool: 'Bash', args: { command } })!, at: AT }) as LedgerEntry
  for (const check of ['DB_TOKEN=sk-ant-abcdefghijklmnop npm test', 'npm  test', `npm test -- ${'x'.repeat(400)}`]) {
    assert.equal(evaluate([check], [recorded(check)], []).ok, true, check)
  }
})
