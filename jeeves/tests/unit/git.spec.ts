import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gitFacts, projectId, repoIdentity, treeStamp } from '../../src/adapter/git.ts'
import { parsePorcelainZ } from '../../src/core/git.ts'
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
  const moved = join(dir, '..', 'moved')
  await rename(dir, moved)
  const after = await repoIdentity(port, moved)
  assert.ok(after?.kind === 'git' && after.worktree !== before.worktree)
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
  assert.deepEqual(f.commitsSinceStart, [])
  sh(dir, 'git', 'commit', '-qam', 'first change')
  sh(dir, 'git', 'commit', '-q', '--allow-empty', '-m', 'second change')
  const after = await gitFacts(port, id, start)
  assert.ok(after.kind === 'git')
  assert.deepEqual(after.commitsSinceStart?.map(c => c.replace(/^[0-9a-f]+ /, '')), ['first change', 'second change'])
  const clean = await gitFacts(port, await repoIdentity(port, (await buildRepo('clean')).dir))
  assert.ok(clean.kind === 'git' && clean.status.length === 0 && clean.changedSinceStart === null && clean.commitsSinceStart === null)
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

test('ST-9.1: a start commit that is not a hash never reaches git; git runs with core.fsmonitor off', async () => {
  const { dir } = await buildRepo('clean')
  const seen: string[][] = []
  const spy: FsPort = { ...port, run: (argv, o) => { seen.push(argv); return port.run(argv, o) } }
  const id = await repoIdentity(spy, dir)
  const target = join(dir, '..', 'clobbered')
  const f = await gitFacts(spy, id, `--output=${target}`)
  assert.equal(f.kind === 'git' && f.changedSinceStart, null)
  assert.ok(seen.every(a => a.slice(0, 4).join(' ') === 'git --no-optional-locks -c core.fsmonitor=false'), JSON.stringify(seen))
  assert.ok(!seen.some(a => a.some(x => x.startsWith('--output'))))
  await assert.rejects(stat(target))
})

test('ST-9.1: a repository whose .git/config sets core.fsmonitor to a command does not run it', async () => {
  const { dir } = await buildRepo('clean')
  const marker = join(dir, '..', `fsmonitor-ran-${Date.now()}`)
  await sh(dir, 'git', 'config', 'core.fsmonitor', `touch ${marker}; false`)
  await gitFacts(port, await repoIdentity(port, dir))
  await assert.rejects(stat(marker))
})

// The completion gate's stamp: content of the files changed since the task started, read-only, from any subdirectory.
async function stampRepo() {
  const { dir } = await buildRepo('clean')
  const start = sh(dir, 'git', 'rev-parse', 'HEAD').trim()
  const id = await repoIdentity(port, dir)
  const stamp = (exclude: string[] = []) => treeStamp(port, id, start, exclude)
  return { dir, start, id, stamp }
}

test('stamp: a write outside Edit/Write, a new file and a delete each change it; null without a start commit or git', async () => {
  const { dir, id, stamp } = await stampRepo()
  const s0 = await stamp()
  assert.match(s0 ?? '', /^[0-9a-f]{64}$/)
  await writeFile(join(dir, 'a.txt'), 'sed -i\n')
  const s1 = await stamp()
  assert.notEqual(s1, s0)
  await writeFile(join(dir, 'new.txt'), 'n\n')
  const s2 = await stamp()
  assert.notEqual(s2, s1)
  await rm(join(dir, 'a.txt'))
  assert.notEqual(await stamp(), s2)
  assert.equal(await treeStamp(port, id, null), null)
  assert.equal(await treeStamp(port, { kind: 'none', cwd: dir }, 'abcd'), null)
  assert.equal(await treeStamp(port, id, '--output=x'), null)
})

