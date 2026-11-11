import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chooseCommandName, pickTask } from '../../src/adapter/commands.ts'
import { ARGUMENT_HINT, firstActivationText, HELP, needsYou, statusText, WIDTH, type StatusView } from '../../src/adapter/ui.ts'
import { probe, submitRefused, turnMode } from '../../src/core/probe.ts'
import { validState } from './helpers.ts'

const all = { 'command.run': true, 'prompt.submit': true, 'session.usage': true, 'process.run': true }
const full = probe({ version: '2.1.319', primitives: all })
const root = '/Users/someone-with-a-long-name/Library/Application Support/Jeeves'
const view = (over: Partial<StatusView> = {}): StatusView => ({ probe: full, stateRoot: root, stateRootError: null, task: null, taskError: null, ...over })
const shape = (text: string) => {
  const lines = text.split('\n')
  assert.ok(lines.length <= 8, `more than 8 lines:\n${text}`)
  for (const l of lines) assert.ok(l.length <= WIDTH, `wider than ${WIDTH}: "${l}"`)
  assert.ok(/^[\x20-\x7e\n]*$/.test(text), `non-ASCII in:\n${text}`)
}

test('no task: says so and how to start', () => {
  const t = statusText(view())
  shape(t)
  assert.equal(t.split('\n')[0], 'Jeeves  mode: full')
  assert.ok(t.includes('No managed task. Start with /jeeves on'))
  assert.ok(t.split('\n').at(-2)!.startsWith('Path: ...'))
  assert.equal(t.split('\n').at(-1), 'Try: /jeeves help')
})

test('a task: mode, task, state, context or unknown, threshold, rotations, last result, path', () => {
  const dir = `${root}/projects/9f2c00aa11bb22cc/tasks/t_20261107_k3m9qa`
  const state = validState({ status: 'PAUSED', reason: 'RATE_LIMIT', lastErrorCode: 'RATE_LIMIT', rotationCount: 2, sessionSequence: 3, lastValidatedHandover: 'history/handover-002.md#sha256:ab', lastContext: { window: 1_000_000, at: '2026-11-07T08:00:00Z', percent: 18 } })
  const t = statusText(view({ task: { state, dir } }))
  shape(t)
  for (const want of ['Task: t_20261107_k3m9qa', 'State: paused', 'Rate limit hit. /jeeves resume later', 'Context: 18%  Threshold: 50%', 'Rotations: 2/30  Session: 3', 'Last: handover-002.md', 'Try: /jeeves resume | off | help']) assert.ok(t.includes(want), `missing "${want}" in\n${t}`)
  const unknown = statusText(view({ task: { state: validState({ lastContext: { window: 1, at: '2026-11-07T08:00:00Z' } }), dir } }))
  assert.ok(unknown.includes('Context: unknown'), 'unknown, never 0%')
  assert.ok(!unknown.includes('0%  '))
})

test('unsupported and assisted modes and a broken state folder still fit', () => {
  const uns = statusText(view({ probe: probe({ version: '2.1.200', primitives: all }) }))
  shape(uns)
  assert.ok(uns.includes('mode: unsupported') && uns.includes('Needs 2.1.319+, this is 2.1.200'), uns)
  const unsTask = statusText(view({ probe: probe({ version: '2.1.200', primitives: all }), task: { state: validState(), dir: `${root}/projects/p/tasks/t1` } }))
  shape(unsTask)
  assert.ok(unsTask.split('\n').at(-1)!.startsWith('Try: '), `commands line kept:\n${unsTask}`)
  shape(statusText(view({ probe: probe({ version: '2.1.319', primitives: { ...all, 'process.run': false } }) })))
  const broken = statusText(view({ stateRoot: null, stateRootError: 'BAD_STATE_ROOT: HOME is not set; set stateDir in /config' }))
  shape(broken)
  assert.ok(broken.includes('State folder: error'))
  shape(statusText(view({ taskError: 't1: schemaVersion: version 9 is newer than this version of Jeeves supports (1); update' })))
  // Help may run longer than status, but stays 40 columns wide and ASCII.
  for (const l of HELP.split('\n')) assert.ok(l.length <= WIDTH && /^[\x20-\x7e]*$/.test(l), l)
})

