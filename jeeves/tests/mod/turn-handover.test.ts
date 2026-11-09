// ST-16.3 / ADR-003 A2: in turn mode the handover is asked for by a submitted prompt, read from the next answered
// turn.complete's `answer`, and retried the same way.
import { expect } from 'claude-code/testing'
import { handover, sha256, stateOf, submit, test, turnGenerating as requested, until, wholeTurn as turn } from './kit.ts'

test('the request goes out as a prompt; a valid answer is saved as in Stop mode, with crons not available; then /clear', async ($, on) => {
  const { h, dir, prompts, clears, taskId, rotationId } = await requested($, on)
  expect(prompts.filter(p => p.text.includes('JEEVES-HANDOVER')).length).toBe(1)
  await turn($, handover(taskId, rotationId))
  const file = h.files.get(`${dir}/history/handover-001.md`)!
  expect(file).toContain(handover(taskId, rotationId))
  expect(file).toContain('- Scheduled session crons: not available in turn mode')
  expect(file).not.toContain('keep running across the rotation')
  expect(stateOf(h, dir).lastValidatedHandover).toBe(`history/handover-001.md#sha256:${await sha256(file)}`)
  await until(h, () => clears.length > 0)
  expect(clears).toEqual(['clear'])
})

test('a handover near handoverMaxChars (about 11.9K) arrives through the answer and is saved', async ($, on) => {
  const { h, dir, taskId, rotationId } = await requested($, on)
  const pad = Array.from({ length: 128 }, (_, i) => `- [inferred] Decision ${String(i).padStart(3, '0')}: keep the parser free of dependencies and side effects.`).join('\n')
  const big = handover(taskId, rotationId, { '- [inferred] Keep zero dependencies.': pad })
  expect(big.length > 11_000 && big.length <= 12_000).toBe(true)
  await turn($, big)
  expect(h.files.get(`${dir}/history/handover-001.md`)).toContain(big)
})

test('AC 3: two invalid answers -> two retry prompts, then NEEDS_REVIEW; earlier handover unchanged; no /clear', async ($, on) => {
  const { h, dir, prompts, clears, taskId, rotationId } = await requested($, on)
  const old = '# Jeeves handover 001\nprevious, validated\n'
  h.files.set(`${dir}/history/handover-001.md`, old)
  const bad = handover(taskId, rotationId, { '## Exact next actions\n1. [inferred] Fix precedence in `src/parse.js`.\n': '' })
  for (let i = 0; i < 3; i++) { await turn($, bad); await h.clock.settle() }
  const retries = prompts.filter(p => p.text.includes('- missing section "## Exact next actions"'))
  expect(retries.length).toBe(2)
  const s = stateOf(h, dir)
  expect([s.status, s.reason]).toEqual(['NEEDS_REVIEW', 'HANDOVER_INVALID'])
  expect(h.files.get(`${dir}/history/handover-001.md`)).toBe(old)
  expect(clears).toEqual([])
})

test('a tool-only turn (no text in the answer) counts as no handover and gets the retry', async ($, on) => {
  const { h, dir, prompts } = await requested($, on)
  await turn($, '')
  await h.clock.settle()
  expect(prompts.at(-1)!.text).toContain('no "<<<JEEVES-HANDOVER v1" line found')
  expect(stateOf(h, dir).rotation.retries).toBe(1)
})

test('AC 2: a prompt typed after the boundary is held, never sent ahead of the request', async ($, on) => {
  const { h, dir, prompts } = await requested($, on)
  const before = prompts.length
  const r = await submit($, 'also fix the README')
  expect(r.drop).toBeDefined()
  expect(prompts.length).toBe(before)
  expect(stateOf(h, dir).heldPrompts).toEqual(['also fix the README'])
})

test('AC 4: an interrupt during the request pauses as in Stop mode', async ($, on) => {
  const { h, dir, clears } = await requested($, on)
  await turn($, 'half a hand', 'aborted')
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['PAUSED', 'USER_INTERRUPT'])
  expect(clears).toEqual([])
})

test('ST-15.4: a refused handover turn counts as no handover and gets the retry (not stuck in HANDOVER_GENERATING)', async ($, on) => {
  const { h, dir, prompts } = await requested($, on)
  await turn($, '', 'refusal')
  await h.clock.settle()
  expect(prompts.at(-1)!.text).toContain('no "<<<JEEVES-HANDOVER v1" line found')
  expect(stateOf(h, dir).rotation.retries).toBe(1)
})

test('ST-15.4: an API error ending the handover turn pauses with API_ERROR, as classic.StopFailure does in Stop mode', async ($, on) => {
  const { h, dir, clears } = await requested($, on)
  await turn($, '', 'error')
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['PAUSED', 'API_ERROR'])
  expect(clears).toEqual([])
  const r = await submit($, 'go on')
  expect(r.drop).toBeUndefined()
})
