// User-facing strings (FR-14, NFR-08): plain ASCII, text labels, <= 40 columns, <= 8 lines for status.
import type { Probe } from '../core/probe.ts'
import { recoverable } from '../core/machine.ts'
import { DEFAULT_CONFIG, INERT, type EventLine, type ReasonCode, type State, type Status } from '../core/types.ts'

export const WIDTH = 40

/** Shorten from the left so the end of a path stays visible. */
export const fitLeft = (s: string, width: number) => (s.length <= width ? s : `...${s.slice(s.length - width + 3)}`)
export const fit = (s: string) => (s.length <= WIDTH ? s : `${s.slice(0, WIDTH - 3)}...`)

export type StatusView = {
  probe: Probe
  stateRoot: string | null
  stateRootError: string | null
  task: { state: State; dir: string } | null
  /** A state.json that could not be read (corrupt or too new). */
  taskError: string | null
  /** The test-only threshold when active (06 §1). */
  thresholdOverride?: number | null
  /** The test-only relative threshold when active (D-25). */
  thresholdRelative?: number | null
  /** The test-only window when active (ST-15.1). */
  windowOverride?: number | null
  /** This project's config.json exists but is invalid (ST-11.1). */
  defaultsError?: string | null
  /** ST-13.3: whether this session is auto-watched, and if not the first reason; set when it has no task of its own. */
  auto?: string | null
}

/** D-25: this session's first reading + d, '?' until that reading; null when the relative override is off. */
const relThreshold = (d: number | null | undefined, s: State) =>
  !d ? null : s.sessionStart?.pct == null ? '?' : `${Math.round((s.sessionStart.pct + d) * 100) / 100}`

/** The threshold this run acts on: a test override when one is active, else the task's. */
export const shownThreshold = (s: State, override?: number | null, relative?: number | null) => relThreshold(relative, s) ?? override ?? s.thresholdPercent

/** One word label per state (ST-7.1 AC 2), for the status entry. */
export const STATE_WORD: Record<Status, string> = {
  DISABLED: 'off', MONITORING: 'on', ROTATION_REQUESTED: 'handover requested', QUIESCING: 'finishing the turn',
  HANDOVER_GENERATING: 'writing handover', VALIDATING: 'checking handover', ROTATING: 'starting fresh',
  RESTORING: 'restoring task', CONTINUING: 'continuing', PAUSED: 'paused', BLOCKED: 'blocked',
  NEEDS_REVIEW: 'waiting for you', FAILED: 'failed', COMPLETED: 'done',
}

const pctText = (p: number | undefined) => (p === undefined ? '?' : `${Math.round(p)}%`)

const QUIET_POINTS = 15

/** This plugin's status entry (ST-7.1): context and threshold while watching; a stopped task's plain reason, else the state's word.
 *  The text after `Jeeves: ` fits 40 columns; Claude Code shows the plugin's name instead of ours (engine-mod.ts). */
export function statusLine(s: State, threshold: number | string): string | undefined {
  if (s.status === 'DISABLED') return undefined
  const mode = s.mode === 'assisted' ? ' assisted' : ''
  // ST-14.5 (spec §6.3): an auto task's entry stays empty until the context is within 15 points of the threshold.
  if (s.status === 'MONITORING' && s.origin === 'auto' && !((s.lastContext?.percent ?? -1) >= Number(threshold) - QUIET_POINTS)) return undefined
  if (s.status === 'MONITORING') return fit(`Jeeves ${pctText(s.lastContext?.percent)}/${threshold}%${mode}`)
  return `Jeeves: ${fit(s.reason && INERT.includes(s.status) ? reasonLine(s) : STATE_WORD[s.status])}`
}

