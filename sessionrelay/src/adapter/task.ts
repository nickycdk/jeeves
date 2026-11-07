// Managed-task wiring (02 §3): find the task, then read state -> reduce -> write state -> run effects.
// Task state lives only in files; every cycle re-reads state.json inside the runtime's serial queue.
import { reduce, type Input } from '../core/machine.ts'
import { newRotationId, newTaskId } from '../core/ids.ts'
import { join } from '../core/paths.ts'
import { foldTask, newTaskState, parseRevision, renderChange, revFile, type ChangeKind, type TaskView } from '../core/task.ts'
import { DEFAULT_CONFIG, type State } from '../core/types.ts'
import { runEffects, type EffectResult } from './effects.ts'
import { gitFacts } from './git.ts'
import type { Runtime } from './runtime.ts'

export type Task = { state: State; dir: string }

/** Statuses after which a task no longer claims the project. */
const ENDED = new Set<State['status']>(['DISABLED', 'COMPLETED', 'FAILED'])
const random6 = () => crypto.getRandomValues(new Uint8Array(6))
const recentFirst = (a: Task, b: Task) => b.state.updatedAt.localeCompare(a.state.updatedAt)

/** Every readable task of this project, most recently updated first; unreadable ones as errors. */
export async function projectTasks(rt: Runtime): Promise<{ tasks: Task[]; errors: string[] }> {
  if (!rt.projectDir) return { tasks: [], errors: [] }
  // shortcut: reads every task's state.json per call; cache the owned task's folder if task counts grow large.
  const tasksDir = join(rt.projectDir, 'tasks')
  const tasks: Task[] = [], errors: string[] = []
  for (const name of await rt.port.listDirs(tasksDir)) {
    const dir = join(tasksDir, name)
    const r = await rt.storage.readState(dir).catch(err => ({ ok: false as const, errors: [String(err)] }))
    if (r === null) continue
    if (r.ok) tasks.push({ state: r.value, dir })
    else errors.push(`${name}: ${r.errors[0] ?? 'invalid'}`)
  }
  return { tasks: tasks.sort(recentFirst), errors }
}

/** The task this session owns (not DISABLED), if any. */
export const ownTask = (tasks: Task[], sessionId: string) => tasks.find(t => t.state.activeSessionId === sessionId && t.state.status !== 'DISABLED') ?? null
/** The most recent task that still claims the project (not off, completed or failed). */
export const liveTask = (tasks: Task[]) => tasks.find(t => !ENDED.has(t.state.status)) ?? null

export type Applied = { state: State; ignored?: string; forHook: EffectResult['forHook'] }

/** One transition from `prev`, inside the serial queue: write state, then run effects; feeds back follow-up inputs. */
async function transition(rt: Runtime, dir: string, prev: State, input: Input): Promise<Applied> {
  let state = prev, ignored: string | undefined
  const forHook: Applied['forHook'] = []
  for (const queue = [input]; queue.length;) {
    const now = await rt.port.now()
    const out = reduce(state, queue.shift()!, { now, config: DEFAULT_CONFIG, newRotationId: newRotationId(now, random6()), ...(rt.thresholdOverride ? { thresholdOverride: rt.thresholdOverride } : {}) })
    if (out.ignored) { ignored = out.ignored; rt.port.log(`sessionrelay: ${out.ignored}`) }
    if (out.state === state) continue
    state = out.state
    await rt.storage.writeState(dir, state)
    const r = await runEffects(out.effects, { port: rt.port, storage: rt.storage, taskDir: dir, state })
    for (const f of r.failed) rt.port.log(`sessionrelay: effect ${f.effect.type} failed: ${f.error}`)
    forHook.push(...r.forHook)
    queue.push(...r.followUps)
  }
  return { state, forHook, ...(ignored ? { ignored } : {}) }
}

/** Apply an input to the task in `dir`; null when its state cannot be read. */
export function apply(rt: Runtime, dir: string, input: Input): Promise<Applied | null> {
  return rt.serial(async () => {
    const r = await rt.storage.readState(dir)
    return r?.ok ? transition(rt, dir, r.value, input) : null
  })
}

