// v0.3 (ST-13.1, spec §5.5–5.6): `<stateRoot>/auto.json`, auto-start everywhere. Never Claude settings.
import { join } from '../core/paths.ts'
import { check, parseJson } from '../core/schema.ts'
import type { AutoFile } from '../core/types.ts'
import type { Runtime } from './runtime.ts'

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
