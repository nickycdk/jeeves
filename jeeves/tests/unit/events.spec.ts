import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { createStorage, StorageError } from '../../src/adapter/storage.ts'
import { check } from '../../src/core/schema.ts'
import type { EventLine } from '../../src/core/types.ts'
import { nodePort, tempDir } from './node-port.ts'
import { AT } from './helpers.ts'

const ev = (over: Partial<EventLine> = {}): EventLine => ({
  v: 1, at: AT, taskId: 't1', rotationId: null, from: 'MONITORING', to: 'ROTATION_REQUESTED',
  code: 'THRESHOLD', pct: 52, sessionId: 's1', detail: '', ...over,
})

test('each append writes exactly one valid line, in call order, even when concurrent', async () => {
  const dir = await tempDir()
  const s = createStorage(nodePort())
  await Promise.all(Array.from({ length: 20 }, (_, i) => s.appendEvent(dir, ev({ pct: i }))))
  const lines = await s.readEvents(dir)
  assert.equal(lines.length, 20)
  assert.deepEqual(lines.map(l => JSON.parse(l).pct), Array.from({ length: 20 }, (_, i) => i))
  for (const l of lines) assert.ok(check('event', JSON.parse(l)).ok)
})

test('no line holds raw prompt text or secrets: detail is redacted and capped', async () => {
  const dir = await tempDir()
  const s = createStorage(nodePort())
  const prompt = 'Refactor the billing module. My key is sk-ant-api03-SECRETSECRETSECRET. ' + 'Details: '.repeat(200)
  await s.appendEvent(dir, ev({ detail: prompt }))
  const [line] = await s.readEvents(dir)
  assert.ok(line && !line.includes('SECRETSECRET'))
  assert.ok(JSON.parse(line).detail.length <= 200)
  assert.ok(!line.includes('Details: '.repeat(30)), 'the prompt is not stored whole')
})

test('an invalid event is refused, not written', async () => {
  const dir = await tempDir()
  const s = createStorage(nodePort())
  await assert.rejects(s.appendEvent(dir, ev({ code: 'NOPE' as never })), (e: unknown) => e instanceof StorageError && e.code === 'INVALID')
  assert.deepEqual(await s.readEvents(dir), [])
})

test('roll-over keeps every line in order', async () => {
  const dir = await tempDir()
  const s = createStorage(nodePort(), { eventLogMaxBytes: 2048 })
  for (let i = 0; i < 60; i++) await s.appendEvent(dir, ev({ pct: i, detail: `event number ${i}` }))
  const files = (await readdir(dir)).sort()
  assert.ok(files.length >= 3, `rolled into several files: ${files}`)
  assert.ok(files.includes('events-001.jsonl') && files.includes('events.jsonl'))
  assert.deepEqual((await s.readEvents(dir)).map(l => JSON.parse(l).pct), Array.from({ length: 60 }, (_, i) => i))
})
