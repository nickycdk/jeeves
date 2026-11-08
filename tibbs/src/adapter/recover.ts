// `/tibbs recover` and the startup notice (ST-6.1, 02 §5.3, §8): continue a task that no live session runs.
import { parseHandover } from '../core/handover/parse.ts'
import { handoverFile } from '../core/handover/render.ts'
import { STALE_MS } from '../core/lock.ts'
import { join } from '../core/paths.ts'
import { classify, rebuildState, type Action, type Found, type LockView } from '../core/recovery.ts'
import { revFile } from '../core/task.ts'
import { recoverable } from '../core/machine.ts'
import { parseJson } from '../core/schema.ts'
import type { State } from '../core/types.ts'
import { hasCommit } from './git.ts'
import type { Runtime } from './runtime.ts'
import { sha256Hex } from './storage.ts'
import { apply, claim, count, nextHandoverNumber, projectTasks, restoreHere, takeLock, writeProjectRecord, type Restored } from './task.ts'
import { MSG } from './ui.ts'

/** Tibbs's own temporary files (the atomic swap's); others in the folder are never touched (02 §8). */
const OWN_TMP = /^(state\.json|handover\.md)\.tmp-[0-9a-f]{12}$/
const TMP_MAX_AGE_MS = 60 * 60_000

type Candidate = { dir: string; taskId: string; state: State | null; found: Found }

async function lockView(rt: Runtime, dir: string): Promise<LockView> {
  const l = await rt.storage.readLock(dir, await rt.port.now())
  return l.kind === 'free' ? l : { kind: 'held', owner: l.owner?.ownerSessionId ?? null, stale: l.stale }
}

/** The newest handover file as a ref with its SHA-256, and its number; null when there is none or it cannot be read. */
async function newestHandover(rt: Runtime, dir: string): Promise<{ ref: string; n: number; text: string } | null> {
  const n = (await nextHandoverNumber(rt, dir)) - 1
  if (n < 1) return null
  const text = await rt.port.read(join(dir, handoverFile(n))).catch(() => null)
  return text === null ? null : { ref: `${handoverFile(n)}#sha256:${await sha256Hex(text)}`, n, text }
}

/** VALIDATING: the handover saved for this rotation before the state swap that never happened (write-once, verified at write). */
async function leftover(rt: Runtime, dir: string, s: State): Promise<string | null> {
  if (s.status !== 'VALIDATING' || !s.rotation) return null
  const h = await newestHandover(rt, dir)
  if (!h || h.ref === s.lastValidatedHandover) return null
  const p = parseHandover(h.text)
  return p.ok && p.value.rotationId === s.rotation.rotationId && p.value.taskId === s.taskId ? h.ref : null
}

async function candidates(rt: Runtime): Promise<Candidate[]> {
  const { tasks, broken } = await projectTasks(rt)
  const out: Candidate[] = []
  for (const t of tasks) out.push({ dir: t.dir, taskId: t.state.taskId, state: t.state, found: { kind: 'state', state: t.state, lock: await lockView(rt, t.dir), leftover: await leftover(rt, t.dir, t.state) } })
  for (const b of broken) out.push({ dir: b.dir, taskId: b.name, state: null, found: { kind: 'corrupt', tooNew: b.tooNew } })
  return out
}

/** At session start: one line about a task that waits for /tibbs recover, or null. Never changes anything. */
export async function recoveryNotice(rt: Runtime): Promise<{ text: string; recover: boolean } | null> {
  const me = await rt.port.sessionId()
  for (const c of await candidates(rt)) {
    const a = classify(c.found, me, () => false)
    if (a.kind === 'recover') return { text: MSG.interrupted(c.taskId, c.state!.status), recover: true }
    if (a.kind === 'rebuild') return { text: MSG.corrupt(c.taskId), recover: false }
    // A crash leaves a live-looking lock for up to STALE_MS; another running session looks the same.
    if (a.kind === 'lock-held') return { text: MSG.heldElsewhere(c.taskId, c.state!.status), recover: false }
  }
  return null
}

/** Remove Tibbs's own temporary files older than an hour (left by a crash mid-swap). */
async function removeOldTmp(rt: Runtime, dir: string): Promise<void> {
  const now = await rt.port.now()
  for (const name of await rt.port.listFiles(dir)) {
    if (!OWN_TMP.test(name)) continue
    const m = await rt.port.mtimeMs(join(dir, name))
    if (m !== null && now - m > TMP_MAX_AGE_MS) await rt.port.run(['rm', '-f', join(dir, name)])
  }
}

