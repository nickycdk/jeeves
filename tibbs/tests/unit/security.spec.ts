// ST-9.1 (docs/threat-model.md): static checks that keep the "never" claims of SECURITY.md true as the code changes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '../..')
const sources = ['src', 'hooks'].flatMap(d => readdirSync(join(ROOT, d), { recursive: true, encoding: 'utf8' })
  .filter(f => f.endsWith('.ts')).map(f => ({ file: `${d}/${f}`, text: readFileSync(join(ROOT, d, f), 'utf8') })))

/** Every program Tibbs starts. Each is given a fixed argv; none is a shell. */
const PROGRAMS = new Set(['git', 'mkdir', 'chmod', 'mv', 'rm', 'rmdir', 'cp', 'uname', 'test', 'true'])

// T1 (a /tibbs check command is never run by Tibbs) follows from this list: no program here runs a given command.
test('T6: processes start only from the allowed programs, as argv arrays, never through a shell', () => {
  const starts = sources.flatMap(s => [...s.text.matchAll(/\brun\(\s*\[\s*['"]([^'"]+)['"]/g)].map(m => ({ file: s.file, prog: m[1]! })))
  assert.ok(starts.length >= 10, `found only ${starts.length} process starts: the pattern no longer matches`)
  for (const st of starts) assert.ok(PROGRAMS.has(st.prog), `${st.file} starts ${st.prog}`)
  // Calls with a variable argv are the port and thin wrappers whose callers pass literal arrays (checked above and below).
  const dynamic = sources.flatMap(s => [...s.text.matchAll(/\b(?:port\.run|process\.run|rt\.port\.run|run)\(\s*(?!\[)([A-Za-z_]\w*)/g)].map(m => `${s.file}: ${m[1]}`))
  assert.deepEqual(dynamic.sort(), ['src/adapter/diagnose.ts: argv', 'src/adapter/engine-mod.ts: argv', 'src/adapter/ports.ts: argv', 'src/adapter/recover.ts: argv', 'src/adapter/storage.ts: argv'])
  for (const s of sources) assert.doesNotMatch(s.text, /['"](sh|bash|zsh)['"]|['"]-c['"]\s*,\s*['"][^'"]*\s/, s.file)
})

test('T6: the storage helper that takes an argv is only called with literal arrays', () => {
  const storage = sources.find(s => s.file === 'src/adapter/storage.ts')!.text
  for (const m of storage.matchAll(/\brunOk\(([^)]*)/g)) assert.match(m[1]!, /^\[\s*'(mkdir|chmod|mv|rm)'/, `runOk(${m[1]})`)
})

test('T8: no network: no fetch, sockets, http or WebSocket anywhere in the plugin', () => {
  for (const s of sources) assert.doesNotMatch(s.text, /\bfetch\(|\bWebSocket\b|XMLHttpRequest|node:(http|https|net|tls|dgram)|['"]https?:\/\//, s.file)
})

test('T8: zero runtime dependencies; the one dev dependency is pinned exactly', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0)
  for (const [name, v] of Object.entries(pkg.devDependencies ?? {})) assert.match(String(v), /^\d+\.\d+\.\d+$/, `${name}@${v} is not pinned`)
})


test('F-8: every GitHub Action is pinned by commit SHA; only the release job may write', () => {
  const dir = join(ROOT, '../.github/workflows')
  for (const f of readdirSync(dir)) {
    const text = readFileSync(join(dir, f), 'utf8')
    for (const m of text.matchAll(/uses:\s*(\S+)/g)) assert.match(m[1]!, /^(\.\/|[\w.-]+\/[\w.-]+@[0-9a-f]{40}$)/, `${f}: ${m[1]}`)
    assert.match(text, /^permissions:\n  contents: read$/m, `${f}: workflow-level permissions must be read-only`)
    assert.doesNotMatch(text, /pull_request_target/, f)
    if (f !== 'release.yml') assert.doesNotMatch(text, /contents: write|id-token: write/, f)
  }
})
