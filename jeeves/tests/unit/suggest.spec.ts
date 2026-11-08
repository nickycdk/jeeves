// ST-11.2: verification-check suggestions from package.json scripts and a top-level Makefile. Suggestions only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestChecks } from '../../src/core/suggest.ts'

const pkg = (scripts: Record<string, string>) => JSON.stringify({ name: 'x', scripts })

test('AC 1: test and typecheck scripts -> two suggestions, npm test first', () => {
  assert.deepEqual(suggestChecks(pkg({ build: 'tsc', typecheck: 'tsc --noEmit', test: 'node --test' }), null), ['npm test', 'npm run typecheck'])
})

test('AC 2: nothing matching -> none', () => {
  assert.deepEqual(suggestChecks(pkg({ build: 'tsc', start: 'node .' }), null), [])
  assert.deepEqual(suggestChecks(null, null), [])
})

test('AC 4: names with shell characters or too long are not shown; at most 4', () => {
  assert.deepEqual(suggestChecks(pkg({ 'test; rm -rf ~': 'x', [`test:${'a'.repeat(500)}`]: 'x', 'lint$(id)': 'x' }), null), [])
  const many = suggestChecks(pkg({ test: 'a', 'test:unit': 'a', 'test:e2e': 'a', lint: 'a', typecheck: 'a', check: 'a' }), null)
  assert.equal(many.length, 4)
  assert.deepEqual(many.slice(0, 2), ['npm test', 'npm run test:unit'])
})

test('AC 5: invalid package.json -> none, no error; scripts not an object -> none', () => {
  assert.deepEqual(suggestChecks('{ nope', null), [])
  assert.deepEqual(suggestChecks(JSON.stringify({ scripts: ['test'] }), null), [])
  assert.deepEqual(suggestChecks(JSON.stringify({ scripts: { test: 7 } }), null), [])
})

test('Makefile test/lint targets, after package.json ones, no duplicates of kind', () => {
  assert.deepEqual(suggestChecks(null, 'all: build\n\ntest: build\n\t./run\nlint:\n\tx\n  test-not:\n'), ['make test', 'make lint'])
  assert.deepEqual(suggestChecks(pkg({ test: 'x' }), 'test:\n\tx\n'), ['npm test', 'make test'])
})
