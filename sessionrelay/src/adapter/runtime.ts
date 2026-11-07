// Per-process context, rebuilt after every reload (no state lives only in memory; this is all derived).
import type { EngineInterface } from 'claude-code'
import type { Probe } from '../core/probe.ts'
import { enginePort } from './engine-mod.ts'
import type { EnginePort } from './ports.ts'
import { repoIdentity } from './git.ts'
import { runProbe } from './probe.ts'
import { createStorage, resolveStateRoot, StorageError, type Storage } from './storage.ts'

export type Runtime = {
  port: EnginePort
  storage: Storage
  probe: Probe
  /** null with `stateRootError` when no usable state folder could be set up. */
  stateRoot: string | null
  stateRootError: string | null
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
  try {
    const id = await repoIdentity(port, await port.cwd())
    stateRoot = (await resolveStateRoot(port, { override: options.stateDir, repoRoot: id?.kind === 'git' ? id.worktree : null })).root
    await storage.ensureRoot(stateRoot)
  } catch (err) {
    stateRoot = null
    stateRootError = err instanceof StorageError ? `${err.code}: ${err.message}` : String(err)
  }
  return { port, storage, probe, stateRoot, stateRootError }
}
