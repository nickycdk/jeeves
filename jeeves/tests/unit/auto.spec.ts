// ST-13.1: auto.json in the state root; an invalid file is reported, never thrown, so the caller can ignore it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readAuto, writeAuto } from '../../src/adapter/auto.ts'
import type { Runtime } from '../../src/adapter/runtime.ts'

const fakeRt = (root: string | null, files = new Map<string, string>()) => ({
  stateRoot: root,
  port: { read: async (p: string) => { const t = files.get(p); if (t === undefined) throw new Error('ENOENT'); return t } },
  storage: { replaceFile: async (p: string, t: string) => { files.set(p, t) } },
}) as unknown as Runtime

test('readAuto: none, valid, corrupt, too new, no state root', async () => {
  const files = new Map<string, string>()
  const rt = fakeRt('/s', files)
  assert.deepEqual(await readAuto(rt), { value: null, error: null })
  await writeAuto(rt, { schemaVersion: 1, default: 'off', reason: 'upgraded from 0.2' })
  assert.deepEqual(await readAuto(rt), { value: { schemaVersion: 1, default: 'off', reason: 'upgraded from 0.2' }, error: null })
  files.set('/s/auto.json', '{"schemaVersion":1,"default":')
  const bad = await readAuto(rt)
  assert.equal(bad.value, null); assert.match(bad.error!, /not valid JSON/)
  files.set('/s/auto.json', '{"schemaVersion":3,"default":"on"}')
  assert.match((await readAuto(rt)).error!, /newer/)
  assert.deepEqual(await readAuto(fakeRt(null)), { value: null, error: null })
})

test('writeAuto refuses an invalid value and writes nothing', async () => {
  const files = new Map<string, string>()
  await assert.rejects(writeAuto(fakeRt('/s', files), { schemaVersion: 1, default: 'maybe' as never }))
  assert.equal(files.size, 0)
})
