// ST-13.8 (spec §5.9): which ended auto tasks the session-start cleanup deletes. Pure.
import type { State } from './types.ts'

export const CLEANUP_AGE_MS = 7 * 24 * 60 * 60_000

/**
 * An auto task that ended (DISABLED or COMPLETED, or MONITORING with no live lock) without a single rotation or
 * handover, last updated at least 7 days before `now`. Never an explicit task.
 */
export function expired(s: State, now: number, lockLive: boolean): boolean {
  if (s.origin !== 'auto' || s.rotationCount > 0 || s.lastValidatedHandover !== null) return false
  const ended = s.status === 'DISABLED' || s.status === 'COMPLETED' || (s.status === 'MONITORING' && !lockLive)
  const updated = Date.parse(s.updatedAt)
  return ended && !Number.isNaN(updated) && now - updated >= CLEANUP_AGE_MS
}
