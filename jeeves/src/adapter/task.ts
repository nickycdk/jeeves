// Managed-task wiring (02 §3): find the task, then read state -> reduce -> write state -> run effects.
// Task state lives only in files; every cycle re-reads state.json inside the runtime's serial queue.
import { completionInstruction, parseComplete } from '../core/completion.ts'
import { changedFiles, continuationPrompt, freshContext } from '../core/continuation.ts'
import { capturedFacts, toolRecord, type ToolOutcome } from '../core/evidence.ts'
import { parseHandover } from '../core/handover/parse.ts'
import { handoverFile, renderHandover, roundTrips } from '../core/handover/render.ts'
import { handoverInstruction, NUDGE_PROMPT, QUIESCE_NOTE, retryInstruction, type CapturedFacts } from '../core/handover/template.ts'
import { mentionedPaths, validateHandover } from '../core/handover/validate.ts'
import { COMPLETION_STATES, HELD_STATES, isSafe, reduce, type Input } from '../core/machine.ts'
import { newRotationId, newTaskId } from '../core/ids.ts'
import { join } from '../core/paths.ts'
import { foldTask, newTaskState, parseRevision, renderChange, revFile, type ChangeKind, type TaskView } from '../core/task.ts'
import { DEFAULT_CONFIG, INERT, SCHEMA_VERSION, type ReasonCode, type State } from '../core/types.ts'
import { runEffects, type EffectResult } from './effects.ts'
import { gitFacts } from './git.ts'
import type { CrashPoint, Runtime } from './runtime.ts'
import { sha256Hex, StorageError } from './storage.ts'

export type Task = { state: State; dir: string }

/** Statuses after which a task no longer claims the project. */
const ENDED = new Set<State['status']>(['DISABLED', 'COMPLETED', 'FAILED'])
const random6 = () => crypto.getRandomValues(new Uint8Array(6))
const recentFirst = (a: Task, b: Task) => b.state.updatedAt.localeCompare(a.state.updatedAt)

/** A task folder whose state.json cannot be used: unreadable or invalid, or written by a newer Jeeves (`tooNew`). */
export type Broken = { dir: string; name: string; tooNew: boolean }

/** Every readable task of this project, most recently updated first; unreadable ones as errors (and in `broken`). */
export async function projectTasks(rt: Runtime): Promise<{ tasks: Task[]; errors: string[]; broken: Broken[] }> {
  if (!rt.projectDir) return { tasks: [], errors: [], broken: [] }
  // shortcut: reads every task's state.json per call; cache the owned task's folder if task counts grow large.
  const tasksDir = join(rt.projectDir, 'tasks')
  const tasks: Task[] = [], errors: string[] = [], broken: Broken[] = []
  for (const name of await rt.port.listDirs(tasksDir)) {
    const dir = join(tasksDir, name)
    const r = await rt.storage.readState(dir).catch(err => ({ ok: false as const, errors: [String(err)], io: true }))
    if (r === null) continue
    if (r.ok) tasks.push({ state: r.value, dir })
    else {
      errors.push(`${name}: ${r.errors[0] ?? 'invalid'}`)
      // A read that failed (I/O, permissions) is not a corrupt file: never offered for a rebuild.
      if (!('io' in r)) broken.push({ dir, name, tooNew: 'code' in r && r.code === 'SCHEMA_TOO_NEW' })
    }
  }
  return { tasks: tasks.sort(recentFirst), errors, broken }
}

/** The task this session owns and that has not ended (not off, completed or failed), if any. */
export const ownTask = (tasks: Task[], sessionId: string) => tasks.find(t => t.state.activeSessionId === sessionId && !ENDED.has(t.state.status)) ?? null
/** Every task that still claims the project (not off, completed or failed), most recent first. */
export const liveTasks = (tasks: Task[]) => tasks.filter(t => !ENDED.has(t.state.status))

export type Applied = { state: State; forHook: EffectResult['forHook'] }

/** One transition from `prev`, inside the serial queue: write state, then run effects; feeds back follow-up inputs. */
async function transition(rt: Runtime, dir: string, prev: State, input: Input): Promise<Applied> {
  let state = prev
  const forHook: Applied['forHook'] = []
  for (const queue = [input]; queue.length;) {
    const now = await rt.port.now()
    const out = reduce(state, queue.shift()!, { now, config: DEFAULT_CONFIG, newRotationId: newRotationId(now, random6()), ...(rt.thresholdOverride ? { thresholdOverride: rt.thresholdOverride } : {}), ...(rt.thresholdRelative ? { thresholdRelative: rt.thresholdRelative } : {}) })
    if (out.ignored) rt.port.log(`jeeves: ${out.ignored}`)
    if (out.state === state) continue
    try {
      await rt.storage.writeState(dir, out.state)
    } catch (err) {
      await blockOnDisk(rt, dir, state, out.state.status, err)
      throw err
    }
    state = out.state
    const r = await runEffects(out.effects, { port: rt.port, storage: rt.storage, taskDir: dir, state })
    for (const f of r.failed) rt.port.log(`jeeves: effect ${f.effect.type} failed: ${f.error}`)
    forHook.push(...r.forHook)
    queue.push(...r.followUps)
  }
  return { state, forHook }
}

