// Builds the test repositories of 06 §2 into a folder (ST-4.8). Run: node --experimental-strip-types
// tests/fixtures/build-repo.ts <fixture> <dir> [--chars <n>]. Never writes outside <dir>; never committed state.
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const FIXTURES = ['clean', 'dirty', 'detached', 'worktrees', 'failing-tests', 'no-git', 'six-steps'] as const
export type Fixture = (typeof FIXTURES)[number]

const git = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe', env: { ...process.env, LC_ALL: 'C' } }).toString()
function write(dir: string, files: Record<string, string>) {
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true })
    writeFileSync(join(dir, p), text)
  }
}
function init(dir: string) {
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'fixture')
  git(dir, 'config', 'commit.gpgsign', 'false')
}
const commitAll = (dir: string, msg: string) => { git(dir, 'add', '-A'); git(dir, 'commit', '-qm', msg) }

/** The six functions of `six-steps`, in order: a stub, a spec entry, a reference implementation for the case table. */
export const STEPS: readonly { name: string; spec: string; ref: (x: never) => unknown; gen: (r: () => number, i: number) => unknown }[] = [
  { name: 'double', spec: 'double(n) returns n * 2.', ref: (n: number) => n * 2, gen: r => Math.floor(r() * 2_000_000) - 1_000_000 },
  { name: 'isPalindrome', spec: 'isPalindrome(s) is true when s reads the same backwards, ignoring case and spaces.', ref: (s: string) => { const t = s.toLowerCase().replace(/\s/g, ''); return t === [...t].reverse().join('') },
    gen: (r, i) => { const w = Array.from({ length: 2 + Math.floor(r() * 6) }, () => 'abcdeAB '[Math.floor(r() * 8)]).join(''); return i % 2 ? w + [...w].reverse().join('') : w } },
  { name: 'sumDigits', spec: 'sumDigits(n) returns the sum of the decimal digits of the whole number n (sign ignored).', ref: (n: number) => [...String(Math.abs(n))].reduce((a, d) => a + Number(d), 0), gen: r => Math.floor(r() * 2e9) - 1e9 },
  { name: 'wordCount', spec: 'wordCount(s) returns the number of words separated by whitespace; an empty or blank string has 0.', ref: (s: string) => s.split(/\s+/).filter(Boolean).length,
    gen: r => Array.from({ length: Math.floor(r() * 7) }, () => (r() < 0.3 ? '  ' : ['ab', 'c', 'dd e', '\t', 'xyz'][Math.floor(r() * 5)])).join(' ') },
  { name: 'fizzbuzz', spec: 'fizzbuzz(n) returns "FizzBuzz" for multiples of 15, "Fizz" for 3, "Buzz" for 5, else String(n).', ref: (n: number) => (n % 15 === 0 ? 'FizzBuzz' : n % 3 === 0 ? 'Fizz' : n % 5 === 0 ? 'Buzz' : String(n)), gen: (_r, i) => i + 1 },
  { name: 'roman', spec: 'roman(n) returns the Roman numeral for 1 <= n <= 3999 (subtractive form: 4 is IV, 9 is IX, 40 is XL).', gen: r => 1 + Math.floor(r() * 3999),
    ref: (n: number) => { let s = ''; for (const [v, x] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']] as const) while (n >= v) { s += x; n -= v } return s } },
]

/** The task the E2E driver types (the only prompt). */
export const SIX_STEPS_TASK = 'Implement the six functions described in SPEC.md, strictly in order, one step at a time. For each step k: read tests/stepk.test.js (its case table shows the edge cases), implement only src/stepk.js, run ./verify.sh, then commit with: git add -A && git commit -m "step k: <function name>". Never change a step that is already committed. When all six steps are committed and ./verify.sh exits 0, the task is complete.'

/** Deterministic cases, as many as fit in `chars` characters: the test file is what Claude reads, so it is the context lever. */
function caseTable(step: (typeof STEPS)[number], seed: number, chars: number): string {
  let x = seed
  const r = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const rows: string[] = []
  for (let i = 0, used = 0; used < chars; i++) {
    const input = step.gen(r, i)
    const row = `  [${JSON.stringify(input)}, ${JSON.stringify(step.ref(input as never))}],`
    rows.push(row)
    used += row.length + 1
  }
  return rows.join('\n')
}

function sixSteps(dir: string, chars: number) {
  const files: Record<string, string> = {
    'package.json': '{ "name": "six-steps", "private": true, "type": "module" }\n',
    '.gitignore': '.verify.log\n',
    'SPEC.md': ['# Six steps', '', 'Implement one function per step, in this order. Each lives in its own file, `src/stepK.js`, and has its tests in `tests/stepK.test.js`, with a table of reference cases. `./verify.sh` runs all tests; it exits 0 only when all six pass.', '',
      ...STEPS.map((s, i) => `${i + 1}. \`src/step${i + 1}.js\`: ${s.spec}`), ''].join('\n'),
    'verify.sh': ['#!/bin/sh', '# Runs every step\'s tests and prints the summary.', 'node --test tests/*.test.js > .verify.log 2>&1', 'code=$?', 'grep -E "^# (tests|pass|fail)|^not ok" .verify.log',
      'if [ $code -eq 0 ]; then echo "verify: all steps pass"; else echo "verify: some steps fail (expected until every step is implemented)"; fi', 'exit $code', ''].join('\n'),
  }
  STEPS.forEach((s, i) => {
    files[`src/step${i + 1}.js`] = `// Step ${i + 1}: see SPEC.md.\nexport function ${s.name}() {\n  throw new Error('not implemented')\n}\n`
    files[`tests/step${i + 1}.test.js`] = [`import { test } from 'node:test'`, `import assert from 'node:assert/strict'`, `import { ${s.name} } from '../src/step${i + 1}.js'`, '',
      '// Reference cases: [input, expected].', 'const CASES = [', caseTable(s, 1000 + i, chars), ']', '',
      `test('step ${i + 1}: ${s.name}', () => { for (const [input, want] of CASES) assert.deepEqual(${s.name}(input), want, JSON.stringify(input)) })`, ''].join('\n')
  })
  write(dir, files)
  chmodSync(join(dir, 'verify.sh'), 0o755)
  init(dir)
  commitAll(dir, 'six-steps fixture')
}

export function build(fixture: Fixture, dir: string, opts: { chars?: number } = {}): string {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const base = { 'README.md': '# fixture\n', 'src/a.js': 'export const a = 1\n' }
  switch (fixture) {
    case 'no-git': write(dir, base); break
    case 'clean': write(dir, base); init(dir); commitAll(dir, 'init'); break
    case 'dirty': write(dir, base); init(dir); commitAll(dir, 'init'); write(dir, { 'src/a.js': 'export const a = 2\n', 'new.txt': 'untracked\n' }); break
    case 'detached': write(dir, base); init(dir); commitAll(dir, 'one'); write(dir, { 'b.txt': 'b\n' }); commitAll(dir, 'two'); git(dir, 'checkout', '-q', '--detach', 'HEAD~1'); break
    case 'worktrees':
      write(dir, base); init(dir); commitAll(dir, 'init')
      // The linked worktree stays inside <dir>; excluded so the main worktree reads clean.
      writeFileSync(join(dir, '.git/info/exclude'), '.wt-feature/\n')
      git(dir, 'worktree', 'add', '-q', '-b', 'feature', join(dir, '.wt-feature')); break
    case 'failing-tests':
      write(dir, { ...base, 'package.json': '{ "name": "failing", "private": true, "scripts": { "test": "node -e \\"process.exit(1)\\"" } }\n' })
      init(dir); commitAll(dir, 'init'); break
    case 'six-steps': sixSteps(dir, opts.chars ?? 28_000); break
  }
  return dir
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [fixture, dir] = process.argv.slice(2)
  const at = process.argv.indexOf('--chars')
  if (!FIXTURES.includes(fixture as Fixture) || !dir) {
    console.error(`usage: build-repo.ts <${FIXTURES.join('|')}> <dir> [--chars <case table size>]`)
    process.exit(2)
  }
  console.log(build(fixture as Fixture, dir, at > 0 ? { chars: Number(process.argv[at + 1]) } : {}))
}
