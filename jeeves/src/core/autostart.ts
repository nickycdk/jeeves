// Auto-start settings (ST-13.2, spec §5.5–5.6, ADR-009 A3). Pure.
import type { OnOff } from './types.ts'

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
