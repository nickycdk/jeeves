// ST-11.4: the /jeeves stats aggregator over a fixture with known sessions.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregate, completionSummary, duration, statsLines, type CompletionInput, type TaskFiles } from '../../src/core/stats.ts'
import type { EventLine, SessionRecord } from '../../src/core/types.ts'
import { validState } from './helpers.ts'

const sess = (n: number, startPct: number | null, endPct: number | null, endReason: string | null, costUsd?: number): SessionRecord =>
  ({ schemaVersion: 1, sessionId: `s${n}`, startedAt: `2026-11-08T1${n}:00:00.000Z`, endedAt: null, endReason, startPct, endPct, ...(costUsd === undefined ? {} : { costUsd }) })
const ev = (to: EventLine['to'], code: EventLine['code'], from: EventLine['from'] = 'HANDOVER_GENERATING'): EventLine =>
  ({ v: 1, at: '2026-11-08T10:00:00.000Z', taskId: 't', rotationId: null, from, to, code, pct: null, sessionId: null, detail: '' })

const A: TaskFiles = {
  state: validState({ rotationCount: 2, lastContext: { window: 1_000_000, at: '2026-11-08T10:00:00Z', percent: 12 } }),
  sessions: [sess(1, 3, 52, 'clear', 0.5), sess(2, 5, 50, 'clear'), sess(3, 4, 30, 'exit', 0.25)],
  events: [ev('NEEDS_REVIEW', 'HANDOVER_INVALID'), ev('PAUSED', 'USER_PAUSE', 'MONITORING'), ev('NEEDS_REVIEW', 'HANDOVER_INVALID', 'NEEDS_REVIEW'), ev('RESTORING', 'THRESHOLD', 'ROTATING'), ev('RESTORING', 'MANUAL', 'ROTATING')],
}
const B: TaskFiles = {
  state: validState({ rotationCount: 1, lastContext: null }),
  sessions: [sess(1, 2, 49, 'clear', 1), sess(2, 6, null, null, 0)],
  events: [ev('NEEDS_REVIEW', 'POSSIBLE_LOOP', 'CONTINUING'), ev('NEEDS_REVIEW', 'HANDOVER_INVALID'), ev('RESTORING', 'THRESHOLD', 'ROTATING'), ev('RESTORING', 'STALE_LOCK', 'MONITORING')],
}

test('AC 1: figures match a fixture with known sessions', () => {
  const s = aggregate([A, B], 1)
  assert.deepEqual([s.tasks, s.unreadable, s.rotations, s.sessions], [2, 1, 3, 5], 'a recover (RESTORING STALE_LOCK) is not a rotation')
  assert.equal(s.avgAtRotation, (52 + 50 + 49) / 3)
  // cleared: A 52-5 + 50-4, B 49-6
  assert.equal(s.clearedPoints, 47 + 46 + 43)
  assert.equal(s.clearedTokens, null, 'B recorded no window, so no token figure')
  assert.equal(aggregate([A]).clearedTokens, (47 + 46) * 10_000)
  assert.deepEqual([s.costUsd, s.costKnown, s.costUnknown], [1.75, 4, 1])
  assert.deepEqual(s.failures, [['HANDOVER_INVALID', 2], ['POSSIBLE_LOOP', 1]], 'user pauses and repeated states are not failures')
})

test('AC 2: a session without cost is unknown, not $0; wording says context cleared', () => {
  const lines = statsLines('Stats', aggregate([{ ...A, sessions: [sess(1, 3, 52, 'clear')] }]))
  assert.ok(lines.includes('Cost: unknown'), lines.join('\n'))
  assert.ok(lines.some(l => l.startsWith('Context cleared: ')))
  assert.ok(!lines.join('\n').toLowerCase().includes('saved'))
  const mixed = statsLines('Stats', aggregate([A]))
  assert.ok(mixed.includes('Cost: $0.75 over 2 session(s), 1 unknown'), mixed.join('\n'))
  assert.ok(mixed.includes('Context cleared: 93 points (~930K tokens)'), mixed.join('\n'))
})

test('nothing yet: no rotations, no failures', () => {
  assert.deepEqual(statsLines('Stats', aggregate([])).slice(1), ['Tasks: 0', 'Rotations: 0  Sessions: 0', 'Avg context at rotation: none yet', 'Context cleared: 0 points', 'Cost: unknown', 'Failures: none'])
})

const START = Date.parse('2026-11-08T10:00:00.000Z')
const done = (over: Partial<CompletionInput> = {}): CompletionInput => ({
  state: validState({ rotationCount: 6, lastContext: { window: 200_000, at: '2026-11-08T13:20:00Z', percent: 30 } }),
  sessions: [sess(1, 10, 100, 'clear', 1), sess(2, 10, 100, 'clear', 2), sess(3, 10, null, null)],
  events: [ev('MONITORING', null, 'DISABLED')],
  liveCostUsd: 1.1, commits: 14, how: 'checks', checks: 2, now: START + (3 * 60 + 20) * 60_000, ...over,
})

test('completion summary: the full two lines', () => {
  assert.deepEqual(completionSummary(done()), [
    'Jeeves: task completed in 3h 20m: 6 handovers, 14 commits, 2/2 checks passed.',
    'Jeeves: context cleared 180 points (~360K tokens). Cost: $4.10 (1 session unknown).',
  ])
})

test('completion summary: handovers, commits and checks wording', () => {
  const first = (o: Partial<CompletionInput>) => completionSummary(done(o))[0]
  assert.match(first({ state: validState({ rotationCount: 0 }) }), /: no handovers,/)
  assert.match(first({ state: validState({ rotationCount: 1 }) }), /: 1 handover,/)
  assert.equal(first({ commits: null }), 'Jeeves: task completed in 3h 20m: 6 handovers, 2/2 checks passed.')
  assert.match(first({ commits: 0 }), / 0 commits,/)
  assert.match(first({ commits: 1 }), / 1 commit,/)
  assert.match(first({ how: 'user' }), /, confirmed by you\.$/)
  assert.match(first({ how: 'user', checks: 0 }), /, no checks set, confirmed by you\.$/)
})

test('completion summary: durations', () => {
  assert.deepEqual([30_000, 45 * 60_000, 200 * 60_000, (52 * 60 + 5) * 60_000].map(duration), ['<1m', '45m', '3h 20m', '2d 4h'])
})

test('completion summary: cost and context cleared', () => {
  const second = (o: Partial<CompletionInput>) => completionSummary(done(o))[1]
  assert.equal(second({ sessions: [sess(1, 10, 100, 'clear'), sess(2, 10, null, null)], liveCostUsd: null }), 'Jeeves: context cleared 90 points (~180K tokens).', 'no cost known: no cost part')
  assert.equal(second({ sessions: [sess(1, 10, 100, 'clear', 1), sess(2, 10, null, null, 2)] }), 'Jeeves: context cleared 90 points (~180K tokens). Cost: $4.10.', 'live cost added')
  assert.equal(second({ sessions: [sess(1, 10, 100, 'clear'), sess(2, 10, null, null)] }), 'Jeeves: context cleared 90 points (~180K tokens). Cost: $1.10 (2 sessions unknown).')
  assert.equal(completionSummary(done({ sessions: [], liveCostUsd: null })).length, 1, 'nothing cleared and no cost: one line')
})
