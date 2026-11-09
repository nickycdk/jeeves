// ST-16.3 / ADR-003 A2: in turn mode the handover is asked for by a submitted prompt, read from the next answered
// turn.complete's `answer`, and retried the same way.
import type { SessionMeasureInput, ToolCallResult } from 'claude-code'
import { expect } from 'claude-code/testing'
import { bottom, handover, PROMPT, relay, ROOT, sha256, start, stateOf, submit, taskDirs, test, turnStart, until, type Kit } from './kit.ts'
import { memHost } from './memfs.ts'

let turns = 0
const end = ($: Kit, answer: string, reason: 'answer' | 'aborted' = 'answer', turnId = `t${turns}`) =>
  $.turn.complete({ answer, durationMs: 1, isAborted: reason === 'aborted', turnId, reason })
/** One main turn that answers `answer`; no classic.Stop reaches Jeeves (the skip). */
const turn = async ($: Kit, answer = 'ok', reason: 'answer' | 'aborted' = 'answer') => { const id = `t${++turns}`; await turnStart($, id); await end($, answer, reason, id) }

/** A turn-mode process whose task's boundary turn just ended: the request is submitted, state HANDOVER_GENERATING. */
async function requested($: Kit, on: Parameters<typeof memHost>[0]) {
  const h = memHost(on)
  const prompts = bottom(on)
  const clears: string[] = []
  on('command.run', async (_, e) => { clears.push(e.command); return { text: '' } })
  on('tool.call', (_, e) => ((e as { command?: string }).command === 'npm test'
    ? { isError: true, result: 'Exit code 1', text: 'Exit code 1' } : { result: {}, text: '' }) as ToolCallResult)
  for (const f of ['src/calc.js', 'src/parse.js', 'src/tokenize.js']) h.files.set(`${ROOT}/${f}`, '// code\n')
  await start($)
  await turn($)
  expect(await relay($, 'status')).toContain('mode: full (turn)')
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await until(h, () => stateOf(h, dir).ledger.length === 1)
  await turnStart($, 'boundary')
  await $.session.measure({ context: { window: 1_000_000, percent: 52 }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
  await end($, 'step done', 'answer', 'boundary')
  const s = stateOf(h, dir)
  expect(s.status).toBe('HANDOVER_GENERATING')
  await until(h, () => prompts.some(p => p.text.includes('JEEVES-HANDOVER')))
  return { h, dir, prompts, clears, taskId: s.taskId as string, rotationId: s.rotation.rotationId as string }
}

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
