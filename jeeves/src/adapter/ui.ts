// User-facing strings (FR-14, NFR-08): plain ASCII, text labels, <= 40 columns, <= 8 lines for status.
import type { Probe } from '../core/probe.ts'
import { recoverable } from '../core/machine.ts'
import { DEFAULT_CONFIG, INERT, type EventLine, type ReasonCode, type State, type Status } from '../core/types.ts'

export const WIDTH = 40

/** Shorten from the left so the end of a path stays visible. */
export const fitLeft = (s: string, width: number) => (s.length <= width ? s : `...${s.slice(s.length - width + 3)}`)
const fit = (s: string) => (s.length <= WIDTH ? s : `${s.slice(0, WIDTH - 3)}...`)

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
  NEEDS_REVIEW: 'needs review', FAILED: 'failed', COMPLETED: 'done',
}

const pctText = (p: number | undefined) => (p === undefined ? '?' : `${Math.round(p)}%`)

/** This plugin's status entry (ST-7.1, <= 40 columns): context and threshold while watching, else the state's word. */
export function statusLine(s: State, threshold: number | string): string | undefined {
  if (s.status === 'DISABLED') return undefined
  const mode = s.mode === 'assisted' ? ' assisted' : ''
  if (s.status === 'MONITORING') return fit(`Jeeves ${pctText(s.lastContext?.percent)}/${threshold}%${mode}`)
  return fit(`Jeeves: ${STATE_WORD[s.status]}${s.reason && INERT.includes(s.status) ? ` (${s.reason})` : ''}`)
}

/** One transcript line per state change (ST-7.1); null for a change not worth a line. Never per tool call. */
export function transitionLine(from: Status, to: Status, code: ReasonCode | null, s: State): string | null {
  if (from === to) return null
  const why = code ? ` (${code})` : ''
  switch (to) {
    case 'MONITORING': return from === 'DISABLED' ? 'Jeeves: on, watching context' : from === 'CONTINUING' ? `Jeeves: session ${s.sessionSequence} at ${pctText(s.lastContext?.percent)}, watching context` : 'Jeeves: watching context again'
    case 'ROTATION_REQUESTED': return `Jeeves: handover requested${why}`
    case 'QUIESCING': return 'Jeeves: letting the current turn finish'
    case 'HANDOVER_GENERATING': return 'Jeeves: asking Claude for the handover'
    case 'VALIDATING': return 'Jeeves: checking the handover'
    case 'ROTATING': return 'Jeeves: handover validated, starting fresh'
    case 'RESTORING': return 'Jeeves: restoring the task'
    case 'CONTINUING': return 'Jeeves: the fresh conversation continues the task'
    case 'DISABLED': return 'Jeeves: off (task files kept)'
    case 'COMPLETED': return 'Jeeves: task completed'
    default: return `Jeeves: ${STATE_WORD[to]}${why}${code ? `: ${REASON_TEXT[code]}` : ''}`
  }
}

/** ` (~400K)`: the task threshold in tokens, when the window is known (ST-10.1). */
const tokensAt = (window: number | undefined, pct: number) => {
  const k = Math.round(((window ?? 0) * pct) / 100_000)
  return k >= 1 ? ` (~${k}K)` : ''
}

/** The reason's line; one that /jeeves retry applies to says so, or that the retries are used up (ST-10.2). */
const reasonLine = (s: State) => {
  if (s.status !== 'NEEDS_REVIEW' || (s.reason !== 'HANDOVER_INVALID' && s.reason !== 'POSSIBLE_LOOP')) return REASON_TEXT[s.reason!]
  if (s.consecutiveFailures >= DEFAULT_CONFIG.maxConsecutiveFailures) return 'Retries used up. /jeeves off ends it'
  return s.reason === 'HANDOVER_INVALID' ? 'Handover invalid. Try: /jeeves retry' : 'Fresh session too full. /jeeves retry'
}

export function statusText(v: StatusView): string {
  // AC-25: a task that fell back to assisted shows it, whatever the probe said.
  const lines = [`Jeeves  mode: ${v.task?.state.mode === 'assisted' ? 'assisted' : v.probe.mode}`]
  if (v.probe.mode === 'unsupported') lines.push(`Needs ${(v.probe.missing[0] ?? 'newer').replace('Claude Code ', '')}, this is ${v.probe.version ?? '?'}`)
  else if (v.probe.mode === 'assisted') lines.push(`Missing: ${v.probe.missing.join(', ')}`)
  if (v.taskError) lines.push(`Task state unreadable:`, v.taskError)
  else if (!v.task) lines.push('No managed task. Start with /jeeves on')
  else {
    const s = v.task.state
    const pct = s.lastContext?.percent
    if (s.taskRevision === 0) lines.push('Waiting for your first prompt')
    lines.push(
      `Task: ${s.taskId}`,
      `State: ${s.status}${s.reason ? ` (${s.reason})` : ''}`,
      `Context: ${pct === undefined ? 'unknown' : `${Math.round(pct * 10) / 10}%`}  Threshold: ${shownThreshold(s, v.thresholdOverride, v.thresholdRelative)}%${tokensAt(s.lastContext?.window, s.thresholdPercent)}`,
      ...(v.thresholdRelative ? [`TEST OVERRIDE +${v.thresholdRelative} (task setting ${s.thresholdPercent}%)`]
        : v.thresholdOverride ? [`TEST OVERRIDE (task setting ${s.thresholdPercent}%)`] : []),
      `Rotations: ${s.rotationCount}  Session: ${s.sessionSequence}`,
      ...(s.reason && INERT.includes(s.status) ? [reasonLine(s)] : []),
      `Last: ${s.lastValidatedHandover ? s.lastValidatedHandover.split('#')[0]!.replace(/^history\//, '') : 'no handover yet'}${s.lastErrorCode ? `, error ${s.lastErrorCode}` : ''}`,
    )
  }
  if (v.stateRoot) lines.push(`Path: ${fitLeft(v.task?.dir ?? v.stateRoot, WIDTH - 6)}`)
  else lines.push(`State folder: ${v.stateRootError ? 'error' : 'unset'}`, ...(v.stateRootError ? [v.stateRootError] : []))
  return lines.slice(0, 8).map(fit).join('\n')
}