/**
 * ST-6.5: a state write failed. The state on disk is still the last good one (the swap is atomic), so it stays the
 * checkpoint; BLOCKED(DISK) is written over it if the disk takes that write. If not, the status line says so (no toast
 * per failed write).
 */
async function blockOnDisk(rt: Runtime, dir: string, prev: State, to: State['status'], err: unknown): Promise<void> {
  if (!(err instanceof StorageError) || err.code !== 'DISK') return
  const out = reduce(prev, { type: 'DISK_FAILED', path: dir, error: err.message, to }, { now: await rt.port.now(), config: DEFAULT_CONFIG, newRotationId: '-' })
  if (out.state === prev) return
  try {
    await rt.storage.writeState(dir, out.state)
    await runEffects(out.effects, { port: rt.port, storage: rt.storage, taskDir: dir, state: out.state })
  } catch {
    rt.port.status(`blocked: cannot write task files (DISK)`)
  }
}

/**
 * Test-only fault injection (ST-6.7): at the configured point, log a marker and never return, as if the process died
 * there. Nothing after it runs in this process; the live driver kills it on the marker, a mod test restarts as a new
 * session. A no-op unless JEEVES_TEST=1 and JEEVES_TEST_CRASH name this point.
 */
export async function crashPoint(rt: Runtime, point: CrashPoint): Promise<void> {
  if (rt.crashAt !== point) return
  rt.port.log(`jeeves: crash point ${point}`)
  await new Promise<never>(() => {})
}

/** Apply an input to the task in `dir`; null when its state cannot be read. */
export function apply(rt: Runtime, dir: string, input: Input): Promise<Applied | null> {
  return rt.serial(async () => {
    const r = await rt.storage.readState(dir)
    return r?.ok ? transition(rt, dir, r.value, input) : null
  })
}

/**
 * Apply an input to this session's own task; null when it has none. The task is looked up inside the queue,
 * so inputs keep the order their hooks fired in (a tool's ledger entry is in before the Stop that follows).
 */
export async function applyOwn(rt: Runtime, input: Input): Promise<Applied | null> {
  const sessionId = await rt.port.sessionId()
  return rt.serial(async () => {
    const own = ownTask((await projectTasks(rt)).tasks, sessionId)
    return own ? transition(rt, own.dir, own.state, input) : null
  })
}

/** `tool.call` finished: its ledger entry, and the main loop's soft-quiesce point (ST-3.1, ST-3.2). */
export async function recordTool(rt: Runtime, o: ToolOutcome): Promise<Applied | null> {
  const entry = toolRecord(o)
  const main = o.agentId === undefined
  // Nothing to record and not a quiesce point: skip the disk reads entirely.
  if (!entry && !main) return null
  // Main loop: the context as it stands after this call, in the same write as the ledger entry.
  const u = main ? await rt.port.usage().catch(() => null) : null
  const reading = u && u.percent !== undefined ? { window: u.window, sessionId: await rt.port.sessionId(), percent: exactPercent(u)!, ...(u.tokens !== undefined ? { tokens: u.tokens } : {}) } : undefined
  const r = await applyOwn(rt, { type: 'TOOL_RESULT', main, ...(entry ? { entry } : {}), ...(reading ? { reading } : {}) })
  if (r?.state.status === 'ROTATION_REQUESTED') await crashPoint(rt, 'threshold')
  if (r?.forHook.some(f => f.type === 'APPEND_NOTE')) await rt.port.appendHiddenNote(QUIESCE_NOTE)
  return r
}

/** Own the task's lock: take it when free or stale (owner silent past STALE_MS). False when another live session holds it. */
export async function claim(rt: Runtime, dir: string, sessionId: string): Promise<boolean> {
  const now = await rt.port.now(), at = new Date(now).toISOString()
  const r = await rt.storage.acquireLock(dir, sessionId, at, now)
  if (r.ok) return true
  return r.stale && (await rt.storage.takeoverLock(dir, sessionId, at, now)).ok
}

/**
 * Take the task's lock for `me`: hand it over from the task's previous session only when this process ended that
 * session itself (after /clear its lock is not stale yet), else claim it, which refuses a live owner (D-18).
 */
export async function takeLock(rt: Runtime, dir: string, previous: string | null, me: string, endedHere: ReadonlySet<string>): Promise<boolean> {
  if (previous && previous !== me && endedHere.has(previous) && (await rt.storage.transferLock(dir, previous, me, new Date(await rt.port.now()).toISOString()))) return true
  return claim(rt, dir, me)
}

/** True when a session other than `sessionId` holds a live (not stale) lock on the task. */
export async function heldByOther(rt: Runtime, dir: string, sessionId: string): Promise<boolean> {
  const l = await rt.storage.readLock(dir, await rt.port.now())
  return l.kind === 'held' && !l.stale && l.owner?.ownerSessionId !== sessionId
}

