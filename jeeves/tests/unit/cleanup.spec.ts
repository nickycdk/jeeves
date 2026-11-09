import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLEANUP_AGE_MS, expired } from '../../src/core/cleanup.ts'
import type { State } from '../../src/core/types.ts'
import { AT, validState } from './helpers.ts'

const NOW = Date.parse(AT) + CLEANUP_AGE_MS
const auto = (over: Partial<State> = {}) => validState({ origin: 'auto', status: 'DISABLED', rotationCount: 0, lastValidatedHandover: null, updatedAt: AT, ...over })

test('ST-13.8: the selection rule (spec §5.9)', () => {
  assert.equal(expired(auto(), NOW, false), true)
  assert.equal(expired(auto(), NOW - 1, false), false)
  assert.equal(expired(auto({ status: 'COMPLETED' }), NOW, false), true)
  assert.equal(expired(auto({ status: 'MONITORING' }), NOW, false), true)
  assert.equal(expired(auto({ status: 'MONITORING' }), NOW, true), false)
  for (const status of ['PAUSED', 'NEEDS_REVIEW', 'FAILED', 'BLOCKED'] as const) assert.equal(expired(auto({ status }), NOW * 2, false), false, status)
  assert.equal(expired(auto({ origin: 'explicit' }), NOW * 2, false), false)
  assert.equal(expired(auto({ rotationCount: 1 }), NOW * 2, false), false)
  assert.equal(expired(auto({ lastValidatedHandover: `history/handover-001.md#sha256:${'0'.repeat(64)}` }), NOW * 2, false), false)
  assert.equal(expired(auto({ updatedAt: 'not a date' }), NOW * 2, false), false)
})
