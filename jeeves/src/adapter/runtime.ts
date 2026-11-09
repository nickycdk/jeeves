// Per-process context, rebuilt after every reload (no state lives only in memory; this is all derived).
import type { EngineInterface } from 'claude-code'
import { submitRefused, turnMode, type Probe } from '../core/probe.ts'
import { notified, started, type Background } from '../core/background.ts'
import { enginePort } from './engine-mod.ts'
import type { EnginePort } from './ports.ts'
import type { AutoRow } from '../core/autostart.ts'
import type { RepoIdentity } from '../core/git.ts'
import { projectDir, projectId, repoIdentity } from './git.ts'
import { simulateWindow } from '../core/task.ts'
import { runProbe } from './probe.ts'
// A cycle (task.ts uses bgCount): only called after both modules are loaded.
import { leaveOnRefusal } from './task.ts'
import { offStatus } from './ui.ts'
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
  /** Test-only window (ST-15.1, AC-41): `JEEVES_TEST_WINDOW_OVERRIDE=<tokens>` with JEEVES_TEST=1; every reading is re-based on it. */
  windowOverride: number | null
  /** Test-only fault injection (ST-6.7): `JEEVES_TEST_CRASH=<point>` with JEEVES_TEST=1 stops this process dead there. */
  crashAt: CrashPoint | null
}

/** The crash matrix's points (ST-6.7), in rotation order. */
export const CRASH_POINTS = ['threshold', 'mid-handover', 'after-persist', 'before-clear', 'before-inject', 'before-submit'] as const
export type CrashPoint = (typeof CRASH_POINTS)[number]

/** `autoRecover`: run /jeeves recover by itself at session start when a task waits for it (userConfig, default off). */
export type Options = { stateDir?: string | undefined; autoRecover?: boolean; autoStart?: AutoRow }

let current: Promise<Runtime> | null = null
// R-25 / ADR-002 A3: set once this process saw a main turn answer without the Stop hook (turn mode), and once a submit
// was refused in turn mode; kept across session.start's re-probe in this process, a reload starts over.
let stopSkipped = false
let refused = false

/** The Stop hook is being skipped: turn mode for this runtime and any later one (session.start re-probes). Same storage and queue. */
export function markStopSkipped(rt: Runtime): void { stopSkipped = true; rt.probe = turnMode(rt.probe) }

const lens = (p: Probe) => (refused ? submitRefused(p) : p)

// ADR-004 A2: background work this process saw start, counted from register() on in every process (before turn mode
// is known), so work from the turn that reveals the skip is counted. A reload starts over (at most one pause).
let background: Background = []
export const bgStarted = (id: string) => { background = started(background, id) }
export const bgNotified = (text: string) => { background = notified(background, text) }
/** At each Jeeves /clear and when a task leaves PAUSED(UNSAFE_BOUNDARY): one lost notification costs at most one pause. */
export const bgReset = () => { background = [] }
export const bgCount = () => background.length

/** One storage (one write queue) per process. Reset by `session.start` so a reload re-probes. */
export function runtime($: EngineInterface, options: Options, refresh = false): Promise<Runtime> {
  if (!current || refresh) current = build($, options)
  return current
}

async function build($: EngineInterface, options: Options): Promise<Runtime> {
  const port = enginePort($)
  const storage = createStorage(port)
  const probe = await runProbe($).then(p => lens(stopSkipped ? turnMode(p) : p))
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
  const w = (await port.env('JEEVES_TEST')) === '1' ? Number((await port.env('JEEVES_TEST_WINDOW_OVERRIDE'))?.trim() || NaN) : NaN
  const windowOverride = Number.isInteger(w) && w >= 1000 ? w : null
  const rt: Runtime = {
    port: windowOverride ? { ...port, usage: () => port.usage().then(u => simulateWindow(u, windowOverride)) } : port, storage, probe, stateRoot, stateRootError, stateRootSource, identity: id, projectId: pid,
    projectDir: stateRoot && pid ? projectDir(stateRoot, pid) : null, serial: createQueue(),
    thresholdOverride: Number.isFinite(override) && override >= 1 && override <= 99 ? override : null,
    thresholdRelative: Number.isFinite(relative) && relative > 0 && relative <= 50 ? relative : null,
    windowOverride,
    crashAt: (CRASH_POINTS as readonly string[]).includes(crash ?? '') ? crash as CrashPoint : null,
  }
  // ADR-002 A3: any refused submit in turn mode makes the process unsupported, said once; the caller's own handling still runs.
  const base = rt.port
  const onRefused = (err: unknown) => {
    if (rt.probe.boundary !== 'turn' || rt.probe.mode === 'unsupported') return
    refused = true
    rt.probe = submitRefused(rt.probe)
    base.status(offStatus(rt.probe))
    base.toast(rt.probe.message ?? '')
    base.log(`jeeves: submit refused in turn mode: ${err instanceof Error ? err.message : String(err)}`)
    void leaveOnRefusal(rt).catch(e => base.log(`jeeves: task not released after the refusal: ${e instanceof Error ? e.message : String(e)}`))
  }
  rt.port = {
    ...base,
    submitPrompt: text => base.submitPrompt(text).catch(err => { onRefused(err); throw err }),
    submitPromptSoon: (text, onError) => base.submitPromptSoon(text, err => { onRefused(err); onError(err) }),
  }
  return rt
}
