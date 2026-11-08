// ST-13.3 (spec §5.1, D-42): whether this session may be auto-watched, decided once at session.start. No task file:
// the decision lives in the plugin store under the session id, so a reload (turns > 0 by then) keeps it.
import { autoReason, isNotWatched, ordered, startReasons, type AutoRow, type NotWatched } from '../core/autostart.ts'
import { autoStartNow } from './auto.ts'
import type { Runtime } from './runtime.ts'
import { applyOwn, ownTask, projectTasks } from './task.ts'

const KEY = 'eligibility'
type Kept = { sessionId: string; reasons: NotWatched[] }

const kept = async (rt: Runtime): Promise<Kept | null> => {
  const v = (await rt.port.storeGet(KEY)) as Partial<Kept> | null | undefined
  return v && typeof v.sessionId === 'string' && Array.isArray(v.reasons) ? { sessionId: v.sessionId, reasons: v.reasons.filter(isNotWatched) } : null
}

/** What session.start reads now. A usage reading that fails counts as no large window (the safe direction). */
async function readNow(rt: Runtime, interactive: boolean): Promise<NotWatched[]> {
  const window = (await rt.port.usage().catch(() => null))?.window ?? 0
  return startReasons({ interactive, mode: rt.probe.mode, git: rt.identity?.kind === 'git', window, turns: await rt.port.turns() })
}

/** session.start: decide once per session; a reload of the same session keeps what was decided. */
export async function decideAtStart(rt: Runtime, interactive: boolean): Promise<void> {
  const me = await rt.port.sessionId()
  if ((await kept(rt))?.sessionId === me) return
  await rt.port.storeSet(KEY, { sessionId: me, reasons: await readNow(rt, interactive) } satisfies Kept)
}

/** Jeeves's or the user's /clear: the fresh conversation is the same session for auto-start (spec §5.7), so it keeps the decision. */
export async function carryOver(rt: Runtime, to: string, endedHere: ReadonlySet<string>): Promise<void> {
  const k = await kept(rt)
  if (k && endedHere.has(k.sessionId)) await rt.port.storeSet(KEY, { ...k, sessionId: to })
}

/**
 * Any other session end: forget it, so `claude --resume` of this id in a new process decides again (and finds turns).
 * shortcut: a crashed process leaves its decision, so resuming that same id keeps it; upgrade if resumed sessions matter more.
 */
export async function forget(rt: Runtime, sessionId: string): Promise<void> {
  if ((await kept(rt))?.sessionId === sessionId) await rt.port.storeSet(KEY, null)
}

/** Every reason this session is not auto-watched (§5.1 order; empty: eligible), with auto-start's own setting read live. */
export async function eligibility(rt: Runtime, row: AutoRow) {
  const k = await kept(rt)
  // No decision kept for this session (its store write failed): read the facts now; turns > 0 then reads as resumed.
  const fixed = k?.sessionId === (await rt.port.sessionId()) ? k.reasons : await readNow(rt, true)
  const auto = await autoStartNow(rt, row)
  const off = autoReason(auto)
  return { reasons: ordered([...fixed, ...(off ? [off] : [])]), auto }
}

/** The R-25 re-check found the Stop hook skipped: the session is unsupported now, and an auto task ends (files kept). */
export async function stopSkipped(rt: Runtime): Promise<boolean> {
  const k = await kept(rt)
  const me = await rt.port.sessionId()
  if (k?.sessionId === me) await rt.port.storeSet(KEY, { sessionId: me, reasons: ordered([...k.reasons.filter(r => r !== 'assisted mode'), 'unsupported']) } satisfies Kept)
  const own = ownTask((await projectTasks(rt)).tasks, me)
  if (own?.state.origin !== 'auto') return false
  await applyOwn(rt, { type: 'OFF', sessionId: me })
  return true
}
