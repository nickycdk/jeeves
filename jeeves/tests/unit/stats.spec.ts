// ST-11.4: the /jeeves stats aggregator over a fixture with known sessions.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregate, statsLines, type TaskFiles } from '../../src/core/stats.ts'
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
