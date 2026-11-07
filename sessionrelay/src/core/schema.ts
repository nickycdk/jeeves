// Runtime guards and migrations for every persisted contract (02 §6). Hand-written: no runtime deps (ADR-008).
import {
  LEDGER_COMMAND_MAX, LEDGER_MAX, MODES, REASON_CODES, ROTATION_STATES, ROTATION_STEPS, SCHEMA_VERSION, STATUSES, TRIGGERS,
  type CommandEntry, type Config, type EditEntry, type EventLine, type LockOwner, type ProjectRecord, type SessionRecord, type State,
} from './types.ts'

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[]; code?: 'SCHEMA_TOO_NEW' }

type Guard = (v: unknown, path: string, errs: string[]) => void
type Field = Guard | { optional: Guard }
type Shape<T> = { [K in keyof T]-?: Field }

const typeName = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)
const fail = (errs: string[], path: string, want: string, v: unknown) => errs.push(`${path || "(root)"}: expected ${want}, got ${typeName(v)}`)

const str = (opts: { nonEmpty?: boolean; max?: number } = {}): Guard => (v, p, e) => {
  if (typeof v !== 'string') return void fail(e, p, 'string', v)
  if (opts.nonEmpty && v.length === 0) e.push(`${p}: must not be empty`)
  if (opts.max !== undefined && v.length > opts.max) e.push(`${p}: longer than ${opts.max} characters`)
}
const int = (min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): Guard => (v, p, e) => {
  if (typeof v !== 'number' || !Number.isInteger(v)) return void fail(e, p, 'integer', v)
  if (v < min || v > max) e.push(`${p}: ${v} is outside ${min}..${max}`)
}
const num = (min: number, max: number): Guard => (v, p, e) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return void fail(e, p, 'number', v)
  if (v < min || v > max) e.push(`${p}: ${v} is outside ${min}..${max}`)
}
const bool: Guard = (v, p, e) => { if (typeof v !== 'boolean') fail(e, p, 'boolean', v) }
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const iso: Guard = (v, p, e) => {
  if (typeof v !== 'string') return void fail(e, p, 'ISO timestamp string', v)
  if (!ISO_RE.test(v) || Number.isNaN(Date.parse(v))) e.push(`${p}: "${v.slice(0, 40)}" is not an ISO UTC timestamp`)
}
const oneOf = (list: readonly string[]): Guard => (v, p, e) => {
  if (typeof v !== 'string' || !list.includes(v)) e.push(`${p}: expected one of ${list.join('|')}, got ${typeof v === 'string' ? `"${v.slice(0, 40)}"` : typeName(v)}`)
}
const nullable = (g: Guard): Guard => (v, p, e) => { if (v !== null) g(v, p, e) }
const arr = (g: Guard, max = 10_000): Guard => (v, p, e) => {
  if (!Array.isArray(v)) return void fail(e, p, 'array', v)
  if (v.length > max) e.push(`${p}: more than ${max} items`)
  v.forEach((x, i) => g(x, `${p}[${i}]`, e))
}
const obj = <T>(shape: Shape<T>): Guard => (v, p, e) => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return void fail(e, p, 'object', v)
  const rec = v as Record<string, unknown>
  for (const [k, f] of Object.entries(shape) as [string, Field][]) {
    const path = p ? `${p}.${k}` : k
    if (typeof f === 'function') {
      if (!(k in rec)) e.push(`${path}: missing`)
      else f(rec[k], path, e)
    } else if (k in rec) f.optional(rec[k], path, e)
  }
  for (const k of Object.keys(rec)) if (!(k in shape)) e.push(`${p ? `${p}.` : ''}${k}: unknown field`)
}
const ver: Guard = int(1, SCHEMA_VERSION)

const contextReading = obj<NonNullable<State['lastContext']>>({
  percent: { optional: num(0, 100) }, tokens: { optional: int(0) }, window: int(0), at: iso,
})
const rotation = obj<NonNullable<State['rotation']>>({
  rotationId: str({ nonEmpty: true, max: 100 }), trigger: oneOf(TRIGGERS), requestedAt: iso,
  sourceSessionId: nullable(str({ nonEmpty: true })), targetSessionId: nullable(str({ nonEmpty: true })),
  step: oneOf(ROTATION_STEPS), retries: int(0, 100), quiesceCount: int(0), noteAppended: bool,
})
const reason = nullable(oneOf(REASON_CODES))
const cmdEntry = obj<CommandEntry>({
  kind: oneOf(['cmd']), command: str({ max: LEDGER_COMMAND_MAX }), ok: bool, exit: nullable(int()), at: iso, agent: nullable(str()),
})
const editEntry = obj<EditEntry>({ kind: oneOf(['edit']), path: str({ nonEmpty: true, max: 4096 }), at: iso, agent: nullable(str()) })
const ledgerEntry: Guard = (v, p, e) => {
  const kind = typeof v === 'object' && v !== null ? (v as { kind?: unknown }).kind : undefined
  ;(kind === 'edit' ? editEntry : cmdEntry)(v, p, e)
}