/** One transcript line per state change (ST-7.1); null for a change not worth a line. Never per tool call. */
export function transitionLine(from: Status, to: Status, code: ReasonCode | null, s: State): string | null {
  if (from === to) return null
  switch (to) {
    case 'MONITORING': return from === 'DISABLED' ? 'Jeeves: on, watching context' : from === 'CONTINUING' ? `Jeeves: session ${s.sessionSequence} at ${pctText(s.lastContext?.percent)}, watching context` : 'Jeeves: watching context again'
    case 'ROTATION_REQUESTED': return `Jeeves: handover requested${code ? `. ${REASON_TEXT[code]}` : ''}`
    case 'QUIESCING': return 'Jeeves: letting the current turn finish'
    case 'HANDOVER_GENERATING': return 'Jeeves: asking Claude for the handover'
    case 'VALIDATING': return 'Jeeves: checking the handover'
    // ST-14.3 (spec §6.2): the full id, since `claude --resume` takes an id or a name, not a prefix.
    case 'ROTATING': return `Jeeves: handover validated${s.rotation?.goal ? ` (goal: ${s.rotation.goal})` : ''}, starting fresh${s.activeSessionId ? `. Previous conversation: claude --resume ${s.activeSessionId}` : ''}`
    case 'RESTORING': return 'Jeeves: restoring the task'
    case 'CONTINUING': return 'Jeeves: the fresh conversation continues the task'
    case 'DISABLED': return 'Jeeves: off (task files kept)'
    case 'COMPLETED': return 'Jeeves: task completed'
    default: return `Jeeves: ${!code ? STATE_WORD[to] : code === s.reason ? reasonLine(s) : REASON_TEXT[code]}`
  }
}

/** ` (~400K)`: the task threshold in tokens, when the window is known (ST-10.1). */
const tokensAt = (window: number | undefined, pct: number) => {
  const k = Math.round(((window ?? 0) * pct) / 100_000)
  return k >= 1 ? ` (~${k}K)` : ''
}

const USER_STOPS = new Set<ReasonCode>(['USER_PAUSE', 'USER_CLEAR', 'USER_INTERRUPT'])
/** The task just stopped by itself and waits for the user, or finished: worth a notification, since they may be away. */
export const needsYou = (prev: State, next: State) =>
  (next.status !== prev.status || next.reason !== prev.reason) &&
  (next.status === 'NEEDS_REVIEW' || next.status === 'FAILED' || next.status === 'BLOCKED' || next.status === 'COMPLETED' ||
    (next.status === 'PAUSED' && next.reason !== null && !USER_STOPS.has(next.reason)))

/** `/jeeves resume` applies (FR-11). */
export const resumable = (s: State) => s.status === 'PAUSED' || (s.status === 'BLOCKED' && s.reason === 'DISK')
/** `/jeeves retry` applies (ST-10.2, ST-10.3), until the failure limit is used up. */
export const retryable = (s: State) => s.status === 'NEEDS_REVIEW' && (s.reason === 'HANDOVER_INVALID' || s.reason === 'POSSIBLE_LOOP')

/** The reason's line; one that /jeeves retry applies to says so, or that the retries are used up (ST-10.2). */
const reasonLine = (s: State) => {
  if (!retryable(s)) return REASON_TEXT[s.reason!]
  if (s.consecutiveFailures >= DEFAULT_CONFIG.maxConsecutiveFailures) return 'Retries used up. /jeeves off ends it'
  return s.reason === 'HANDOVER_INVALID' ? 'Handover failed checks. /jeeves retry' : 'Fresh session too full. /jeeves retry'
}


/**
 * ST-14.2 (spec §6.5): the commands that fit now, at most three, `help` filling a short list. `v.auto` is set only when
 * this session has no task of its own, so a warning and `retry` (both need the owning session) are offered without it.
 */
function commandsLine(v: StatusView): string {
  const s = v.task?.state
  const own = s && !v.auto
  const t = s ? Number(shownThreshold(s, v.thresholdOverride, v.thresholdRelative)) : NaN
  const pct = s?.lastContext?.percent
  const cmds = own && s.status === 'MONITORING' && pct !== undefined && pct >= t - DEFAULT_CONFIG.warnBeforePercent && pct < t ? ['later', 'off']
    : s && resumable(s) ? ['resume', 'off']
    : own && retryable(s) && s.consecutiveFailures < DEFAULT_CONFIG.maxConsecutiveFailures ? ['retry', 'off']
    : own && s.rotationCount > 0 && s.lastValidatedHandover ? ['handover']
    : v.auto?.startsWith('Auto off') ? ['on'] : []
  return `Try: /jeeves ${[...cmds, 'help'].slice(0, 3).join(' | ')}`
}