/** Create a task owned by this session: lock, rev 1 when the goal is given, state MONITORING. */
export async function startTask(rt: Runtime, sessionId: string, goal: string | null): Promise<Applied & { dir: string }> {
  const now = await rt.port.now(), at = new Date(now).toISOString()
  const taskId = newTaskId(now, random6())
  const dir = join(rt.projectDir!, 'tasks', taskId)
  const facts = await gitFacts(rt.port, rt.identity)
  const lock = await rt.storage.acquireLock(dir, sessionId, at, now)
  await writeProjectRecord(rt, at)
  let state = newTaskState({ taskId, projectId: rt.projectId!, thresholdPercent: DEFAULT_CONFIG.thresholdPercent, taskStartHead: facts.kind === 'git' ? facts.head : null, at })
  if (goal !== null && lock.ok) {
    await rt.storage.writeImmutable(join(dir, revFile(1)), goal)
    state = { ...state, taskRevision: 1 }
  }
  const applied = await rt.serial(() => transition(rt, dir, state, { type: 'ON', mode: rt.probe.mode, lockAcquired: lock.ok, sessionId }))
  return { ...applied, dir }
}

/** `project.json` (02 §6.1): where this project lives, so a moved repository can be relinked (ST-6.5). Written once. */
export async function writeProjectRecord(rt: Runtime, at: string): Promise<void> {
  const path = join(rt.projectDir!, 'project.json')
  if (!rt.identity || (await rt.port.exists(path))) return
  const id = rt.identity
  const record = { schemaVersion: SCHEMA_VERSION, repoRoot: id.kind === 'git' ? id.commonDir : id.cwd, worktree: id.kind === 'git' ? id.worktree : id.cwd, createdAt: at }
  await rt.storage.replaceFile(path, JSON.stringify(record, null, 2) + '\n').catch(err => rt.port.log(`jeeves: project.json not written: ${why(err)}`))
}

/**
 * A revision file whose state write then failed is already the next revision: record it before writing a new one,
 * so a retry never hits "already exists" and the task never sticks (write-once files, read the file as the truth).
 */
async function adoptLeftovers(rt: Runtime, dir: string, s: State): Promise<State> {
  while (await rt.port.exists(join(dir, revFile(s.taskRevision + 1)))) {
    // After rev 1 the queue is written first (flushPending), so a leftover then is the first queued change.
    const pending = s.taskRevision >= 1 && (s.pendingChanges?.length ?? 0) > 0
    const next = (await transition(rt, dir, s, { type: 'REVISED', revision: s.taskRevision + 1, ...(pending ? { pending } : {}) })).state
    if (next.taskRevision === s.taskRevision) break
    s = next
  }
  return s
}

/**
 * `/jeeves dod|check` typed before the first prompt become the next revisions once rev 1 exists, in the order typed
 * (FR-05). Called wherever a revision is written, so a queue left by a failed write is flushed at the next chance.
 */
async function flushPending(rt: Runtime, dir: string, s: State): Promise<State> {
  for (const c of [...(s.pendingChanges ?? [])]) {
    if (s.taskRevision < 1) break
    const n = s.taskRevision + 1
    await rt.storage.writeImmutable(join(dir, revFile(n)), renderChange(n, c.kind, c.text, new Date(await rt.port.now()).toISOString()))
    s = (await transition(rt, dir, s, { type: 'REVISED', revision: n, pending: true })).state
  }
  return s
}

/**
 * `prompt.submit` (composer): while this session's task waits for its first prompt, store it as rev 1, byte for byte.
 * A later prompt only flushes changes still queued from before rev 1 (left by a failed write).
 */
export async function captureFirstPrompt(rt: Runtime, text: string): Promise<void> {
  const own = ownTask((await projectTasks(rt)).tasks, await rt.port.sessionId())
  if (!own || (own.state.taskRevision !== 0 && !own.state.pendingChanges?.length)) return
  await rt.serial(async () => {
    const r = await rt.storage.readState(own.dir)
    if (!r?.ok) return
    let s = await adoptLeftovers(rt, own.dir, r.value)
    if (s.taskRevision === 0) {
      await rt.storage.writeImmutable(join(own.dir, revFile(1)), text)
      s = (await transition(rt, own.dir, s, { type: 'REVISED', revision: 1 })).state
    }
    await flushPending(rt, own.dir, s)
  })
}

/**
 * A prompt the user typed while a handover is in flight (ADR-010): held for the fresh conversation instead of the
 * old one. True when held; the hook then drops it and empties the box. The task is this session's, or the one whose
 * /clear this process has under way (between session.end and the fresh SessionStart the new id owns nothing yet).
 */
export async function holdPrompt(rt: Runtime, text: string, endedHere: ReadonlySet<string>): Promise<boolean> {
  const me = await rt.port.sessionId()
  const { tasks } = await projectTasks(rt)
  const t = ownTask(tasks, me) ?? tasks.find(clearingHere(endedHere)) ?? null
  if (!t || !HELD_STATES.includes(t.state.status)) return false
  const r = await apply(rt, t.dir, { type: 'HOLD_PROMPT', text })
  return r !== null && r.state.heldPrompts.length > t.state.heldPrompts.length
}

/** Heartbeat for the lock of the task this session owns (ADR-005). */
export async function heartbeat(rt: Runtime): Promise<void> {
  const me = await rt.port.sessionId()
  const own = ownTask((await projectTasks(rt)).tasks, me)
  if (own && !(await rt.storage.heartbeat(own.dir, me, new Date(await rt.port.now()).toISOString()))) rt.port.log(`jeeves: lost the lock of ${own.state.taskId}`)
}

