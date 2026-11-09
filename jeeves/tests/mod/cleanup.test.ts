// ST-13.8 / AC-44 (spec §5.9): at session start, ended auto tasks without a rotation are deleted 7 days after their
// last update, in every project under the resolved state folder, whatever auto-start says. Explicit and rotated tasks stay.
import { expect, test } from 'claude-code/testing'
import { bottom, fakeGit, PROMPT, relay, start, stateOf, submit, taskDirs, type Kit } from './kit.ts'
import { memHost, type MemHost } from './memfs.ts'

const DAY = 24 * 60 * 60_000
/** An auto task of this session, then ended with /jeeves off (DISABLED, lock released). */
async function endedAuto($: Kit, on: Parameters<typeof memHost>[0]) {
  const h = memHost(on)
  fakeGit(h)
  h.usage = { window: 1_000_000 }
  bottom(on)
  await start($)
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await relay($, 'off')
  expect([stateOf(h, dir).origin, stateOf(h, dir).status]).toEqual(['auto', 'DISABLED'])
  return { h, dir }
}
/** Patch the task's state as if it was last updated `ageMs` before now. */
function aged(h: MemHost, dir: string, ageMs: number, over: Record<string, unknown> = {}) {
  const s = stateOf(h, dir)
  h.files.set(`${dir}/state.json`, JSON.stringify({ ...s, ...over, updatedAt: new Date(Date.parse(s.updatedAt) - ageMs).toISOString() }, null, 2) + '\n')
}
const exists = (h: MemHost, dir: string) => h.files.has(`${dir}/state.json`)
async function nextSession($: Kit, h: MemHost, id: string) {
  h.sessionId = id
  await start($)
}

test('AC 1: an ended auto task is kept at 6 days 23 hours and deleted at 7 days, folder and all', async ($, on) => {
  const { h, dir } = await endedAuto($, on)
  aged(h, dir, 7 * DAY - 60 * 60_000)
  await nextSession($, h, 'sess-2')
  expect(exists(h, dir)).toBe(true)
  aged(h, dir, 60 * 60_000)
  await nextSession($, h, 'sess-3')
  expect([...h.files.keys()].some(f => f.startsWith(`${dir}/`))).toBe(false)
})

test('AC 2: explicit tasks, auto tasks with a rotation or a handover, and COMPLETED vs NEEDS_REVIEW', async ($, on) => {
  const { h, dir } = await endedAuto($, on)
  for (const over of [{ origin: 'explicit' }, { rotationCount: 1 }, { status: 'NEEDS_REVIEW', reason: 'HANDOVER_INVALID' }]) {
    aged(h, dir, 400 * DAY, over)
    await nextSession($, h, `sess-${JSON.stringify(over).length}`)
    expect(exists(h, dir)).toBe(true)
    aged(h, dir, 0, { origin: 'auto', rotationCount: 0, status: 'DISABLED', reason: null })
  }
  aged(h, dir, 8 * DAY, { status: 'COMPLETED' })
  await nextSession($, h, 'sess-9')
  expect(exists(h, dir)).toBe(false)
})

test('AC 3: a MONITORING auto task is kept while its lock is live, deleted once no lock holds it', async ($, on) => {
  const { h, dir } = await endedAuto($, on)
  aged(h, dir, 8 * DAY, { status: 'MONITORING' })
  const now = new Date(Date.parse(stateOf(h, dir).updatedAt) + 8 * DAY).toISOString()
  h.files.set(`${dir}/lock.d/owner.json`, JSON.stringify({ schemaVersion: 1, ownerSessionId: 'sess-live', acquiredAt: now, heartbeatAt: now }))
  h.dirs.add(`${dir}/lock.d`)
  await nextSession($, h, 'sess-2')
  expect(exists(h, dir)).toBe(true)
  h.files.delete(`${dir}/lock.d/owner.json`)
  h.dirs.delete(`${dir}/lock.d`)
  await nextSession($, h, 'sess-3')
  expect(exists(h, dir)).toBe(false)
})

test('AC 4: under a custom stateDir', { options: { stateDir: '/data/jeeves' } }, async ($, on) => {
  const { h, dir } = await endedAuto($, on)
  expect(dir.startsWith('/data/jeeves/projects/')).toBe(true)
  aged(h, dir, 7 * DAY)
  await nextSession($, h, 'sess-2')
  expect(exists(h, dir)).toBe(false)
})

test('AC 5: auto-start turned off everywhere still cleans', async ($, on) => {
  const { h, dir } = await endedAuto($, on)
  await relay($, 'auto off')
  aged(h, dir, 7 * DAY)
  await nextSession($, h, 'sess-2')
  expect(exists(h, dir)).toBe(false)
})
