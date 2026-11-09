import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notified, started } from '../../src/core/background.ts'

const note = (id: string) => `<task-notification>\n<task-id>${id}</task-id>\n<status>completed</status>\n</task-notification>`

test('ADR-004 A2 count table: up at a start, down at its notification, never below zero', () => {
  const rows: [string, readonly string[], readonly string[]][] = [
    ['start a', [], ['a']],
    ['start a again', ['a'], ['a']],
    ['note a', ['a', 'b'], ['b']],
    ['note of an id never started', ['a'], ['a']],
    ['note without an id drops the oldest', ['a', 'b'], ['b']],
    ['note on empty stays empty', [], []],
  ]
  for (const [name, from, want] of rows) {
    const got = name.startsWith('start') ? started(from, 'a') : name.includes('never') ? notified(from, note('zz')) : name.includes('without') || name.includes('empty') ? notified(from, 'plain text') : notified(from, note('a'))
    assert.deepEqual(got, want, name)
  }
})
