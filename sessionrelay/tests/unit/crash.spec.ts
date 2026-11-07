import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parseJson } from '../../src/core/schema.ts'
import { prng } from './helpers.ts'
import { tempDir } from './node-port.ts'

const child = join(import.meta.dirname, 'crash-child.ts')

test('SIGKILL at random points always leaves a whole old or new state.json (ADR-005)', { timeout: 120_000 }, async () => {
  const dir = await tempDir('sr-crash-')
  const rnd = prng(7)
  let last = 0, tmpLeftovers = 0
  for (let round = 0; round < 25; round++) {
    const p = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', child, dir], { stdio: ['ignore', 'pipe', 'inherit'] })
    await new Promise<void>(r => p.stdout.once('data', () => r()))
    const exited = new Promise<string>(r => p.once('exit', (code, sig) => r(`${code ?? sig}`)))
    const early = await Promise.race([exited, new Promise<null>(r => setTimeout(() => r(null), 20 + rnd.int(300)))])
    assert.equal(early, null, `child exited on its own (${early}) before the kill`)
    p.kill('SIGKILL')
    await exited
    const files = await readdir(dir)
    tmpLeftovers += files.filter(f => f.includes('.tmp-')).length
    if (!files.includes('state.json')) { assert.equal(last, 0, 'state.json vanished after it existed'); continue }
    const r = parseJson('state', await readFile(join(dir, 'state.json'), 'utf8'))
    assert.ok(r.ok, `round ${round}: state.json is partial or invalid: ${!r.ok && r.errors[0]}`)
    // Each round restarts the counter at 1, so only check it is a whole, valid version.
    last = r.value.rotationCount
  }
  assert.ok(last > 0, 'the child wrote at least one state')
  console.log(`crash test: 25 kills, state.json always whole; tmp leftovers seen: ${tmpLeftovers} (recovery ignores them, 02 §8)`)
})
