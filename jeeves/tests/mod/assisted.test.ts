// ST-4.6 / AC-25: assisted mode is honest. A refused /clear keeps the verified handover (NEEDS_REVIEW,
// ROTATE_UNAVAILABLE); status says assisted and what to do; /relay continue works only in a fresh conversation and
// continues there with the task and handover inside the prompt.
import { expect, test } from 'claude-code/testing'
import { engineClear, generating, handover, relay, stateOf, stop, turnEnd, until } from './kit.ts'

test('AC-25: /clear refused -> assisted, status says so; continue refused with turns; after /clear it continues here', async ($, on) => {
  const g = await generating($, on)
  const { h, dir, ctl, prompts } = g
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  ctl.rejectClear = true
  await turnEnd($)
  await until(h, () => stateOf(h, dir).status === 'NEEDS_REVIEW')
  expect([stateOf(h, dir).reason, stateOf(h, dir).mode]).toEqual(['ROTATE_UNAVAILABLE', 'assisted'])
  expect(h.toasts.at(-1)).toBe('Automatic /clear is unavailable. The handover is saved. Run /clear, then type /relay continue.')

  const status = await relay($, 'status')
  expect(status.split('\n')[0]).toBe('Jeeves  mode: assisted')
  expect(status).toContain('State: NEEDS_REVIEW (ROTATE_UNAVAILABLE)')
  expect(status).toContain('Run /clear, then /relay continue.')
  expect(status).not.toMatch(/automatic|by itself/i)

  // AC 2: not in a conversation that already has turns.
  h.turns = 3
  expect(await relay($, 'continue')).toBe('Run /clear first: /relay continue works only in a fresh conversation, so the old one is not mixed in.')
  expect(stateOf(h, dir).status).toBe('NEEDS_REVIEW')
  expect(await relay($, 'continue', 'plugin')).toBe('Only you can change a Jeeves task: type the /relay command yourself.')

  ctl.rejectClear = false
  await engineClear($, h, 'sess-2')
  h.turns = 0
  expect(stateOf(h, dir).status).toBe('NEEDS_REVIEW')
  expect(await relay($, 'continue')).toBe(`Continuing task ${g.taskId} here: Jeeves sends the task and its latest handover as the next prompt.`)
  await until(h, () => prompts.some(p => p.text.includes('Jeeves: you are session 2')))
  const text = prompts.find(p => p.text.includes('Jeeves: you are session 2'))!.text
  expect(text).toContain(`## Latest validated handover (history/handover-001.md)`)
  expect(text).toContain('1. [inferred] Fix precedence in `src/parse.js`.')
  const s = stateOf(h, dir)
  expect([s.status, s.activeSessionId, s.mode, JSON.parse(h.files.get(`${dir}/lock.d/owner.json`)!).ownerSessionId]).toEqual(['CONTINUING', 'sess-2', 'assisted', 'sess-2'])
  expect(await relay($, 'continue')).toBe('No handover is waiting for /relay continue. /relay status shows the task.')
})

test('a task already in assisted mode never runs /clear: the next rotation waits for the user at once', async ($, on) => {
  const g = await generating($, on)
  const { h, dir, clears } = g
  // As after an earlier refused /clear: the task carries mode assisted.
  h.files.set(`${dir}/state.json`, JSON.stringify({ ...stateOf(h, dir), mode: 'assisted' }))
  expect(await stop($, handover(g.taskId, g.rotationId))).toEqual({})
  await turnEnd($)
  await h.clock.settle()
  expect(clears).toEqual([])
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['NEEDS_REVIEW', 'ROTATE_UNAVAILABLE'])
})