test('command name: relay unless someone else has it', () => {
  assert.equal(chooseCommandName([]), 'jeeves')
  assert.equal(chooseCommandName([{ name: 'jeeves', plugin: 'jeeves' }]), 'jeeves', 'our own registration from before a reload')
  assert.equal(chooseCommandName([{ name: 'jeeves', plugin: 'other' }]), 'relay')
  assert.equal(chooseCommandName([{ name: 'jeeves' }]), 'relay', 'a user command')
})

test('pickTask prefers this session, then the latest non-disabled task', () => {
  const a = { state: validState({ taskId: 'a', activeSessionId: 'other', updatedAt: '2026-11-07T09:00:00Z' }) }
  const b = { state: validState({ taskId: 'b', activeSessionId: 'me', updatedAt: '2026-11-07T08:00:00Z' }) }
  const c = { state: validState({ taskId: 'c', status: 'DISABLED', updatedAt: '2026-11-07T10:00:00Z' }) }
  assert.equal(pickTask([a, b, c], 'me')?.state.taskId, 'b')
  assert.equal(pickTask([a, c], 'me')?.state.taskId, 'a')
  assert.equal(pickTask([c], 'me'), null)
})

test('ST-7.3: every reason code has a plain one-line message that fits the status width', async () => {
  const { REASON_TEXT } = await import('../../src/adapter/ui.ts')
  const { REASON_CODES } = await import('../../src/core/types.ts')
  assert.deepEqual(Object.keys(REASON_TEXT).sort(), [...REASON_CODES].sort())
  for (const code of REASON_CODES) {
    const t = REASON_TEXT[code]
    assert.ok(t.length > 0 && t.length <= WIDTH && /^[\x20-\x7e]+$/.test(t), `${code}: "${t}"`)
  }
})

test('status of a stopped task says the state and the reason in words, never the code', () => {
  const state = validState({ status: 'PAUSED', reason: 'USER_PAUSE' })
  const t = statusText(view({ task: { state, dir: '/x' } }))
  shape(t)
  assert.ok(t.includes('State: paused'))
  assert.ok(!t.includes('USER_PAUSE'))
  assert.ok(t.includes('Paused by you. /jeeves resume'))
})

test('AC-25: a task that fell back to assisted shows mode assisted and the one thing to do, never automatic rotation', () => {
  const state = validState({ status: 'NEEDS_REVIEW', reason: 'ROTATE_UNAVAILABLE', mode: 'assisted', lastValidatedHandover: 'history/handover-001.md#sha256:ab' })
  const t = statusText(view({ task: { state, dir: `${root}/t` } }))
  shape(t)
  assert.equal(t.split('\n')[0], 'Jeeves  mode: assisted')
  assert.ok(t.includes('Run /clear, then /jeeves continue.'))
  assert.ok(!/automatic|by itself/i.test(t))
  assert.match(firstActivationText('/s', true).join('\n'), /asks you to run \/clear, then \/jeeves continue/)
  assert.ok(!/by itself/.test(firstActivationText('/s', true).join('\n')))
})

test('ST-7.1: every state has a word label; status entries fit 40 columns, ASCII, user-unrelated', async () => {
  const { STATE_WORD, statusLine, transitionLine } = await import('../../src/adapter/ui.ts')
  const { STATUSES, REASON_CODES } = await import('../../src/core/types.ts')
  for (const status of STATUSES) {
    assert.ok(STATE_WORD[status], `no word for ${status}`)
    for (const reason of [null, ...REASON_CODES]) {
      const s = validState({ status, reason, lastContext: { window: 200_000, percent: 99.6, at: '2026-11-07T10:00:00.000Z' } })
      const line = statusLine(s, 50)
      if (status === 'DISABLED') { assert.equal(line, undefined); continue }
      // Claude Code shows `jeeves:` and the port drops our own `Jeeves: ` (hooks/register.ts): the rest fits the width.
      const shown = line!.replace(/^Jeeves:? /, '')
      assert.ok(shown.length <= WIDTH && /^[\x20-\x7e]+$/.test(shown), `bad status "${line}"`)
      assert.ok(line!.startsWith('Jeeves') && !(reason && line!.includes(reason)), `code shown: "${line}"`)
      for (const from of STATUSES) {
        const t = transitionLine(from, status, reason, s)
        if (from === status) assert.equal(t, null)
        else assert.ok(t && /^Jeeves: [\x20-\x7e]+$/.test(t), `bad line ${from}->${status}: "${t}"`)
      }
    }
  }
  assert.equal(statusLine(validState({ status: 'MONITORING', lastContext: null }), 50), 'Jeeves ?/50%')
  assert.equal(statusLine(validState({ status: 'MONITORING', mode: 'assisted' }), '7.2'), 'Jeeves ?/7.2% assisted')
})

