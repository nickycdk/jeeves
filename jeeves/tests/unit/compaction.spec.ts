import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COMPACTION_DROP, isCompaction, tokensOf } from '../../src/core/compaction.ts'

test('ST-16.5: which falls read as a compaction', () => {
  const last = { sessionId: 's1', tokens: 70_222 }
  const rows: [string, Parameters<typeof isCompaction>, boolean][] = [
    ['the probe\'s typed /compact (70,222 -> 57,907)', [last, 's1', 57_907], true],
    ['a compaction near a 50% threshold of 200K', [{ sessionId: 's1', tokens: 100_000 }, 's1', 62_000], true],
    ['a growing context', [last, 's1', 75_000], false],
    ['a small fall (a rewind of a few turns)', [last, 's1', 70_222 - 3_000], false],
    ['exactly the amount', [last, 's1', 70_222 - COMPACTION_DROP], false],
    ['a fall after a /clear (new session id)', [last, 's2', 40_000], false],
    ['no earlier reading', [null, 's1', 40_000], false],
    ['an unknown size', [last, 's1', null], false],
    ['a rewind of more than the amount reads as one (harmless, one extra rotation)', [last, 's1', 70_222 - 15_000], true],
  ]
  for (const [name, args, want] of rows) assert.equal(isCompaction(...args), want, name)
})

test('tokensOf: tokens first, else percent of the window, else unknown', () => {
  assert.equal(tokensOf({ tokens: 12, percent: 50, window: 100 }), 12)
  assert.equal(tokensOf({ percent: 5.2, window: 1_000_000 }), 52_000)
  assert.equal(tokensOf({ window: 1_000_000 }), null)
  assert.equal(tokensOf({ percent: 5, window: 0 }), null)
})