export function statusText(v: StatusView): string {
  // AC-25: a task that fell back to assisted shows it, whatever the probe said.
  // ADR-002 A3: `(turn)` names the boundary, so a bug report says which path ran.
  const lines = [`Jeeves  mode: ${v.task?.state.mode === 'assisted' ? 'assisted' : v.probe.mode}${v.probe.boundary === 'turn' ? ' (turn)' : ''}`]
  if (v.probe.missing[0] === '$.prompt.submit') lines.push('Stop hook skipped and a prompt refused')
  else if (v.probe.mode === 'unsupported') lines.push(`Needs ${(v.probe.missing[0] ?? 'newer').replace('Claude Code ', '')}, this is ${v.probe.version ?? '?'}`)
  else if (v.probe.mode === 'assisted') lines.push(`Missing: ${v.probe.missing.join(', ')}`)
  if (v.auto) lines.push(v.auto)
  if (v.windowOverride) lines.push(`TEST OVERRIDE window ${Math.round(v.windowOverride / 1000)}K`)
  if (v.taskError) lines.push(`Task state unreadable:`, v.taskError)
  else if (!v.task) lines.push('No managed task. Start with /jeeves on')
  else {
    const s = v.task.state
    const pct = s.lastContext?.percent
    if (s.taskRevision === 0) lines.push('Waiting for your first prompt')
    lines.push(
      `Task: ${s.taskId} (${s.origin})`,
      // ST-14.3: `auto` is set only when this session has no task of its own, so this task runs elsewhere.
      ...(v.auto && s.activeSessionId ? ['Owned by another session'] : []),
      `State: ${STATE_WORD[s.status]}`,
      `Context: ${pct === undefined ? 'unknown' : `${Math.round(pct * 10) / 10}%`}  Threshold: ${shownThreshold(s, v.thresholdOverride, v.thresholdRelative)}%${tokensAt(s.lastContext?.window, s.thresholdPercent)}`,
      ...(v.thresholdRelative ? [`TEST OVERRIDE +${v.thresholdRelative} (task setting ${s.thresholdPercent}%)`]
        : v.thresholdOverride ? [`TEST OVERRIDE (task setting ${s.thresholdPercent}%)`] : []),
      `Rotations: ${s.rotationCount}/${s.maxRotations ?? DEFAULT_CONFIG.maxRotationsPerTask}  Session: ${s.sessionSequence}`,
      ...(s.reason && INERT.includes(s.status) ? [reasonLine(s)] : []),
      `Last: ${s.lastValidatedHandover ? s.lastValidatedHandover.split('#')[0]!.replace(/^history\//, '') : 'no handover yet'}`,
    )
  }
  if (v.defaultsError) lines.push('Warning: defaults unreadable')
  if (v.stateRoot) lines.push(`Path: ${fitLeft(v.task?.dir ?? v.stateRoot, WIDTH - 6)}`)
  else lines.push(`State folder: ${v.stateRootError ? 'error' : 'unset'}`, ...(v.stateRootError ? [v.stateRootError] : []))
  lines.push(commandsLine(v))
  // At most 8 lines: the least useful give way first, so the reason, the commands and any warning always show.
  for (const prefix of ['Path: ', 'Last: ', 'Rotations: ', 'Waiting for', 'TEST OVERRIDE']) {
    for (let i; lines.length > 8 && (i = lines.findIndex(l => l.startsWith(prefix))) >= 0;) lines.splice(i, 1)
  }
  // Still too long (test settings stacked on warnings): keep the commands line, the last.
  if (lines.length > 8) lines.splice(7, lines.length - 8)
  return lines.map(fit).join('\n')
}

/** The status line when Jeeves is not in full mode. */
export const offStatus = (p: Probe) =>
  p.missing[0] === '$.prompt.submit' ? 'off: prompt refused' : p.mode === 'unsupported' ? `off: needs ${p.missing[0]}` : 'assisted mode'

/** The `/jeeves` command menu's argument hint; a unit test keeps it in step with HELP. */
export const ARGUMENT_HINT = 'on [goal] | off | pause | resume | rotate | later | continue | recover | done | retry | threshold <n> | limit <n> | defaults ... | auto [on|off] | task | dod <text> | check <cmd> | status [--diagnose] | history [--full] | handover | stats | purge | help'

export const HELP = [
  'Jeeves commands (/jeeves ...):',
  'on [goal]     start a managed task',
  'off           stop it (files kept)',
  'pause         no handover until resume',
  'resume        allow the handover again',
  'rotate        hand over now',
  'later         postpone the next handover',
  'continue      after /clear (assisted)',
  'recover       continue a stopped task',
  'done          confirm the task is done',
  'retry         after a failed handover',
  'threshold <n> hand over at n% (20-90)',
  'limit <n>     most handovers (1-100)',
  'defaults ...  this project\'s defaults',
  'auto [on|off] auto-start everywhere',
  'task          original task + changes',
  'dod <text>    add a done criterion',
  'check <cmd>   add a check (never run)',
  'status        mode, task, context',
  'status --diagnose  report for a bug',
  'history [--full]  state changes',
  'handover      the last handover',
  'stats         rotations, context, cost',
  'purge ...     delete task files',
  'help          this list',
].join('\n')