/**
 * state.json cannot be read: rebuild one from the event log and the write-once files into NEEDS_REVIEW(STATE_CORRUPT).
 * The unreadable file is kept beside it (`state.json.corrupt-<time>`), never deleted (ST-6.1 AC 4).
 */
async function rebuild(rt: Runtime, dir: string, taskId: string): Promise<State> {
  const at = new Date(await rt.port.now()).toISOString()
  const h = await newestHandover(rt, dir)
  const state = rebuildState({
    taskId, projectId: rt.projectId!, at, events: await rt.storage.readEvents(dir).catch(() => []),
    revisions: await count(rt, n => join(dir, revFile(n))), handover: h ? { ref: h.ref, count: h.n } : null,
    sessions: await count(rt, n => join(dir, `sessions/${String(n).padStart(3, '0')}.json`)),
    startHead: h ? /Files changed since the task started \(([0-9a-f]{7,40})\)/.exec(h.text)?.[1] ?? null : null,
  })
  const kept = `state.json.corrupt-${at.replace(/[-:.]/g, '')}`
  // Copied, not moved: if the rebuilt state cannot be written, the original stays in place and the task stays visible.
  if (await rt.port.exists(join(dir, 'state.json'))) {
    const cp = await rt.port.run(['cp', join(dir, 'state.json'), join(dir, kept)])
    if (cp.exitCode !== 0) throw new Error(`could not keep a copy of the unreadable state.json: ${cp.stderr.trim().slice(0, 120)}`)
  }
  await rt.storage.writeState(dir, state)
  await rt.storage.appendEvent(dir, {
    v: 1, at, taskId, rotationId: null, from: null, to: 'NEEDS_REVIEW', code: 'STATE_CORRUPT', pct: null, sessionId: state.activeSessionId,
    detail: `state.json was unreadable; rebuilt from events and files, the old file kept as ${kept}`,
  })
  return state
}

/** Why nothing was recovered, in the user's words. */
async function nothing(rt: Runtime, acts: { c: Candidate; a: Action }[]): Promise<string> {
  const held = acts.find(x => x.a.kind === 'lock-held')
  if (held) {
    const l = await rt.storage.readLock(held.c.dir, await rt.port.now())
    const beat = l.kind === 'held' && l.owner ? Date.parse(l.owner.heartbeatAt) : NaN
    const wait = Number.isNaN(beat) ? null : Math.max(1, Math.ceil((beat + STALE_MS - (await rt.port.now())) / 1000))
    return MSG.recoverHeld(held.c.taskId, wait)
  }
  if (acts.some(x => x.a.kind === 'mine')) return MSG.recoverMine
  const tooNew = acts.find(x => x.a.kind === 'too-new')
  if (tooNew) return MSG.recoverTooNew(tooNew.c.taskId)
  if (acts.some(x => x.a.kind === 'none' && x.a.why === 'paused')) return MSG.recoverPaused
  return MSG.nothingToRecover
}

/**
 * `/tibbs recover`: the most recent task no live session runs is continued here, once. Takes the lock (refused while
 * another session holds a live one), rebuilds an unreadable state.json first, then the restore path: task and last
 * validated handover in the continuation prompt, with a note when work after that handover may exist. Idempotent:
 * afterwards the task is this session's (RESTORING/CONTINUING), so a second recover finds nothing to do.
 */
export async function recover(rt: Runtime, me: string, endedHere: ReadonlySet<string>, relink = false): Promise<string> {
  const acts = (await candidates(rt)).map(c => ({ c, a: classify(c.found, me, s => endedHere.has(s)) }))
  // One task per session: a second one's lock would go without heartbeats and look stale to everyone else.
  if (acts.some(x => x.a.kind === 'mine')) return MSG.recoverMine
  const pick = acts.find(x => x.a.kind === 'recover' || x.a.kind === 'rebuild')
  if (!pick) {
    // ST-6.5: nothing here, but a task whose repository folder is gone may be this one, moved.
    const moved = acts.some(x => x.a.kind !== 'none' || x.a.why !== 'ended') ? [] : await movedTasks(rt)
    if (moved.length === 0) return nothing(rt, acts)
    return relink ? relinkHere(rt, moved[0]!, me) : MSG.moved(moved[0]!.state.taskId, moved[0]!.oldPath)
  }
  const { c } = pick
  if (!(await takeLock(rt, c.dir, c.state?.activeSessionId ?? null, me, endedHere))) return MSG.lockHeld(c.taskId)
  await removeOldTmp(rt, c.dir)
  if (pick.a.kind === 'rebuild' && (await rt.storage.readState(c.dir).catch(() => null))?.ok !== false) {
    // Readable again (or unreadable for another reason than its content): never overwrite a state that may be fine.
    await rt.storage.releaseLock(c.dir, me)
    return MSG.notRebuilt(c.taskId)
  }
  const a = pick.a.kind === 'rebuild' ? (await rebuild(rt, c.dir, c.taskId), { gap: true, adopt: null }) : pick.a as Extract<Action, { kind: 'recover' }>
  const r = await restoreHere(rt, c.dir, { type: 'RECOVER', sessionId: me, ...(a.adopt ? { adopt: a.adopt } : {}) }, { gap: a.gap, adopt: a.adopt, relink })
  // Refused with nothing changed: give the lock back, or every other session waits for it to go stale.
  if (r === 'unverified' || r === null) await rt.storage.releaseLock(c.dir, me)
  return restoredText(r, MSG.recovered(c.taskId, pick.a.kind === 'rebuild'), MSG.nothingToRecover)
}