test('diagnose: the home folder becomes ~ only as a whole path segment', async () => {
  const { tilde } = await import('../../src/adapter/diagnose.ts')
  assert.equal(tilde('State folder: /Users/al/.local/x', '/Users/al'), 'State folder: ~/.local/x')
  assert.equal(tilde('mkdir: /Users/al: Permission denied', '/Users/al'), 'mkdir: ~: Permission denied')
  assert.equal(tilde("cannot open '/Users/al'", '/Users/al'), "cannot open '~'")
  assert.equal(tilde('/Users/alice/x and /Users/al.bak', '/Users/al'), '/Users/alice/x and /Users/al.bak')
})

test('the command menu hint names every command in help', () => {
  for (const cmd of helpCommands()) assert.ok(ARGUMENT_HINT.split(' ').includes(cmd), `missing ${cmd}`)
  assert.ok(ARGUMENT_HINT.includes('--full') && ARGUMENT_HINT.includes('--diagnose'))
})

const helpCommands = () => HELP.split('\n').slice(1).filter(l => l !== 'More:').map(l => l.split(' ')[0]!)
// The first cell of each table row that starts with a code span, e.g. "| `pause` / `resume`".
const commandCells = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').split('\n')
  .filter(l => l.startsWith('| `')).map(l => l.split(' | ')[0]!)
const inTable = (cells: string[], cmd: string) => cells.some(c => c.includes(`\`${cmd}\``) || c.includes(`\`${cmd} `))

test('docs: every help command has a row in docs/commands.md; the everyday ones (before More:) also in the README', () => {
  const table = commandCells('../../docs/commands.md')
  for (const cmd of helpCommands()) assert.ok(inTable(table, cmd), `docs/commands.md has no row for ${cmd}`)
  const readme = commandCells('../../README.md')
  const everyday = HELP.split('\n').slice(1, HELP.split('\n').indexOf('More:')).map(l => l.split(' ')[0]!)
  assert.equal(everyday.length, 8)
  for (const cmd of everyday) assert.ok(inTable(readme, cmd), `README has no row for ${cmd}`)
  assert.ok(!inTable(['| `autoStart` (Auto-start)'], 'on'), 'a mention outside the first cell does not count')
})

test('more than 8 lines: Path, Last, Rotations, Waiting, TEST OVERRIDE give way in that order; the reason and the defaults warning always show', () => {
  const state = validState({ status: 'NEEDS_REVIEW', reason: 'HANDOVER_INVALID', taskRevision: 0 })
  const t = statusText(view({ probe: submitRefused(turnMode(full)), task: { state, dir: `${root}/projects/p/tasks/t1` }, defaultsError: 'bad', thresholdOverride: 30 }))
  shape(t)
  for (const want of ['mode: unsupported (turn)', 'Stop hook skipped and a prompt refused', 'Handover failed checks', 'Warning: defaults unreadable', 'State: waiting for you', 'Try: /jeeves retry | off | help']) assert.ok(t.includes(want), `missing ${want}:\n${t}`)
  assert.ok(!t.includes('Path:') && !t.includes('Last:'), t)
  const roomy = statusText(view({ task: { state: validState(), dir: `${root}/projects/p/tasks/t1` }, defaultsError: 'bad' }))
  assert.ok(roomy.includes('Try:') && roomy.includes('Last:') && roomy.includes('Warning: defaults unreadable'), roomy)
})