/**
 * A user command's change as the next write-once revision (FR-05). Before rev 1 (the original prompt) is captured it
 * is queued and written right after it: 'pending'. Null when the task cannot be read or the queue is full.
 */
export function addRevision(rt: Runtime, dir: string, kind: ChangeKind, text: string): Promise<number | 'pending' | null> {
  return rt.serial(async () => {
    const r = await rt.storage.readState(dir)
    if (!r?.ok) return null
    let s = await adoptLeftovers(rt, dir, r.value)
    if (s.taskRevision < 1) {
      const q = await transition(rt, dir, s, { type: 'QUEUE_CHANGE', kind, text })
      return (q.state.pendingChanges?.length ?? 0) > (s.pendingChanges?.length ?? 0) ? 'pending' : null
    }
    s = await flushPending(rt, dir, s)
    const n = s.taskRevision + 1
    await rt.storage.writeImmutable(join(dir, revFile(n)), renderChange(n, kind, text, new Date(await rt.port.now()).toISOString()))
    await transition(rt, dir, s, { type: 'REVISED', revision: n })
    return n
  })
}

/** Every revision up to the state's, folded. A file that is missing or not ours is reported, never guessed. */
export async function readTask(rt: Runtime, dir: string, state: State): Promise<{ view: TaskView; errors: string[] }> {
  const revs = [], errors: string[] = []
  for (let n = 1; n <= state.taskRevision; n++) {
    const text = await rt.port.read(join(dir, revFile(n))).catch(() => null)
    const rev = text === null ? null : parseRevision(n, text)
    if (rev) revs.push(rev)
    else errors.push(`${revFile(n)} is ${text === null ? 'missing' : 'not a Jeeves revision'}`)
  }
  return { view: foldTask(revs), errors }
}

/** The engine's percent is a whole number (10K tokens on a 1M window); with tokens known, the exact figure. */
const exactPercent = (c: { percent?: number; tokens?: number; window: number }) =>
  c.percent !== undefined && c.tokens !== undefined && c.window > 0 ? Math.round((c.tokens / c.window) * 10_000) / 100 : c.percent

/** `session.measure` with a context change: the main conversation's `usage().context` (FR-02). Missing percent stays unknown. */
export async function measure(rt: Runtime, c: { percent?: number; tokens?: number; window: number }): Promise<Applied | null> {
  const sessionId = await rt.port.sessionId()
  const percent = exactPercent(c)
  const r = await applyOwn(rt, { type: 'MEASURE', window: c.window, sessionId, ...(percent !== undefined ? { percent } : {}), ...(c.tokens !== undefined ? { tokens: c.tokens } : {}) })
  if (r?.state.status === 'ROTATION_REQUESTED') await crashPoint(rt, 'threshold')
  return r
}

/** The session ends for good (exit, logout, resume elsewhere): give up its lock so the next session can resume at once. Task state is kept. */
export async function releaseOnExit(rt: Runtime, sessionId: string): Promise<void> {
  for (const t of (await projectTasks(rt)).tasks) if (t.state.activeSessionId === sessionId) await rt.storage.releaseLock(t.dir, sessionId)
}

/**
 * session.end(clear). Jeeves's own /clear (ROTATING, CLEAR_SCHEDULED) records the source session and writes its
 * `sessions/NNN.json`; the lock stays for the fresh session to take. A user's /clear pauses the task (USER_CLEAR,
 * ADR-010) and gives up the old id's lock, so the new conversation can see it and end it.
 */
export async function onUserClear(rt: Runtime, oldSessionId: string): Promise<void> {
  const own = ownTask((await projectTasks(rt)).tasks, oldSessionId)
  if (!own) return
  const cost = await rt.port.costUsd()
  const r = await apply(rt, own.dir, { type: 'SESSION_END', reason: 'clear', sessionId: oldSessionId, ...(cost !== null ? { costUsd: cost } : {}) })
  if (r?.state.status === 'PAUSED' && r.state.reason === 'USER_CLEAR') await rt.storage.releaseLock(own.dir, oldSessionId)
}

/**
 * A rotation whose /clear this process has under way (ST-6.6): its session is one this process ended, so the next
 * fresh session here belongs to it, never to a rotation another process runs in the same project.
 */
const clearingHere = (endedHere: ReadonlySet<string>) => (t: Task) =>
  t.state.status === 'ROTATING' && (t.state.rotation?.step === 'CLEAR_SCHEDULED' || t.state.rotation?.step === 'CLEARED') &&
  t.state.activeSessionId !== null && endedHere.has(t.state.activeSessionId)

/**
 * classic.SessionStart(source clear) (ST-4.2): the fresh conversation takes the task: target id, lock, RESTORING.
 * Returns the context to inject (task, DoD, verified handover), else null (a user's /clear, no rotation, or a handover
 * that no longer verifies: then NEEDS_REVIEW and nothing is injected).
 */
