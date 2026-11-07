// User-facing strings (FR-14, NFR-08): plain ASCII, text labels, <= 40 columns, <= 8 lines for status.
import type { Probe } from '../core/probe.ts'
import type { State } from '../core/types.ts'

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
}

export function statusText(v: StatusView): string {
  const lines = [`SessionRelay  mode: ${v.probe.mode}`]
  if (v.probe.mode === 'unsupported') lines.push(`Needs ${(v.probe.missing[0] ?? 'newer').replace('Claude Code ', '')}, this is ${v.probe.version ?? '?'}`)
  else if (v.probe.mode === 'assisted') lines.push(`Missing: ${v.probe.missing.join(', ')}`)
  if (v.taskError) lines.push(`Task state unreadable:`, v.taskError)
  else if (!v.task) lines.push('No managed task. Start with /relay on')
  else {
    const s = v.task.state
    const pct = s.lastContext?.percent
    if (s.taskRevision === 0) lines.push('Waiting for your first prompt')
    lines.push(
      `Task: ${s.taskId}`,
      `State: ${s.status}${s.reason ? ` (${s.reason})` : ''}`,
      `Context: ${pct === undefined ? 'unknown' : `${pct}%`}  Threshold: ${v.thresholdOverride ?? s.thresholdPercent}%`,
      ...(v.thresholdOverride ? [`TEST OVERRIDE (task setting ${s.thresholdPercent}%)`] : []),
      `Rotations: ${s.rotationCount}  Session: ${s.sessionSequence}`,
      `Last: ${s.lastValidatedHandover ? s.lastValidatedHandover.split('#')[0]!.replace(/^history\//, '') : 'no handover yet'}${s.lastErrorCode ? `, error ${s.lastErrorCode}` : ''}`,
    )
  }
  if (v.stateRoot) lines.push(`Path: ${fitLeft(v.task?.dir ?? v.stateRoot, WIDTH - 6)}`)
  else lines.push(`State folder: ${v.stateRootError ? 'error' : 'unset'}`, ...(v.stateRootError ? [v.stateRootError] : []))
  return lines.slice(0, 8).map(fit).join('\n')
}

export const HELP = [
  'SessionRelay commands (/relay ...):',
  'on [goal]     start a managed task',
  'off           stop it (files kept)',
  'threshold <n> hand over at n% (20-90)',
  'task          original task + changes',
  'dod <text>    add a done criterion',
  'check <cmd>   add a check (never run)',
  'status        mode, task, context',
  'help          this list',
].join('\n')

const short = (s: string) => s.replace(/\s+/g, ' ').slice(0, 120)

/** Replies to /relay commands. Plain text, no colour or emoji meaning (FR-14). */
export const MSG = {
  userOnly: 'Only you can change a SessionRelay task: type the /relay command yourself.',
  unsupported: 'This Claude Code version is not supported, so SessionRelay stays off.',
  noTask: 'No managed task. Start with /relay on',
  waitingForPrompt: 'The task has no original prompt yet: type it as your next prompt first.',
  reviseUsage: (kind: 'dod' | 'check') => kind === 'dod' ? 'Usage: /relay dod <what must be true when the task is done>' : 'Usage: /relay check <command that verifies the task, e.g. npm test>',
  revised: (n: number, kind: 'dod' | 'check') => `Saved as task revision ${n} (${kind === 'dod' ? 'Definition of Done' : 'verification command, stored as text, never run by SessionRelay'}). /relay task shows all changes.`,
  noProject: (stateRootError: string | null) => stateRootError
    ? `SessionRelay has no state folder (${stateRootError}). Set stateDir in /config.`
    : 'SessionRelay could not tell which project this is (git did not answer). Try again.',
  alreadyOn: (s: State) => `Already on: task ${s.taskId} (${s.status}). /relay status shows it.`,
  lockHeld: (taskId: string) => `Another running session owns task ${taskId} here (LOCK_HELD). /relay status shows it read-only.`,
  leftBehind: (s: State) => `Task ${s.taskId} from an earlier session is ${s.status} here. ${s.status === 'PAUSED' ? '/relay resume continues it, or ' : ''}/relay off ends it.`,
  turnedOn: (taskId: string, withGoal: boolean) => withGoal
    ? `SessionRelay on: task ${taskId}. Your goal is saved word for word and sent as the first prompt.`
    : `SessionRelay on: task ${taskId}. Your next prompt is saved word for word as the task.`,
  thresholdRange: (arg: string, min: number, max: number) => `Threshold must be a whole number from ${min} to ${max} (got "${short(arg).slice(0, 20)}"). Example: /relay threshold 60`,
  thresholdSet: (n: number, override: number | null) => `Threshold set to ${n}%: SessionRelay warns at ${n - 5}% and hands over at ${n}%.${override ? ` TEST OVERRIDE ${override}% is active in this run.` : ''}`,
  turnedOff: (taskId: string, dir: string) => `SessionRelay off. Task ${taskId} is kept, nothing was deleted: ${dir}`,
  submitFailed: (err: unknown) => `SessionRelay could not send your goal (${short(String(err))}). Type it as your next prompt.`,
}
