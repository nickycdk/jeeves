import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, mkdir, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isStale, STALE_MS } from '../../src/core/lock.ts'
import { createStorage, StorageError } from '../../src/adapter/storage.ts'
import { nodePort, tempDir } from './node-port.ts'
import type { FsPort } from '../../src/adapter/ports.ts'
import { validState } from './helpers.ts'

const T0 = Date.parse('2026-11-07T08:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

test('isStale: older than 120 s without heartbeat, or unreadable', () => {
  assert.equal(isStale({ heartbeatAt: iso(T0) }, T0 + STALE_MS), false)
  assert.equal(isStale({ heartbeatAt: iso(T0) }, T0 + STALE_MS + 1), true)
  assert.equal(isStale({ heartbeatAt: 'garbage' }, T0), true)
})

test('writeState swaps atomically and round-trips; tmp files are gone; invalid state refused', async () => {
  const dir = await tempDir()
  const s = createStorage(nodePort())
  assert.equal(await s.readState(dir), null)
  await s.writeState(dir, validState({ rotationCount: 1 }))
  await s.writeState(dir, validState({ rotationCount: 2 }))
  const r = await s.readState(dir)
  assert.ok(r?.ok)
  assert.equal(r.value.rotationCount, 2)
  assert.deepEqual(await readdir(dir), ['state.json'])
  await assert.rejects(s.writeState(dir, validState({ status: 'ROTATING' })), (e: unknown) => e instanceof StorageError && e.code === 'INVALID')
})

test('second acquirer gets LOCK_HELD; the same session re-enters; only the owner releases', async () => {
  const dir = await tempDir()
  const a = createStorage(nodePort()), b = createStorage(nodePort())
  assert.deepEqual((await a.acquireLock(dir, 'sA', iso(T0), T0)).ok, true)
  const held = await b.acquireLock(dir, 'sB', iso(T0), T0 + 1000)
  assert.equal(held.ok, false)
  assert.ok(!held.ok && held.code === 'LOCK_HELD' && held.owner?.ownerSessionId === 'sA' && !held.stale)
  assert.equal((await a.acquireLock(dir, 'sA', iso(T0), T0)).ok, true, 're-entrant after a reload')
  assert.equal(await b.releaseLock(dir, 'sB'), false)
  assert.equal(await a.releaseLock(dir, 'sA'), true)
  assert.equal((await b.acquireLock(dir, 'sB', iso(T0), T0)).ok, true)
})

test('heartbeat and transfer only work for the owner', async () => {
  const dir = await tempDir()
  const s = createStorage(nodePort())
  await s.acquireLock(dir, 'sA', iso(T0), T0)
  assert.equal(await s.heartbeat(dir, 'sX', iso(T0 + 30_000)), false)
  assert.equal(await s.heartbeat(dir, 'sA', iso(T0 + 30_000)), true)
  assert.equal(await s.transferLock(dir, 'sX', 'sB', iso(T0)), false)
  assert.equal(await s.transferLock(dir, 'sA', 'sB', iso(T0 + 31_000)), true)
  const r = await createStorage(nodePort()).acquireLock(dir, 'sA', iso(T0), T0 + 31_000)
  assert.ok(!r.ok && r.owner?.ownerSessionId === 'sB' && r.owner.heartbeatAt === iso(T0 + 31_000))
})

test('stale lock: detectable, takeover re-checks staleness, and only one of two racing takers wins', async () => {
  const dir = await tempDir()
  await createStorage(nodePort()).acquireLock(dir, 'dead', iso(T0), T0)
  const fresh = await createStorage(nodePort()).takeoverLock(dir, 'sB', iso(T0 + 1000), T0 + 1000)
  assert.ok(!fresh.ok && !fresh.stale, 'a live lock is not taken over')
  const later = T0 + STALE_MS + 5000
  const held = await createStorage(nodePort()).acquireLock(dir, 'sB', iso(later), later)
  assert.ok(!held.ok && held.stale, 'stale is reported')
  const results = await Promise.all(['sB', 'sC', 'sD'].map(id => createStorage(nodePort()).takeoverLock(dir, id, iso(later), later)))
  assert.equal(results.filter(r => r.ok).length, 1)
  assert.deepEqual((await readdir(dir)).sort(), ['lock.d'])
})

test('lock.d without owner.json (crash after mkdir) is stale only once old', async () => {
  const dir = await tempDir()
  await mkdir(join(dir, 'lock.d'))
  const s = createStorage(nodePort())
  const now = Date.now()
  const young = await s.acquireLock(dir, 'sB', iso(now), now)
  assert.ok(!young.ok && young.owner === null && !young.stale)
  const old = (now - STALE_MS - 10_000) / 1000
  await utimes(join(dir, 'lock.d'), old, old)
  assert.equal((await s.takeoverLock(dir, 'sB', iso(now), now)).ok, true)
})

test('a slow taker that judged the lock stale cannot steal the fresh lock of a faster taker', async () => {
  const dir = await tempDir()
  await createStorage(nodePort()).acquireLock(dir, 'dead', iso(T0), T0)
  const later = T0 + STALE_MS + 5000
  // B pauses right after it judged the lock stale (at its first mkdir); A takes over meanwhile.
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  const real = nodePort()
  const slow: FsPort = { ...real, run: async (argv, o) => { if (argv[0] === 'mkdir' && argv[1]?.endsWith('lock.takeover.d')) await gate; return real.run(argv, o) } }
  const b = createStorage(slow).takeoverLock(dir, 'sB', iso(later), later)
  await new Promise(r => setTimeout(r, 50))
  const a = await createStorage(nodePort()).takeoverLock(dir, 'sA', iso(later), later)
  release()
  const rb = await b
  assert.equal(a.ok, true)
  assert.ok(!rb.ok && rb.owner?.ownerSessionId === 'sA' && !rb.stale, `B must see A's fresh lock, got ${JSON.stringify(rb)}`)
  assert.deepEqual((await readdir(dir)).sort(), ['lock.d'])
})

test('release works even with a heartbeat tmp file left inside lock.d by a crash', async () => {
  const dir = await tempDir()
  const s = createStorage(nodePort())
  await s.acquireLock(dir, 'sA', iso(T0), T0)
  await writeFile(join(dir, 'lock.d/owner.json.tmp-deadbeef'), '{')
  assert.equal(await s.releaseLock(dir, 'sA'), true)
  assert.deepEqual(await readdir(dir), [])
})
