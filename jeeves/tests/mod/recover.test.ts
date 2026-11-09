// ST-6.1 / AC-16 (I layer): a task left by a dead session is named at the next session start and continued once by
// /jeeves recover, from the last validated handover; never while another session's lock is live; a lost state.json is
// rebuilt, never deleted.
import { expect, test } from 'claude-code/testing'
import { generating, handover, relay, start, stateOf, stop, until, type Kit } from './kit.ts'
import type { MemHost } from './memfs.ts'

/** A new process: new session id, session.start again (the dead process ran no session.end). */
async function restart($: Kit, h: MemHost, sessionId = 'sess-2') {
  h.sessionId = sessionId
  await start($)
}
const continuations = (prompts: { text: string }[]) => prompts.filter(p => p.text.includes('Jeeves: you are session'))

test('AC 1-3: crash in ROTATING -> notice, LOCK_HELD while the lock is live, then exactly one continuation from handover-001; a second recover refuses', async ($, on) => {
  const g = await generating($, on)
  const { h, dir, prompts } = g
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  expect(stateOf(h, dir).status).toBe('ROTATING')
  // The process dies here: no turn.complete, no /clear, no session.end.
  await restart($, h)
  expect(h.toasts.at(-1)).toBe(`Task ${g.taskId} is ROTATING in another session. If that session stopped, /jeeves recover takes it over once it has been silent for 2 minutes.`)
  const live = await relay($, 'recover')
  expect(live).toContain('(LOCK_HELD)')
  expect(live).toMatch(/try again in \d+ s/)
  expect(stateOf(h, dir).status).toBe('ROTATING')

  await h.clock.advance(121_000)
  await start($)
  expect(h.toasts.at(-1)).toBe(`Task ${g.taskId} was left ROTATING by an earlier session. /jeeves recover continues it here.`)
  expect(await relay($, 'recover')).toBe(`Recovering task ${g.taskId} here: Jeeves sends the task and its last validated handover as the next prompt.`)
  await until(h, () => continuations(prompts).length > 0)
  await h.clock.settle()
  const cont = continuations(prompts)
  expect(cont.length).toBe(1)
  expect(cont[0]!.text).toContain('## Latest validated handover (history/handover-001.md)')
  expect(cont[0]!.text).toContain('Fix precedence in `src/parse.js`')
  expect(cont[0]!.text).not.toContain('stopped unexpectedly')
  const s = stateOf(h, dir)
  expect([s.status, s.activeSessionId, JSON.parse(h.files.get(`${dir}/lock.d/owner.json`)!).ownerSessionId]).toEqual(['CONTINUING', 'sess-2', 'sess-2'])
  expect(h.files.get(`${dir}/events.jsonl`)).toContain('recovered by /jeeves recover from ROTATING with history/handover-001.md')

  expect(await relay($, 'recover')).toBe('This session runs the task already: nothing to recover. /jeeves status shows it.')
  // From yet another session, while this one is alive: refused.
  h.sessionId = 'sess-3'
  expect(await relay($, 'recover')).toContain('(LOCK_HELD)')
  await h.clock.settle()
  expect(continuations(prompts).length).toBe(1)
})

test('crash mid-handover: recovered from the earlier state with the gap note (work after the last handover may exist)', async ($, on) => {
  const { h, dir, prompts } = await generating($, on)
  await restart($, h)
  await h.clock.advance(121_000)
  expect(await relay($, 'recover')).toContain('Recovering task')
  await until(h, () => continuations(prompts).length > 0)
  const text = continuations(prompts)[0]!.text
  expect(text).toContain('the previous session stopped unexpectedly. Work done after that may exist')
  expect(text).toContain('There is no validated handover yet')
  expect(stateOf(h, dir).status).toBe('CONTINUING')
})

