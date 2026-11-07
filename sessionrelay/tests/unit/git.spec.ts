import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gitFacts, projectId, repoIdentity } from '../../src/adapter/git.ts'
import { parsePorcelainZ, sameRepo } from '../../src/core/git.ts'
import { newTaskId, projectKey } from '../../src/core/ids.ts'
import type { FsPort } from '../../src/adapter/ports.ts'
import { buildRepo, sh } from './fixtures.ts'
import { nodePort } from './node-port.ts'

const port = nodePort()

test('parsePorcelainZ: branch, upstream, detached, no commits, rename', () => {
  const p = parsePorcelainZ('## main...origin/main [ahead 1]\0 M a.txt\0R  new.txt\0old.txt\0?? x y.txt\0')
  assert.equal(p.branch, 'main')
  assert.equal(p.upstream, 'origin/main')
  assert.deepEqual(p.entries, [{ xy: ' M', path: 'a.txt' }, { xy: 'R ', path: 'new.txt', origPath: 'old.txt' }, { xy: '??', path: 'x y.txt' }])
  assert.equal(parsePorcelainZ('## HEAD (no branch)\0').detached, true)
  const nc = parsePorcelainZ('## No commits yet on main\0')
  assert.deepEqual([nc.noCommits, nc.branch], [true, 'main'])
})

test('ids: projectKey and taskId format', () => {
  assert.equal(projectKey({ commonDir: '/r/.git', worktree: '/r' }), '/r/.git|/r')
  assert.equal(projectKey({ cwd: '/d' }), 'nogit|/d')
  assert.equal(newTaskId(Date.parse('2026-11-07T10:00:00Z'), new Uint8Array([0, 1, 2, 31, 32, 255])), 't_20261107_abc7a7')
})

test('two worktrees of one repo get two project IDs', async () => {
  const { dir, linked } = await buildRepo('worktrees')
  const a = await repoIdentity(port, dir), b = await repoIdentity(port, linked!)
  assert.ok(a?.kind === 'git' && b?.kind === 'git')
  assert.equal(a.commonDir, b.commonDir)
  assert.notEqual(a.worktree, b.worktree)
  assert.notEqual(await projectId(a), await projectId(b))
  assert.match(await projectId(a), /^[0-9a-f]{16}$/)
  assert.equal((await gitFacts(port, b)).kind === 'git' && (await gitFacts(port, b) as { branch: string }).branch, 'feature')
})

test('a moved repo is detectable as a mismatch', async () => {
  const { dir } = await buildRepo('clean')
  const before = await repoIdentity(port, dir)
  assert.ok(before?.kind === 'git')
  const stored = { repoRoot: before.commonDir, worktree: before.worktree }
  const moved = join(dir, '..', 'moved')
  await rename(dir, moved)
  const after = await repoIdentity(port, moved)
  assert.ok(after && !sameRepo(stored, after))
  assert.ok(sameRepo(stored, before))
})

test('facts: clean, dirty with untracked, and changes since the task start', async () => {
  const { dir } = await buildRepo('dirty')
  const id = await repoIdentity(port, dir)
  const start = sh(dir, 'git', 'rev-parse', 'HEAD').trim()
  const f = await gitFacts(port, id, start)
  assert.ok(f.kind === 'git')
  assert.equal(f.branch, 'main')
  assert.equal(f.head, start)
  assert.deepEqual(f.status.map(e => [e.xy, e.path]), [[' M', 'a.txt'], ['??', 'untracked file.txt']])
  assert.deepEqual(f.changedSinceStart, ['a.txt', 'untracked file.txt'])
  const clean = await gitFacts(port, await repoIdentity(port, (await buildRepo('clean')).dir))
  assert.ok(clean.kind === 'git' && clean.status.length === 0 && clean.changedSinceStart === null)
})

test('facts: detached HEAD, no commits, and non-git directories', async () => {
  const det = await gitFacts(port, await repoIdentity(port, (await buildRepo('detached')).dir))
  assert.ok(det.kind === 'git' && det.detached && det.branch === null && /^[0-9a-f]{40}$/.test(det.head ?? ''))
  const nc = await gitFacts(port, await repoIdentity(port, (await buildRepo('no-commits')).dir))
  assert.ok(nc.kind === 'git' && nc.head === null && nc.branch === 'main' && nc.status[0]?.path === 'new.txt')
  const { dir } = await buildRepo('no-git')
  const id = await repoIdentity(port, dir)
  assert.equal(id?.kind, 'none')
  assert.deepEqual(await gitFacts(port, id), { kind: 'none' })
  assert.match(await projectId(id!), /^[0-9a-f]{16}$/)
})

test('a git timeout gives unknown facts, never empty ones', async () => {
  const { dir } = await buildRepo('dirty')
  const id = await repoIdentity(port, dir)
  const slow: FsPort = { ...port, run: async argv => { if (argv.includes('status')) throw new Error('git timed out'); return port.run(argv) } }
  const f = await gitFacts(slow, id)
  assert.equal(f.kind, 'unknown')
  const missing: FsPort = { ...port, run: async () => { throw Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }) } }
  assert.equal(await repoIdentity(missing, dir), null)
  assert.equal((await gitFacts(missing, null)).kind, 'unknown')
})

test('facts commands never mutate git (no index write)', async () => {
  const { dir } = await buildRepo('dirty')
  await writeFile(join(dir, 'a.txt'), 'again\n')
  const indexStat = async () => { const st = await stat(join(dir, '.git/index')); return [st.mtimeMs, st.size] }
  const before = await indexStat()
  await gitFacts(port, await repoIdentity(port, dir), null)
  assert.deepEqual(await indexStat(), before)
})

test('identity from a subdirectory resolves a relative common dir to the same project', async () => {
  const { dir } = await buildRepo('clean')
  await mkdir(join(dir, 'sub/deeper'), { recursive: true })
  const top = await repoIdentity(port, dir), sub = await repoIdentity(port, join(dir, 'sub/deeper'))
  assert.ok(top?.kind === 'git' && sub?.kind === 'git')
  assert.ok(sub.commonDir.startsWith('/'))
  assert.deepEqual(sub, top)
})

test('an unexpected git error is unknown (null), not "not a repo"; git runs with LC_ALL=C', async () => {
  const seen: (Record<string, string> | undefined)[] = []
  const odd: FsPort = { ...port, run: async (_argv, o) => { seen.push(o?.env); return { exitCode: 128, stdout: '', stderr: 'fatal: detected dubious ownership in repository' } } }
  assert.equal(await repoIdentity(odd, '/tmp'), null)
  assert.deepEqual(seen[0], { LC_ALL: 'C' })
  const notRepo: FsPort = { ...port, run: async () => ({ exitCode: 128, stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git' }) }
  assert.equal((await repoIdentity(notRepo, '/tmp'))?.kind, 'none')
})
