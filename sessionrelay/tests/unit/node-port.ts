// FsPort on real Node fs + processes: the storage/process (P) test layer.
import { mkdir, readFile, writeFile, access, mkdtemp, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FsPort } from '../../src/adapter/ports.ts'

export function nodePort(env: Record<string, string | undefined> = {}): FsPort {
  return {
    read: path => readFile(path, 'utf8'),
    write: async (path, text) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, text) },
    exists: path => access(path).then(() => true, () => false),
    mtimeMs: path => stat(path).then(st => st.mtimeMs, () => null),
    run: (argv, opts = {}) => new Promise(resolve => {
      execFile(argv[0]!, argv.slice(1), { cwd: opts.cwd, timeout: opts.timeoutMs ?? 10_000 }, (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0
        resolve({ exitCode: code, stdout, stderr })
      })
    }),
    env: async name => (name in env ? env[name] : process.env[name]),
  }
}

export const tempDir = (prefix = 'sr-') => mkdtemp(join(process.env.SR_TEST_TMP ?? tmpdir(), prefix))