test('AC 4: an unreadable state.json is rebuilt (NEEDS_REVIEW(STATE_CORRUPT) first), kept beside it, never deleted; own old tmp files go', async ($, on) => {
  const g = await generating($, on)
  const { h, dir, prompts } = g
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  h.files.set(`${dir}/state.json`, '{"schemaVersion": 1, "status": "ROTA')
  h.files.set(`${dir}/state.json.tmp-0123456789ab`, 'half')
  h.files.set(`${dir}/notes.tmp-0123456789ab`, 'not ours')
  await restart($, h)
  expect(h.toasts.at(-1)).toContain('its state.json is unreadable. /jeeves recover rebuilds it')
  expect(await relay($, 'status')).toContain('Task state unreadable')
  await h.clock.advance(121_000)
  expect(await relay($, 'recover')).toContain('(state.json rebuilt; the old file is kept)')
  const kept = [...h.files.keys()].filter(f => f.startsWith(`${dir}/state.json.corrupt-`))
  expect(kept.length).toBe(1)
  expect(h.files.get(kept[0]!)).toBe('{"schemaVersion": 1, "status": "ROTA')
  expect(h.files.has(`${dir}/state.json.tmp-0123456789ab`)).toBe(false)
  expect(h.files.get(`${dir}/notes.tmp-0123456789ab`)).toBe('not ours')
  expect(h.files.get(`${dir}/events.jsonl`)).toContain('"to":"NEEDS_REVIEW","code":"STATE_CORRUPT"')
  await until(h, () => continuations(prompts).length > 0)
  expect(continuations(prompts)[0]!.text).toContain('history/handover-001.md')
  expect(continuations(prompts)[0]!.text).toContain('stopped unexpectedly')
  const s = stateOf(h, dir)
  expect([s.status, s.taskId, s.taskRevision, s.lastValidatedHandover]).toEqual(['CONTINUING', g.taskId, 1, expect.stringContaining('history/handover-001.md#sha256:')])
})

test('a paused task, or no task, is not "recovered"', async ($, on) => {
  const { h } = await generating($, on)
  await restart($, h)
  await h.clock.advance(121_000)
  await relay($, 'off')
  expect(await relay($, 'recover')).toBe('Nothing to recover: no task here was interrupted. /jeeves status shows the task.')
})

test('autoRecover: at session start the interrupted task is continued without a command', { options: { autoRecover: true } }, async ($, on) => {
  const g = await generating($, on)
  const { h, dir, prompts } = g
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  // A clean exit released the lock, so the next start may recover at once.
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sess-test', resume: { id: 'sess-test' } })
  await restart($, h)
  expect(h.toasts.at(-1)).toContain('Recovering task')
  await until(h, () => continuations(prompts).length > 0)
  await h.clock.settle()
  expect(continuations(prompts).length).toBe(1)
  expect(stateOf(h, dir).status).toBe('CONTINUING')
})

test('review fix 2: a recover refused for a changed handover gives the lock back at once', async ($, on) => {
  const g = await generating($, on)
  const { h, dir } = g
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  h.files.set(`${dir}/history/handover-001.md`, 'edited by hand')
  await restart($, h)
  await h.clock.advance(121_000)
  expect(await relay($, 'recover')).toContain('no longer matches its checksum')
  expect(h.files.has(`${dir}/lock.d/owner.json`)).toBe(false)
  expect(stateOf(h, dir).status).toBe('ROTATING')
})

test('second review 1: a rebuild whose write fails leaves the unreadable state.json in place, so the task stays visible', async ($, on) => {
  const g = await generating($, on)
  const { h, dir } = g
  h.files.set(`${dir}/state.json`, '{ broken')
  await restart($, h)
  await h.clock.advance(121_000)
  h.failWrite = p => p.includes('state.json.tmp')
  await relay($, 'recover').catch(() => '')
  h.failWrite = null
  expect(h.files.get(`${dir}/state.json`)).toBe('{ broken')
  expect([...h.files.keys()].some(f => f.startsWith(`${dir}/state.json.corrupt-`))).toBe(true)
  expect(await relay($, 'status')).toContain('Task state unreadable')
})

test('code review 1: with its own active task, /jeeves recover refuses instead of taking the crashed one too', async ($, on) => {
  const g = await generating($, on)
  const { h, dir } = g
  await restart($, h)
  await h.clock.advance(121_000)
  // Seed this session as the owner of a second, running task.
  const mine = dir.replace(/[^/]+$/, 't_20261108_mine01')
  h.files.set(`${mine}/state.json`, JSON.stringify({ ...stateOf(h, dir), taskId: 't_20261108_mine01', status: 'MONITORING', reason: null, rotation: null, activeSessionId: 'sess-2', updatedAt: '2026-11-07T09:00:00.000Z' }))
  expect(await relay($, 'recover')).toBe('This session runs the task already: nothing to recover. /jeeves status shows it.')
  expect(stateOf(h, dir).status).toBe('HANDOVER_GENERATING')
})

