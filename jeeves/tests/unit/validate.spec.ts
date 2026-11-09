import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { GitFacts } from '../../src/core/git.ts'
import { asPath, validateHandover, type Facts, type ValidationCode } from '../../src/core/handover/validate.ts'
import type { LedgerEntry } from '../../src/core/types.ts'
import { AT } from './helpers.ts'

const read = (name: string) => readFileSync(new URL(`../fixtures/handover/${name}`, import.meta.url), 'utf8')
const cmd = (command: string, ok: boolean, exit: number | null = ok ? 0 : 1): LedgerEntry => ({ kind: 'cmd', command, ok, exit, at: AT, agent: null })
const GIT: GitFacts = { kind: 'git', worktree: '/r', branch: 'main', detached: false, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', status: [{ xy: ' M', path: 'src/calc.js' }], changedSinceStart: ['src/calc.js'] }
/** The repository the synthetic fixtures describe: lint passed, the test suite failed. */
const facts = (over: Partial<Facts> = {}): Facts => ({
  taskId: 't_20261107_k3m9qa', rotationId: 'r_fixture01', maxChars: 12000, git: GIT, capturedBranch: 'main',
  ledger: [cmd('npm run lint', true), cmd('npm test', false)],
  existing: new Set(['src/calc.js', 'test/calc.test.js', 'src/parse.js', 'src/tokenize.js']), ...over,
})
const codes = (r: ReturnType<typeof validateHandover>) => (r.ok ? [] : [...new Set(r.errors.map(e => e.code))])

/** Validator outcome for each fixture that parses (the parser's own cases are in parse.spec.ts). */
const VALIDATE: Record<string, 'ok' | ValidationCode> = {
  'valid.md': 'ok', 'crlf.md': 'ok', 'fenced.md': 'ok', 'prose-around.md': 'ok', 'heading-case.md': 'ok', 'mentions-sentinel-in-prose.md': 'ok',
  'wrong-ids.md': 'WRONG_IDS', 'secret-inside.md': 'SECRET', 'oversize.md': 'TOO_LONG', 'false-pass.md': 'FALSE_PASS',
  'missing-path.md': 'MISSING_PATH', 'wrong-branch.md': 'REPO_MISMATCH', 'missing-heading.md': 'MISSING_HEADING', 'no-block.md': 'NO_BLOCK',
}
for (const [file, want] of Object.entries(VALIDATE)) {
  test(`validate ${file} -> ${want}`, () => {
    const r = validateHandover(read(file), facts())
    assert.deepEqual(codes(r), want === 'ok' ? [] : [want], JSON.stringify(!r.ok && r.errors))
  })
}

test('AC-08: a valid handover is ok with no errors and no warnings, and keeps its sections', () => {
  const r = validateHandover(read('valid.md'), facts())
  assert.ok(r.ok)
  assert.deepEqual(Object.keys(r), ['ok', 'narrative'])
  assert.equal(r.narrative.sections['Exact next actions'].length, 2)
})

test('the 10 real S-05 handovers (v1, six headings) validate for a pre-upgrade task against their fixture repo (branch main, HEAD 056b512, calc.js)', () => {
  for (let i = 1; i <= 10; i++) {
    const n = String(i).padStart(2, '0')
    const f = facts({ taskId: 't_20261107_spike0', rotationId: `r_0${n}`, existing: new Set(['calc.js']), ledger: [], git: { ...GIT, head: '056b512' + '0'.repeat(33), status: [] } })
    const r = validateHandover(read(`s05-trial-${n}.md`), { ...f, preUpgrade: true })
    assert.ok(r.ok, `trial ${n}: ${JSON.stringify(!r.ok && r.errors)}`)
    // ST-13.6 AC 2: the same block from a task created after the upgrade lacks the seventh heading.
    assert.deepEqual(codes(validateHandover(read(`s05-trial-${n}.md`), f)), ['MISSING_HEADING'])
  }
})

test('AC-09: "tests pass" for a command whose last run failed is an error naming the command; a later pass clears it', () => {
  const r = validateHandover(read('false-pass.md'), facts())
  assert.ok(!r.ok)
  assert.equal(r.errors[0]!.message, 'a bullet says `npm test` passed, but its last run exited 1; say it failed')
  assert.ok(validateHandover(read('false-pass.md'), facts({ ledger: [cmd('npm test', false), cmd('npm test', true)] })).ok)
  assert.deepEqual(codes(validateHandover(read('false-pass.md'), facts({ ledger: [cmd('npm test', true), cmd('cd app && npm test', false)] }))), ['FALSE_PASS'])
  const denied = validateHandover(read('false-pass.md'), facts({ ledger: [cmd('npm test', false, null)] }))
  assert.ok(!denied.ok && denied.errors[0]!.message.includes('did not finish'))
  // No run of it at all: nothing to contradict.
  assert.ok(validateHandover(read('false-pass.md'), facts({ ledger: [] })).ok)
})

test('an [inferred] or next-action mention of passing is not a claim; a "Tests and checks" bullet is, whatever its tag', () => {
  const inferred = read('valid.md').replace('- [inferred] Keep zero dependencies, as the task says.', '- [inferred] `npm test` probably passes now.')
  assert.ok(validateHandover(inferred, facts()).ok)
  const inTests = read('valid.md').replace('- [verified] `npm run lint` passed.', '- [inferred] `npm test` passes.')
  assert.deepEqual(codes(validateHandover(inTests, facts())), ['FALSE_PASS'])
})

test('paths: missing is an error; deleted in git status or absolute inside the worktree is fine; [inferred] names are not checked', () => {
  assert.deepEqual(codes(validateHandover(read('missing-path.md'), facts())), ['MISSING_PATH'])
  assert.ok(validateHandover(read('missing-path.md'), facts({ git: { ...GIT, status: [{ xy: ' D', path: 'src/lexer.js' }] } })).ok)
  const abs = read('valid.md').replace('`src/tokenize.js`', '`/r/src/lexer.js`')
  assert.ok(validateHandover(abs, facts({ git: { ...GIT, status: [{ xy: 'D ', path: 'src/lexer.js' }] } })).ok)
  const guess = read('valid.md').replace('- [inferred] Keep zero dependencies, as the task says.', '- [inferred] Check `package.json` for a test script.')
  assert.ok(validateHandover(guess, facts()).ok)
})

test('branch and HEAD: a wrong claim is REPO_MISMATCH; a right one is fine; a branch name is never read as a path', () => {
  const on = (b: string) => read('valid.md').replace('Branch `main` is the working branch', `The current branch is ${b}; branch \`${b}\` is the working branch`)
  assert.ok(validateHandover(on('feat/parser'), facts({ capturedBranch: 'feat/parser', git: { ...GIT, branch: 'feat/parser' } })).ok)
  assert.deepEqual(codes(validateHandover(on('feat/parser'), facts())), ['REPO_MISMATCH'])
  const head = (h: string) => read('valid.md').replace('nothing is committed yet', `HEAD is ${h}`)
  assert.ok(validateHandover(head('a1b2c3d'), facts()).ok)
  assert.deepEqual(codes(validateHandover(head('deadbee'), facts())), ['REPO_MISMATCH'])
})

test('fatal: the branch changed during the handover, or git did not answer; no retry can fix either', () => {
  const moved = validateHandover(read('valid.md'), facts({ capturedBranch: 'feature' }))
  assert.ok(!moved.ok && moved.fatal === 'REPO_MISMATCH')
  assert.match(moved.errors[0]!.message, /branch changed during the handover \(feature -> main\)/)
  const unknown = validateHandover(read('valid.md'), facts({ git: { kind: 'unknown', reason: 'timeout' } }))
  assert.ok(!unknown.ok && unknown.fatal === 'HANDOVER_INVALID')
  // No snapshot to compare with: checked against the facts now only.
  assert.ok(validateHandover(read('valid.md'), facts({ capturedBranch: undefined })).ok)
})

test('outside git: paths are still checked, branch claims are not', () => {
  assert.ok(validateHandover(read('valid.md'), facts({ git: { kind: 'none' }, capturedBranch: undefined })).ok)
  assert.deepEqual(codes(validateHandover(read('missing-path.md'), facts({ git: { kind: 'none' } }))), ['MISSING_PATH'])
})

test('asPath: file names yes; commands, code, URLs, dotted identifiers no', () => {
  for (const yes of ['calc.js', 'src/a.ts', 'src/a.ts:12', './x/y.md', 'docs/', 'package.json', 'a.test.ts,']) assert.ok(asPath(yes), yes)
  for (const no of ['npm test', 'a + b', 'console.log', 'obj.map', 'https://x.io/a.js', 'v1.2.3', 'f(x).js', '--flag', '~/.zshrc', 'sub', 'e.g', '/\\s+/', 'src\\a.js', '/api/users', '@types/node', 'date-fns/locale', 'origin/main', 'application/json']) assert.equal(asPath(no), null, no)
})

test('a search that found nothing is no failed check of the file it searched; a failed run of the file still is', () => {
  const h = read('valid.md').replace(/^- \[verified\] .*$/m, '- [verified] `src/calc.js` compiles ok.')
  assert.ok(h.includes('compiles ok'))
  assert.deepEqual(codes(validateHandover(h, facts({ ledger: [cmd('grep -n TODO src/calc.js', false)] }))), [])
  assert.deepEqual(codes(validateHandover(h, facts({ ledger: [cmd('node src/calc.js', false)] }))), ['FALSE_PASS'])
})
