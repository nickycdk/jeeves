// An in-memory host for mod tests: answers $.fs, $.process (mkdir/mv/chmod/uname) and $.env beneath the plugin.
import type { On } from 'claude-code'
import { mock, type MockClock } from 'claude-code/testing'

export type MemHost = {
  toasts: string[]
  commands: { name: string; description: string; source: 'builtin' | 'plugin' | 'user' | 'mcp'; plugin?: string }[]
  registered: string[]
  status: (string | undefined)[]
  version: string
  failProcess: boolean
  files: Map<string, string>
  dirs: Set<string>
  env: Record<string, string>
  argv: string[][]
  failWrite: ((path: string) => boolean) | null
  sessionId: string
  clock: MockClock
  /** What `$.agent.list()` answers (status only matters). */
  agents: { id: string; status: string }[]
  /** Debug log lines (`$.ui.log`). */
  logs: string[]
  /** What `$.session.turns()` answers. */
  turns: number
  /** Every `$.prompt.fill` text, in order. */
  fills: string[]
  /** What `$.session.usage().context` answers. */
  usage: { window: number; percent?: number; tokens?: number }
}

const parent = (p: string) => p.replace(/\/[^/]+$/, '') || '/'
const yieldTicks = async (n: number) => { for (let i = 0; i < n; i++) await Promise.resolve() }

/** The mock clock starts here, so timestamps in assertions are readable. */
export const T0 = Date.parse('2026-11-07T08:00:00.000Z')

export function memHost(on: On, env: Record<string, string> = { HOME: '/home/t' }): MemHost {
  const h: MemHost = {
    commands: [], registered: [], toasts: [], status: [], version: '2.1.319', failProcess: false, files: new Map(), dirs: new Set(['/']), env, argv: [], failWrite: null,
    sessionId: 'sess-test', agents: [], fills: [], turns: 0, logs: [], clock: mock.clock(on, { now: T0 }), usage: { window: 1_000_000 },
  }
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('classic.Stop', () => ({}))
  on('classic.SessionStart', () => ({}))
  on('prompt.fill', (_, e) => { h.fills.push(e.text); return { isFilled: true } })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('session.version', () => ({ value: { version: h.version } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { ...h.usage }, rateLimits: [] } }))
  on('session.cwd', () => ({ value: '/work/proj' }))
  on('session.id', () => ({ value: h.sessionId }))
  on('session.turns', () => ({ value: h.turns }))
  on('ui.toast', (_, e) => { h.toasts.push(e.text); return { value: undefined } })
  on('ui.log', (_, e) => { h.logs.push(e.text); return { value: undefined } })
  on('ui.status', (_, e) => { h.status.push(e.text); return { value: undefined } })
  on('fs.stat', (_, e) => {
    if (!h.files.has(e.path) && !h.dirs.has(e.path)) return { deny: `ENOENT: ${e.path}` }
    return { value: { kind: h.dirs.has(e.path) ? 'dir' : 'file', size: 0, mtimeMs: 0, isLink: false, ...(e.resolve ? { realPath: e.path } : {}) } }
  })
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
  on('fs.list', (_, e) => {
    const prefix = e.path.endsWith('/') ? e.path : `${e.path}/`
    const names = new Map<string, 'file' | 'dir'>()
    for (const d of h.dirs) if (d.startsWith(prefix) && d !== prefix) names.set(d.slice(prefix.length).split('/')[0]!, 'dir')
    for (const f of h.files.keys()) if (f.startsWith(prefix)) { const rest = f.slice(prefix.length).split('/'); names.set(rest[0]!, rest.length > 1 ? 'dir' : 'file') }
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('command.list', () => ({ value: h.commands }))
  on('agent.list', () => ({ value: h.agents.map(a => ({ ...a, description: 'test agent', type: 'general-purpose' })) as never }))
  on('command.register', (_, e) => { h.registered.push(e.name); return { value: { command: e.name } } })
  on('fs.exists', (_, e) => ({ value: h.files.has(e.path) || h.dirs.has(e.path) }))
  on('env.get', (_, e) => ({ value: h.env[e.name] }))
  on('process.run', (_, e) => {
    const argv = [...e.argv]
    h.argv.push(argv)
    const ok = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
    const [cmd, ...rest] = argv
    if (h.failProcess) return { deny: 'process.run unavailable' }
    if (cmd === 'true') return { value: ok }
    if (cmd === 'git') return { value: { ...ok, exitCode: 128, stderr: 'fatal: not a git repository' } }
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

