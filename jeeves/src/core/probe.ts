// Capability probe (ADR-002). Pure: the adapter gathers the facts.
import type { Mode } from './types.ts'

/** Oldest Claude Code version Jeeves is tested on (02 §9). */
export const MIN_VERSION = '2.1.319'

export const PRIMITIVES = ['command.run', 'prompt.submit', 'session.usage', 'process.run'] as const
export type Primitive = (typeof PRIMITIVES)[number]

export type ProbeFacts = {
  /** `$.session.version()`: `base` when present (dev builds), else `version`. */
  version: string | null
  primitives: Record<Primitive, boolean>
}

export const SUBMIT_REFUSED = 'Jeeves cannot ask for a handover in this session: its Stop hook does not run here and Claude Code refused a prompt Jeeves sent. Automatic rotation is off. See troubleshooting.'

/** Where a rotation is asked for: `classic.Stop`, or `turn.complete` once the Stop hook was seen skipped (ADR-002 A3). */
export type Boundary = 'stop' | 'turn'

export type Probe = { mode: Mode; version: string | null; missing: string[]; message: string | null; boundary: Boundary }

const core = (v: string) => /^(\d+)\.(\d+)\.(\d+)/.exec(v)?.slice(1).map(Number) ?? null

/** -1, 0, 1; null when either side is not x.y.z. */
export function compareVersions(a: string, b: string): number | null {
  const x = core(a), y = core(b)
  if (!x || !y) return null
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! < y[i]! ? -1 : 1
  return 0
}

export function probe(f: ProbeFacts): Probe {
  const cmp = f.version === null ? null : compareVersions(f.version, MIN_VERSION)
  if (cmp === null || cmp < 0) {
    const seen = f.version === null ? 'its version could not be read' : `this is ${f.version}`
    return {
      mode: 'unsupported', version: f.version, missing: [`Claude Code ${MIN_VERSION}+`],
      message: `Jeeves needs Claude Code ${MIN_VERSION} or later (${seen}). Automatic rotation is off. Update Claude Code (claude update) and restart the session.`,
      boundary: 'stop',
    }
  }
  const missing = PRIMITIVES.filter(p => !f.primitives[p]).map(p => `$.${p}`)
  if (missing.length) {
    return {
      mode: 'assisted', version: f.version, missing,
      message: `Jeeves is in assisted mode: this Claude Code lacks ${missing.join(', ')}. Handovers are saved, but you start the fresh session yourself.`,
      boundary: 'stop',
    }
  }
  return { mode: 'full', version: f.version, missing: [], message: null, boundary: 'stop' }
}

/** ADR-002 A3: the Stop hook is skipped (any cause), so the boundary moves to `turn.complete`; the mode stays. A version refusal stays. */
export function turnMode(p: Probe): Probe {
  return p.mode === 'unsupported' ? p : { ...p, boundary: 'turn' }
}

/** ADR-002 A3: in turn mode a refused `$.prompt.submit` leaves no way to ask for a handover: unsupported, not assisted. */
export function submitRefused(p: Probe): Probe {
  return p.boundary !== 'turn' || p.mode === 'unsupported' ? p : { mode: 'unsupported', version: p.version, missing: ['$.prompt.submit'], message: SUBMIT_REFUSED, boundary: 'turn' }
}