/** The answer to a restore-path command (recover, resume after /clear, continue): `ok` when it continued. */
export function restoredText(r: Restored, ok: string, none: string): string {
  if (r === 'unverified') return MSG.handoverUnverified
  if (r !== null && typeof r === 'object') return MSG.repoMismatch(r.mismatch.expected, r.mismatch.actual)
  return r === 'restored' ? ok : none
}

type Moved = { dir: string; state: State; oldPath: string }

/**
 * Tasks of other projects whose recorded worktree no longer exists and that no live session runs: candidates for a
 * repository that was moved here. With git, the task's start commit must exist in this repository.
 */
async function movedTasks(rt: Runtime): Promise<Moved[]> {
  if (!rt.projectDir || !rt.identity) return []
  const projects = rt.projectDir.replace(/\/[^/]+$/, '')
  const out: Moved[] = []
  for (const name of await rt.port.listDirs(projects)) {
    if (name === rt.projectId) continue
    const rec = parseJson('project', await rt.port.read(join(projects, name, 'project.json')).catch(() => ''))
    if (!rec.ok || (await rt.port.exists(rec.value.worktree))) continue
    for (const t of await rt.port.listDirs(join(projects, name, 'tasks'))) {
      const dir = join(projects, name, 'tasks', t)
      const r = await rt.storage.readState(dir).catch(() => null)
      if (!r?.ok || !recoverable(r.value)) continue
      const l = await rt.storage.readLock(dir, await rt.port.now())
      if (l.kind === 'held' && !l.stale) continue
      const head = r.value.taskStartHead
      if (rt.identity.kind === 'git' && head && !(await hasCommit(rt.port, rt.identity.worktree, head))) continue
      out.push({ dir, state: r.value, oldPath: rec.value.worktree })
    }
  }
  return out.sort((a, b) => b.state.updatedAt.localeCompare(a.state.updatedAt))
}

/** `/tibbs recover --relink` (the user confirmed): move the task folder into this project, then recover it here. */
async function relinkHere(rt: Runtime, m: Moved, me: string): Promise<string> {
  if (!(await claim(rt, m.dir, me))) return MSG.lockHeld(m.state.taskId)
  const target = join(rt.projectDir!, 'tasks', m.state.taskId)
  const refuse = async (text: string) => { await rt.storage.releaseLock(m.dir, me); return text }
  if (await rt.port.exists(target)) return refuse(MSG.relinkExists(target))
  for (const argv of [['mkdir', '-p', join(rt.projectDir!, 'tasks')], ['mv', m.dir, target]]) {
    const r = await rt.port.run(argv)
    if (r.exitCode !== 0) return refuse(MSG.relinkFailed(m.dir, r.stderr.trim().slice(0, 120)))
  }
  await writeProjectRecord(rt, new Date(await rt.port.now()).toISOString())
  await apply(rt, target, { type: 'RELINKED', projectId: rt.projectId! })
  const r = await rt.storage.readState(target)
  if (!r?.ok) return MSG.nothingToRecover
  const a = classify({ kind: 'state', state: r.value, lock: { kind: 'held', owner: me, stale: false }, leftover: await leftover(rt, target, r.value) }, me, () => false)
  if (a.kind !== 'recover') return MSG.nothingToRecover
  const done = await restoreHere(rt, target, { type: 'RECOVER', sessionId: me, ...(a.adopt ? { adopt: a.adopt } : {}) }, { gap: a.gap, adopt: a.adopt, relink: true })
  if (done === 'unverified' || done === null) await rt.storage.releaseLock(target, me)
  return `${MSG.relinked(m.state.taskId, m.oldPath)} ${restoredText(done, MSG.recovered(m.state.taskId, false), MSG.nothingToRecover)}`
}
