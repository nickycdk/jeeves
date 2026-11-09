// ST-14.1 (spec §6.1, AC-47): a session that is not auto-watched gets one hint at threshold - 5, only for reasons 3b
// and 4-6, never after an explicit off at any level or under -p, silent after 3 unanswered; plugin store only.
import type { SessionMeasureInput } from 'claude-code'
import { expect } from 'claude-code/testing'
import { fakeGit, relay, start, test, type Kit } from './kit.ts'
import { memHost, type MemHost } from './memfs.ts'

// Each test states the row: the hint depends on auto-start's own setting, not on the suite's mode.
const ROW = { options: { autoStart: 'default' } } as const
const STATE = '/home/t/.local/state/jeeves'
const hintAt = (p: number) => `Jeeves: this session is at ${p}%. /jeeves on would hand it over to a fresh conversation before it fills up. /jeeves auto off hides this.`
const measure = ($: Kit, h: MemHost, percent: number) => {
  h.usage = { ...h.usage, percent }
  return $.session.measure({ context: { window: h.usage.window, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
}
const hints = (h: MemHost) => h.toasts.filter(t => t.startsWith('Jeeves: this session is at'))

type Setup = (h: MemHost) => void
const cases: [string, Setup, number][] = [
  ['3b: upgraded from 0.2 (1M, git)', h => { fakeGit(h); h.usage = { window: 1_000_000 } }, 35],
  ['4: resumed conversation (1M, git)', h => { fakeGit(h); h.usage = { window: 1_000_000 }; h.turns = 3 }, 35],
  ['5: not a git repository (1M)', h => { h.usage = { window: 1_000_000 } }, 35],
  ['6: window below 200K at start (git)', h => { fakeGit(h); h.usage = { window: 128_000 } }, 45],
]
for (const [name, setup, at] of cases) {
  test(`shown for ${name}, once, at threshold - 5; no file in the state folder (AC 1, 2, 4)`, ROW, async ($, on) => {
    const h = memHost(on, undefined, name.startsWith('3b') ? { upgradeCheck: 'upgrader' } : {})
    setup(h)
    await start($)
    const before = new Map([...h.files].filter(([f]) => f.startsWith(STATE)))
    await measure($, h, at - 1)
    expect(hints(h)).toEqual([])
    await measure($, h, at)
    await measure($, h, at + 10)
    expect(hints(h)).toEqual([hintAt(at)])
    expect(new Map([...h.files].filter(([f]) => f.startsWith(STATE)))).toEqual(before)
  })
}

test('not shown under -p, nor after an off for this session, this project, everywhere or in /config (AC 1)', ROW, async ($, on) => {
  const h = memHost(on)
  await $.session.start({ cwd: '/work/proj', surface: 'terminal', isInteractive: false })
  await measure($, h, 60)
  expect(hints(h)).toEqual([])
  for (const off of ['off', 'defaults auto off', 'auto off']) {
    h.sessionId = `s-${off}`
    await start($)
    await relay($, off)
    await measure($, h, 60)
    expect(hints(h)).toEqual([])
    if (off === 'defaults auto off') await relay($, 'defaults clear') // back to no project setting for the next case
  }
})

test('not shown with the /config row off', { options: { autoStart: 'off' } }, async ($, on) => {
  const h = memHost(on)
  await start($)
  await measure($, h, 60)
  expect(hints(h)).toEqual([])
})

test('silent after 3 unanswered hints; a typed /jeeves on resets the count (AC 3)', ROW, async ($, on) => {
  const h = memHost(on)
  const session = async (id: string) => { h.sessionId = id; await start($); await measure($, h, 45) }
  for (const id of ['s1', 's2', 's3', 's4']) await session(id)
  expect(hints(h).length).toBe(3)
  await relay($, 'on')
  await relay($, 'off')
  await session('s5')
  expect(hints(h).length).toBe(4)
})
