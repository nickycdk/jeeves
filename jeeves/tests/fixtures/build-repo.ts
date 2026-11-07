// Builds the test repositories of 06 §2 into a folder (ST-4.8). Run: node --experimental-strip-types
// tests/fixtures/build-repo.ts <fixture> <dir> [--pad <lines>]. Never writes outside <dir>; never committed state.
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

/** The six functions of `six-steps`, in order; each has a stub, a spec entry and its own test file. */
export const STEPS = [
  { name: 'double', spec: 'double(n) returns n * 2.', test: "assert.equal(double(3), 6); assert.equal(double(-2), -4)" },
  { name: 'isPalindrome', spec: 'isPalindrome(s) is true when s reads the same backwards, ignoring case and spaces.', test: "assert.equal(isPalindrome('Never odd or even'), true); assert.equal(isPalindrome('abc'), false)" },
  { name: 'sumDigits', spec: 'sumDigits(n) returns the sum of the decimal digits of the whole number n (sign ignored).', test: "assert.equal(sumDigits(1234), 10); assert.equal(sumDigits(-505), 10)" },
  { name: 'wordCount', spec: 'wordCount(s) returns the number of words separated by whitespace; an empty or blank string has 0.', test: "assert.equal(wordCount('  a bb  ccc '), 3); assert.equal(wordCount('   '), 0)" },
  { name: 'fizzbuzz', spec: 'fizzbuzz(n) returns "FizzBuzz" for multiples of 15, "Fizz" for 3, "Buzz" for 5, else String(n).', test: "assert.equal(fizzbuzz(15), 'FizzBuzz'); assert.equal(fizzbuzz(9), 'Fizz'); assert.equal(fizzbuzz(10), 'Buzz'); assert.equal(fizzbuzz(7), '7')" },
  { name: 'roman', spec: 'roman(n) returns the Roman numeral for 1 <= n <= 3999 (subtractive form: 4 is IV, 9 is IX, 40 is XL).', test: "assert.equal(roman(1994), 'MCMXCIV'); assert.equal(roman(3999), 'MMMCMXCIX'); assert.equal(roman(4), 'IV')" },
] as const

/** The task the E2E driver types (the only prompt). */
export const SIX_STEPS_TASK = 'Implement the six functions described in SPEC.md, strictly in order, one step at a time. For each step k: implement only src/stepk.js, run ./verify.sh, then commit with: git add -A && git commit -m "step k: <function name>". Never change a step that is already committed. When all six steps are committed and ./verify.sh exits 0, the task is complete.'

function sixSteps(dir: string, pad: number) {
  const files: Record<string, string> = {
    'package.json': '{ "name": "six-steps", "private": true, "type": "module" }\n',
    '.gitignore': '.verify.log\n',
    'SPEC.md': ['# Six steps', '', 'Implement one function per step, in this order. Each lives in its own file, `src/stepK.js`, and has its tests in `tests/stepK.test.js`. `./verify.sh` runs all tests; it exits 0 only when all six pass.', '',
      ...STEPS.map((s, i) => `${i + 1}. \`src/step${i + 1}.js\`: ${s.spec}`), ''].join('\n'),
    // The padding is a cost lever: it makes each run add context, so test rotations come within a few steps.
    'verify.sh': ['#!/bin/sh', '# Runs every step\'s tests, then prints the detailed trace report.', 'node --test tests/*.test.js > .verify.log 2>&1', 'code=$?', 'grep -E "^# (tests|pass|fail)|^not ok" .verify.log',
      `i=1; while [ $i -le ${pad} ]; do echo "trace $i: module graph entry verified, exports resolved, no side effects found"; i=$((i+1)); done`,
      'if [ $code -eq 0 ]; then echo "verify: all steps pass"; else echo "verify: some steps fail (expected until every step is implemented)"; fi', 'exit $code', ''].join('\n'),
  }
  STEPS.forEach((s, i) => {
    files[`src/step${i + 1}.js`] = `// Step ${i + 1}: see SPEC.md.\nexport function ${s.name}() {\n  throw new Error('not implemented')\n}\n`
    files[`tests/step${i + 1}.test.js`] = `import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { ${s.name} } from '../src/step${i + 1}.js'\n\ntest('step ${i + 1}: ${s.name}', () => { ${s.test} })\n`
  })
  write(dir, files)
  chmodSync(join(dir, 'verify.sh'), 0o755)
  init(dir)
  commitAll(dir, 'six-steps fixture')
}

export function build(fixture: Fixture, dir: string, opts: { pad?: number } = {}): string {
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
    case 'six-steps': sixSteps(dir, opts.pad ?? 400); break
  }
  return dir
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [fixture, dir] = process.argv.slice(2)
  const padAt = process.argv.indexOf('--pad')
  if (!FIXTURES.includes(fixture as Fixture) || !dir) {
    console.error(`usage: build-repo.ts <${FIXTURES.join('|')}> <dir> [--pad <lines>]`)
    process.exit(2)
  }
  console.log(build(fixture as Fixture, dir, padAt > 0 ? { pad: Number(process.argv[padAt + 1]) } : {}))
}
