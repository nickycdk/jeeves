// ST-14.4 (spec §6.2): `/jeeves handover` shows the last handover: its file, Current goal and first next actions, at
// the status width. Reads only; a missing or changed file is said, not printed (as `history --full`).
import { expect } from 'claude-code/testing'
import { generating, handover, relay, stateOf, stop, type Kit, test } from './kit.ts'

/** A task whose handover-001 was just validated and saved (ROTATING). */
async function rotated($: Kit, on: Parameters<typeof generating>[1]) {
  const g = await generating($, on)
  const next = '1. [inferred] Fix precedence in `src/parse.js`.'
  expect(await stop($, handover(g.taskId, g.rotationId, { [next]: `${next}\n2. [verified] Run \`npm test\` again.` }))).toEqual({})
  expect(stateOf(g.h, g.dir).status).toBe('ROTATING')
  return g
}

test('AC 1: after a rotation: the file, the goal and the first next actions, 40 ASCII columns; nothing written', async ($, on) => {
  const { h } = await rotated($, on)
  const before = new Map(h.files)
  const text = await relay($, 'handover', 'plugin')
  expect(text.replace(/^Handover: .*$/m, 'Handover: F')).toBe([
    'Handover: F',
    'Goal: Finish operator precedence in t...',
    'Next:',
    '1. Fix precedence in `src/parse.js`.',
    '2. Run `npm test` again.',
  ].join('\n'))
  expect(text.split('\n')[0]).toMatch(/^Handover: \.\.\..*\/history\/handover-001\.md$/)
  for (const l of text.split('\n')) expect(l.length).toBeLessThanOrEqual(40)
  expect(/^[\x20-\x7e\n]*$/.test(text)).toBe(true)
  expect(new Map(h.files)).toEqual(before)
})

test('AC 2: no handover yet says so in one line; no task says how to start', async ($, on) => {
  const g = await generating($, on)
  expect(await relay($, 'handover')).toBe('No handover yet for this task.')
  g.h.files.clear()
  expect(await relay($, 'handover')).toBe('No managed task. Start with /jeeves on')
})

test('AC 3: a changed or missing handover file is reported, not printed', async ($, on) => {
  const { h, dir } = await rotated($, on)
  const file = `${dir}/history/handover-001.md`
  h.files.set(file, h.files.get(file)!.replace('Fix precedence', 'Delete everything'))
  const changed = await relay($, 'handover')
  expect(changed).toContain('Not shown: the file is changed since saved.')
  expect(changed).not.toContain('Delete everything')
  h.files.delete(file)
  expect(await relay($, 'handover')).toContain('Not shown: the file is missing.')
})