/** Apply an input to this session's own task; null when it has none. */
export async function applyOwn(rt: Runtime, input: Input): Promise<Applied | null> {
  const own = ownTask((await projectTasks(rt)).tasks, await rt.port.sessionId())
  return own ? apply(rt, own.dir, input) : null
}

/** Own the task's lock: take it when free or stale (owner silent past STALE_MS). False when another live session holds it. */
export async function claim(rt: Runtime, dir: string, sessionId: string): Promise<boolean> {
  const now = await rt.port.now(), at = new Date(now).toISOString()
  const r = await rt.storage.acquireLock(dir, sessionId, at, now)
  if (r.ok) return true
  return r.stale && (await rt.storage.takeoverLock(dir, sessionId, at, now)).ok
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
  let state = newTaskState({ taskId, projectId: rt.projectId!, thresholdPercent: DEFAULT_CONFIG.thresholdPercent, taskStartHead: facts.kind === 'git' ? facts.head : null, at })
  if (goal !== null && lock.ok) {
    await rt.storage.writeImmutable(join(dir, revFile(1)), goal)
    state = { ...state, taskRevision: 1 }
  }
  const applied = await rt.serial(() => transition(rt, dir, state, { type: 'ON', mode: rt.probe.mode, lockAcquired: lock.ok, sessionId }))
  return { ...applied, dir }
}

/** `prompt.submit` (composer): while this session's task waits for its first prompt, store it as rev 1, byte for byte. */
export async function captureFirstPrompt(rt: Runtime, text: string): Promise<boolean> {
  const own = ownTask((await projectTasks(rt)).tasks, await rt.port.sessionId())
  if (!own || own.state.taskRevision !== 0) return false
  return rt.serial(async () => {
    const r = await rt.storage.readState(own.dir)
    if (!r?.ok || r.value.taskRevision !== 0) return false
    await rt.storage.writeImmutable(join(own.dir, revFile(1)), text)
    await transition(rt, own.dir, r.value, { type: 'REVISED', revision: 1 })
    return true
  })
}

/** Heartbeat for the lock of the task this session owns (ADR-005). */
export async function heartbeat(rt: Runtime): Promise<void> {
  const me = await rt.port.sessionId()
  const own = ownTask((await projectTasks(rt)).tasks, me)
  if (own && !(await rt.storage.heartbeat(own.dir, me, new Date(await rt.port.now()).toISOString()))) rt.port.log(`sessionrelay: lost the lock of ${own.state.taskId}`)
}

/** A user command's change as the next write-once revision (FR-05). Null while rev 1 (the original prompt) is not captured yet. */
export function addRevision(rt: Runtime, dir: string, kind: ChangeKind, text: string): Promise<number | null> {
  return rt.serial(async () => {
    const r = await rt.storage.readState(dir)
    if (!r?.ok || r.value.taskRevision < 1) return null
    const n = r.value.taskRevision + 1
    await rt.storage.writeImmutable(join(dir, revFile(n)), renderChange(n, kind, text, new Date(await rt.port.now()).toISOString()))
    await transition(rt, dir, r.value, { type: 'REVISED', revision: n })
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
    else errors.push(`${revFile(n)} is ${text === null ? 'missing' : 'not a SessionRelay revision'}`)
  }
  return { view: foldTask(revs), errors }
}

/** `session.measure` with a context change: the main conversation's `usage().context` (FR-02). Missing percent stays unknown. */
export async function measure(rt: Runtime, c: { percent?: number; tokens?: number; window: number }): Promise<Applied | null> {
  const sessionId = await rt.port.sessionId()
  return applyOwn(rt, { type: 'MEASURE', window: c.window, sessionId, ...(c.percent !== undefined ? { percent: c.percent } : {}), ...(c.tokens !== undefined ? { tokens: c.tokens } : {}) })
}
