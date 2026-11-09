// ST-4.4 / ADR-010 (+A1): a prompt typed during a handover is held (never sent to the old conversation), the box is
// emptied, the full text waits in state (the event line is redacted), and it is delivered once, quoted verbatim, in
// the continuation. Slash commands such as /jeeves pause still run.
import { expect } from 'claude-code/testing'
import { HELD_TEXT } from '../../src/adapter/ui.ts'
import { engineClear, generating, handover, relay, stateOf, stop, submit, turnEnd, until, test } from './kit.ts'

const TYPED = 'also update the README\n  keep this indent; key AKIAIOSFODNN7EXAMPLE'

test('AC 1-2, 4-5: held during the handover, box emptied, delivered once and verbatim; event line redacted', async ($, on) => {
  const g = await generating($, on)
  const { h, dir, ctl, prompts } = g
  const before = prompts.length
  const r = await submit($, TYPED)
  expect(r.drop).toBe(HELD_TEXT)
  expect(prompts.length).toBe(before)
  expect(h.toasts).toContain(HELD_TEXT)
  await until(h, () => h.fills.length > 0)
  expect(h.fills).toEqual([''])
  expect(stateOf(h, dir).heldPrompts).toEqual([TYPED])
  const events = h.files.get(`${dir}/events.jsonl`)!
  expect(events).toContain('held prompt 1 (')
  expect(events).not.toContain('also update the README')
  expect(events).not.toContain('AKIAIOSFODNN7EXAMPLE')

  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  // Typed in the window between the old session's end and the fresh SessionStart: still held.
  ctl.onClear = async () => {
    await $.session.end({ reason: 'clear', sessionId: 'sess-test', resume: { id: 'sess-test' } })
    h.sessionId = 'sess-2'
    expect((await submit($, 'second message')).drop).toBe(HELD_TEXT)
    await $.classic.SessionStart({ source: 'clear', session_id: 'sess-2' })
  }
  await turnEnd($)
  await until(h, () => prompts.some(p => p.text.startsWith('Jeeves: you are session 2')))
  await h.clock.settle()
  const cont = prompts.filter(p => p.text.startsWith('Jeeves: you are session 2'))
  expect(cont.length).toBe(1)
  expect(cont[0]!.text).toContain('Message 1:\n> also update the README\n>   keep this indent; key AKIAIOSFODNN7EXAMPLE\nMessage 2:\n> second message')
  expect(stateOf(h, dir).heldPrompts).toEqual([])
  // After the continuation, prompts go through as usual.
  await submit($, 'normal prompt')
  expect(prompts.at(-1)).toEqual({ text: 'normal prompt', origin: 'composer' })
})

test('AC 3: slash commands still run during a handover: /jeeves pause is not held and takes effect', async ($, on) => {
  const { h, dir, prompts } = await generating($, on)
  const r = await submit($, '/jeeves pause', { kind: 'composer' }, { name: 'jeeves', args: 'pause' })
  expect(r.drop).toBe(undefined)
  expect(prompts.at(-1)?.text).toBe('/jeeves pause')
  expect(await relay($, 'pause')).toBe('A handover is under way. Jeeves pauses once the fresh conversation has your task.')
  expect(stateOf(h, dir).pauseRequested).toBe(true)
  expect(stateOf(h, dir).heldPrompts).toEqual([])
})

test('a prompt from another plugin is never held, even during a handover', async ($, on) => {
  const { h, dir, prompts } = await generating($, on)
  expect((await submit($, 'from a plugin', { kind: 'plugin', name: 'other' })).drop).toBe(undefined)
  expect(prompts.at(-1)?.text).toBe('from a plugin')
  expect(stateOf(h, dir).heldPrompts).toEqual([])
})