const short = (s: string) => s.replace(/\s+/g, ' ').slice(0, 120)

/** Shown when a prompt typed during a handover is held (ADR-010). */
export const HELD_TEXT = 'Held by Jeeves: your message will be delivered to the fresh conversation.'

/** Replies to /jeeves commands. Plain text, no colour or emoji meaning (FR-14). */
export const MSG = {
  userOnly: 'Only you can change a Jeeves task: type the /jeeves command yourself.',
  unsupported: 'This Claude Code version is not supported, so Jeeves stays off.',
  noTask: 'No managed task. Start with /jeeves on',
  waitingForPrompt: 'The task has no original prompt yet: type it as your next prompt first.',
  reviseUsage: (kind: 'dod' | 'check') => kind === 'dod' ? 'Usage: /jeeves dod <what must be true when the task is done>' : 'Usage: /jeeves check <command that verifies the task, e.g. npm test>',
  revisePending: (kind: 'dod' | 'check') => `Noted (${kind === 'dod' ? 'Definition of Done' : 'verification command, stored as text, never run by Jeeves'}). It is saved as a task revision right after your first prompt.`,
  revised: (n: number, kind: 'dod' | 'check') => `Saved as task revision ${n} (${kind === 'dod' ? 'Definition of Done' : 'verification command, stored as text, never run by Jeeves'}). /jeeves task shows all changes.`,
  noProject: (stateRootError: string | null) => stateRootError
    ? `Jeeves has no state folder (${stateRootError}). Set stateDir in /config.`
    : 'Jeeves could not tell which project this is (git did not answer). Try again.',
  madeExplicit: (taskId: string, n: number) => `Task ${taskId} is now explicit: your goal is task revision ${n}, and a /clear pauses it instead of ending it.`,
  alreadyOn: (s: State) => `Already on: task ${s.taskId} (${s.status}). /jeeves status shows it.`,
  lockHeld: (taskId: string) => `Another running session owns task ${taskId} here. /jeeves status shows it read-only.`,
  separateTask: (taskId: string) => `Another running session owns task ${taskId} here; it stays that session's. Starting a separate task for this session.`,
  leftBehind: (s: State) => `Task ${s.taskId} from an earlier session is ${s.status} here. ${s.status === 'PAUSED' ? '/jeeves resume continues it, or ' : recoverable(s) ? '/jeeves recover continues it here, or ' : ''}/jeeves off ends it.`,
  interrupted: (taskId: string, status: string) => `Task ${taskId} was left ${status} by an earlier session. /jeeves recover continues it here.`,
  corrupt: (taskId: string) => `Task ${taskId}: its state.json is unreadable. /jeeves recover rebuilds it from the task's files (nothing is deleted).`,
  recovered: (taskId: string, rebuilt: boolean) => `Recovering task ${taskId} here${rebuilt ? ' (state.json rebuilt; the old file is kept)' : ''}: Jeeves sends the task and its last validated handover as the next prompt.`,
  recoverHeld: (taskId: string, wait: number | null) => `Another session owns task ${taskId} and is still running, so nothing was changed.${wait !== null ? ` If that session is gone, try again in ${wait} s.` : ''}`,
  heldElsewhere: (taskId: string, status: string) => `Task ${taskId} is ${status} in another session. If that session stopped, /jeeves recover takes it over once it has been silent for 2 minutes.`,
  repoMismatch: (expected: string, actual: string) => `Blocked: the handover was written on branch ${expected}, but the repository is on ${actual}. Nothing was continued. Switch back to ${expected} and type /jeeves recover, or type /jeeves recover --relink to continue on ${actual}.`,
  moved: (taskId: string, oldPath: string) => `Task ${taskId} was started in ${oldPath}, which no longer exists. If you moved the repository here, type /jeeves recover --relink to continue it here.`,
  relinked: (taskId: string, oldPath: string) => `Task ${taskId} moved here from ${oldPath}.`,
  relinkExists: (target: string) => `Not relinked: ${target} already exists. Nothing was changed.`,
  relinkFailed: (dir: string, err: string) => `Not relinked: moving ${dir} failed (${err}). Nothing else was changed.`,
  recoverUsage: 'Usage: /jeeves recover, or /jeeves recover --relink to continue after a branch switch or a moved folder.',
  notRebuilt: (taskId: string) => `Task ${taskId}: its state.json can be read again (or could not be read at all), so nothing was rebuilt. Type /jeeves recover again; /jeeves status shows it.`,
  recoverMine: 'This session runs the task already: nothing to recover. /jeeves status shows it.',
  recoverMineOther: (mine: string, other: string) => `This session runs task ${mine}, so task ${other} was not taken over. To continue it instead: /jeeves off ends ${mine}, then /jeeves recover.`,
  recoverTooNew: (taskId: string) => `Task ${taskId} was saved by a newer Jeeves. Update Jeeves; nothing was changed.`,
  recoverPaused: 'The task is paused, not interrupted: /jeeves resume continues it.',
  nothingToRecover: 'Nothing to recover: no task here was interrupted. /jeeves status shows the task.',
  restored: (taskId: string) => `Continuing task ${taskId} here: Jeeves sends the task and its latest handover as the next prompt.`,
  // ST-13.5 (spec §5.5)
  postponed: (t: number, warn: number, atCap: boolean) => `Postponed: Jeeves now hands over at ${t}% and warns at ${warn}%.${atCap ? " That is the cap: it can't be postponed again." : ' /jeeves later again postpones further.'}`,
  laterRefused: (status: string, rotating: boolean) => `Nothing to postpone: the task is ${status}.${rotating ? ' A handover under way goes on; /jeeves pause stops handovers until /jeeves resume.' : ''}`,
  rotateRequested: 'Handover requested: Jeeves asks Claude for it at the next safe stop, then starts a fresh conversation.',
  notRotatable: (status: string) => `No handover now: the task is ${status}. /jeeves status shows why.`,
  suggestedChecks: (cmds: string[]) => `Suggested checks: ${cmds.map(c => `/jeeves check ${c}`).join(', ')}`,
  noDefaults: 'No defaults set for this project. /jeeves defaults threshold <n>, limit <n> or check <cmd> sets them for the next /jeeves on here.',
  defaultsUsage: 'Usage: /jeeves defaults, /jeeves defaults threshold <20-90>, /jeeves defaults limit <1-100>, /jeeves defaults check <cmd>, /jeeves defaults auto on|off, /jeeves defaults clear',
  defaultAutoSet: (v: 'on' | 'off') => `Auto-start for this project: ${v}. It wins over /config and /jeeves auto here; /jeeves defaults clear resets it.`,
  // ST-13.2 (spec §5.5, §5.6)
  autoState: (on: boolean, source: string) => `Auto-start: ${on ? 'on' : 'off'} (${source}).`,
  autoUsage: 'Usage: /jeeves auto shows auto-start; /jeeves auto on or /jeeves auto off sets it everywhere (kept in the state folder, not in Claude settings).',
  autoSaved: (v: 'on' | 'off') => `Auto-start everywhere: ${v}. /jeeves defaults auto on|off sets one project, /jeeves off this session.`,
  autoOverridden: (row: 'on' | 'off') => `Saved, but /config → Auto-start is set to ${row}, which takes precedence.`,
  autoUnreadable: (why: string) => `Warning: auto.json is unreadable and ignored (${why.slice(0, 80)}). /jeeves auto on|off writes a new one.`,
  // ST-13.4 (spec §5.4): the first eligible session's notice, with the threshold that applies.
  autoNotice: (threshold: number, window: number | undefined) => [
    `Jeeves watches long sessions here. At ${threshold}% context${window ? ` (~${Math.round((window * threshold) / 100_000)}K tokens)` : ''} it saves a handover and continues in a fresh conversation.`,
    '/jeeves later postpones a handover, /jeeves off stops it for this session, /jeeves auto off turns it off.',
  ].join('\n'),
  // ST-13.3 (spec §5.1): the R-25 re-check ends an auto task.
  upgradeNotice: 'Jeeves can now watch long sessions by itself. Type /jeeves auto on to turn it on. Nothing changes until you do.',
  hint: (percent: number) => `Jeeves: this session is at ${percent}%. /jeeves on would hand it over to a fresh conversation before it fills up. /jeeves auto off hides this.`,
  autoOffSession: 'No managed task. Auto-start is off for the rest of this session; /jeeves on still starts a task.',
  defaultsUnreadable: (err: string) => `Project defaults unreadable (config.json: ${short(err).slice(0, 80)}); they are ignored. /jeeves defaults clear resets them.`,
  defaultsCleared: 'Project defaults cleared. Running tasks are not changed.',
  defaultThresholdSet: (n: number) => `Default threshold for this project: ${n}%. It applies from the next /jeeves on here; running tasks are not changed.`,
  defaultCheckAdded: (cmd: string) => `Default check added for this project: ${short(cmd)} (stored as text, never run by Jeeves). It applies from the next /jeeves on here.`,
  defaultsFull: (n: number) => `Not added: a project keeps at most ${n} default checks. /jeeves defaults clear starts over.`,
  defaultsIgnored: 'Warning: project defaults unreadable (config.json), so none were applied. /jeeves defaults shows why.',
  retryRequested: 'Handover requested again: Jeeves asks Claude for it at the next safe stop. Earlier handovers are kept as they are.',
  retryWatching: 'Watching again in this session, without a handover here. The next fresh session rotates as usual. A higher /jeeves threshold or a shorter task avoids another loop.',
  retryUsedUp: (n: number) => `No retry: ${n} handovers in a row failed, the limit. /jeeves off ends the task (files kept).`,
  nothingToRetry: '/jeeves retry works only after a handover failed its checks, or after a fresh conversation started too full.',
  nothingToConfirm: 'Nothing waits for /jeeves done: only a task stopped as DOD_UNMET can be confirmed by hand.',
  confirmedDone: (taskId: string) => `Task ${taskId} marked done by you (recorded as your decision, not verified by checks).`,
  nothingToContinue: 'No handover is waiting for /jeeves continue. /jeeves status shows the task.',
  continueNeedsFresh: 'Run /clear first: /jeeves continue works only in a fresh conversation, so the old one is not mixed in.',
  handoverUnverified: 'The saved handover no longer matches its checksum, so Jeeves did not continue. /jeeves status shows the task; /jeeves off ends it.',
  turnedOn: (taskId: string, withGoal: boolean) => withGoal
    ? `Jeeves on: task ${taskId}. Your goal is saved word for word and sent as the first prompt.`
    : `Jeeves on: task ${taskId}. Your next prompt is saved word for word as the task.`,
  limitRange: (arg: string, min: number, max: number) => `The handover limit must be a whole number from ${min} to ${max} (got "${short(arg).slice(0, 20)}"). Example: /jeeves limit 50`,
  limitSet: (n: number, done: number, paused: boolean) => `Handover limit set to ${n} for this task (${done} done so far).${paused ? (n > done ? ' /jeeves resume continues it.' : ' That is not above the handovers done, so the task stays paused.') : ''}`,
  defaultLimitSet: (n: number) => `Default handover limit for this project: ${n}. It applies from the next /jeeves on here; running tasks are not changed.`,
  thresholdRange: (arg: string, min: number, max: number) => `Threshold must be a whole number from ${min} to ${max} (got "${short(arg).slice(0, 20)}"). Example: /jeeves threshold 60`,
  thresholdSet: (n: number, override: number | null) => `Threshold set to ${n}%: Jeeves warns at ${n - 5}% and hands over at ${n}%.${override ? ` TEST OVERRIDE ${override}% is active in this run.` : ''}`,
  paused: (cancelled: boolean) => `Paused: no handover until /jeeves resume.${cancelled ? ' The requested handover is cancelled.' : ''} The pause is kept across restarts.`,
  pauseDeferred: 'A handover is under way. Jeeves pauses once the fresh conversation has your task.',
  notPausable: (status: string) => `Nothing to pause: the task is ${status}.`,
  notPaused: (status: string) => `The task is ${status}, not paused.`,
  resumed: (t: number, override: number | null) => `Resumed: Jeeves hands over again at ${override ?? t}%${override ? ' (TEST OVERRIDE)' : ''}.`,
  turnedOff: (taskId: string, dir: string) => `Jeeves off. Task ${taskId} is kept, nothing was deleted: ${dir}. Auto-start is off for the rest of this session.`,
  heldOnOff: (held: readonly string[]) => `Not delivered: ${held.length} message(s) you typed during the handover. Type them again if they still matter:\n${held.map(m => `> ${m.replace(/\r\n?|\n/g, '\n> ')}`).join('\n')}`,
  heldNotSent: (err: unknown, held: readonly string[]) => `Jeeves could not deliver the messages you typed during the handover (${short(String(err))}). Please type them again: ${held.map(m => `"${short(m)}"`).join(', ')}`,
  submitFailed: (err: unknown) => `Jeeves could not send your goal (${short(String(err))}). Type it as your next prompt.`,
}

