import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build, FIXTURES, longTask, STEPS } from '../fixtures/build-repo.ts'
import { tempDir } from './node-port.ts'

// verify.sh runs node --test itself: without this it would report to the outer runner instead of exiting.
const { NODE_TEST_CONTEXT: _ctx, ...childEnv } = process.env
const run = (cmd: string, dir: string) => spawnSync(cmd, { cwd: dir, encoding: 'utf8', env: childEnv })
const git = (dir: string, ...a: string[]) => execFileSync('git', a, { cwd: dir, env: { ...process.env, LC_ALL: 'C' } }).toString().trimEnd()

test('ST-4.8: every fixture builds into a fresh folder with the git state 06 §2 names', async () => {
  for (const f of FIXTURES) {
    const dir = build(f, join(await tempDir(), f), { chars: 200 })
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

test('six-steps: verify.sh fails on the stubs; the reference implementations pass every case; tables are about the asked size', async () => {
  const dir = build('six-steps', join(await tempDir(), 'six'), { chars: 3000 })
  const first = run('./verify.sh', dir)
  assert.equal(first.status, 1)
  assert.match(first.stdout, /# fail 6/)
  assert.ok(first.stdout.split('\n').length < 20, 'stubs fail once each, not once per case')
  assert.equal(git(dir, 'log', '--format=%s'), 'six-steps fixture')
  const t1 = readFileSync(join(dir, 'tests/step1.test.js'), 'utf8')
  assert.ok(t1.length > 3000 && t1.length < 4000, String(t1.length))
  STEPS.forEach((s, i) => writeFileSync(join(dir, `src/step${i + 1}.js`), `export const ${s.name} = ${s.ref.toString()}\n`))
  const done = run('./verify.sh', dir)
  assert.equal(done.status, 0, done.stdout)
  assert.match(done.stdout, /verify: all steps pass/)
  assert.ok(done.stdout.split('\n').filter(l => /^ +ok \d+ - case /.test(l)).length > 300, 'one line per case once implemented')
})

test('long-task (ST-15.2): stubs fail; ./verify.sh <n> prints module n only; the reference implementations pass', async () => {
  const dir = build('long-task', join(await tempDir(), 'long'), { chars: 2000, modules: 8 })
  const first = run('./verify.sh', dir)
  assert.equal(first.status, 1)
  assert.match(first.stdout, /# fail 8/)
  assert.match(longTask(8), /up to src\/m08\.js/)
  STEPS.forEach((s, i) => { for (const n of [i + 1, i + 7]) if (n <= 8) writeFileSync(join(dir, `src/m0${n}.js`), `export const ${s.name} = ${s.ref.toString()}\n`) })
  const one = spawnSync('./verify.sh', ['3'], { cwd: dir, encoding: 'utf8', env: childEnv })
  assert.equal(one.status, 0, one.stdout)
  assert.ok(one.stdout.split('\n').every(l => !/module [^3]/.test(l)), 'module 3 only')
  assert.ok(one.stdout.split('\n').filter(l => /^ +ok \d+ - case /.test(l)).length > 50)
  const all = run('./verify.sh', dir)
  assert.equal(all.status, 0, all.stdout)
  assert.ok(all.stdout.split('\n').length < 10, 'summary only')
})
