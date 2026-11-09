// ST-13.2 (spec §5.5, §5.6, AC-38, AC-43): the upgrade check once per install, /jeeves auto, /jeeves defaults auto,
// /jeeves off for the session, and the /config row's precedence.
import { expect, test } from 'claude-code/testing'
import { bottom, PROMPT, relay, start, submit, type Kit } from './kit.ts'
import { memHost, type MemHost } from './memfs.ts'

const STATE = '/home/t/.local/state/jeeves'
const AUTO = `${STATE}/auto.json`
const UPGRADE = 'Jeeves can now watch long sessions by itself. Type /jeeves auto on to turn it on. Nothing changes until you do.'
const snapshot = (h: MemHost) => new Map(h.files)
/** A v0.2 project with a task, its defaults and nothing of v0.3. */
function v02Project(h: MemHost) {
  const p = `${STATE}/projects/0123456789abcdef`
  h.files.set(`${p}/project.json`, '{"schemaVersion":1,"repoRoot":"/old","worktree":"/old","createdAt":"2026-11-01T08:00:00.000Z"}\n')
  h.files.set(`${p}/config.json`, '{\n  "schemaVersion": 1,\n  "thresholdPercent": 60,\n  "verificationCommands": []\n}\n')
  h.files.set(`${p}/tasks/t_20261101_aaaaaa/task-rev-001.md`, 'old task')
  return p
}
const newSession = async ($: Kit, h: MemHost, id: string) => { h.sessionId = id; await start($) }

test('fresh install: on, no notice, no auto.json; still on in the next session after the first task made a project (AC 5, 8)', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  expect(h.toasts).not.toContain(UPGRADE)
  expect(h.files.has(AUTO)).toBe(false)
  expect(await relay($, 'auto')).toBe('Auto-start: on (fresh install).')
  await relay($, 'on')
  await submit($, PROMPT)
  expect([...h.files.keys()].some(f => f.includes('/projects/'))).toBe(true)
  await relay($, 'off')
  await newSession($, h, 'sess-2')
  expect(await relay($, 'auto')).toBe('Auto-start: on (fresh install).')
  expect(h.toasts).not.toContain(UPGRADE)
  expect(h.files.has(AUTO)).toBe(false)
})

test('/jeeves on on a fresh install, then an empty state folder (a new stateDir): never an upgrader (AC 6, 9)', async ($, on) => {
  const h = memHost(on)
  bottom(on)
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  for (const f of [...h.files.keys()]) if (f.startsWith(STATE)) h.files.delete(f)
  await newSession($, h, 'sess-2')
  expect(await relay($, 'auto')).toBe('Auto-start: on (fresh install).')
  // The /jeeves on notice is remembered under its own key, so it stays shown once, and firstActivationShown stays v0.2's.
  expect(await relay($, 'on')).not.toContain('keeps task state')
})

for (const [why, seed] of [['firstActivationShown', (h: MemHost) => void h], ['a project in the state folder', v02Project]] as const) {
  test(`upgrader by ${why}: auto.json off, notice once, nothing else changed, off until /jeeves auto on (AC 4)`, async ($, on) => {
    const h = memHost(on, undefined, why === 'firstActivationShown' ? { firstActivationShown: true } : {})
    seed(h)
    const before = snapshot(h)
    await start($)
    expect(h.toasts.filter(t => t === UPGRADE).length).toBe(1)
    expect(JSON.parse(h.files.get(AUTO)!)).toEqual({ schemaVersion: 1, default: 'off', reason: 'upgraded from 0.2' })
    for (const [f, text] of before) expect(h.files.get(f)).toBe(text)
    expect([...h.files.keys()].filter(f => !before.has(f))).toEqual([AUTO])
    expect(await relay($, 'auto')).toBe('Auto-start: off (upgraded from 0.2).')
    // Review fix 2: reason 3b, so the session gets the hint (spec §6.1), not the explicit "everywhere".
    expect(await relay($, 'status')).toMatch(/^Auto off: upgraded from 0\.2/m)
    await newSession($, h, 'sess-2')
    expect(h.toasts.filter(t => t === UPGRADE).length).toBe(1)
    expect(await relay($, 'auto on')).toContain('Auto-start everywhere: on.')
    expect(await relay($, 'auto')).toBe('Auto-start: on (auto.json).')
  })
}

test('the check runs once: a stored result is kept whatever the state folder holds (AC 10, 11)', async ($, on) => {
  const h = memHost(on, undefined, { upgradeCheck: 'fresh' })
  v02Project(h)
  await start($)
  expect(h.files.has(AUTO)).toBe(false)
  expect(await relay($, 'auto')).toBe('Auto-start: on (fresh install).')
})

