// Per-process context, rebuilt after every reload (no state lives only in memory; this is all derived).
import type { EngineInterface } from 'claude-code'
import { withoutStopHook, type Probe } from '../core/probe.ts'
import { enginePort } from './engine-mod.ts'
import type { EnginePort } from './ports.ts'
import type { RepoIdentity } from '../core/git.ts'
import { projectDir, projectId, repoIdentity } from './git.ts'
import { runProbe } from './probe.ts'
import { createQueue, createStorage, resolveStateRoot, StorageError, type StateRootSource, type Storage } from './storage.ts'

export type Runtime = {
  port: EnginePort
  storage: Storage
  probe: Probe
  /** null with `stateRootError` when no usable state folder could be set up. */
  stateRoot: string | null
  stateRootError: string | null
  /** Where the state root came from (ADR-005 order); null without one. */
  stateRootSource: StateRootSource | null
  /** This cwd's repo identity; null when git did not answer. */
  identity: RepoIdentity | null
  /** `projects/<projectId>` under the state root; null without a state root or identity. */
  projectId: string | null
  projectDir: string | null
  /** Serialises each read -> reduce -> write -> effects cycle, so concurrent hooks never act on the same old state. */
  serial: ReturnType<typeof createQueue>
  /** Test-only threshold (06 §1): set only when JEEVES_TEST=1 and the override is a number 1..99 (decimals allowed). */
  thresholdOverride: number | null
  /** Test-only relative threshold (D-25): `JEEVES_TEST_THRESHOLD_OVERRIDE=+d`, d in (0, 50]: rotate at this session's first reading + d. */
  thresholdRelative: number | null
  /** Test-only fault injection (ST-6.7): `JEEVES_TEST_CRASH=<point>` with JEEVES_TEST=1 stops this process dead there. */
  crashAt: CrashPoint | null
}

/** The crash matrix's points (ST-6.7), in rotation order. */
export const CRASH_POINTS = ['threshold', 'mid-handover', 'after-persist', 'before-clear', 'before-inject', 'before-submit'] as const
export type CrashPoint = (typeof CRASH_POINTS)[number]

/** `autoRecover`: run /jeeves recover by itself at session start when a task waits for it (userConfig, default off). */
export type Options = { stateDir?: string | undefined; autoRecover?: boolean }

let current: Promise<Runtime> | null = null
// R-25: set once this process saw a main turn answer without the Stop hook; a reload starts over and finds it again.
let stopSkipped = false

/** The Stop hook is being skipped: this runtime and any later one (session.start re-probes) say so. Same storage and queue. */
export function markStopSkipped(rt: Runtime): void { stopSkipped = true; rt.probe = withoutStopHook(rt.probe) }

/** One storage (one write queue) per process. Reset by `session.start` so a reload re-probes. */
export function runtime($: EngineInterface, options: Options, refresh = false): Promise<Runtime> {
  if (!current || refresh) current = build($, options)
  return current
}

async function build($: EngineInterface, options: Options): Promise<Runtime> {
  const port = enginePort($)
  const storage = createStorage(port)
  const probe = await runProbe($).then(p => stopSkipped ? withoutStopHook(p) : p)
  let stateRoot: string | null = null, stateRootError: string | null = null, stateRootSource: StateRootSource | null = null
  const id = await port.cwd().then(cwd => repoIdentity(port, cwd)).catch(() => null)
  try {
    const found = await resolveStateRoot(port, { override: options.stateDir, repoRoot: id?.kind === 'git' ? id.worktree : null })
    stateRoot = found.root
    stateRootSource = found.source
    await storage.ensureRoot(stateRoot)
  } catch (err) {
    stateRoot = null
    stateRootSource = null
    stateRootError = err instanceof StorageError ? `${err.code}: ${err.message}` : String(err)
  }
  const pid = id ? await projectId(id) : null
  const raw = (await port.env('JEEVES_TEST')) === '1' ? (await port.env('JEEVES_TEST_THRESHOLD_OVERRIDE'))?.trim() : undefined
  const relative = raw?.startsWith('+') ? Number(raw.slice(1)) : NaN
  const override = raw && !raw.startsWith('+') ? Number(raw) : NaN
  const crash = (await port.env('JEEVES_TEST')) === '1' ? (await port.env('JEEVES_TEST_CRASH'))?.trim() : undefined
  return {
    port, storage, probe, stateRoot, stateRootError, stateRootSource, identity: id, projectId: pid,
    projectDir: stateRoot && pid ? projectDir(stateRoot, pid) : null, serial: createQueue(),
    thresholdOverride: Number.isFinite(override) && override >= 1 && override <= 99 ? override : null,
    thresholdRelative: Number.isFinite(relative) && relative > 0 && relative <= 50 ? relative : null,
    crashAt: (CRASH_POINTS as readonly string[]).includes(crash ?? '') ? crash as CrashPoint : null,
  }
}
