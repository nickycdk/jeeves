// ST-13.3 (spec §5.1, D-42): whether this session may be auto-watched, decided once at session.start. No task file:
// the decision lives in the plugin store under the session id, so a reload (turns > 0 by then) keeps it.
import { autoReason, HINT_LIMIT, hintable, isNotWatched, ordered, startReasons, type AutoRow, type NotWatched } from '../core/autostart.ts'
import { simulateWindow, windowThreshold } from '../core/task.ts'
import { THRESHOLD_MIN } from '../core/machine.ts'
import { autoStartNow, sessionOffKey } from './auto.ts'
import { readDefaults } from './defaults.ts'
import type { Runtime } from './runtime.ts'
import { addRevision, applyOwn, ownTask, projectTasks, startTask } from './task.ts'
import { MSG } from './ui.ts'

/** Keyed by session id: the plugin store is shared by every session on the machine, so two at once keep their own. */
const keyOf = (sessionId: string) => `eligibility:${sessionId}`
/** ST-14.1: the hint was shown in this session (carried over a /clear like the decision). */
const hintedKey = (sessionId: string) => `hinted:${sessionId}`
/** ST-14.1: hints shown in a row with no `/jeeves on` or `/jeeves auto on` after them; machine-wide. */
const HINT_COUNT = 'hintsUnanswered'

/** The reasons decided at this session's start; null when none was kept (no session.start, or its write failed). */
const kept = async (rt: Runtime, sessionId: string): Promise<NotWatched[] | null> => {
  const v = (await rt.port.storeGet(keyOf(sessionId))) as { reasons?: unknown } | null | undefined
  return v && Array.isArray(v.reasons) ? v.reasons.filter(isNotWatched) : null
}
const keep = (rt: Runtime, sessionId: string, reasons: NotWatched[]) => rt.port.storeSet(keyOf(sessionId), { reasons })

/** What session.start reads now. A usage reading that fails counts as no large window (the safe direction). */
async function readNow(rt: Runtime, interactive: boolean): Promise<NotWatched[]> {
  const window = (await rt.port.usage().catch(() => null))?.window ?? 0
  return startReasons({ interactive, mode: rt.probe.mode, git: rt.identity?.kind === 'git', window, turns: await rt.port.turns() })
}

/** session.start: decide once per session; a reload of the same session keeps what was decided. */
export async function decideAtStart(rt: Runtime, interactive: boolean): Promise<void> {
  const me = await rt.port.sessionId()
  if ((await kept(rt, me)) === null) await keep(rt, me, await readNow(rt, interactive))
}

/**
 * Jeeves's or the user's /clear: the fresh conversation is the same session for auto-start (spec §5.7), so it takes the
 * decision and a `/jeeves off` of the session it replaces (the one this process ended last).
 */
export async function carryOver(rt: Runtime, to: string, endedHere: ReadonlySet<string>): Promise<void> {
  const from = [...endedHere].at(-1)
  if (!from || from === to) return
  const reasons = await kept(rt, from)
  if (reasons !== null) await keep(rt, to, reasons)
  if ((await rt.port.storeGet(sessionOffKey(from))) === true) await rt.port.storeSet(sessionOffKey(to), true)
  if ((await rt.port.storeGet(hintedKey(from))) === true) await rt.port.storeSet(hintedKey(to), true)
  await forget(rt, from)
}

/**
 * Turn mode: no SessionStart follows a /clear (probe, ST-16.4), so a fresh conversation with no decision of its own takes
 * the carry-over when it is first used (a typed prompt, a /jeeves command). A no-op once a decision is kept.
 */
export async function carryUndecided(rt: Runtime, endedHere: ReadonlySet<string>): Promise<void> {
  const me = await rt.port.sessionId()
  if ((await kept(rt, me)) === null) await carryOver(rt, me, endedHere)
}

/**
 * Any session end but /clear: forget it, so `claude --resume` of this id in a new process decides again (and finds turns).
 * shortcut: a crashed process leaves its three small keys, and resuming that same id keeps its decision; upgrade if that matters.
 */
export async function forget(rt: Runtime, sessionId: string): Promise<void> {
  await rt.port.storeSet(keyOf(sessionId), null)
  await rt.port.storeSet(sessionOffKey(sessionId), null)
  await rt.port.storeSet(hintedKey(sessionId), null)
}

/**
 * Every reason this session is not auto-watched (§5.1 order; empty: eligible), with auto-start's own setting read live.
 * A task of this session that ended (near-threshold, model switch, done) also counts as off for this session: none
 * starts again here, and `/jeeves on` is the way back. A task paused by a user's /clear sets this session's off key
 * (onUserClear), so it holds for the session that cleared, not for later ones. `owns`: this session runs a task now.
 */