test('an upgrader with a new, empty stateDir stays off (AC 11)', async ($, on) => {
  const h = memHost(on, undefined, { upgradeCheck: 'upgrader' })
  await start($)
  expect(h.files.has(AUTO)).toBe(false)
  expect(h.toasts).not.toContain(UPGRADE)
  expect(await relay($, 'auto')).toBe('Auto-start: off (upgraded from 0.2).')
})

// Pinned (spec §5.6, accepted gap): a wiped store with the projects kept reads as an upgrader. Off is the safe direction;
// do not "fix" this towards on.
test('a plugin store wiped while the state folder keeps its projects (a reinstall): upgrader, auto-start off (AC 12)', async ($, on) => {
  const h = memHost(on)
  v02Project(h)
  await start($)
  expect(await relay($, 'auto')).toBe('Auto-start: off (upgraded from 0.2).')
  expect(JSON.parse(h.files.get(AUTO)!).default).toBe('off')
})

test('/jeeves auto on|off writes only auto.json; only the user may; a bad value is refused (AC 2, 7)', async ($, on) => {
  const h = memHost(on)
  await start($)
  const before = snapshot(h)
  expect(await relay($, 'auto off', 'plugin')).toContain('Only you can change')
  expect(await relay($, 'defaults auto off', 'plugin')).toContain('Only you can change')
  expect(await relay($, 'auto maybe')).toContain('Usage: /jeeves auto')
  expect(h.files).toEqual(before)
  expect(await relay($, 'auto off')).toContain('Auto-start everywhere: off.')
  expect([...h.files.keys()].filter(f => h.files.get(f) !== before.get(f))).toEqual([AUTO])
  expect(JSON.parse(h.files.get(AUTO)!)).toEqual({ schemaVersion: 1, default: 'off' })
  expect(await relay($, 'auto')).toBe('Auto-start: off (auto.json).')
})

test('the /config row on or off wins over auto.json, and /jeeves auto says so (AC 1, 3)', { options: { autoStart: 'on' } }, async ($, on) => {
  memHost(on)
  await start($)
  expect(await relay($, 'auto off')).toBe('Saved, but /config → Auto-start is set to on, which takes precedence.')
  expect(await relay($, 'auto')).toBe('Auto-start: on (/config).')
})

test('project defaults win over the row and auto.json; config.json is schema 2 only while autoStart is set (AC 1)', { options: { autoStart: 'on' } }, async ($, on) => {
  const h = memHost(on)
  await start($)
  expect(await relay($, 'defaults auto off')).toContain('Auto-start for this project: off')
  const config = [...h.files.keys()].find(f => f.endsWith('/config.json'))!
  expect(JSON.parse(h.files.get(config)!)).toEqual({ schemaVersion: 2, verificationCommands: [], autoStart: 'off' })
  expect(await relay($, 'defaults')).toContain('Auto-start: off')
  expect(await relay($, 'auto')).toBe('Auto-start: off (this project).')
  expect(await relay($, 'defaults auto sometimes')).toContain('Usage: /jeeves defaults')
  await relay($, 'defaults clear')
  expect(JSON.parse(h.files.get(config)!)).toEqual({ schemaVersion: 1, verificationCommands: [] })
  expect(await relay($, 'auto')).toBe('Auto-start: on (/config).')
})

test('/jeeves off keeps auto-start off for this session only, with or without a task; /jeeves on still works (AC 1)', async ($, on) => {
  const h = memHost(on)
  await start($)
  expect(await relay($, 'off')).toBe('No managed task. Auto-start is off for the rest of this session; /jeeves on still starts a task.')
  expect(await relay($, 'auto')).toBe('Auto-start: off (this session).')
  expect(await relay($, 'on')).toContain('Jeeves on')
  await relay($, 'off')
  await newSession($, h, 'sess-2')
  expect(await relay($, 'auto')).toBe('Auto-start: on (fresh install).')
})

test('an unreadable auto.json is ignored and said (ST-13.1 AC 3)', async ($, on) => {
  const h = memHost(on, undefined, { upgradeCheck: 'fresh' })
  h.files.set(AUTO, '{"schemaVersion":1,"default":')
  await start($)
  const shown = await relay($, 'auto')
  expect(shown).toContain('Auto-start: on (fresh install).')
  expect(shown).toContain('Warning: auto.json is unreadable and ignored')
})
