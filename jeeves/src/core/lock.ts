// Lock timing rules (ADR-005). Pure.
import type { LockOwner } from './types.ts'

export const HEARTBEAT_MS = 30_000
export const STALE_MS = 120_000

/** Stale = no heartbeat for STALE_MS. An unreadable timestamp counts as stale. */
export function isStale(owner: Pick<LockOwner, 'heartbeatAt'>, nowMs: number, staleMs = STALE_MS): boolean {
  const beat = Date.parse(owner.heartbeatAt)
  return Number.isNaN(beat) || nowMs - beat > staleMs
}