test('code review 5: a state.json that fails to read (I/O) is never called corrupt or rebuilt', async ($, on) => {
  const g = await generating($, on)
  const { h, dir } = g
  const before = h.files.get(`${dir}/state.json`)
  h.failRead = p => p === `${dir}/state.json`
  await restart($, h)
  await h.clock.advance(121_000)
  expect(h.toasts.some(t => t.includes('unreadable'))).toBe(false)
  expect(await relay($, 'recover')).toContain('Nothing to recover')
  h.failRead = undefined
  expect(h.files.get(`${dir}/state.json`)).toBe(before)
  expect([...h.files.keys()].some(f => f.includes('state.json.corrupt-'))).toBe(false)
})

test('code review 9: an unknown argument to /jeeves recover is refused with the usage', async ($, on) => {
  const g = await generating($, on)
  await restart($, g.h)
  await g.h.clock.advance(121_000)
  expect(await relay($, 'recover --relnk')).toBe('Usage: /jeeves recover, or /jeeves recover --relink to continue after a branch switch or a moved folder.')
  expect(stateOf(g.h, g.dir).status).toBe('HANDOVER_GENERATING')
})

// ---- ST-13.7 (spec §5.8, D-43): an auto task cut off mid-rotation recovers by itself, only in a session that passes the gates ----
async function autoLeftRotating($: Kit, on: Parameters<typeof generating>[1]) {
  const g = await generating($, on)
  const { h, dir } = g
  h.files.set(`${dir}/state.json`, JSON.stringify({ ...stateOf(h, dir), origin: 'auto' }, null, 2) + '\n')
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sess-test', resume: { id: 'sess-test' } })
  return g
}

test('ST-13.7 AC 4: an interrupted auto task continues by itself in a fresh interactive full-mode session, without autoRecover', async ($, on) => {
  const g = await autoLeftRotating($, on)
  await restart($, g.h)
  expect(g.h.toasts.at(-1)).toBe(`Recovering task ${g.taskId} here: Jeeves sends the task and its last validated handover as the next prompt.`)
  await until(g.h, () => continuations(g.prompts).length > 0)
  await g.h.clock.settle()
  expect(continuations(g.prompts).length).toBe(1)
  expect([stateOf(g.h, g.dir).status, stateOf(g.h, g.dir).origin]).toEqual(['CONTINUING', 'auto'])
})

for (const [name, setup] of [
  ['under -p', async ($: Kit, h: MemHost) => { h.sessionId = 'sess-2'; await $.session.start({ cwd: '/work/proj', surface: 'terminal', isInteractive: false }) }],
  ['in a resumed conversation', async ($: Kit, h: MemHost) => { h.turns = 4; await restart($, h) }],
  ['in assisted mode', async ($: Kit, h: MemHost) => { h.failProcess = true; await restart($, h) }],
] as const) {
  test(`ST-13.7 AC 4: an interrupted auto task waits ${name}; /jeeves recover still works`, async ($, on) => {
    const g = await autoLeftRotating($, on)
    await setup($, g.h)
    await g.h.clock.settle()
    expect(continuations(g.prompts).length).toBe(0)
    expect(stateOf(g.h, g.dir).status).toBe('ROTATING')
    if (name === 'in assisted mode') return
    expect(g.h.toasts.at(-1)).toBe(`Task ${g.taskId} was left ROTATING by an earlier session. /jeeves recover continues it here.`)
    expect(await relay($, 'recover')).toContain(`Recovering task ${g.taskId} here`)
  })
}

test('ST-13.7 AC 5: an explicit task left mid-rotation follows autoRecover (off: the notice only)', async ($, on) => {
  const g = await generating($, on)
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sess-test', resume: { id: 'sess-test' } })
  await restart($, g.h)
  await g.h.clock.settle()
  expect(g.h.toasts.at(-1)).toBe(`Task ${g.taskId} was left ROTATING by an earlier session. /jeeves recover continues it here.`)
  expect(continuations(g.prompts).length).toBe(0)
})
