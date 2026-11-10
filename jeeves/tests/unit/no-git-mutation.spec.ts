// AC-19 (U layer): Jeeves runs git through one helper, with read-only subcommands only, and never names Claude Code's
// settings files. The E layer (git and settings snapshots around a live rotation) is in evidence/m5-demo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '../..')
const READ_ONLY = new Set(['rev-parse', 'status', 'diff', 'cat-file', 'log', '--version'])
const sources = ['src', 'hooks'].flatMap(d => readdirSync(join(ROOT, d), { recursive: true, encoding: 'utf8' })
  .filter(f => f.endsWith('.ts')).map(f => ({ file: `${d}/${f}`, text: readFileSync(join(ROOT, d, f), 'utf8') })))

test('AC-19: git is started in one place only, with --no-optional-locks', () => {
  const starts = sources.flatMap(s => [...s.text.matchAll(/\[\s*['"]git['"]/g)].map(() => s.file))
  assert.deepEqual(starts, ['src/adapter/git.ts'])
  assert.match(sources.find(s => s.file === 'src/adapter/git.ts')!.text, /\['git', '--no-optional-locks', '-c', 'core\.fsmonitor=false', \.\.\.args\]/)
})

test('AC-19: every git call is a read-only subcommand (no commit, push, reset, stash, checkout, ...)', () => {
  const calls = sources.flatMap(s => [...s.text.matchAll(/\bgit\(port, [^,]+, \[\s*['"]([a-z-]+)['"]/g)].map(m => `${s.file}: ${m[1]}`))
  assert.ok(calls.length >= 5, `found only ${calls.length} git calls: the pattern no longer matches the helper's callers`)
  for (const c of calls) assert.ok(READ_ONLY.has(c.split(': ')[1]!), `not read-only: ${c}`)
  for (const s of sources) assert.doesNotMatch(s.text, /'(commit|push|reset|stash|checkout|switch|merge|rebase|restore)'/, s.file)
})

test('AC-19: no source names a Claude Code settings file (permissions stay the user\'s)', () => {
  for (const s of sources) assert.doesNotMatch(s.text, /settings(\.local)?\.json|permissions\s*:/, s.file)
})
