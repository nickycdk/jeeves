import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { capturedFacts } from '../../src/core/evidence.ts'
import { factsLine, HANDOVER_INSTRUCTION_MAX, handoverInstruction } from '../../src/core/handover/template.ts'

const SNAPSHOT = new URL('../fixtures/handover-instruction.txt', import.meta.url)
const input = { taskId: 't_20261107_k3m9qa', rotationId: 'r_20261107080000_abcdef', maxChars: 12000, facts: { branch: 'main', head: 'a1b2c3d4e5f6a7b8c9d0', changedFiles: 3, commands: 7, edits: 1 } }

test('ST-3.4: the instruction matches its snapshot and is the same for the same input', () => {
  assert.equal(handoverInstruction(input), readFileSync(SNAPSHOT, 'utf8'))
  assert.equal(handoverInstruction({ ...input }), handoverInstruction(input))
})

test('ST-3.4: at most 2,500 characters, even with long ids, a long branch and the largest budget', () => {
  const worst = handoverInstruction({ taskId: 't'.repeat(100), rotationId: 'r'.repeat(100), maxChars: 100_000, facts: { branch: 'b'.repeat(250), head: 'f'.repeat(40), changedFiles: 99999, commands: 200, edits: 200 } })
  assert.ok(worst.length <= HANDOVER_INSTRUCTION_MAX, `${worst.length}`)
})

test('the facts line: detached HEAD, no git, unknown git, singulars', () => {
  assert.equal(factsLine({ branch: null, head: 'abc', changedFiles: 1, commands: 1, edits: 0 }), 'SessionRelay already recorded: a detached HEAD at abc, 1 changed file, 1 command with exit codes, 0 edits.')
  const ledger = [{ kind: 'cmd' as const, command: 'x', ok: true, exit: 0, at: '', agent: null }, { kind: 'edit' as const, path: '/a', at: '', agent: null }]
  assert.deepEqual(capturedFacts({ kind: 'none' }, ledger), { branch: null, head: null, changedFiles: null, commands: 1, edits: 1 })
  assert.equal(capturedFacts({ kind: 'unknown', reason: 'timeout' }, ledger), null)
  assert.match(factsLine(null), /records git status/)
  assert.equal(capturedFacts({ kind: 'git', worktree: '/r', branch: 'main', detached: false, head: 'h', status: [{ xy: ' M', path: 'a' }], changedSinceStart: null }, [])?.changedFiles, 1)
})