/** One plain line (<= 40 columns) per reason code (AC-23): the status entry, transcript line and notification of a stopped task.
 *  It stands alone (no code beside it) and says what to do when there is something to do. Codes stay in history and --diagnose. */
export const REASON_TEXT: Record<ReasonCode, string> = {
  THRESHOLD: 'Context reached the threshold.',
  MANUAL: 'You asked for a handover.',
  COMPACTED: 'Context was compacted; handing over.',
  UNSAFE_BOUNDARY: 'Paused: no safe point to hand over.',
  USER_INTERRUPT: 'Paused: you interrupted the handover.',
  USER_CLEAR: 'Paused after your /clear. /jeeves resume',
  USER_PAUSE: 'Paused by you. /jeeves resume',
  HANDOVER_INVALID: 'Handover failed its checks.',
  ROTATE_UNAVAILABLE: 'Run /clear, then /jeeves continue.',
  POSSIBLE_LOOP: 'Fresh conversation started too full.',
  MAX_ROTATIONS: 'Handover limit hit. /jeeves limit <n>',
  RATE_LIMIT: 'Rate limit hit. /jeeves resume later',
  AUTH: 'Login problem. /login, then resume.',
  BILLING: 'Billing problem: check your account.',
  OVERLOADED: 'API busy. /jeeves resume in a while',
  API_ERROR: 'API error. /jeeves resume to retry.',
  DISK: 'Could not save task files to disk.',
  LOCK_HELD: 'Another session runs this task.',
  STALE_LOCK: 'The session running it stopped.',
  SCHEMA_TOO_NEW: 'Saved by a newer Jeeves. Update Jeeves',
  REPO_MISMATCH: 'Task belongs to another repository.',
  DOD_UNMET: 'Claude says done. Confirm: /jeeves done',
  COMPLETED: 'Task completed.',
  STATE_CORRUPT: 'Task file unreadable. /jeeves recover',
}