export const HELP = [
  'Jeeves commands (/jeeves ...):',
  'on [goal]     start a managed task',
  'off           stop it (files kept)',
  'pause         no handover until resume',
  'resume        allow the handover again',
  'rotate        hand over now',
  'continue      after /clear (assisted)',
  'recover       continue a stopped task',
  'done          confirm the task is done',
  'retry         after a failed handover',
  'threshold <n> hand over at n% (20-90)',
  'task          original task + changes',
  'dod <text>    add a done criterion',
  'check <cmd>   add a check (never run)',
  'status        mode, task, context',
  'status --diagnose  report for a bug',
  'history       last 20 state changes',
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
  alreadyOn: (s: State) => `Already on: task ${s.taskId} (${s.status}). /jeeves status shows it.`,
  lockHeld: (taskId: string) => `Another running session owns task ${taskId} here (LOCK_HELD). /jeeves status shows it read-only.`,
  separateTask: (taskId: string) => `Another running session owns task ${taskId} here (LOCK_HELD); it stays that session's. Starting a separate task for this session.`,
  leftBehind: (s: State) => `Task ${s.taskId} from an earlier session is ${s.status} here. ${s.status === 'PAUSED' ? '/jeeves resume continues it, or ' : recoverable(s) ? '/jeeves recover continues it here, or ' : ''}/jeeves off ends it.`,
  interrupted: (taskId: string, status: string) => `Task ${taskId} was left ${status} by an earlier session. /jeeves recover continues it here.`,
  corrupt: (taskId: string) => `Task ${taskId}: its state.json is unreadable. /jeeves recover rebuilds it from the task's files (nothing is deleted).`,
  recovered: (taskId: string, rebuilt: boolean) => `Recovering task ${taskId} here${rebuilt ? ' (state.json rebuilt; the old file is kept)' : ''}: Jeeves sends the task and its last validated handover as the next prompt.`,
  recoverHeld: (taskId: string, wait: number | null) => `Another session owns task ${taskId} and is still running (LOCK_HELD), so nothing was changed.${wait !== null ? ` If that session is gone, try again in ${wait} s.` : ''}`,
  heldElsewhere: (taskId: string, status: string) => `Task ${taskId} is ${status} in another session. If that session stopped, /jeeves recover takes it over once it has been silent for 2 minutes.`,
  repoMismatch: (expected: string, actual: string) => `Blocked (REPO_MISMATCH): the handover was written on branch ${expected}, but the repository is on ${actual}. Nothing was continued. Switch back to ${expected} and type /jeeves recover, or type /jeeves recover --relink to continue on ${actual}.`,
  moved: (taskId: string, oldPath: string) => `Task ${taskId} was started in ${oldPath}, which no longer exists (REPO_MISMATCH). If you moved the repository here, type /jeeves recover --relink to continue it here.`,
  relinked: (taskId: string, oldPath: string) => `Task ${taskId} moved here from ${oldPath}.`,
  relinkExists: (target: string) => `Not relinked: ${target} already exists. Nothing was changed.`,
  relinkFailed: (dir: string, err: string) => `Not relinked: moving ${dir} failed (${err}). Nothing else was changed.`,
  recoverUsage: 'Usage: /jeeves recover, or /jeeves recover --relink to continue after a branch switch or a moved folder.',
  notRebuilt: (taskId: string) => `Task ${taskId}: its state.json can be read again (or could not be read at all), so nothing was rebuilt. Type /jeeves recover again; /jeeves status shows it.`,
  recoverMine: 'This session runs the task already: nothing to recover. /jeeves status shows it.',
  recoverTooNew: (taskId: string) => `Task ${taskId} was saved by a newer Jeeves (SCHEMA_TOO_NEW). Update Jeeves; nothing was changed.`,
  recoverPaused: 'The task is paused, not interrupted: /jeeves resume continues it.',
  nothingToRecover: 'Nothing to recover: no task here was interrupted. /jeeves status shows the task.',
  restored: (taskId: string) => `Continuing task ${taskId} here: Jeeves sends the task and its latest handover as the next prompt.`,
  rotateRequested: 'Handover requested: Jeeves asks Claude for it at the next safe stop, then starts a fresh conversation.',
  notRotatable: (status: string) => `No handover now: the task is ${status}. /jeeves status shows why.`,
  retryRequested: 'Handover requested again: Jeeves asks Claude for it at the next safe stop. Earlier handovers are kept as they are.',
  retryWatching: 'Watching again in this session, without a handover here. The next fresh session rotates as usual. A higher /jeeves threshold or a shorter task avoids another loop.',
  retryUsedUp: (n: number) => `No retry: ${n} handovers in a row failed, the limit. /jeeves off ends the task (files kept).`,
  nothingToRetry: '/jeeves retry works only after an invalid handover (HANDOVER_INVALID) or a possible loop (POSSIBLE_LOOP).',
  nothingToConfirm: 'Nothing waits for /jeeves done: only a task stopped as DOD_UNMET can be confirmed by hand.',
  confirmedDone: (taskId: string) => `Task ${taskId} marked done by you (recorded as your decision, not verified by checks).`,
  nothingToContinue: 'No handover is waiting for /jeeves continue. /jeeves status shows the task.',
  continueNeedsFresh: 'Run /clear first: /jeeves continue works only in a fresh conversation, so the old one is not mixed in.',
  handoverUnverified: 'The saved handover no longer matches its checksum, so Jeeves did not continue. /jeeves status shows the task; /jeeves off ends it.',
  turnedOn: (taskId: string, withGoal: boolean) => withGoal
    ? `Jeeves on: task ${taskId}. Your goal is saved word for word and sent as the first prompt.`
    : `Jeeves on: task ${taskId}. Your next prompt is saved word for word as the task.`,
  thresholdRange: (arg: string, min: number, max: number) => `Threshold must be a whole number from ${min} to ${max} (got "${short(arg).slice(0, 20)}"). Example: /jeeves threshold 60`,
  thresholdSet: (n: number, override: number | null) => `Threshold set to ${n}%: Jeeves warns at ${n - 5}% and hands over at ${n}%.${override ? ` TEST OVERRIDE ${override}% is active in this run.` : ''}`,
  paused: (cancelled: boolean) => `Paused: no handover until /jeeves resume.${cancelled ? ' The requested handover is cancelled.' : ''} The pause is kept across restarts.`,
  pauseDeferred: 'A handover is under way. Jeeves pauses once the fresh conversation has your task.',
  notPausable: (status: string) => `Nothing to pause: the task is ${status}.`,
  notPaused: (status: string) => `The task is ${status}, not paused.`,
  resumed: (t: number, override: number | null) => `Resumed: Jeeves hands over again at ${override ?? t}%${override ? ' (TEST OVERRIDE)' : ''}.`,
  turnedOff: (taskId: string, dir: string) => `Jeeves off. Task ${taskId} is kept, nothing was deleted: ${dir}`,
  heldNotSent: (err: unknown, held: readonly string[]) => `Jeeves could not deliver the messages you typed during the handover (${short(String(err))}). Please type them again: ${held.map(m => `"${short(m)}"`).join(', ')}`,
  submitFailed: (err: unknown) => `Jeeves could not send your goal (${short(String(err))}). Type it as your next prompt.`,
}

