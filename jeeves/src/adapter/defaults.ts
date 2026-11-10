// ST-11.1 (ADR-009 A2): per-project defaults in projects/<projectId>/config.json (state folder, never the repository).
import { isLimit, isThreshold, LIMIT_MAX, LIMIT_MIN, THRESHOLD_MAX, THRESHOLD_MIN } from '../core/machine.ts'
import { join } from '../core/paths.ts'
import { defaultsVersion, parseJson } from '../core/schema.ts'
import { DEFAULT_CONFIG, DEFAULTS_CHECKS_MAX, SCHEMA_VERSION, type ProjectDefaults } from '../core/types.ts'
import type { Runtime } from './runtime.ts'
import { MSG } from './ui.ts'

/** null: none set; `error`: the file exists but is not valid (ignored, said in status and at /jeeves on). */
export type DefaultsRead = { value: ProjectDefaults | null; error: string | null }

const pathOf = (rt: Runtime) => join(rt.projectDir!, 'config.json')

export async function readDefaults(rt: Runtime): Promise<DefaultsRead> {
  if (!rt.projectDir) return { value: null, error: null }
  const text = await rt.port.read(pathOf(rt)).catch(() => null)
  if (text === null) return { value: null, error: null }
  const r = parseJson('defaults', text)
  return r.ok ? { value: r.value, error: null } : { value: null, error: r.errors[0] ?? 'invalid' }
}

const write = (rt: Runtime, d: ProjectDefaults) => rt.storage.replaceFile(pathOf(rt), JSON.stringify({ ...d, schemaVersion: defaultsVersion(d) }, null, 2) + '\n')

const showText = (d: ProjectDefaults | null) => {
  if (!d || (d.thresholdPercent === undefined && d.maxRotations === undefined && d.verificationCommands.length === 0 && !d.autoStart)) return MSG.noDefaults
  return ['Project defaults (for the next /jeeves on here):', `Threshold: ${d.thresholdPercent ?? DEFAULT_CONFIG.thresholdPercent}%${d.thresholdPercent === undefined ? ' (Jeeves default)' : ''}`,
    `Handover limit: ${d.maxRotations ?? DEFAULT_CONFIG.maxRotationsPerTask}${d.maxRotations === undefined ? ' (Jeeves default)' : ''}`,
    ...(d.verificationCommands.length ? ['Checks:', ...d.verificationCommands.map(c => `  ${c}`)] : ['Checks: none']),
    ...(d.autoStart ? [`Auto-start: ${d.autoStart}`] : [])].join('\n')
}

/** `/jeeves defaults [threshold <n> | limit <n> | check <cmd> | auto on|off | clear]`; `userTyped` is required for every change (FR-05). */
export async function defaultsCommand(rt: Runtime, rest: string, userTyped: boolean): Promise<string> {
  const m = /^\s*(\S*)\s?([\s\S]*)$/.exec(rest)!
  const sub = m[1]!.toLowerCase(), arg = m[2]!.trim()
  if (!rt.projectDir) return MSG.noProject(rt.stateRootError)
  const cur = await readDefaults(rt)
  if (sub === '') return cur.error ? MSG.defaultsUnreadable(cur.error) : showText(cur.value)
  if (!['threshold', 'limit', 'check', 'clear', 'auto'].includes(sub)) return MSG.defaultsUsage
  if (!userTyped) return MSG.userOnly
  const base: ProjectDefaults = cur.value ?? { schemaVersion: SCHEMA_VERSION, verificationCommands: [] }
  if (sub === 'clear') {
    await write(rt, { schemaVersion: SCHEMA_VERSION, verificationCommands: [] })
    return MSG.defaultsCleared
  }
  // A newer Jeeves's file or a hand edit: never overwrite it; clear above is the way out.
  if (cur.error) return MSG.defaultsUnreadable(cur.error)
  if (sub === 'auto') {
    const v = arg.toLowerCase()
    if (v !== 'on' && v !== 'off') return MSG.defaultsUsage
    await write(rt, { ...base, autoStart: v })
    return MSG.defaultAutoSet(v)
  }
  if (sub === 'threshold') {
    const n = /^\d+$/.test(arg) ? Number(arg) : NaN
    if (!isThreshold(n)) return MSG.thresholdRange(arg, THRESHOLD_MIN, THRESHOLD_MAX)
    await write(rt, { ...base, thresholdPercent: n })
    return MSG.defaultThresholdSet(n)
  }
  if (sub === 'limit') {
    const n = /^\d+$/.test(arg) ? Number(arg) : NaN
    if (!isLimit(n)) return MSG.limitRange(arg, LIMIT_MIN, LIMIT_MAX)
    await write(rt, { ...base, maxRotations: n })
    return MSG.defaultLimitSet(n)
  }
  // check: stored as text, never run (FR-16); as typed after "check ".
  const cmd = m[2]!.replace(/^\s+/, '').replace(/\s+$/, '')
  if (!cmd || cmd.length > 2000) return MSG.defaultsUsage
  if (base.verificationCommands.length >= DEFAULTS_CHECKS_MAX) return MSG.defaultsFull(DEFAULTS_CHECKS_MAX)
  await write(rt, { ...base, verificationCommands: [...base.verificationCommands, cmd] })
  return MSG.defaultCheckAdded(cmd)
}