export async function onFreshSession(rt: Runtime, sessionId: string, endedHere: ReadonlySet<string>): Promise<string | null> {
  const t = (await projectTasks(rt)).tasks.find(clearingHere(endedHere))
  if (!t) return null
  await crashPoint(rt, 'before-inject')
  const h = await latestHandover(rt, t.dir, t.state)
  const r = await apply(rt, t.dir, { type: 'SESSION_START_CLEAR', sessionId, handoverOk: h.ok && h.text !== null })
  if (!r?.forHook.some(f => f.type === 'INJECT_CONTEXT')) return null
  rt.port.after(FRESH_CONTINUE_MS, () => void continueFresh(rt, t.dir).catch(err => rt.port.log(`jeeves: continuation failed: ${why(err)}`)))
  return contextFor(rt, t.dir, r.state, h)
}

/** What the Stop hook passes in (classic.Stop on the main loop). */
export type StopInfo = { backgroundTasks: number; crons: readonly { id: string; schedule: string; recurring: boolean; prompt: string }[]; message: string }

/** Rotation states in which a Stop matters. */
const STOP_STATES = new Set<State['status']>(['ROTATION_REQUESTED', 'QUIESCING', 'HANDOVER_GENERATING'])

/** The facts snapshot taken at the safe Stop (ADR-003 verified section; ADR-004 A1 crons). */
export const factsFile = (rotationId: string) => `history/facts-${rotationId}.json`

/**
 * classic.Stop (ST-3.3): at a safe boundary ask for the handover; otherwise count the wait (QUIESCING) until the
 * quiesce limit pauses the task. Returns the Stop `block` text, or null to let Claude stop. Throws only on failure:
 * the hook then lets Claude stop (fail open for the user) and nothing advances (fail closed for the rotation).
 */
export async function onStop(rt: Runtime, info: StopInfo): Promise<string | null> {
  const own = ownTask((await projectTasks(rt)).tasks, await rt.port.sessionId())
  if (!own) return null
  // ST-5.2: a completion block is judged first; a rotation that has asked Claude nothing yet gives way to it.
  const complete = COMPLETION_STATES.includes(own.state.status) ? parseComplete(info.message) : null
  if (complete && (complete.taskId === null || complete.taskId === own.state.taskId)) return completionStop(rt, own, complete.blockers)
  if (!STOP_STATES.has(own.state.status)) return null
  if (own.state.status === 'HANDOVER_GENERATING') return handoverStop(rt, own, info)
  // An agent list that cannot be read counts as one running agent: unsafe, so the quiesce limit still ends the wait.
  const runningAgents = await rt.port.runningAgents().catch(() => 1)
  const r = await applyOwn(rt, { type: 'STOP', backgroundTasks: info.backgroundTasks, runningAgents })
  if (!r) return null
  const rotationId = r.state.rotation?.rotationId
  let captured: CapturedFacts | null = null
  if (rotationId && r.forHook.some(f => f.type === 'CAPTURE_FACTS')) {
    const git = await gitFacts(rt.port, rt.identity, r.state.taskStartHead)
    captured = capturedFacts(git, r.state.ledger)
    const snapshot = { schemaVersion: 1, rotationId, capturedAt: r.state.updatedAt, git, crons: info.crons }
    // A snapshot that cannot be saved is logged; the handover is checked against fresh facts anyway.
    await rt.storage.writeImmutable(join(own.dir, factsFile(rotationId)), JSON.stringify(snapshot, null, 2) + '\n')
      .catch(err => rt.port.log(`jeeves: facts snapshot not saved: ${why(err)}`))
  }
  const block = r.forHook.find(f => f.type === 'BLOCK_STOP')
  if (block?.type === 'BLOCK_STOP' && block.kind === 'handover-request' && rotationId) {
    await crashPoint(rt, 'mid-handover')
    return handoverInstruction({ taskId: r.state.taskId, rotationId, maxChars: DEFAULT_CONFIG.handoverMaxChars, facts: captured })
  }
  return null
}

/**
 * The Stop that carries Claude's JEEVES-COMPLETE block (ST-5.2, ADR-007). The reducer checks it against the ledger
 * inside the serial queue (a check's entry lands before the Stop is applied). Missing evidence: one block listing
 * the checks to run; still missing: NEEDS_REVIEW(DOD_UNMET); passing: COMPLETED with a summary and the lock released.
 */
async function completionStop(rt: Runtime, own: Task, blockers: string[]): Promise<string | null> {
  const { view } = await readTask(rt, own.dir, own.state)
  const r = await applyOwn(rt, { type: 'COMPLETE_BLOCK', commands: view.checks, blockers })
  const ask = r?.forHook.find(f => f.type === 'BLOCK_STOP' && f.kind === 'completion-missing')
  if (ask?.type !== 'BLOCK_STOP') return null
  return [
    'Jeeves: not marked done yet. Run each check below as its own Bash command, exactly as written, with nothing before or after it (no ;, &&, pipes or echo: a chained command reports the last command\'s exit code), then reply with the JEEVES-COMPLETE block again:',
    ...ask.errors.slice(0, 10).map(e => `- ${e}`),
  ].join('\n')
}

/** The system-prompt section for this session's active task (ST-5.2): how to report completion. Null without one. */
export async function taskSection(rt: Runtime): Promise<string | null> {
  const own = ownTask((await projectTasks(rt)).tasks, await rt.port.sessionId())
  if (!own || INERT.includes(own.state.status) || own.state.taskRevision < 1) return null
  const { view } = await readTask(rt, own.dir, own.state)
  return completionInstruction(own.state.taskId, view.checks)
}

