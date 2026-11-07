// Storage (ADR-005): state root, one serial write queue per process, write-once files verified by SHA-256.
import { isInside, join } from '../core/paths.ts'
import type { FsPort } from './ports.ts'

export type StorageErrorCode = 'DISK' | 'IMMUTABLE_EXISTS' | 'BAD_STATE_ROOT'

export class StorageError extends Error {
  readonly code: StorageErrorCode
  constructor(code: StorageErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Runs tasks one at a time, in call order; a failed task does not stop later ones. */
export function createQueue() {
  let tail: Promise<unknown> = Promise.resolve()
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task)
    tail = run.catch(() => undefined)
    return run
  }
}

export type StateRootSource = 'config' | 'test-env' | 'plugin-data' | 'os-default'

/**
 * Where SessionRelay keeps its files: `stateDir` from config, else `SESSIONRELAY_STATE_DIR` when
 * `SESSIONRELAY_TEST=1` (test runs only, 06 §1), else the per-plugin data dir when the engine provides
 * one, else the OS default. A derived root inside the repo is refused (AC 4 of ST-1.3).
 */
export async function resolveStateRoot(
  port: FsPort,
  opts: { override?: string | undefined; repoRoot?: string | null | undefined } = {},
): Promise<{ root: string; source: StateRootSource }> {
  if (opts.override) {
    if (!opts.override.startsWith('/')) throw new StorageError('BAD_STATE_ROOT', `stateDir must be an absolute path, got "${opts.override}"`)
    return { root: join(opts.override), source: 'config' }
  }
  if ((await port.env('SESSIONRELAY_TEST')) === '1') {
    const dir = await port.env('SESSIONRELAY_STATE_DIR')
    if (dir?.startsWith('/')) return { root: join(dir), source: 'test-env' }
  }
  let found: { root: string; source: StateRootSource }
  const pluginData = await port.env('CLAUDE_PLUGIN_DATA')
  if (pluginData?.startsWith('/')) found = { root: join(pluginData, 'state'), source: 'plugin-data' }
  else {
    const home = await port.env('HOME')
    if (!home?.startsWith('/')) throw new StorageError('BAD_STATE_ROOT', 'HOME is not set; set stateDir in /config')
    const os = (await port.run(['uname', '-s'])).stdout.trim()
    const xdg = await port.env('XDG_STATE_HOME')
    found = os === 'Darwin'
      ? { root: join(home, 'Library/Application Support/SessionRelay'), source: 'os-default' }
      : { root: join(xdg?.startsWith('/') ? xdg : join(home, '.local/state'), 'sessionrelay'), source: 'os-default' }
  }
  if (opts.repoRoot && isInside(found.root, opts.repoRoot)) {
    throw new StorageError('BAD_STATE_ROOT', `default state folder ${found.root} is inside the repository ${opts.repoRoot}; set stateDir in /config`)
  }
  return found
}

export function createStorage(port: FsPort) {
  const enqueue = createQueue()

  const runOk = async (argv: string[]) => {
    const r = await port.run(argv)
    if (r.exitCode !== 0) throw new StorageError('DISK', `${argv[0]} failed (exit ${r.exitCode}): ${r.stderr.trim().slice(0, 200)}`)
  }

  const disk = async <T>(what: string, op: () => Promise<T>): Promise<T> => {
    try { return await op() } catch (err) {
      if (err instanceof StorageError) throw err
      throw new StorageError('DISK', `${what}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300))
    }
  }

  return {
    enqueue,

    /** Create the root with user-only permissions. */
    ensureRoot: (root: string) => enqueue(async () => {
      await runOk(['mkdir', '-p', root])
      await runOk(['chmod', '700', root])
    }),

    read: (path: string) => disk(`read ${path}`, () => port.read(path)),
    exists: (path: string) => disk(`exists ${path}`, () => port.exists(path)),

    /** Write once: refuses an existing file, then reads back and compares SHA-256. Returns the hash. */
    writeImmutable: (path: string, text: string) => enqueue(async () => {
      if (await disk(`exists ${path}`, () => port.exists(path))) throw new StorageError('IMMUTABLE_EXISTS', `${path} already exists and is never overwritten`)
      return writeVerified(path, text)
    }),

    /** Append one line through the queue (the engine has no append). */
    appendLine: (path: string, line: string) => enqueue(async () => {
      const prev = (await disk(`exists ${path}`, () => port.exists(path))) ? await disk(`read ${path}`, () => port.read(path)) : ''
      await disk(`write ${path}`, () => port.write(path, prev + line + '\n'))
    }),

    /** Unqueued verified write, for callers already inside `enqueue`. */
    writeVerified,
  }

  async function writeVerified(path: string, text: string): Promise<string> {
    await disk(`write ${path}`, () => port.write(path, text))
    const [want, got] = await Promise.all([sha256Hex(text), disk(`read back ${path}`, () => port.read(path)).then(sha256Hex)])
    if (want !== got) throw new StorageError('DISK', `${path}: read-back hash mismatch (wrote ${want.slice(0, 12)}, read ${got.slice(0, 12)})`)
    return want
  }
}

export type Storage = ReturnType<typeof createStorage>