test('stamp: content only: staging, committing, stash and pop give the same stamp', async () => {
  const { dir, stamp } = await stampRepo()
  await writeFile(join(dir, 'a.txt'), 'changed\n')
  const dirty = await stamp()
  sh(dir, 'git', 'add', 'a.txt')
  assert.equal(await stamp(), dirty)
  sh(dir, 'git', 'commit', '-q', '-m', 'same content')
  assert.equal(await stamp(), dirty)
  await writeFile(join(dir, 'a.txt'), 'again\n')
  const before = await stamp()
  sh(dir, 'git', 'stash', '-q')
  assert.notEqual(await stamp(), before)
  sh(dir, 'git', 'stash', 'pop', '-q')
  assert.equal(await stamp(), before)
})

test('stamp: ignored files, .claude/ and the excluded state folder never count', async () => {
  const { dir, stamp } = await stampRepo()
  await writeFile(join(dir, '.gitignore'), 'coverage/\n')
  const state = join(dir, 'jeeves-state')
  const s0 = await stamp([state])
  await mkdir(join(dir, 'coverage')); await writeFile(join(dir, 'coverage/report.txt'), String(Date.now()))
  await mkdir(join(dir, '.claude')); await writeFile(join(dir, '.claude/local.json'), '{}')
  // Claude Code started in a subfolder writes its .claude/ there.
  await mkdir(join(dir, 'packages/app/.claude'), { recursive: true }); await writeFile(join(dir, 'packages/app/.claude/local.json'), '{}')
  await mkdir(state); await writeFile(join(state, 'state.json'), '{"ledger":[]}')
  assert.equal(await stamp([state]), s0)
  await writeFile(join(state, 'state.json'), '{"ledger":[1]}')
  assert.equal(await stamp([state]), s0)
  assert.notEqual(await stamp(), s0, 'without the exclude the state file counts')
})

test('stamp: the same from a subdirectory; git rm --cached keeps the file counted as present', async () => {
  const { dir, start, stamp } = await stampRepo()
  await mkdir(join(dir, 'sub')); await writeFile(join(dir, 'sub/b.txt'), 'b\n')
  await writeFile(join(dir, 'a.txt'), 'x\n')
  const fromSub = await treeStamp(port, await repoIdentity(port, join(dir, 'sub')), start)
  assert.equal(fromSub, await stamp())
  const present = await stamp()
  sh(dir, 'git', 'rm', '-q', '--cached', 'a.txt')
  assert.equal(await stamp(), present)
  await rm(join(dir, 'a.txt'))
  assert.notEqual(await stamp(), present)
})

test('stamp: odd names, a symlink to a directory and a nested repository still give a stamp', async () => {
  const { dir, stamp } = await stampRepo()
  for (const name of ['a b.txt', '?q.txt', '-dash.txt', 'nl\nname.txt']) await writeFile(join(dir, name), name)
  await mkdir(join(dir, 'real')); await writeFile(join(dir, 'real/f.txt'), 'f')
  await symlink(join(dir, 'real'), join(dir, 'link'))
  await symlink(join(dir, 'nowhere'), join(dir, 'dangling'))
  await mkdir(join(dir, 'nested')); sh(join(dir, 'nested'), 'git', 'init', '-q')
  const s0 = await stamp()
  assert.match(s0 ?? '', /^[0-9a-f]{64}$/)
  await writeFile(join(dir, 'nl\nname.txt'), 'changed')
  assert.notEqual(await stamp(), s0)
})

test('stamp: read-only: the index is not rewritten and no index.lock appears', async () => {
  const { dir, stamp } = await stampRepo()
  await writeFile(join(dir, 'a.txt'), 'changed\n')
  // A stat-dirty index is what a plain `git status` would refresh and rewrite.
  const index = join(dir, '.git/index')
  const before = (await stat(index)).mtimeMs
  await new Promise(r => setTimeout(r, 20))
  await stamp()
  assert.equal((await stat(index)).mtimeMs, before)
  assert.equal(await access(join(dir, '.git/index.lock')).then(() => true, () => false), false)
})
