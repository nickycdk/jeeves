// ST-6.2 / AC-23: classic.StopFailure pauses with the error's own code and fix; Jeeves never sends a prompt after it.
import { expect, test } from 'claude-code/testing'
import { generating, relay, stateOf, submit, turnEnd, until, type Kit } from './kit.ts'

const fail = ($: Kit, error: 'rate_limit' | 'authentication_failed' | 'overloaded', agent_id?: string) =>
  $.classic.StopFailure({ error, ...(agent_id ? { agent_id } : {}) } as never)

test('a rate limit during the handover: PAUSED(RATE_LIMIT) with the reset time; no prompt follows, not even after the turn ends', async ($, on) => {
  const { h, dir, prompts } = await generating($, on)
  h.rateLimits = [{ kind: 'seven_day', percentUsed: 40 }, { kind: 'five_hour', percentUsed: 100, resetsAt: '2026-11-07T14:00:00.000Z' }]
  const before = prompts.length
  await fail($, 'rate_limit')
  const s = stateOf(h, dir)
  expect([s.status, s.reason, s.consecutiveFailures]).toEqual(['PAUSED', 'RATE_LIMIT', 0])
  expect(h.toasts.at(-1)).toBe('Paused (RATE_LIMIT): the usage limit is reached. It resets at 2026-11-07 14:00 UTC. Then type /relay resume.')
  await turnEnd($)
  await h.clock.advance(5_000)
  await until(h, () => true)
  expect(prompts.length).toBe(before)
})

test('each code pauses with its own reason; a subagent failure changes nothing', async ($, on) => {
  const { h, dir } = await generating($, on)
  await fail($, 'overloaded', 'agent-1')
  expect(stateOf(h, dir).status).toBe('HANDOVER_GENERATING')
  await fail($, 'authentication_failed')
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['PAUSED', 'AUTH'])
  expect(h.toasts.at(-1)).toContain('Run /login')
})

test('review fix 1: a message held during a handover that a rate limit paused is delivered once by /relay resume', async ($, on) => {
  const { h, dir, prompts } = await generating($, on)
  await submit($, 'please also add a README')
  await fail($, 'rate_limit')
  expect(stateOf(h, dir).heldPrompts).toEqual(['please also add a README'])
  expect(await relay($, 'resume')).toContain('Resumed')
  await until(h, () => prompts.some(p => p.text.includes('> please also add a README')))
  await h.clock.settle()
  expect(prompts.filter(p => p.text.includes('> please also add a README')).length).toBe(1)
  expect(prompts.at(-1)!.text.startsWith('Jeeves: the handover was stopped before a fresh conversation started')).toBe(true)
  expect(stateOf(h, dir).heldPrompts).toEqual([])
})

test('second review 3: if the held messages cannot be sent at resume, the toast still carries the user\'s words', async ($, on) => {
  const { h, refuse } = await generating($, on)
  await submit($, 'keep my words')
  await fail($, 'rate_limit')
  refuse.drop = t => t.startsWith('Jeeves: the handover was stopped')
  await relay($, 'resume')
  await until(h, () => h.toasts.some(t => t.includes('could not deliver')))
  expect(h.toasts.find(t => t.includes('could not deliver'))).toContain('"keep my words"')
})
