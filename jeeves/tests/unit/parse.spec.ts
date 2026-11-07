import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { parseHandover, type ParseCode } from '../../src/core/handover/parse.ts'
import { CLOSE, HEADINGS, OPEN } from '../../src/core/handover/template.ts'
import { prng } from './helpers.ts'

const DIR = new URL('../fixtures/handover/', import.meta.url)
const read = (name: string) => readFileSync(new URL(name, DIR), 'utf8')

/** The s05-trial-NN files are the real S-05 outputs with only the product name changed (SESSIONRELAY -> JEEVES, D-22). */
/** Every fixture's parse outcome: 'ok' or the one error code it must give. Validator cases (ST-3.6) parse ok. */
export const PARSE: Record<string, 'ok' | ParseCode> = {
  'valid.md': 'ok', 'crlf.md': 'ok', 'fenced.md': 'ok', 'prose-around.md': 'ok', 'heading-case.md': 'ok', 'mentions-sentinel-in-prose.md': 'ok',
  'missing-heading.md': 'MISSING_HEADING', 'two-blocks.md': 'MULTIPLE_BLOCKS', 'no-block.md': 'NO_BLOCK', 'empty-section.md': 'EMPTY_SECTION',
  'no-bullet.md': 'NO_BULLET', 'no-numbered-action.md': 'NO_NUMBERED_ACTION', 'untagged.md': 'UNTAGGED', 'unclosed.md': 'UNCLOSED',
  'duplicate-heading.md': 'DUPLICATE_HEADING',
  'wrong-ids.md': 'ok', 'secret-inside.md': 'ok', 'oversize.md': 'ok', 'false-pass.md': 'ok', 'missing-path.md': 'ok', 'wrong-branch.md': 'ok',
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`s05-trial-${String(i + 1).padStart(2, '0')}.md`, 'ok' as const])),
}

test('the corpus has >= 20 fixtures and every file has an expected outcome', () => {
  const files = readdirSync(DIR).filter(f => f.endsWith('.md')).sort()
  assert.ok(files.length >= 20, `${files.length}`)
  assert.deepEqual(files, Object.keys(PARSE).sort())
})

for (const [file, want] of Object.entries(PARSE)) {
  test(`fixture ${file} -> ${want}`, () => {
    const r = parseHandover(read(file))
    if (want === 'ok') {
      assert.ok(r.ok, JSON.stringify(!r.ok && r.errors))
      for (const h of HEADINGS) assert.ok(r.value.sections[h].length > 0, h)
    } else {
      assert.ok(!r.ok, 'expected an error')
      assert.deepEqual(r.errors.map(e => e.code), [want], JSON.stringify(r.errors))
    }
  })
}

test('the fixture sections come out typed: ids, tags, numbered actions, CRLF and fences make no difference', () => {
  const r = parseHandover(read('valid.md'))
  assert.ok(r.ok)
  assert.equal(r.value.taskId, 't_20261107_k3m9qa')
  assert.equal(r.value.rotationId, 'r_fixture01')
  assert.deepEqual(r.value.sections['Exact next actions'].map(i => [i.tag, i.numbered]), [['inferred', true], ['inferred', true]])
  assert.equal(r.value.sections['Open work and blockers'][1]!.tag, 'unknown')
  for (const other of ['crlf.md', 'fenced.md', 'prose-around.md', 'heading-case.md']) {
    const o = parseHandover(read(other))
    assert.ok(o.ok)
    assert.deepEqual(o.value.sections, r.value.sections, other)
  }
})

test('the S-05 samples keep their real ids', () => {
  const r = parseHandover(read('s05-trial-03.md'))
  assert.ok(r.ok)
  assert.deepEqual([r.value.taskId, r.value.rotationId], ['t_20261107_spike0', 'r_003'])
})

test('a continuation line joins its bullet; an unknown heading does not swallow lines into the section before it', () => {
  const r = parseHandover(read('valid.md').replace('- [unknown] Whether unary minus is in scope.', '- [unknown] Whether unary minus\n  is in scope.\n## Notes\n- stray untagged line'))
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors))
  assert.deepEqual(r.value.sections['Open work and blockers'].map(i => i.text), ['[verified] Operator precedence in `src/parse.js` is not implemented.', '[unknown] Whether unary minus is in scope.'])
})

test('errors are specific and several are reported at once', () => {
  const r = parseHandover(`${OPEN} task=t rotation=r\n## Tests and checks\n\n${CLOSE}`)
  assert.ok(!r.ok)
  assert.deepEqual([...new Set(r.errors.map(e => e.code))].sort(), ['EMPTY_SECTION', 'MISSING_HEADING'])
  assert.ok(r.errors.some(e => e.message === 'missing section "## Exact next actions"'))
})

test('fuzz: never throws on arbitrary input, including sentinel and heading fragments', () => {
  const rnd = prng(42)
  const parts = [OPEN, CLOSE, ' task=x rotation=y', '\n', '\r\n', '## ', ...HEADINGS, '- [verified] ', '1. ', '```', '<<<', '>>>', '\u0000', '🚀', 'x'.repeat(50), '[unknown]', '#']
  for (let n = 0; n < 3000; n++) {
    let s = ''
    for (let k = rnd.int(40); k > 0; k--) s += rnd.next() < 0.8 ? rnd.pick(parts) : String.fromCharCode(rnd.int(0x3000))
    const r = parseHandover(s)
    assert.equal(typeof r.ok, 'boolean')
  }
  for (const odd of [undefined, null, 42, {}] as unknown as string[]) assert.equal(parseHandover(odd).ok, false)
})

test('linear time: a 2 MB message with thousands of headings and bullets parses in well under a second', () => {
  const big = `${OPEN} task=t rotation=r\n${HEADINGS.map(h => `## ${h}\n${'1. [inferred] step\n'.repeat(5000)}`).join('')}${'## '.repeat(100000)}\n## a${' '.repeat(200000)}x\n- ${' '.repeat(200000)}y\n${CLOSE}\n`
  const t = performance.now()
  assert.ok(parseHandover(big).ok)
  assert.ok(performance.now() - t < 1000)
})
