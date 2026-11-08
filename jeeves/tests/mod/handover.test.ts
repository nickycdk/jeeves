// ST-3.8 / AC-08, AC-09, AC-17: the handover Stop sequence through the hooks: validate, persist write-once with a
// verified hash before anything can clear, retries with specific errors, then NEEDS_REVIEW with nothing touched.
import { expect, test } from 'claude-code/testing'
import { generating, handover, sha256, stateOf, stop } from './kit.ts'

test('AC-08: a valid handover is written once, hash-verified, copied to handover.md, and only then ROTATING; nothing is cleared yet', async ($, on) => {
  const { h, dir, clears, taskId, rotationId } = await generating($, on)
  expect(await stop($, handover(taskId, rotationId))).toEqual({})
  const s = stateOf(h, dir)
  expect([s.status, s.rotation.step]).toEqual(['ROTATING', 'HANDOVER_PERSISTED'])
  const file = h.files.get(`${dir}/history/handover-001.md`)!
  expect(s.lastValidatedHandover).toBe(`history/handover-001.md#sha256:${await sha256(file)}`)
  expect(h.files.get(`${dir}/handover.md`)).toBe(file)
  expect(file).toContain(handover(taskId, rotationId))
  expect(file).toContain('`npm test` -> exit 1')
  expect(clears).toEqual([])
})

test('AC-17: three invalid handovers -> 2 retries with specific errors, then NEEDS_REVIEW; old handover byte-identical; no /clear', async ($, on) => {
  const { h, dir, clears, taskId, rotationId } = await generating($, on)
  const old = '# Jeeves handover 001\nprevious, validated\n'
  h.files.set(`${dir}/history/handover-001.md`, old)
  h.files.set(`${dir}/handover.md`, old)
  const blocks: string[] = []
  const bad = handover(taskId, rotationId, { '## Exact next actions\n1. [inferred] Fix precedence in `src/parse.js`.\n': '' })
  for (let i = 0; i < 3; i++) { const r = await stop($, bad); if (r.block) blocks.push(r.block) }
  expect(blocks.length).toBe(2)
  for (const b of blocks) expect(b).toContain('- missing section "## Exact next actions"')
  const s = stateOf(h, dir)
  expect([s.status, s.reason, s.rotation]).toEqual(['NEEDS_REVIEW', 'HANDOVER_INVALID', null])
  expect([h.files.get(`${dir}/history/handover-001.md`), h.files.get(`${dir}/handover.md`)]).toEqual([old, old])
  expect(h.files.has(`${dir}/history/handover-002.md`)).toBe(false)
  expect(clears).toEqual([])
  expect(h.toasts.at(-1)).toBe('Handover was invalid after retries. Nothing was cleared. Run /jeeves status.')
  // Stop blocks for the whole rotation: the request plus 2 retries = 3, under the cap of 4 (engine cap 8).
  expect(1 + blocks.length <= 4).toBe(true)
})

test('an invalid handover, then a corrected one on retry, is saved as handover-001', async ($, on) => {
  const { h, dir, taskId, rotationId } = await generating($, on)
  const r = await stop($, handover(taskId, 'r_wrong'))
  expect(r.block).toContain(`First line: <<<JEEVES-HANDOVER v1 task=${taskId} rotation=${rotationId}`)
  expect(await stop($, handover(taskId, rotationId))).toEqual({})
  expect(stateOf(h, dir).status).toBe('ROTATING')
  expect(h.files.has(`${dir}/history/handover-001.md`)).toBe(true)
})

test('AC-09 through the hooks: "npm test passes" after a failed npm test is refused, naming the command', async ($, on) => {
  const { taskId, rotationId } = await generating($, on)
  const r = await stop($, handover(taskId, rotationId, { '`npm test` fails: 2 cases.': '`npm test` passes.' }))
  expect(r.block).toContain('a bullet says `npm test` passed, but its last run exited 1; say it failed')
})

test('a [verified] path that does not exist is refused; a secret is refused', async ($, on) => {
  const { taskId, rotationId } = await generating($, on)
  expect((await stop($, handover(taskId, rotationId, { '`src/tokenize.js`': '`src/lexer.js`' }))).block).toContain('`src/lexer.js` is named in a [verified] bullet but does not exist')
  expect((await stop($, handover(taskId, rotationId, { 'Keep zero dependencies.': 'Key AKIAIOSFODNN7EXAMPLE.' }))).block).toContain('looks like a secret (aws-key-id)')
})

test('the handover file cannot be written -> NEEDS_REVIEW(DISK), nothing cleared, state never ROTATING', async ($, on) => {
  const { h, dir, clears, taskId, rotationId } = await generating($, on)
  h.failWrite = p => p.includes('/history/handover-')
  expect(await stop($, handover(taskId, rotationId))).toEqual({})
  h.failWrite = null
  expect([stateOf(h, dir).status, stateOf(h, dir).reason]).toEqual(['NEEDS_REVIEW', 'DISK'])
  expect(clears).toEqual([])
})

test('crash between the handover write and the state swap: file verified on disk, state stays VALIDATING, nothing clears', async ($, on) => {
  const { h, dir, clears, taskId, rotationId } = await generating($, on)
  h.failWrite = p => p.includes('state.json.tmp') && h.files.has(`${dir}/history/handover-001.md`)
  expect(await stop($, handover(taskId, rotationId))).toEqual({})
  h.failWrite = null
  expect(stateOf(h, dir).status).toBe('VALIDATING')
  expect(h.files.get(`${dir}/history/handover-001.md`)).toContain(`rotation=${rotationId}`)
  expect(await stop($, handover(taskId, rotationId))).toEqual({})
  expect(stateOf(h, dir).status).toBe('VALIDATING')
  expect(clears).toEqual([])
})

test('review fix 2: a background task started while the handover was written blocks it; nothing is saved until it ends', async ($, on) => {
  const { h, dir, taskId, rotationId } = await generating($, on)
  const busy = await $.classic.Stop({ stop_hook_active: true, last_assistant_message: handover(taskId, rotationId), background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'npm test' }], session_crons: [] })
  expect(busy.block).toContain('1 background task(s) and 0 running agent(s) are still in flight')
  expect(stateOf(h, dir).status).toBe('HANDOVER_GENERATING')
  expect(h.files.has(`${dir}/history/handover-001.md`)).toBe(false)
  expect(await stop($, handover(taskId, rotationId))).toEqual({})
  expect(stateOf(h, dir).status).toBe('ROTATING')
})