/**
 * `/jeeves history` (ST-7.2): the last 20 state changes from events.jsonl, oldest first, then a rotations summary.
 * Every line fits 80 columns. Details were redacted when written; they are cut, never widened.
 */
export function historyText(s: State, lines: readonly string[]): string {
  const changes = lines.flatMap(l => { try { return [JSON.parse(l) as EventLine] } catch { return [] } }).filter(e => e.from !== e.to)
  const row = (e: EventLine) => {
    const head = `${e.at.slice(5, 16).replace('T', ' ')} ${e.from ?? '-'} > ${e.to ?? '-'}${e.code ? ` ${e.code}` : ''}${e.pct == null ? '' : ` ${Math.round(e.pct * 10) / 10}%`}`
    const detail = e.detail.replace(/\s+/g, ' ')
    return detail && head.length + 3 < 80 ? `${head}  ${detail}`.slice(0, 80) : head.slice(0, 80)
  }
  const shown = changes.slice(-20)
  return [
    `Task ${s.taskId}: ${s.status}${s.reason ? ` (${s.reason})` : ''}`,
    `Rotations: ${s.rotationCount}  Session: ${s.sessionSequence}  Failed handovers in a row: ${s.consecutiveFailures}`,
    shown.length < changes.length ? `Last ${shown.length} of ${changes.length} state changes (times in UTC):` : `State changes (times in UTC):`,
    ...(shown.length ? shown.map(row) : ['none yet']),
  ].join('\n')
}

/** Shown once per machine, on the first successful `/jeeves on` (ST-7.3). */
export const firstActivationText = (stateRoot: string, assisted = false) => [
  `Jeeves keeps task state on this machine only: ${stateRoot}`,
  assisted
    ? 'Assisted mode: when context fills up, it saves a handover and asks you to run /clear, then /jeeves continue.'
    : 'When context fills up, it starts a fresh conversation by itself and continues the task there.',
  '/jeeves pause stops that at any time; /jeeves off ends the task (nothing is deleted).',
]
