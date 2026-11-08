// Second review 2: the moved-repository filter asks real git whether the task's start commit exists here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { hasCommit } from '../../src/adapter/git.ts'
import { build } from '../fixtures/build-repo.ts'
import { nodePort, tempDir } from './node-port.ts'

test('hasCommit: true for a commit of this repository, false for a foreign or malformed one', async () => {
  const dir = build('clean', join(await tempDir('sr-commit-'), 'repo'))
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim()
  const port = nodePort()
  assert.equal(await hasCommit(port, dir, head), true)
  assert.equal(await hasCommit(port, dir, 'f'.repeat(40)), false)
  assert.equal(await hasCommit(port, dir, 'not-a-sha'), false)
})
