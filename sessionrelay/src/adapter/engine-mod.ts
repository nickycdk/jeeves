// Ports implemented with the engine's `$`.
import type { EngineInterface } from 'claude-code'
import type { FsPort } from './ports.ts'

export function fsPort($: EngineInterface): FsPort {
  return {
    read: path => $.fs.read(path),
    write: (path, text) => $.fs.write(path, text),
    exists: path => $.fs.exists(path),
    realPath: path => $.fs.stat(path, { resolve: true }).then(st => st.realPath ?? null, () => null),
    mtimeMs: path => $.fs.stat(path).then(st => st.mtimeMs, () => null),
    run: async (argv, opts = {}) => {
      const r = await $.process.run(argv, { timeoutMs: opts.timeoutMs ?? 10_000, ...(opts.cwd ? { cwd: opts.cwd } : {}) })
      return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }
    },
    env: name => $.env.get(name),
  }
}
