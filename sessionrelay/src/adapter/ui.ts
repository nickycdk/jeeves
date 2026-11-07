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
    lines.push(
      `Task: ${s.taskId}`,
      `State: ${s.status}${s.reason ? ` (${s.reason})` : ''}`,
      `Context: ${pct === undefined ? 'unknown' : `${pct}%`}  Threshold: ${s.thresholdPercent}%`,
      `Rotations: ${s.rotationCount}  Session: ${s.sessionSequence}`,
      `Last: ${s.lastValidatedHandover ? s.lastValidatedHandover.split('#')[0]!.replace(/^history\//, '') : 'no handover yet'}${s.lastErrorCode ? `, error ${s.lastErrorCode}` : ''}`,
    )
  }
  if (v.stateRoot) lines.push(`Path: ${fitLeft(v.task?.dir ?? v.stateRoot, WIDTH - 6)}`)
  else lines.push(`State folder: ${v.stateRootError ? 'error' : 'unset'}`, ...(v.stateRootError ? [v.stateRootError] : []))
  return lines.slice(0, 8).map(fit).join('\n')
}

export const HELP = [
  'SessionRelay commands:',
  '/relay status  mode, task, context',
  '/relay help    this list',
  'More commands come in later versions.',
].join('\n')