const stateShape = obj<State>({
  schemaVersion: ver, taskId: str({ nonEmpty: true, max: 100 }), projectId: str({ nonEmpty: true, max: 100 }),
  status: oneOf(STATUSES), reason, mode: oneOf(MODES), taskRevision: int(0), sessionSequence: int(0),
  activeSessionId: nullable(str({ nonEmpty: true })), rotation: nullable(rotation),
  lastValidatedHandover: nullable(str({ nonEmpty: true })), rotationCount: int(0), consecutiveFailures: int(0),
  thresholdPercent: int(20, 90), lastContext: nullable(contextReading), armedFired: bool,
  warnedSessionId: nullable(str()), heldPrompts: arr(str({ max: 100_000 }), 50), pauseRequested: bool, taskStartHead: nullable(str()),
  lastErrorCode: reason, ledger: arr(ledgerEntry, LEDGER_MAX), updatedAt: iso,
})
const state: Guard = (v, p, e) => {
  const before = e.length
  stateShape(v, p, e)
  if (e.length > before) return
  const s = v as State
  if (ROTATION_STATES.includes(s.status) && s.rotation === null) e.push(`rotation: required while status is ${s.status}`)
}

const config = obj<Config>({
  schemaVersion: ver, thresholdPercent: int(20, 90), warnBeforePercent: int(1, 20),
  maxRotationsPerTask: int(1, 1000), maxHandoverRetries: int(0, 5), maxConsecutiveFailures: int(1, 100),
  quiesceMaxTurns: int(1, 100), quiesceMaxMinutes: int(1, 1440), autoRecover: bool,
  handoverMaxChars: int(1000, 100_000), verificationCommands: arr(str({ nonEmpty: true, max: 2000 }), 50),
})
const project = obj<ProjectRecord>({ schemaVersion: ver, repoRoot: str({ nonEmpty: true }), worktree: str({ nonEmpty: true }), createdAt: iso })
const session = obj<SessionRecord>({
  schemaVersion: ver, sessionId: str({ nonEmpty: true }), startedAt: iso, endedAt: nullable(iso),
  endReason: nullable(str({ max: 100 })), startPct: nullable(num(0, 100)), endPct: nullable(num(0, 100)),
})
const lock = obj<LockOwner>({ schemaVersion: ver, ownerSessionId: str({ nonEmpty: true }), acquiredAt: iso, heartbeatAt: iso })
const event = obj<EventLine>({
  v: ver, at: iso, taskId: str({ nonEmpty: true }), rotationId: nullable(str()), from: nullable(oneOf(STATUSES)),
  to: nullable(oneOf(STATUSES)), code: reason, pct: nullable(num(0, 100)), sessionId: nullable(str()),
  detail: str({ max: 2000 }),
})

export type Kinds = { state: State; config: Config; project: ProjectRecord; session: SessionRecord; lock: LockOwner; event: EventLine }
export type Kind = keyof Kinds
const GUARDS: { [K in Kind]: Guard } = { state, config, project, session, lock, event }
const VERSION_FIELD: { [K in Kind]: string } = { state: 'schemaVersion', config: 'schemaVersion', project: 'schemaVersion', session: 'schemaVersion', lock: 'schemaVersion', event: 'v' }

type Migration = (old: Record<string, unknown>) => Record<string, unknown>
/** MIGRATIONS[kind][n - 1] turns version n into n + 1. Empty until schema v2 exists. */
export const MIGRATIONS: { [K in Kind]: Migration[] } = { state: [], config: [], project: [], session: [], lock: [], event: [] }

/** Validate an already-current value. */
export function check<K extends Kind>(kind: K, v: unknown): Result<Kinds[K]> {
  const errors: string[] = []
  GUARDS[kind](v, '', errors)
  return errors.length ? { ok: false, errors } : { ok: true, value: v as Kinds[K] }
}

/** Run the migration steps from the value's version to the newest. Exported for tests. */
export function applyMigrations(v: unknown, field: string, migrations: Migration[]): Result<Record<string, unknown>> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return { ok: false, errors: [`expected object, got ${typeName(v)}`] }
  let cur = v as Record<string, unknown>
  const version = cur[field]
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, errors: [`${field}: missing or not a positive integer`] }
  const target = migrations.length + 1
  if (version > target) return { ok: false, code: 'SCHEMA_TOO_NEW', errors: [`${field}: version ${version} is newer than this SessionRelay supports (${target}); update SessionRelay`] }
  for (let n = version; n < target; n++) cur = { ...migrations[n - 1]!(cur), [field]: n + 1 }
  return { ok: true, value: cur }
}

/** Bring a parsed value of any known version to the current one, then validate it. */
export function migrate<K extends Kind>(kind: K, v: unknown): Result<Kinds[K]> {
  const r = applyMigrations(v, VERSION_FIELD[kind], MIGRATIONS[kind])
  return r.ok ? check(kind, r.value) : r
}

export function parseJson<K extends Kind>(kind: K, text: string): Result<Kinds[K]> {
  let v: unknown
  try { v = JSON.parse(text) } catch (err) { return { ok: false, errors: [`not valid JSON: ${(err as Error).message.slice(0, 120)}`] } }
  return migrate(kind, v)
}
