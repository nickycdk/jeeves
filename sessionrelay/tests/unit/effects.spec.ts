import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runEffects } from '../../src/adapter/effects.ts'
import { createStorage } from '../../src/adapter/storage.ts'
import type { EnginePort } from '../../src/adapter/ports.ts'
import type { Effect } from '../../src/core/machine.ts'
import { nodePort, tempDir } from './node-port.ts'
import { AT, validState } from './helpers.ts'

function fakeEngine(over: Partial<EnginePort> = {}) {
  const toasts: string[] = [], commands: string[] = []
  const port: EnginePort = {
    ...nodePort(),
    version: async () => ({ version: '2.1.319' }), sessionId: async () => 'sess-a', cwd: async () => '/w',
    usage: async () => ({ window: 1 }), runCommand: async n => { commands.push(n) }, submitPrompt: async () => {}, submitPromptSoon: () => {}, firstActivation: async () => false,
    appendHiddenNote: async () => {}, runningAgents: async () => 0, status: () => {}, toast: t => { toasts.push(t) }, log: () => {}, now: async () => Date.parse(AT),
    ...over,
  }
  return { port, toasts, commands }
}

test('runs generic effects in order and hands hook-bound ones back', async () => {
  const dir = await tempDir()
  const storage = createStorage(nodePort())
  const { port, toasts, commands } = fakeEngine()
  const effects: Effect[] = [
    { type: 'LOG_EVENT', key: 'r1:ROTATION_REQUESTED', rotationId: 'r1', from: 'MONITORING', to: 'ROTATION_REQUESTED', code: 'THRESHOLD', detail: 'context 52%' },
    { type: 'TOAST', key: 'r1:t', text: 'hello' },
    { type: 'BLOCK_STOP', key: 'r1:HANDOVER_REQUESTED', kind: 'handover-request', errors: [] },
    { type: 'RUN_CLEAR', key: 'r1:CLEAR_SCHEDULED' },
  ]
  const r = await runEffects(effects, { port, storage, taskDir: dir, state: validState({ status: 'ROTATION_REQUESTED', rotation: { rotationId: 'r1', trigger: 'THRESHOLD', requestedAt: AT, sourceSessionId: null, targetSessionId: null, step: 'REQUESTED', retries: 0, quiesceCount: 0, noteAppended: false } }) })
  assert.deepEqual(r.forHook.map(e => e.type), ['BLOCK_STOP'])
  assert.deepEqual(r.failed, [])
  assert.deepEqual(toasts, ['hello'])
  assert.deepEqual(commands, ['clear'])
  const [line] = await storage.readEvents(dir)
  assert.deepEqual(JSON.parse(line!).rotationId, 'r1')
})

test('/clear rejecting feeds CLEAR_FAILED back; a failing effect is reported, not thrown', async () => {
  const dir = await tempDir()
  const storage = createStorage(nodePort())
  const { port } = fakeEngine({ runCommand: async () => { throw new Error('not allowed') } })
  const r = await runEffects([
    { type: 'RUN_CLEAR', key: 'r1:CLEAR_SCHEDULED' },
    { type: 'TRANSFER_LOCK', key: 'r1:lock', from: 'nobody', to: 'sess-b' },
  ], { port, storage, taskDir: dir, state: validState() })
  assert.deepEqual(r.followUps, [{ type: 'CLEAR_FAILED' }])
  assert.equal(r.failed.length, 1)
  assert.match(r.failed[0]!.error, /lock not owned by nobody/)
})

test('RELEASE_LOCK releases the lock this session holds', async () => {
  const dir = await tempDir()
  const storage = createStorage(nodePort())
  await storage.acquireLock(dir, 'sess-a', AT, Date.parse(AT))
  const { port } = fakeEngine()
  await runEffects([{ type: 'RELEASE_LOCK', key: '-:release' }], { port, storage, taskDir: dir, state: validState({ activeSessionId: 'sess-a' }) })
  assert.equal((await createStorage(nodePort()).acquireLock(dir, 'sess-z', AT, Date.parse(AT))).ok, true)
})