export const why = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 200)

/** The next unused `history/handover-NNN.md` (write-once: a number is never reused). */
export const nextHandoverNumber = async (rt: Runtime, dir: string) => (await count(rt, n => join(dir, handoverFile(n)))) + 1

/** How many files `path(1)`, `path(2)`, ... exist in an unbroken run from 1. */
export async function count(rt: Runtime, path: (n: number) => string): Promise<number> {
  let n = 0
  while (await rt.port.exists(path(n + 1))) n++
  return n
}

/** The branch in the rotation's facts snapshot; undefined when there is none to compare with. */
async function snapshotBranch(rt: Runtime, dir: string, rotationId: string): Promise<string | null | undefined> {
  try {
    const snap = JSON.parse(await rt.port.read(join(dir, factsFile(rotationId)))) as { git?: { kind?: string; branch?: string | null } }
    return snap.git?.kind === 'git' ? (snap.git.branch ?? null) : undefined
  } catch { return undefined }
}

/**
 * The Stop that carries Claude's handover (ST-3.8): parse, validate against fresh facts, render the merged file and
 * check it parses back; then the reducer decides. Valid: write history/handover-NNN.md once (SHA-256 read back) and
 * only then record HANDOVER_PERSISTED, the one way to ROTATING, so no /clear can come before a verified file.
 * Invalid: block with the errors up to maxHandoverRetries, then NEEDS_REVIEW(HANDOVER_INVALID) with nothing written.
 */
async function handoverStop(rt: Runtime, own: Task, info: StopInfo): Promise<string | null> {
  const s = own.state, rotation = s.rotation!
  const base = rt.identity?.kind === 'git' ? rt.identity.worktree : rt.identity?.kind === 'none' ? rt.identity.cwd : await rt.port.cwd()
  const git = await gitFacts(rt.port, rt.identity, s.taskStartHead)
  const parsed = parseHandover(info.message)
  const existing = new Set<string>()
  // A lookup the engine refuses counts as missing: validation then asks Claude to fix that bullet, instead of the
  // whole Stop throwing and the rotation waiting for ever (live run 8). Untested: the mod kit skips a throwing hook.
  if (parsed.ok) for (const p of mentionedPaths(parsed.value)) if (await rt.port.exists(p.startsWith('/') ? p : join(base, p)).catch(() => false)) existing.add(p)
  const v = validateHandover(info.message, {
    taskId: s.taskId, rotationId: rotation.rotationId, maxChars: DEFAULT_CONFIG.handoverMaxChars, git,
    capturedBranch: await snapshotBranch(rt, own.dir, rotation.rotationId), ledger: s.ledger, existing,
  })
  let merged: string | null = null, n = 0
  let outcome: { ok: true } | { ok: false; errors: string[]; fatal?: ReasonCode }
  if (v.ok) {
    n = await nextHandoverNumber(rt, own.dir)
    const { view } = await readTask(rt, own.dir, s)
    merged = renderHandover({
      n, taskId: s.taskId, rotationId: rotation.rotationId, trigger: rotation.trigger, sourceSessionId: s.activeSessionId,
      at: new Date(await rt.port.now()).toISOString(), contextPercent: s.lastContext?.percent ?? null, retries: rotation.retries,
      taskRevision: s.taskRevision, dod: view.dod, checks: view.checks, taskStartHead: s.taskStartHead, git, crons: info.crons,
      ledger: s.ledger, narrative: v.narrative,
    })
    outcome = roundTrips(merged, v.narrative) ? { ok: true } : { ok: false, errors: ['the merged handover file did not parse back'], fatal: 'HANDOVER_INVALID' }
  } else {
    outcome = { ok: false, errors: v.errors.map(e => e.message), ...(v.fatal ? { fatal: v.fatal } : {}) }
  }
  // ADR-004 holds at the handover Stop too: work Claude started while writing it must end before anything rotates.
  const runningAgents = await rt.port.runningAgents().catch(() => 1)
  if (!isSafe({ backgroundTasks: info.backgroundTasks, runningAgents })) {
    const busy = `${info.backgroundTasks} background task(s) and ${runningAgents} running agent(s) are still in flight; wait for them, run no new tool, then reply with the handover again`
    outcome = { ok: false, errors: [busy, ...(outcome.ok ? [] : outcome.errors)], ...(!outcome.ok && outcome.fatal ? { fatal: outcome.fatal } : {}) }
    merged = null
  }
  const r = await applyOwn(rt, { type: 'STOP', backgroundTasks: info.backgroundTasks, runningAgents: 0, handover: outcome })
  if (!r) return null
  if (merged !== null && r.forHook.some(f => f.type === 'PERSIST_HANDOVER')) {
    let ref: string | null = null
    try {
      ref = `${handoverFile(n)}#sha256:${await rt.storage.writeImmutable(join(own.dir, handoverFile(n)), merged)}`
      // handover.md is a convenience copy; the verified history file is what counts.
      await rt.storage.replaceFile(join(own.dir, 'handover.md'), merged).catch(err => rt.port.log(`jeeves: handover.md not updated: ${why(err)}`))
    } catch (err) {
      rt.port.log(`jeeves: handover not saved: ${why(err)}`)
    }
    if (ref) await crashPoint(rt, 'after-persist')
    const p = await applyOwn(rt, ref ? { type: 'HANDOVER_PERSISTED', ok: true, ref } : { type: 'HANDOVER_PERSISTED', ok: false })
    if (p?.state.status === 'ROTATING') await crashPoint(rt, 'before-clear')
    return null
  }
  const retry = r.forHook.find(f => f.type === 'BLOCK_STOP' && f.kind === 'handover-retry')
  return retry?.type === 'BLOCK_STOP' ? retryInstruction({ taskId: s.taskId, rotationId: rotation.rotationId, errors: retry.errors }) : null
}

