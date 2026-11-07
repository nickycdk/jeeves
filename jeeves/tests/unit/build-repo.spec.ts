import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build, FIXTURES, STEPS } from '../fixtures/build-repo.ts'
import { tempDir } from './node-port.ts'

// verify.sh runs node --test itself: without this it would report to the outer runner instead of exiting.
const { NODE_TEST_CONTEXT: _ctx, ...childEnv } = process.env
const run = (cmd: string, dir: string) => spawnSync(cmd, { cwd: dir, encoding: 'utf8', env: childEnv })
const git = (dir: string, ...a: string[]) => execFileSync('git', a, { cwd: dir, env: { ...process.env, LC_ALL: 'C' } }).toString().trimEnd()

test('ST-4.8: every fixture builds into a fresh folder with the git state 06 §2 names', async () => {
  for (const f of FIXTURES) {
    const dir = build(f, join(await tempDir(), f), { pad: 3 })
    assert.ok(existsSync(dir), f)
    if (f === 'no-git') { assert.ok(!existsSync(join(dir, '.git'))); continue }
    const status = git(dir, 'status', '--porcelain')
    if (f === 'dirty') assert.match(status, / M src\/a\.js[\s\S]*\?\? new\.txt/)
    else assert.equal(status, '', f)
    if (f === 'detached') assert.equal(spawnSync('git', ['symbolic-ref', '-q', 'HEAD'], { cwd: dir }).status, 1)
    if (f === 'worktrees') assert.match(git(dir, 'worktree', 'list'), /\.wt-feature/)
    if (f === 'failing-tests') assert.equal(spawnSync('npm', ['test', '--silent'], { cwd: dir }).status, 1)
  }
})

test('six-steps: verify.sh fails on the stubs and passes once all six functions are implemented', async () => {
  const dir = build('six-steps', join(await tempDir(), 'six'), { pad: 5 })
  const first = run('./verify.sh', dir)
  assert.equal(first.status, 1)
  assert.match(first.stdout, /trace 5: /)
  assert.equal(git(dir, 'log', '--format=%s'), 'six-steps fixture')
  const impl: Record<string, string> = {
    double: 'n => n * 2', isPalindrome: "s => { const t = s.toLowerCase().replace(/\\s/g, ''); return t === [...t].reverse().join('') }",
    sumDigits: "n => [...String(Math.abs(n))].reduce((a, d) => a + Number(d), 0)", wordCount: 's => s.split(/\\s+/).filter(Boolean).length',
    fizzbuzz: "n => n % 15 === 0 ? 'FizzBuzz' : n % 3 === 0 ? 'Fizz' : n % 5 === 0 ? 'Buzz' : String(n)",
    roman: "n => { const t = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]; let s = ''; for (const [v, r] of t) while (n >= v) { s += r; n -= v } return s }",
  }
  STEPS.forEach((s, i) => writeFileSync(join(dir, `src/step${i + 1}.js`), `export const ${s.name} = ${impl[s.name]}\n`))
  const done = run('./verify.sh', dir)
  assert.equal(done.status, 0, done.stdout)
  assert.match(done.stdout, /verify: all steps pass/)
})
