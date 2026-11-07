// An in-memory host for mod tests: answers $.fs, $.process (mkdir/mv/chmod/uname) and $.env beneath the plugin.
import type { On } from 'claude-code'

export type MemHost = {
  files: Map<string, string>
  dirs: Set<string>
  env: Record<string, string>
  argv: string[][]
  failWrite: ((path: string) => boolean) | null
}

const parent = (p: string) => p.replace(/\/[^/]+$/, '') || '/'
const yieldTicks = async (n: number) => { for (let i = 0; i < n; i++) await Promise.resolve() }

export function memHost(on: On, env: Record<string, string> = { HOME: '/home/t' }): MemHost {
  const h: MemHost = { files: new Map(), dirs: new Set(['/']), env, argv: [], failWrite: null }
  const mkdirs = (d: string) => { for (let p = d; !h.dirs.has(p); p = parent(p)) h.dirs.add(p) }
  on('fs.read', async (_, e) => {
    await yieldTicks(3) // lets concurrent callers interleave, as a real disk does
    const t = h.files.get(e.path)
    return t === undefined ? { deny: `ENOENT: ${e.path}` } : { value: t }
  })
  on('fs.write', async (_, e) => {
    await yieldTicks(2)
    if (h.failWrite?.(e.path)) return { deny: `EIO: ${e.path}` }
    mkdirs(parent(e.path))
    h.files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.exists', (_, e) => ({ value: h.files.has(e.path) || h.dirs.has(e.path) }))
  on('env.get', (_, e) => ({ value: h.env[e.name] }))
  on('process.run', (_, e) => {
    const argv = [...e.argv]
    h.argv.push(argv)
    const ok = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
    const [cmd, ...rest] = argv
    if (cmd === 'uname') return { value: { ...ok, stdout: 'Linux\n' } }
    if (cmd === 'chmod') return { value: ok }
    if (cmd === 'mkdir') {
      const p = rest.includes('-p')
      const d = rest.filter(a => !a.startsWith('-'))[0]!
      if (h.dirs.has(d) || h.files.has(d)) return { value: p ? ok : { ...ok, exitCode: 1, stderr: `mkdir: ${d}: File exists` } }
      if (!p && !h.dirs.has(parent(d))) return { value: { ...ok, exitCode: 1, stderr: `mkdir: ${d}: No such file or directory` } }
      mkdirs(d)
      return { value: ok }
    }
    if (cmd === 'mv') {
      const [src, dst] = rest.filter(a => !a.startsWith('-'))
      const t = h.files.get(src!)
      if (t === undefined) return { value: { ...ok, exitCode: 1, stderr: `mv: ${src}: No such file` } }
      h.files.delete(src!)
      h.files.set(dst!, t)
      return { value: ok }
    }
    if (cmd === 'rm') {
      for (const a of rest.filter(a => !a.startsWith('-'))) {
        h.files.delete(a)
        for (const f of [...h.files.keys()]) if (f.startsWith(`${a}/`)) h.files.delete(f)
        for (const d of [...h.dirs]) if (d === a || d.startsWith(`${a}/`)) h.dirs.delete(d)
      }
      return { value: ok }
    }
    return { value: { ...ok, exitCode: 127, stderr: `memHost: ${cmd} not modelled` } }
  })
  return h
}

