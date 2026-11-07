// Per-process context, rebuilt after every reload (no state lives only in memory; this is all derived).
import type { EngineInterface } from 'claude-code'
import type { Probe } from '../core/probe.ts'
import { enginePort } from './engine-mod.ts'
import type { EnginePort } from './ports.ts'
import type { RepoIdentity } from '../core/git.ts'
import { projectDir, projectId, repoIdentity } from './git.ts'
import { runProbe } from './probe.ts'
import { createQueue, createStorage, resolveStateRoot, StorageError, type Storage } from './storage.ts'

export type Runtime = {
  port: EnginePort
  storage: Storage
  probe: Probe
  /** null with `stateRootError` when no usable state folder could be set up. */
  stateRoot: string | null
  stateRootError: string | null
  /** This cwd's repo identity; null when git did not answer. */
  identity: RepoIdentity | null
  /** `projects/<projectId>` under the state root; null without a state root or identity. */
  projectId: string | null
  projectDir: string | null
  /** Serialises each read -> reduce -> write -> effects cycle, so concurrent hooks never act on the same old state. */
  serial: ReturnType<typeof createQueue>
  /** Test-only threshold (06 §1): set only when JEEVES_TEST=1 and the override is a number 1..99 (decimals allowed). */
  thresholdOverride: number | null
}

export type Options = { stateDir?: string | undefined }

let current: Promise<Runtime> | null = null

/** One storage (one write queue) per process. Reset by `session.start` so a reload re-probes. */
export function runtime($: EngineInterface, options: Options, refresh = false): Promise<Runtime> {
  if (!current || refresh) current = build($, options)
  return current
}

async function build($: EngineInterface, options: Options): Promise<Runtime> {
  const port = enginePort($)
  const storage = createStorage(port)
  const probe = await runProbe($, true)
  let stateRoot: string | null = null, stateRootError: string | null = null
  const id = await port.cwd().then(cwd => repoIdentity(port, cwd)).catch(() => null)
  try {
    stateRoot = (await resolveStateRoot(port, { override: options.stateDir, repoRoot: id?.kind === 'git' ? id.worktree : null })).root
    await storage.ensureRoot(stateRoot)
  } catch (err) {
    stateRoot = null
    stateRootError = err instanceof StorageError ? `${err.code}: ${err.message}` : String(err)
  }
  const pid = id ? await projectId(id) : null
  const override = (await port.env('JEEVES_TEST')) === '1' ? Number(await port.env('JEEVES_TEST_THRESHOLD_OVERRIDE') ?? NaN) : NaN
  return {
    port, storage, probe, stateRoot, stateRootError, identity: id, projectId: pid,
    projectDir: stateRoot && pid ? projectDir(stateRoot, pid) : null, serial: createQueue(),
    thresholdOverride: Number.isFinite(override) && override >= 1 && override <= 99 ? override : null,
  }
}
