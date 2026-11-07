// Storage (ADR-005): state root, one serial write queue per process, write-once files verified by SHA-256.
import { isStale, STALE_MS } from '../core/lock.ts'
import { isInside, join } from '../core/paths.ts'
import { eventDetail } from '../core/redact.ts'
import { check, parseJson, type Result } from '../core/schema.ts'
import { SCHEMA_VERSION, type EventLine, type LockOwner, type State } from '../core/types.ts'
import type { FsPort } from './ports.ts'

export type StorageErrorCode = 'DISK' | 'IMMUTABLE_EXISTS' | 'BAD_STATE_ROOT' | 'INVALID'

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

const randomTag = () => [...crypto.getRandomValues(new Uint8Array(6))].map(b => b.toString(16).padStart(2, '0')).join('')

export type LockResult =
  | { ok: true; owner: LockOwner }
  | { ok: false; code: 'LOCK_HELD'; owner: LockOwner | null; stale: boolean }

/** events.jsonl rolls to events-NNN.jsonl past this size (the engine reads at most 4 MiB). */
export const EVENT_LOG_MAX_BYTES = 1024 * 1024

export type StateRootSource = 'config' | 'test-env' | 'plugin-data' | 'os-default'

/**
 * Where Jeeves keeps its files: `stateDir` from config, else `JEEVES_STATE_DIR` when
 * `JEEVES_TEST=1` (test runs only, 06 §1), else the per-plugin data dir when the engine provides
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
  if ((await port.env('JEEVES_TEST')) === '1') {
    const dir = await port.env('JEEVES_STATE_DIR')
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
      ? { root: join(home, 'Library/Application Support/Jeeves'), source: 'os-default' }
      : { root: join(xdg?.startsWith('/') ? xdg : join(home, '.local/state'), 'jeeves'), source: 'os-default' }
  }
  if (opts.repoRoot && isInside(found.root, opts.repoRoot)) {
    throw new StorageError('BAD_STATE_ROOT', `default state folder ${found.root} is inside the repository ${opts.repoRoot}; set stateDir in /config`)
  }
  return found
}

export function createStorage(port: FsPort, opts: { eventLogMaxBytes?: number } = {}) {
  const eventLogMax = opts.eventLogMaxBytes ?? EVENT_LOG_MAX_BYTES
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
    /** Create the root with user-only permissions. An existing folder keeps its permissions (it may be one the user shares). */
    ensureRoot: (root: string) => enqueue(async () => {
      if (await disk(`exists ${root}`, () => port.exists(root))) return
      await runOk(['mkdir', '-p', root])
      await runOk(['chmod', '700', root])
    }),

    /** Write once: refuses an existing file, then reads back and compares SHA-256. Returns the hash. */
    writeImmutable: (path: string, text: string) => enqueue(async () => {
      if (await disk(`exists ${path}`, () => port.exists(path))) throw new StorageError('IMMUTABLE_EXISTS', `${path} already exists and is never overwritten`)
      return writeVerified(path, text)
    }),

    /** One line per transition (read + rewrite: the engine has no append); `detail` is redacted and capped here, whatever the caller passed. */
    appendEvent: (taskDir: string, e: EventLine) => enqueue(async () => {
      const line = JSON.stringify({ ...e, detail: eventDetail(e.detail) })
      const valid = check('event', JSON.parse(line))
      if (!valid.ok) throw new StorageError('INVALID', `refusing to log an invalid event: ${valid.errors.slice(0, 3).join('; ')}`)
      const path = join(taskDir, 'events.jsonl')
      let prev = (await disk(`exists ${path}`, () => port.exists(path))) ? await disk(`read ${path}`, () => port.read(path)) : ''
      const bytes = (t: string) => new TextEncoder().encode(t).length
      if (prev && bytes(prev) + bytes(line) + 1 > eventLogMax) {
        let n = 1
        const rolled = (k: number) => join(taskDir, `events-${String(k).padStart(3, '0')}.jsonl`)
        while (await disk('exists', () => port.exists(rolled(n)))) n++
        await runOk(['mv', path, rolled(n)])
        prev = ''
      }
      await disk(`write ${path}`, () => port.write(path, prev + line + '\n'))
    }),

    /** All events in order: rolled files by number, then the current file. */
    readEvents: async (taskDir: string): Promise<string[]> => {
      const files: string[] = []
      for (let n = 1; ; n++) {
        const f = join(taskDir, `events-${String(n).padStart(3, '0')}.jsonl`)
        if (!(await disk('exists', () => port.exists(f)))) break
        files.push(f)
      }
      const cur = join(taskDir, 'events.jsonl')
      if (await disk('exists', () => port.exists(cur))) files.push(cur)
      const texts = await Promise.all(files.map(f => disk(`read ${f}`, () => port.read(f))))
      return texts.flatMap(t => t.split('\n').filter(Boolean))
    },

    /** Atomic pointer swap: tmp file, read-back hash check, then `mv -f` (POSIX rename). */
    writeState: (taskDir: string, state: State) => enqueue(async () => {
      const valid = check('state', state)
      if (!valid.ok) throw new StorageError('INVALID', `refusing to write an invalid state: ${valid.errors.slice(0, 3).join('; ')}`)
      await swap(join(taskDir, 'state.json'), JSON.stringify(state, null, 2) + '\n')
    }),

    /** Replace a mutable convenience file (handover.md) by the same tmp + hash check + `mv -f` swap as state.json. */
    replaceFile: (path: string, text: string) => enqueue(() => swap(path, text)),

    /** null when there is no state file; otherwise the parse result (invalid or too new is not thrown). */
    readState: async (taskDir: string): Promise<Result<State> | null> => {
      const path = join(taskDir, 'state.json')
      if (!(await disk(`exists ${path}`, () => port.exists(path)))) return null
      return parseJson('state', await disk(`read ${path}`, () => port.read(path)))
    },

    /** Take the task lock (`mkdir` is atomic). Re-entrant for the same session (a reload reruns session.start). */
    acquireLock: (taskDir: string, sessionId: string, nowIso: string, nowMs: number) => enqueue(() => acquire(taskDir, sessionId, nowIso, nowMs)),

    /** Who holds the lock, read-only. */
    readLock: (taskDir: string, nowMs: number) => lockState(taskDir, nowMs),

    /** Refresh heartbeatAt; false when this session no longer owns the lock. */
    heartbeat: (taskDir: string, sessionId: string, nowIso: string) => enqueue(async () => {
      const owner = await readOwner(taskDir)
      if (owner?.ownerSessionId !== sessionId) return false
      await swap(ownerPath(taskDir), JSON.stringify({ ...owner, heartbeatAt: nowIso }) + '\n')
      return true
    }),

    /** Hand the lock to the new session after /clear (only the current owner may). */
    transferLock: (taskDir: string, fromSessionId: string, toSessionId: string, nowIso: string) => enqueue(async () => {
      const owner = await readOwner(taskDir)
      if (owner?.ownerSessionId !== fromSessionId) return false
      await swap(ownerPath(taskDir), JSON.stringify({ ...owner, ownerSessionId: toSessionId, heartbeatAt: nowIso }) + '\n')
      return true
    }),

    /** Release only a lock this session owns. */
    releaseLock: (taskDir: string, sessionId: string) => enqueue(async () => {
      const owner = await readOwner(taskDir)
      if (owner?.ownerSessionId !== sessionId) return false
      await runOk(['rm', '-rf', join(taskDir, 'lock.d')])
      return true
    }),

    /**
     * Take over a stale lock. Takers serialise on a second mkdir lock (lock.takeover.d) and re-check
     * staleness while holding it, so of two racing takers only one ends up owning lock.d.
     */
    takeoverLock: (taskDir: string, sessionId: string, nowIso: string, nowMs: number) => enqueue(async (): Promise<LockResult> => {
      const first = await lockState(taskDir, nowMs)
      if (first.kind === 'free') return acquire(taskDir, sessionId, nowIso, nowMs)
      const held: LockResult = { ok: false, code: 'LOCK_HELD', owner: first.owner, stale: first.stale }
      if (!first.stale) return held
      const guard = join(taskDir, 'lock.takeover.d')
      if ((await port.run(['mkdir', guard])).exitCode !== 0) {
        // shortcut: a guard left by a crashed taker is replaced once it is older than STALE_MS; two takers racing on
        // that same dead guard can still collide. Upgrade if auto-recover ever runs in many processes at once.
        const age = await port.mtimeMs(guard)
        if (age === null || nowMs - age <= STALE_MS) return held
        await runOk(['rm', '-rf', guard])
        if ((await port.run(['mkdir', guard])).exitCode !== 0) return held
      }
      try {
        const again = await lockState(taskDir, nowMs)
        if (again.kind === 'held' && !again.stale) return { ok: false, code: 'LOCK_HELD', owner: again.owner, stale: false }
        await runOk(['rm', '-rf', join(taskDir, 'lock.d')])
        return await acquire(taskDir, sessionId, nowIso, nowMs)
      } finally {
        await port.run(['rmdir', guard])
      }
    }),
  }

  function ownerPath(taskDir: string) { return join(taskDir, 'lock.d/owner.json') }

  async function swap(target: string, text: string) {
    const tmp = `${target}.tmp-${randomTag()}`
    await writeVerified(tmp, text)
    await runOk(['mv', '-f', tmp, target])
  }

  async function readOwner(taskDir: string): Promise<LockOwner | null> {
    const path = ownerPath(taskDir)
    if (!(await disk(`exists ${path}`, () => port.exists(path)))) return null
    const r = parseJson('lock', await disk(`read ${path}`, () => port.read(path)))
    return r.ok ? r.value : null
  }

  /** A lock.d with no readable owner.json (a crash between mkdir and write) is stale once lock.d is older than STALE_MS. */
  async function lockState(taskDir: string, nowMs: number): Promise<{ kind: 'free' } | { kind: 'held'; owner: LockOwner | null; stale: boolean }> {
    const lockDir = join(taskDir, 'lock.d')
    const mtime = await port.mtimeMs(lockDir)
    if (mtime === null) return { kind: 'free' }
    const owner = await readOwner(taskDir)
    return { kind: 'held', owner, stale: owner ? isStale(owner, nowMs) : nowMs - mtime > STALE_MS }
  }

  async function acquire(taskDir: string, sessionId: string, nowIso: string, nowMs: number): Promise<LockResult> {
    await runOk(['mkdir', '-p', taskDir])
    const made = await port.run(['mkdir', join(taskDir, 'lock.d')])
    if (made.exitCode !== 0) {
      const state = await lockState(taskDir, nowMs)
      if (state.kind === 'free') throw new StorageError('DISK', `mkdir lock.d failed (exit ${made.exitCode}): ${made.stderr.trim().slice(0, 200)}`)
      if (state.owner?.ownerSessionId === sessionId) return { ok: true, owner: state.owner }
      return { ok: false, code: 'LOCK_HELD', owner: state.owner, stale: state.stale }
    }
    const owner: LockOwner = { schemaVersion: SCHEMA_VERSION, ownerSessionId: sessionId, acquiredAt: nowIso, heartbeatAt: nowIso }
    await writeVerified(ownerPath(taskDir), JSON.stringify(owner) + '\n')
    return { ok: true, owner }
  }

  async function writeVerified(path: string, text: string): Promise<string> {
    await disk(`write ${path}`, () => port.write(path, text))
    const [want, got] = await Promise.all([sha256Hex(text), disk(`read back ${path}`, () => port.read(path)).then(sha256Hex)])
    if (want !== got) throw new StorageError('DISK', `${path}: read-back hash mismatch (wrote ${want.slice(0, 12)}, read ${got.slice(0, 12)})`)
    return want
  }
}

export type Storage = ReturnType<typeof createStorage>
