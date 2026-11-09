// v0.3 (ST-13.1, spec §5.5–5.6): `<stateRoot>/auto.json`, auto-start everywhere. Never Claude settings.
import { classifyInstall, isInstallKind, resolveAutoStart, type AutoRow, type InstallKind } from '../core/autostart.ts'
import { join } from '../core/paths.ts'
import { check, parseJson } from '../core/schema.ts'
import { AUTO_SCHEMA_VERSION, type AutoFile } from '../core/types.ts'
import { readDefaults } from './defaults.ts'
import type { Runtime } from './runtime.ts'
import { MSG } from './ui.ts'

/** null: no file (or no state root); `error`: the file exists but is not valid, so it is ignored and the default applies. */
export type AutoRead = { value: AutoFile | null; error: string | null }

const pathOf = (root: string) => join(root, 'auto.json')

export async function readAuto(rt: Runtime): Promise<AutoRead> {
  if (!rt.stateRoot) return { value: null, error: null }
  const text = await rt.port.read(pathOf(rt.stateRoot)).catch(() => null)
  if (text === null) return { value: null, error: null }
  const r = parseJson('auto', text)
  return r.ok ? { value: r.value, error: null } : { value: null, error: r.errors[0] ?? 'invalid' }
}

/** Same tmp + hash check + `mv -f` swap as state.json. */
export async function writeAuto(rt: Runtime, v: AutoFile): Promise<void> {
  if (!rt.stateRoot) throw new Error('no state folder')
  const valid = check('auto', v)
  if (!valid.ok) throw new Error(`refusing to write an invalid auto.json: ${valid.errors[0]}`)
  await rt.storage.replaceFile(pathOf(rt.stateRoot), JSON.stringify(v, null, 2) + '\n')
}

const UPGRADE_KEY = 'upgradeCheck'
/** `/jeeves off` for one session, keyed by its id: the store is shared by every session on the machine. */
export const sessionOffKey = (sessionId: string) => `autoOff:${sessionId}`

/**
 * The upgrade check, once per install (ST-13.2, spec §5.6): only while the store has no `upgradeCheck`. An upgrader gets
 * `auto.json` off (unless one is there already); then the result is stored, so later sessions, the user's own first
 * project and a new `stateDir` never change it. `notice`: the upgrade notice is due now. Null without a state folder:
 * the check waits for a session that has one (until then the install reads as an upgrader, off).
 */
export async function upgradeCheck(rt: Runtime): Promise<{ kind: InstallKind; notice: boolean } | null> {
  const stored = await rt.port.storeGet(UPGRADE_KEY)
  if (isInstallKind(stored)) return { kind: stored, notice: false }
  if (!rt.stateRoot) return null
  const projects = await rt.port.listDirs(join(rt.stateRoot, 'projects')).catch(() => [])
  const kind = classifyInstall((await rt.port.storeGet('firstActivationShown')) === true, projects.length > 0)
  // auto.json first: if it cannot be written, the check is not recorded and runs again next session.
  if (kind === 'upgrader' && !(await rt.port.exists(pathOf(rt.stateRoot)))) await writeAuto(rt, { schemaVersion: AUTO_SCHEMA_VERSION, default: 'off', reason: 'upgraded from 0.2' })
  await rt.port.storeSet(UPGRADE_KEY, kind)
  return { kind, notice: kind === 'upgrader' }
}

/** `/jeeves off`: auto-start stays off for the rest of this session (kept in the store, so a reload keeps it too). */
export const setSessionOff = async (rt: Runtime) => rt.port.storeSet(sessionOffKey(await rt.port.sessionId()), true)

/** Whether auto-start applies in this session, and which level decided it (spec §5.5). */
export async function autoStartNow(rt: Runtime, row: AutoRow) {
  const [off, defaults, file, install] = await Promise.all([rt.port.sessionId().then(id => rt.port.storeGet(sessionOffKey(id))), readDefaults(rt), readAuto(rt), rt.port.storeGet(UPGRADE_KEY)])
  const r = resolveAutoStart({
    sessionOff: off === true, project: defaults.value?.autoStart, row, file: file.value?.default, fileUpgraded: file.value?.reason === 'upgraded from 0.2', install: isInstallKind(install) ? install : null,
  })
  return { ...r, fileError: file.error }
}

/** `/jeeves auto [on|off]`: shows the setting; on/off write only `auto.json` (never Claude settings), typed by the user. */
export async function autoCommand(rt: Runtime, rest: string, userTyped: boolean, row: AutoRow): Promise<string> {
  const arg = rest.trim().toLowerCase()
  if (arg === '') {
    const now = await autoStartNow(rt, row)
    return [MSG.autoState(now.on, now.source), ...(now.fileError ? [MSG.autoUnreadable(now.fileError)] : [])].join('\n')
  }
  if (arg !== 'on' && arg !== 'off') return MSG.autoUsage
  if (!userTyped) return MSG.userOnly
  if (!rt.stateRoot) return MSG.noProject(rt.stateRootError)
  await writeAuto(rt, { schemaVersion: AUTO_SCHEMA_VERSION, default: arg })
  return row === 'default' ? MSG.autoSaved(arg) : MSG.autoOverridden(row)
}
