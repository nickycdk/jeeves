import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isInside, join, normalize } from '../../src/core/paths.ts'

test('normalize, join', () => {
  assert.equal(normalize('/a//b/./c/../d/'), '/a/b/d')
  assert.equal(normalize('/../x'), '/x')
  assert.equal(join('/a', 'b/c', '../d'), '/a/b/d')
})

test('isInside compares whole path segments', () => {
  assert.ok(isInside('/r/x', '/r'))
  assert.ok(isInside('/r', '/r/'))
  assert.ok(!isInside('/repo2', '/repo'))
  assert.ok(isInside('/r/a/../b', '/r'))
  assert.ok(!isInside('/r/../s', '/r'))
  assert.ok(isInside('/anything', '/'))
})