test('ST-14.2: the commands line offers what fits now and survives the 8-line rule', () => {
  const dir = `${root}/projects/p/tasks/t1`
  const ctx = (percent: number) => ({ lastContext: { window: 1_000_000, percent, at: '2026-11-07T08:00:00Z' } })
  const last = (over: Partial<StatusView>) => { const t = statusText(view(over)); shape(t); return t.split('\n').at(-1) }
  assert.equal(last({ task: { state: validState(ctx(44)), dir } }), 'Try: /jeeves help', 'below the warning')
  assert.equal(last({ task: { state: validState(ctx(45)), dir } }), 'Try: /jeeves later | off | help', 'in the warning')
  assert.equal(last({ task: { state: validState(ctx(50)), dir } }), 'Try: /jeeves help', 'at the threshold the handover is under way')
  assert.equal(last({ task: { state: validState(ctx(45)), dir }, auto: 'Auto off: off everywhere' }), 'Try: /jeeves on | help', "another session's warning is not this one's")
  assert.equal(last({ task: { state: validState({ status: 'BLOCKED', reason: 'DISK' }), dir } }), 'Try: /jeeves resume | off | help')
  assert.equal(last({ task: { state: validState({ ...ctx(10), rotationCount: 1, lastValidatedHandover: 'history/handover-001.md#sha256:ab' }), dir } }), 'Try: /jeeves handover | help', 'after a rotation (ST-14.4)')
  assert.equal(last({ task: { state: validState({ status: 'NEEDS_REVIEW', reason: 'POSSIBLE_LOOP' }), dir } }), 'Try: /jeeves retry | off | help')
  assert.equal(last({ task: { state: validState({ status: 'NEEDS_REVIEW', reason: 'HANDOVER_INVALID', consecutiveFailures: 2 }), dir } }), 'Try: /jeeves help', 'retries used up')
  assert.equal(last({ auto: 'Auto off: resumed conversation (+1 more)' }), 'Try: /jeeves on | help')
  assert.equal(last({ auto: 'Auto-start: on (default)' }), 'Try: /jeeves help')
  // Every test setting and warning at once: still 8 lines, the reason and the commands kept.
  const crowded = statusText(view({ probe: submitRefused(turnMode(full)), task: { state: validState({ status: 'PAUSED', reason: 'USER_PAUSE', taskRevision: 0 }), dir }, defaultsError: 'bad', thresholdOverride: 30, windowOverride: 200_000 }))
  shape(crowded)
  for (const want of ['Paused by you', 'Try: /jeeves resume | off | help']) assert.ok(crowded.includes(want), crowded)
})

test('needsYou: a stop the user did not cause, or a finished task, notifies once; their own stops and rotations do not', () => {
  const on = validState({ status: 'MONITORING', reason: null })
  const at = (status: Parameters<typeof validState>[0]['status'], reason: Parameters<typeof validState>[0]['reason'] = null) => validState({ status, reason })
  assert.equal(needsYou(on, at('NEEDS_REVIEW', 'HANDOVER_INVALID')), true)
  assert.equal(needsYou(on, at('PAUSED', 'MAX_ROTATIONS')), true)
  assert.equal(needsYou(on, at('PAUSED', 'RATE_LIMIT')), true)
  assert.equal(needsYou(on, at('BLOCKED', 'DISK')), true)
  assert.equal(needsYou(on, at('FAILED', 'API_ERROR')), true)
  assert.equal(needsYou(on, at('COMPLETED', 'COMPLETED')), true)
  assert.equal(needsYou(on, at('PAUSED', 'USER_PAUSE')), false)
  assert.equal(needsYou(on, at('PAUSED', 'USER_CLEAR')), false)
  assert.equal(needsYou(on, at('PAUSED', 'USER_INTERRUPT')), false)
  assert.equal(needsYou(on, at('ROTATING')), false)
  assert.equal(needsYou(at('NEEDS_REVIEW', 'HANDOVER_INVALID'), at('NEEDS_REVIEW', 'HANDOVER_INVALID')), false)
})
