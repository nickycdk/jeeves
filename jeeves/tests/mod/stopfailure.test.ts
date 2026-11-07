// ST-6.2 / AC-23: classic.StopFailure pauses with the error's own code and fix; Jeeves never sends a prompt after it.
import { expect, test } from 'claude-code/testing'
import { generating, stateOf, turnEnd, until, type Kit } from './kit.ts'

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
