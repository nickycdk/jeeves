import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createQueue, createStorage, resolveStateRoot, sha256Hex, StorageError } from '../../src/adapter/storage.ts'
import type { FsPort } from '../../src/adapter/ports.ts'
import { nodePort, tempDir } from './node-port.ts'

const code = (err: unknown) => (err instanceof StorageError ? err.code : String(err))

test('50 concurrent appends on a real disk keep every line, in order', async () => {
  const dir = await tempDir()
  const s = createStorage(nodePort())
  const path = join(dir, 'events.jsonl')
  await Promise.all(Array.from({ length: 50 }, (_, i) => s.appendLine(path, `line-${i}`)))
  const lines = (await s.read(path)).trimEnd().split('\n')
  assert.deepEqual(lines, Array.from({ length: 50 }, (_, i) => `line-${i}`))
})

test('writeImmutable writes once, returns the SHA-256, and never overwrites', async () => {
  const dir = await tempDir()
  const s = createStorage(nodePort())
  const path = join(dir, 'history/handover-001.md')
  const hash = await s.writeImmutable(path, 'first ✓\n')
  assert.equal(hash, await sha256Hex('first ✓\n'))
  await assert.rejects(s.writeImmutable(path, 'second'), (e: unknown) => code(e) === 'IMMUTABLE_EXISTS')
  assert.equal(await s.read(path), 'first ✓\n')
})

test('a read-back mismatch is DISK', async () => {
  const real = nodePort()
  const flaky: FsPort = { ...real, read: async p => (await real.read(p)) + 'X' }
  const dir = await tempDir()
  await assert.rejects(createStorage(flaky).writeImmutable(join(dir, 'f'), 'a'), (e: unknown) => code(e) === 'DISK' && /hash mismatch/.test(String(e)))
})

test('fs failures surface as DISK and the queue keeps going', async () => {
  const real = nodePort()
  let fail = true
  const broken: FsPort = { ...real, write: async (p, t) => { if (fail) { fail = false; throw new Error('ENOSPC: no space left') } return real.write(p, t) } }
  const dir = await tempDir()
  const s = createStorage(broken)
  const path = join(dir, 'log')
  const [a, b] = await Promise.allSettled([s.appendLine(path, 'one'), s.appendLine(path, 'two')])
  assert.equal(a.status, 'rejected')
  assert.equal(code((a as PromiseRejectedResult).reason), 'DISK')
  assert.equal(b.status, 'fulfilled')
  assert.equal(await s.read(path), 'two\n')
})

test('ensureRoot creates the folder with user-only permissions', async () => {
  const root = join(await tempDir(), 'deep/SessionRelay')
  await createStorage(nodePort()).ensureRoot(root)
  assert.equal((await stat(root)).mode & 0o777, 0o700)
})

test('ensureRoot never changes the permissions of a folder that already exists', async () => {
  const root = await tempDir()
  await chmod(root, 0o755)
  await createStorage(nodePort()).ensureRoot(root)
  assert.equal((await stat(root)).mode & 0o777, 0o755)
})

test('queue runs tasks one at a time in order', async () => {
  const q = createQueue()
  const log: string[] = []
  const job = (n: number, ms: number) => q(async () => { log.push(`start${n}`); await new Promise(r => setTimeout(r, ms)); log.push(`end${n}`) })
  await Promise.all([job(1, 20), job(2, 1), job(3, 5)])
  assert.deepEqual(log, ['start1', 'end1', 'start2', 'end2', 'start3', 'end3'])
})

const fakePort = (env: Record<string, string>, uname: string): FsPort => ({
  ...nodePort(env),
  env: async n => env[n],
  run: async () => ({ exitCode: 0, stdout: `${uname}\n`, stderr: '' }),
})

test('state root: config override, plugin data dir, then OS default', async () => {
  assert.deepEqual(await resolveStateRoot(fakePort({ HOME: '/Users/u' }, 'Darwin'), { override: '/x/state/' }), { root: '/x/state', source: 'config' })
  await assert.rejects(resolveStateRoot(fakePort({}, 'Darwin'), { override: 'rel' }), (e: unknown) => code(e) === 'BAD_STATE_ROOT')
  assert.deepEqual(await resolveStateRoot(fakePort({ HOME: '/Users/u', CLAUDE_PLUGIN_DATA: '/d/p' }, 'Darwin')), { root: '/d/p/state', source: 'plugin-data' })
  assert.deepEqual(await resolveStateRoot(fakePort({ HOME: '/Users/u' }, 'Darwin')), { root: '/Users/u/Library/Application Support/SessionRelay', source: 'os-default' })
  assert.deepEqual(await resolveStateRoot(fakePort({ HOME: '/home/u' }, 'Linux')), { root: '/home/u/.local/state/sessionrelay', source: 'os-default' })
  assert.deepEqual(await resolveStateRoot(fakePort({ HOME: '/home/u', XDG_STATE_HOME: '/xdg' }, 'Linux')), { root: '/xdg/sessionrelay', source: 'os-default' })
})

test('state root: the env override needs SESSIONRELAY_TEST=1', async () => {
  assert.equal((await resolveStateRoot(fakePort({ HOME: '/h', SESSIONRELAY_STATE_DIR: '/t/s' }, 'Linux'))).source, 'os-default')
  assert.deepEqual(await resolveStateRoot(fakePort({ HOME: '/h', SESSIONRELAY_TEST: '1', SESSIONRELAY_STATE_DIR: '/t/s' }, 'Linux')), { root: '/t/s', source: 'test-env' })
})

test('state root is never inside the repo unless configured', async () => {
  const port = fakePort({ HOME: '/Users/u' }, 'Darwin')
  await assert.rejects(resolveStateRoot(port, { repoRoot: '/Users/u' }), (e: unknown) => code(e) === 'BAD_STATE_ROOT' && /inside the repository/.test(String(e)))
  assert.equal((await resolveStateRoot(port, { repoRoot: '/Users/u/proj' })).source, 'os-default')
  assert.equal((await resolveStateRoot(port, { repoRoot: '/r', override: '/r/.sessionrelay' })).root, '/r/.sessionrelay')
})
