import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PRODUCT } from '../../src/core/types.ts'

test('core loads under node type stripping', () => {
  assert.equal(PRODUCT, 'SessionRelay')
})