/** The handover's verified branch against the repository's now; null when they agree or either is unknown. */
async function branchMismatch(rt: Runtime, handover: string | null): Promise<{ expected: string; actual: string } | null> {
  const m = handover ? /^- Branch: (.+)$/m.exec(handover) : null
  if (!m) return null
  const git = await gitFacts(rt.port, rt.identity)
  if (git.kind !== 'git') return null
  const actual = git.branch ?? '(detached HEAD)'
  return m[1]!.trim() === actual ? null : { expected: m[1]!.trim(), actual }
}

/** The text of the validated handover `ref` (`history/handover-NNN.md#sha256:<hex>`) if it is on disk and unchanged. */
async function readVerified(rt: Runtime, dir: string, ref: string | null): Promise<string | null> {
  const m = ref ? /^(.+)#sha256:([0-9a-f]{64})$/.exec(ref) : null
  if (!m) return null
  const text = await rt.port.read(join(dir, m[1]!)).catch(() => null)
  return text !== null && (await sha256Hex(text)) === m[2] ? text : null
}

/** The task's latest handover. `ok` false: there is one but it cannot be read back or no longer matches its hash. */
type Latest = { ok: boolean; file: string | null; text: string | null }
async function latestHandover(rt: Runtime, dir: string, s: State): Promise<Latest> {
  if (!s.lastValidatedHandover) return { ok: true, file: null, text: null }
  const text = await readVerified(rt, dir, s.lastValidatedHandover)
  return { ok: text !== null, file: s.lastValidatedHandover.split('#')[0]!, text }
}

/** What the fresh conversation is given (ST-4.3). Its session number counts this new one (`sessionSequence` moves on at rearm). */
async function contextFor(rt: Runtime, dir: string, s: State, h: Latest): Promise<string> {
  const { view } = await readTask(rt, dir, s)
  return freshContext({ taskId: s.taskId, session: s.sessionSequence + 1, view, handover: h.file && h.text ? { file: h.file, text: h.text } : null })
}

/** The continuation prompt (ST-4.3, D-23): generated from the validated handover, plus the prompts held during rotation. */
function continuationFor(s: State, h: Latest, held: readonly string[], context?: string, gap?: boolean): string {
  const parsed = h.text ? parseHandover(h.text) : null
  return continuationPrompt({
    taskId: s.taskId, session: s.sessionSequence + 1, handoverFile: h.file, narrative: parsed?.ok ? parsed.value : null,
    changedFiles: h.text ? changedFiles(h.text) : null, heldPrompts: held, ...(context ? { context } : {}), ...(gap ? { gap } : {}),
  })
}

/**
 * A main-loop turn ended (ST-4.1). A user interrupt during a handover pauses (USER_INTERRUPT). In ROTATING with the
 * handover persisted, `/clear` runs once the hook has returned; the reducer's step (persisted) makes it once per rotation.
 * A request still waiting for a Stop after a normal turn end gets the nudge (D-23).
 */
export async function onTurnComplete(rt: Runtime, reason: 'answer' | 'aborted' | 'refusal' | 'error'): Promise<void> {
  const own = ownTask((await projectTasks(rt)).tasks, await rt.port.sessionId())
  if (!own) return
  const handoverVerified = own.state.status === 'ROTATING' ? (await readVerified(rt, own.dir, own.state.lastValidatedHandover)) !== null : undefined
  const r = await applyOwn(rt, { type: 'TURN_COMPLETE', reason, ...(handoverVerified !== undefined ? { handoverVerified } : {}) })
  if (r?.forHook.some(f => f.type === 'RUN_CLEAR')) rt.port.after(0, () => void runClear(rt, own.dir).catch(err => rt.port.log(`jeeves: rotation after /clear failed: ${why(err)}`)))
  else if (reason !== 'aborted') await nudgeIfWaiting(rt)
}

/** classic.StopFailure on the main loop (ST-6.2): pause with the error's own code and what to do; never resubmit. */
export async function stopFailure(rt: Runtime, error: string): Promise<void> {
  const resetsAt = error === 'rate_limit' ? await rt.port.rateLimitReset() : null
  await applyOwn(rt, { type: 'STOP_FAILURE', error, ...(resetsAt ? { resetsAt } : {}) })
}

/** ADR-006: whether this session owns an active task, so compaction ahead of time (`precompute`) is skipped. */
export async function managedNow(rt: Runtime): Promise<boolean> {
  const own = ownTask((await projectTasks(rt)).tasks, await rt.port.sessionId())
  return own !== null && !INERT.includes(own.state.status)
}