export async function eligibility(rt: Runtime, row: AutoRow) {
  const me = await rt.port.sessionId()
  const k = await kept(rt, me)
  // No decision kept for this session (its store write failed): read the facts now; turns > 0 then reads as resumed.
  const fixed = k ?? await readNow(rt, true)
  const tasks = (await projectTasks(rt)).tasks
  const owns = ownTask(tasks, me) !== null
  const ended = !owns && tasks.some(t => t.state.activeSessionId === me)
  const auto = await autoStartNow(rt, row)
  const off = autoReason(auto)
  return { reasons: ordered([...fixed, ...(off ? [off] : []), ...(ended ? ['this session' as const] : [])]), auto, decided: k !== null, owns }
}

const NOTICE_KEY = 'autoNoticeShown'

/**
 * ST-14.1 (spec §6.1): a reading in a session with no task of its own, at the point a watched one would be warned
 * (threshold - 5), gets one hint: once per session, only for reasons 3b and 4-6, silent after HINT_LIMIT unanswered.
 * Plugin store only, no task file. The counter is set before the toast, so a failed write never repeats it.
 */
export async function hint(rt: Runtime, row: AutoRow, raw: { percent?: number; tokens?: number; window: number }): Promise<void> {
  const c = rt.windowOverride ? simulateWindow(raw, rt.windowOverride) : raw // as measure() reads it
  // No threshold is below THRESHOLD_MIN: below that minus 5, nothing more needs reading (the usual reading).
  if (c.percent === undefined || c.percent < THRESHOLD_MIN - 5) return
  const me = await rt.port.sessionId()
  if ((await rt.port.storeGet(hintedKey(me))) === true) return
  const n = await rt.port.storeGet(HINT_COUNT)
  const shown = typeof n === 'number' ? n : 0
  if (shown >= HINT_LIMIT) return
  const threshold = (await readDefaults(rt)).value?.thresholdPercent ?? windowThreshold(c.window)
  if (c.percent < threshold - 5) return
  const e = await eligibility(rt, row)
  if (e.owns || !hintable(e.reasons)) return
  await rt.port.storeSet(hintedKey(me), true)
  await rt.port.storeSet(HINT_COUNT, shown + 1)
  rt.port.toast(MSG.hint(Math.round(c.percent)))
}

/** The user acted on the hint, or on auto-start: `/jeeves on` or `/jeeves auto on`, typed. */
export const hintAnswered = (rt: Runtime) => rt.port.storeSet(HINT_COUNT, 0)

/**
 * ST-13.4 (spec §5.4): the first eligible session hears, at session.start, that it is watched and at which threshold.
 * The key is set first, so a failed write never repeats the notice in every session.
 */
export async function autoNotice(rt: Runtime, row: AutoRow): Promise<void> {
  if ((await rt.port.storeGet(NOTICE_KEY)) === true) return
  const e = await eligibility(rt, row)
  if (!e.decided || e.reasons.length) return
  const window = (await rt.port.usage().catch(() => null))?.window
  const threshold = (await readDefaults(rt)).value?.thresholdPercent ?? windowThreshold(window)
  await rt.port.storeSet(NOTICE_KEY, true)
  rt.port.toast(MSG.autoNotice(threshold, window))
}

// One start at a time: two prompts submitted at once must not make two tasks.
let starting: Promise<boolean> | null = null

/**
 * ST-13.4 (spec §5.2): the first typed prompt of an eligible session becomes an auto task, saved word for word as rev 1.
 * None when this session had a task already (ended ones too: a near-threshold or model-switch end is for the session);
 * a /clear brings a new session id, so its next prompt may start one (§5.7). Project defaults apply as for /jeeves on.
 */
export function startAuto(rt: Runtime, text: string, row: AutoRow): Promise<boolean> {
  if (starting) return starting.then(() => false)
  starting = (async () => {
    // The decision kept at session.start first: one store read, so a session that can never auto-start reads no task.
    if (!rt.projectDir || (await kept(rt, await rt.port.sessionId()))?.length !== 0) return false
    const e = await eligibility(rt, row)
    if (!e.decided || e.owns || e.reasons.length) return false
    const me = await rt.port.sessionId()
    const defaults = await readDefaults(rt)
    const r = await startTask(rt, me, text, defaults.value?.thresholdPercent, 'auto')
    if (r.state.status !== 'MONITORING') return false
    for (const cmd of defaults.value?.verificationCommands ?? []) await addRevision(rt, r.dir, 'check', cmd)
    return true
  })().finally(() => { starting = null })
  return starting
}
