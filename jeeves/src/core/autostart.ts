// Auto-start settings (ST-13.2, spec §5.5–5.6, ADR-009 A3). Pure.
import type { Mode, OnOff } from './types.ts'

/** The `/config` row `autoStart`. `default` defers to `auto.json`, then to the install's default. */
export const AUTO_ROW = ['default', 'on', 'off'] as const
export type AutoRow = (typeof AUTO_ROW)[number]
export const isAutoRow = (v: unknown): v is AutoRow => typeof v === 'string' && (AUTO_ROW as readonly string[]).includes(v)

/** Result of the once-per-install upgrade check, kept in the plugin store as `upgradeCheck`. */
export type InstallKind = 'fresh' | 'upgrader'
export const isInstallKind = (v: unknown): v is InstallKind => v === 'fresh' || v === 'upgrader'

/**
 * Upgrader: v0.2 was activated here (`firstActivationShown`, which only v0.2 writes) or the state folder holds a project.
 * Run once per install: later, a fresh user's own first project would look like an upgrade.
 */
export const classifyInstall = (firstActivationShown: boolean, hasProject: boolean): InstallKind =>
  firstActivationShown || hasProject ? 'upgrader' : 'fresh'

export type AutoSource = 'this session' | 'this project' | '/config' | 'auto.json' | 'upgraded from 0.2' | 'fresh install'
export type AutoInputs = {
  /** `/jeeves off` in this session. */
  sessionOff: boolean
  project?: OnOff | undefined
  row: AutoRow
  file?: OnOff | undefined
  /** null: the upgrade check has not run (no state folder yet), read as an upgrader: off, the safe direction. */
  install: InstallKind | null
}

/** Precedence (spec §5.5): session, project, the `/config` row when on/off, `auto.json`, then the install's default. */
export function resolveAutoStart(v: AutoInputs): { on: boolean; source: AutoSource } {
  if (v.sessionOff) return { on: false, source: 'this session' }
  if (v.project) return { on: v.project === 'on', source: 'this project' }
  if (v.row !== 'default') return { on: v.row === 'on', source: '/config' }
  if (v.file) return { on: v.file === 'on', source: 'auto.json' }
  return v.install === 'fresh' ? { on: true, source: 'fresh install' } : { on: false, source: 'upgraded from 0.2' }
}

/** D-42: auto-start only on windows above 200K tokens, at first (spec §5.1 item 4, Q8). */
export const AUTO_MIN_WINDOW = 200_000
export const largeWindow = (window: number) => window > AUTO_MIN_WINDOW

/**
 * Why a session is not auto-watched (ST-13.3), in the spec §5.1 order: first what no command changes in this session,
 * then the fixable ones, easiest first. Each is also its status text (status prefixes `Auto off: `, <= 40 columns).
 */
export const NOT_WATCHED = ['-p or SDK', 'unsupported', 'assisted mode', 'this session', 'this project', 'everywhere', 'upgraded from 0.2', 'resumed conversation', 'not a git repository', '200K window at start'] as const
export type NotWatched = (typeof NOT_WATCHED)[number]
export const isNotWatched = (v: unknown): v is NotWatched => (NOT_WATCHED as readonly unknown[]).includes(v)

/** What `session.start` reads, once per session. `window`: `$.session.usage().window` (the model setting). */
export type StartFacts = { interactive: boolean; mode: Mode; git: boolean; window: number; turns: number }

/** The reasons fixed at `session.start` (all but auto-start's own setting, which a command may change later). */
export function startReasons(f: StartFacts): NotWatched[] {
  return [
    ...(f.interactive ? [] : ['-p or SDK' as const]),
    ...(f.mode === 'unsupported' ? ['unsupported' as const] : f.mode === 'assisted' ? ['assisted mode' as const] : []),
    ...(f.turns > 0 ? ['resumed conversation' as const] : []),
    ...(f.git ? [] : ['not a git repository' as const]),
    ...(largeWindow(f.window) ? [] : ['200K window at start' as const]),
  ]
}

/** Auto-start resolved off is a reason too; which level said so decides its place (3: `/config` or `auto.json`, 3b: the upgrade default). */
export function autoReason(a: { on: boolean; source: AutoSource }): NotWatched | null {
  if (a.on) return null
  return a.source === 'this session' || a.source === 'this project' || a.source === 'upgraded from 0.2' ? a.source : 'everywhere'
}

/** Every reason, once each, in the §5.1 order. Empty: the session is eligible. */
export const ordered = (reasons: readonly NotWatched[]): NotWatched[] => NOT_WATCHED.filter(r => reasons.includes(r))

/** The one status line (spec §5.1): the first reason, and `(+N more)` so fixing one does not look like the whole answer. */
export const reasonLine = (reasons: readonly NotWatched[]): string | null => {
  const r = ordered(reasons)
  return r.length ? `Auto off: ${r[0]}${r.length > 1 ? ` (+${r.length - 1} more)` : ''}` : null
}
