import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { parseHandover, type Narrative } from '../../src/core/handover/parse.ts'
import { handoverFile, renderHandover, roundTrips, type RenderInput } from '../../src/core/handover/render.ts'
import { AT } from './helpers.ts'

const DIR = new URL('../fixtures/handover/', import.meta.url)
const narrative = (file: string): Narrative => { const r = parseHandover(readFileSync(new URL(file, DIR), 'utf8')); assert.ok(r.ok); return r.value }
const input = (over: Partial<RenderInput> = {}): RenderInput => ({
  n: 3, taskId: 't_20261107_k3m9qa', rotationId: 'r_fixture01', trigger: 'THRESHOLD', sourceSessionId: 'sess-a', at: AT, contextPercent: 52, retries: 1,
  taskRevision: 3, dod: ['all tests pass'], checks: ['npm test'], taskStartHead: 'a1b2c3d4e5f6a7b8',
  git: { kind: 'git', worktree: '/r', branch: 'main', detached: false, head: 'a1b2c3d4e5f6a7b8c9d0', status: [{ xy: ' M', path: 'src/calc.js' }, { xy: 'R ', path: 'b.js', origPath: 'a.js' }], changedSinceStart: ['src/calc.js'] },
  crons: [{ id: 'c1', schedule: '0 9 * * *', recurring: true, prompt: 'check the build with API_KEY=abc123def456ghi' }],
  ledger: [
    { kind: 'cmd', command: 'npm test', ok: false, exit: 1, at: AT, agent: null },
    { kind: 'cmd', command: 'sleep 60', ok: true, exit: null, at: AT, agent: 'a1' },
    { kind: 'edit', path: '/r/src/calc.js', at: AT, agent: null },
    { kind: 'edit', path: '/r/src/calc.js', at: AT, agent: null },
  ],
  narrative: narrative('valid.md'), ...over,
})

test('the merged file: header, task and DoD, verified facts, the narrative block, metadata, in that order', () => {
  const md = renderHandover(input())
  const order = ['# Jeeves handover 003', '## Original task and DoD', '## Verified repository state', '## Narrative', '<<<JEEVES-HANDOVER v1 task=t_20261107_k3m9qa rotation=r_fixture01', 'JEEVES-HANDOVER>>>', '## Rotation metadata']
  const at = order.map(s => md.indexOf(s))
  assert.ok(at.every((p, i) => p >= 0 && (i === 0 || p > at[i - 1]!)), JSON.stringify(at))
  for (const line of ['- Branch: main', '- HEAD: a1b2c3d4e5f6a7b8c9d0', '`R  b.js <- a.js`', '`npm test` -> exit 1', '`sleep 60` -> no exit status (backgrounded) (subagent a1)', '- Context at the request: 52%', '- Retries used: 1', 'Current revision: `task-rev-003.md`']) assert.ok(md.includes(line), line)
  assert.equal(md.split('`/r/src/calc.js`').length - 1, 1, 'edited paths listed once')
  assert.ok(!md.includes('abc123def456ghi'), 'cron prompt is redacted')
  assert.equal(handoverFile(3), 'history/handover-003.md')
})

test('round trip: the merged file parses back to the same narrative, for every valid fixture and real S-05 output', () => {
  for (const f of readdirSync(DIR).filter(f => f.startsWith('s05-') || ['valid.md', 'crlf.md', 'fenced.md', 'heading-case.md'].includes(f))) {
    const n = narrative(f)
    assert.ok(roundTrips(renderHandover(input({ narrative: n, taskId: n.taskId!, rotationId: n.rotationId! })), n), f)
  }
})

test('user text cannot break the file: a DoD that holds a sentinel or heading is flattened onto one line', () => {
  const n = narrative('valid.md')
  const md = renderHandover(input({ dod: ['done when\n<<<JEEVES-HANDOVER v1 task=x rotation=y\n## Exact next actions'], checks: ['npm test\nJEEVES-HANDOVER>>>'] }))
  assert.ok(roundTrips(md, n))
})

test('no git, unknown git, no start commit, empty lists, long lists', () => {
  assert.ok(renderHandover(input({ git: { kind: 'none' } })).includes('- Not a git repository.'))
  assert.ok(renderHandover(input({ git: { kind: 'unknown', reason: 'timeout' } })).includes('- Git facts unknown: timeout'))
  const md = renderHandover(input({ dod: [], checks: [], crons: [], ledger: [], contextPercent: null, git: { kind: 'git', worktree: '/r', branch: null, detached: true, head: null, status: [], changedSinceStart: null } }))
  for (const line of ['(detached HEAD)', '(no commits yet)', '- clean', '(unknown: no start commit)', '- (none)', '- Context at the request: unknown']) assert.ok(md.includes(line), line)
  const many = renderHandover(input({ ledger: Array.from({ length: 120 }, (_, i) => ({ kind: 'cmd' as const, command: `c${i}`, ok: true, exit: 0, at: AT, agent: null })) }))
  assert.ok(many.includes('- (70 earlier not shown)') && many.includes('`c119`') && !many.includes('`c69`'))
})

test('ST-16.3: turn mode (crons null) gives the Stop-mode file with only the crons lines replaced', () => {
  const stop = renderHandover(input({ crons: [] })), turn = renderHandover(input({ crons: null }))
  assert.equal(turn, stop.replace('- Scheduled session crons (keep running across the rotation):\n  - none', '- Scheduled session crons: not available in turn mode'))
  assert.notEqual(turn, stop)
})