/** ADR-006: a compaction of the main conversation stood; compacted context is lossy, so hand over (MONITORING/CONTINUING only). */
export async function compacted(rt: Runtime, trigger: string): Promise<void> {
  await applyOwn(rt, { type: 'COMPACTED', trigger })
}

/** Claude is idle while a rotation waits for a Stop: submit the one nudge prompt for this rotation (D-23). */
export async function nudgeIfWaiting(rt: Runtime): Promise<void> {
  const r = await applyOwn(rt, { type: 'IDLE' })
  if (r?.forHook.some(f => f.type === 'SUBMIT_NUDGE')) rt.port.submitPromptSoon(NUDGE_PROMPT, err => rt.port.log(`jeeves: nudge not sent: ${why(err)}`))
}

/**
 * The scheduled `/clear` (ST-4.1). A rejection means automatic rotation is unavailable here (ST-4.6). Live (2.1.319)
 * the promise resolves when the /clear is queued, before it runs (gate runs 5-6), or never (live run 5); the mod kit
 * resolves it after the fresh SessionStart. Whichever path finds RESTORING continues: here, or the fresh session's timer.
 */
async function runClear(rt: Runtime, dir: string): Promise<void> {
  try {
    await rt.port.runCommand('clear')
  } catch (err) {
    await apply(rt, dir, { type: 'CLEAR_FAILED' })
    rt.port.log(`jeeves: /clear rejected: ${why(err)}`)
    return
  }
  await continueFresh(rt, dir)
}

/** How long after the fresh SessionStart that session continues on its own; live this is the path that continues. */
export const FRESH_CONTINUE_MS = 1000

/**
 * RESTORING -> CONTINUING and the continuation, with no keystroke (ST-4.3). Called by the resolved /clear and by
 * the fresh session's timer; the serial queue and the reducer let only the first one submit.
 */
async function continueFresh(rt: Runtime, dir: string): Promise<void> {
  await crashPoint(rt, 'before-submit')
  const r = await apply(rt, dir, { type: 'CONTEXT_READY' })
  const submit = r?.forHook.find(f => f.type === 'SUBMIT_CONTINUATION')
  // Not RESTORING: the other path already continued, or (live) the /clear is only queued and the timer will.
  // shortcut: a /clear that never brings its SessionStart leaves the task ROTATING; recovery is ST-6.1.
  if (!r || submit?.type !== 'SUBMIT_CONTINUATION') return
  try {
    await rt.port.submitPrompt(continuationFor(r.state, await latestHandover(rt, dir, r.state), submit.heldPrompts))
  } catch (err) {
    await apply(rt, dir, { type: 'SUBMIT_FAILED', heldPrompts: submit.heldPrompts })
    rt.port.log(`jeeves: continuation rejected: ${why(err)}`)
  }
}

/**
 * Restore path (02 §5.3, ADR-003): this conversation is already fresh (the user's /clear), so `input` (RESUME after
 * USER_CLEAR, or CONTINUE_CMD in assisted mode) moves the task to RESTORING and the context goes into the continuation prompt itself. The lock must
 * already be this session's. 'unverified': the saved handover cannot be verified, so nothing changed.
 * `gap` (recovery): work after the handover may exist; `adopt`: the handover ref to use in place of the state's.
 */
export type Restored = 'restored' | 'unverified' | null | { mismatch: { expected: string; actual: string } }

export async function restoreHere(rt: Runtime, dir: string, input: Input, opts: { gap?: boolean; adopt?: string | null; relink?: boolean } = {}): Promise<Restored> {
  const before = await rt.storage.readState(dir)
  if (!before?.ok) return null
  const h = await latestHandover(rt, dir, opts.adopt ? { ...before.value, lastValidatedHandover: opts.adopt } : before.value)
  if (!h.ok) return 'unverified'
  // ST-6.5: never continue on another branch than the handover's, unless the user relinks (`/jeeves recover --relink`).
  const mismatch = opts.relink ? null : await branchMismatch(rt, h.text)
  if (mismatch) {
    await apply(rt, dir, { type: 'REPO_MISMATCH', sessionId: await rt.port.sessionId(), detail: `handover branch ${mismatch.expected}, repository on ${mismatch.actual}`, ...(opts.adopt ? { adopt: opts.adopt } : {}) })
    return { mismatch }
  }
  const r = await apply(rt, dir, input)
  if (!r?.forHook.some(f => f.type === 'INJECT_CONTEXT')) return null
  const ready = await apply(rt, dir, { type: 'CONTEXT_READY' })
  const submit = ready?.forHook.find(f => f.type === 'SUBMIT_CONTINUATION')
  if (!ready || submit?.type !== 'SUBMIT_CONTINUATION') return null
  const text = continuationFor(ready.state, h, submit.heldPrompts, await contextFor(rt, dir, ready.state, h), opts.gap)
  // A command.run hook may not submit (D-19): it goes out once the hook has returned.
  rt.port.submitPromptSoon(text, err => {
    rt.port.log(`jeeves: continuation rejected: ${why(err)}`)
    void apply(rt, dir, { type: 'SUBMIT_FAILED', heldPrompts: submit.heldPrompts })
  })
  return 'restored'
}
