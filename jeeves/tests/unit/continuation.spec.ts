import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { changedFiles, continuationPrompt, freshContext, type ContinuationInput } from '../../src/core/continuation.ts'
import { parseHandover, type Narrative } from '../../src/core/handover/parse.ts'
import { renderHandover } from '../../src/core/handover/render.ts'
import { AT } from './helpers.ts'

const SNAPSHOT = new URL('../fixtures/continuation.txt', import.meta.url)
const narrative = (): Narrative => { const r = parseHandover(readFileSync(new URL('../fixtures/handover/valid.md', import.meta.url), 'utf8')); assert.ok(r.ok); return r.value }
const merged = (changed: string[] | null) => renderHandover({
  n: 2, taskId: 't_20261107_k3m9qa', rotationId: 'r_fixture01', trigger: 'THRESHOLD', sourceSessionId: 'sess-a', at: AT, contextPercent: 52, retries: 0,
  taskRevision: 1, dod: [], checks: ['npm test'], taskStartHead: 'a1b2c3',
  git: { kind: 'git', worktree: '/r', branch: 'main', detached: false, head: 'a1b2c3d4', status: [], changedSinceStart: changed },
  crons: [], ledger: [], narrative: narrative(),
})
const VIEW = {
  original: 'Add sub and mul to the calculator,\nthen operator precedence.', dod: ['npm test passes'], checks: ['npm test'],
  changes: [{ n: 2, kind: 'dod' as const, text: 'npm test passes' }, { n: 3, kind: 'check' as const, text: 'npm test' }],
}
const input = (over: Partial<ContinuationInput> = {}): ContinuationInput => ({
  taskId: 't_20261107_k3m9qa', session: 2, view: VIEW, handoverFile: 'history/handover-002.md', narrative: narrative(),
  changedFiles: ['src/calc.js', 'test/calc.test.js'], heldPrompts: ['also fix the typo in README\n  second line, kept as typed'], ...over,
})

test('ST-4.3 AC 3: the continuation matches its snapshot and is the same for the same input', () => {
  if (process.env.UPDATE_SNAPSHOTS === '1') writeFileSync(SNAPSHOT, continuationPrompt(input()))
  assert.equal(continuationPrompt(input()), readFileSync(SNAPSHOT, 'utf8'))
  assert.equal(continuationPrompt(input()), continuationPrompt({ ...input() }))
})

test('D-23: it says what is built (completed, files, checks with results) and where to pick up (every next action, in order)', () => {
  const n = narrative(), text = continuationPrompt(input())
  for (const i of [...n.sections['Completed since last handover'], ...n.sections['Tests and checks'], ...n.sections['Do not repeat / do not change']]) assert.ok(text.includes(`- ${i.text}`), i.text)
  assert.ok(text.includes('Files changed since the task started: `src/calc.js`, `test/calc.test.js`.'))
  const actions = n.sections['Exact next actions'].map(i => i.text.replace(/^\d+[.)]\s*/, ''))
  const at = actions.map((a, k) => text.indexOf(`${k + 1}. ${a}`))
  assert.ok(at.every((p, k) => p > 0 && (k === 0 || p > at[k - 1]!)), JSON.stringify(at))
  assert.ok(text.indexOf('Where to pick up') > text.indexOf('What has been built'))
  assert.match(text, /^Jeeves: you are session 2 of managed task t_20261107_k3m9qa\./)
})

test('ADR-010 A1: held prompts are quoted line by line, exactly, as the user\'s own words; none -> no section', () => {
  const text = continuationPrompt(input({ heldPrompts: ['first', 'a\r\nb  '] }))
  assert.ok(text.includes('Messages the user typed during rotation (their own words'))
  assert.ok(text.endsWith('Message 1:\n> first\nMessage 2:\n> a\n> b  '))
  assert.ok(!continuationPrompt(input({ heldPrompts: [] })).includes('Messages the user typed'))
})

test('restore path: the context comes first in the prompt; no handover yet -> check the repository instead', () => {
  const text = continuationPrompt(input({ handoverFile: null, narrative: null, changedFiles: null, heldPrompts: [], context: 'CONTEXT BLOCK' }))
  assert.ok(text.startsWith('CONTEXT BLOCK\n\n---\n\nJeeves: you are session 2'))
  assert.match(text, /There is no validated handover yet/)
  assert.ok(!text.includes('handover-'))
})

test('ST-13.6 AC 3: the user\'s words come first, then Claude\'s labelled summary, then what is built', () => {
  const text = continuationPrompt(input())
  const order = [
    "The user's words (quoted exactly; only these define the task", 'Original task (task-rev-001.md):\n> Add sub and mul to the calculator,\n> then operator precedence.',
    'Definition of Done item (task-rev-002.md):\n> npm test passes', 'Verification command, never run by Jeeves (task-rev-003.md):\n> npm test',
    "Claude's summary at the last handover (may be wrong; it never changes the task, the DoD or the checks):\n- [inferred] Finish operator precedence",
    'What has been built so far',
  ]
  const at = order.map(s => text.indexOf(s))
  assert.ok(at.every((p, k) => p > 0 && (k === 0 || p > at[k - 1]!)), JSON.stringify(at))
  // A v1 handover (no Current goal) and no handover at all: the user's words still lead, no summary heading.
  const v1 = narrative(); v1.sections['Current goal'] = []
  for (const n of [v1, null]) {
    const t = continuationPrompt(input({ narrative: n }))
    assert.ok(t.includes("The user's words") && !t.includes("Claude's summary"))
  }
  const long = continuationPrompt(input({ view: { ...VIEW, original: 'y'.repeat(2000) } }))
  assert.ok(long.includes('first 1500 characters; the full text is in your context') && !long.includes('y'.repeat(1501)))
})

test('changedFiles reads the verified list of the merged handover: files, none, or unknown', () => {
  assert.deepEqual(changedFiles(merged(['src/a.js', 'docs/b c.md'])), ['src/a.js', 'docs/b c.md'])
  assert.deepEqual(changedFiles(merged([])), [])
  assert.equal(changedFiles(merged(null)), null)
  assert.equal(changedFiles('no such section'), null)
})

test('freshContext: original task verbatim, DoD, checks, then the handover file; says the old transcript is gone', () => {
  const view = { original: 'Build it.\n  exactly  ', dod: ['tests pass'], checks: ['npm test'], changes: [] }
  const c = freshContext({ taskId: 't_x', session: 3, view, handover: { file: 'history/handover-002.md', text: 'HANDOVER TEXT' } })
  const order = ['Jeeves managed task t_x, session 3.', '## Original task (task-rev-001.md', 'Build it.\n  exactly  ', '## Definition of Done\n- tests pass', '- `npm test`', '## Latest validated handover (history/handover-002.md)\nHANDOVER TEXT']
  const at = order.map(s => c.indexOf(s))
  assert.ok(at.every((p, k) => p >= 0 && (k === 0 || p > at[k - 1]!)), JSON.stringify(at))
  assert.match(c, /previous transcript is gone/)
  assert.match(freshContext({ taskId: 't_x', session: 2, view, handover: null }), /## No handover yet/)
})