/** One line (<= 40 columns) per reason code, shown in status beside the code (AC-23). Every code has one. */
export const REASON_TEXT: Record<ReasonCode, string> = {
  THRESHOLD: 'Context reached the threshold.',
  MANUAL: 'You asked for a handover.',
  COMPACTED: 'Context was compacted; handing over.',
  UNSAFE_BOUNDARY: 'No safe point to hand over.',
  USER_INTERRUPT: 'You interrupted the handover.',
  USER_CLEAR: 'You cleared the conversation.',
  USER_PAUSE: 'Paused by you. /jeeves resume',
  HANDOVER_INVALID: 'Handover invalid; nothing cleared.',
  ROTATE_UNAVAILABLE: 'Run /clear, then /jeeves continue.',
  POSSIBLE_LOOP: 'Fresh session too full: loop stopped.',
  MAX_ROTATIONS: 'Rotation limit for this task reached.',
  RATE_LIMIT: 'Rate limit hit. Resume when it lifts.',
  AUTH: 'Login problem. /login, then resume.',
  BILLING: 'Billing problem: check your account.',
  OVERLOADED: 'API overloaded. Resume in a while.',
  API_ERROR: 'API error. /jeeves resume to retry.',
  DISK: 'Could not write task files (disk).',
  LOCK_HELD: 'Another session owns this task.',
  STALE_LOCK: 'Its owning session stopped.',
  SCHEMA_TOO_NEW: 'Files come from a newer Jeeves version.',
  REPO_MISMATCH: 'Repository differs from the task.',
  DOD_UNMET: 'Not done: checks are missing.',
  COMPLETED: 'Task completed.',
  STATE_CORRUPT: 'state.json unreadable; kept as is.',
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
