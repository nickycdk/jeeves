// Fixture repos (06 §2), built fresh in a temp dir per test. ST-4.8 extends this.
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tempDir } from './node-port.ts'

const ENV = {
  ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
}
export const sh = (cwd: string, ...argv: string[]) => execFileSync(argv[0]!, argv.slice(1), { cwd, env: ENV, encoding: 'utf8' })
const gitIn = (cwd: string, ...args: string[]) => sh(cwd, 'git', ...args)

export type Shape = 'clean' | 'dirty' | 'detached' | 'no-commits' | 'worktrees' | 'no-git'

export async function buildRepo(shape: Shape): Promise<{ dir: string; linked?: string }> {
  const dir = join(await tempDir(`sr-${shape}-`), 'repo')
  await mkdir(dir)
  if (shape === 'no-git') { await writeFile(join(dir, 'a.txt'), 'a\n'); return { dir } }
  gitIn(dir, 'init', '-q', '-b', 'main')
  if (shape === 'no-commits') { await writeFile(join(dir, 'new.txt'), 'n\n'); return { dir } }
  await writeFile(join(dir, 'a.txt'), 'a\n')
  gitIn(dir, 'add', 'a.txt')
  gitIn(dir, 'commit', '-q', '-m', 'first')
  if (shape === 'dirty') {
    await writeFile(join(dir, 'a.txt'), 'changed\n')
    await writeFile(join(dir, 'untracked file.txt'), 'u\n')
  }
  if (shape === 'detached') {
    await writeFile(join(dir, 'b.txt'), 'b\n')
    gitIn(dir, 'add', 'b.txt')
    gitIn(dir, 'commit', '-q', '-m', 'second')
    gitIn(dir, 'checkout', '-q', '--detach', 'HEAD~1')
  }
  if (shape === 'worktrees') {
    const linked = join(dir, '..', 'linked')
    gitIn(dir, 'worktree', 'add', '-q', '-b', 'feature', linked)
    return { dir, linked }
  }
  return { dir }
}
