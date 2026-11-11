// ST-11.4 (FR-11, R-15): `/jeeves stats` figures from the task files. Pure. Says "context cleared", never "tokens
// saved" (claims policy, 08 §7); an unknown cost stays unknown, never 0.
import type { EventLine, ReasonCode, SessionRecord, State } from './types.ts'

export type TaskFiles = { state: State; sessions: SessionRecord[]; events: EventLine[] }

export type Stats = {
  tasks: number
  unreadable: number
  rotations: number
  sessions: number
  /** Mean context of the sessions a rotation ended (`endReason` clear), or null with none. */
  avgAtRotation: number | null
  /** Context points freed by rotations: a session's end minus the next one's start, where both are known. */
  clearedPoints: number
  /** The same in tokens, when every counted rotation's task recorded its window; else null. */
  clearedTokens: number | null
  costUsd: number
  costKnown: number
  costUnknown: number
  failures: [ReasonCode, number][]
}

const STOPS = new Set(['NEEDS_REVIEW', 'FAILED', 'PAUSED', 'BLOCKED'])

export function aggregate(tasks: readonly TaskFiles[], unreadable = 0): Stats {
  let rotations = 0, sessions = 0, atRotation = 0, atRotationN = 0, points = 0, tokens: number | null = 0, cost = 0, known = 0, unknown = 0
  const failures = new Map<ReasonCode, number>()
  for (const t of tasks) {
    // A /jeeves recover also passes RESTORING (code STALE_LOCK) but is not a rotation.
    rotations += t.events.filter(e => e.to === 'RESTORING' && e.from !== e.to && e.code !== 'STALE_LOCK').length
    sessions += t.sessions.length
    const bySeq = [...t.sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    const window = t.state.lastContext?.window || 0
    bySeq.forEach((s, i) => {
      if (s.costUsd === undefined) unknown++
      else { cost += s.costUsd; known++ }
      if (s.endReason !== 'clear' || s.endPct === null) return
      atRotation += s.endPct
      atRotationN++
      const next = bySeq[i + 1]
      if (next?.startPct == null) return
      const freed = Math.max(0, s.endPct - next.startPct)
      points += freed
      tokens = tokens !== null && window > 0 ? tokens + (freed * window) / 100 : null
    })
    for (const e of t.events) {
      if (e.from === e.to || !e.to || !STOPS.has(e.to) || !e.code || e.code.startsWith('USER_')) continue
      failures.set(e.code, (failures.get(e.code) ?? 0) + 1)
    }
  }
  return {
    tasks: tasks.length, unreadable, rotations, sessions, avgAtRotation: atRotationN ? atRotation / atRotationN : null,
    clearedPoints: points, clearedTokens: points > 0 ? tokens : null, costUsd: cost, costKnown: known, costUnknown: unknown,
    failures: [...failures].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  }
}

const k = (n: number) => (n >= 1000 ? `~${Math.round(n / 1000)}K` : `~${Math.round(n)}`)
const one = (n: number) => `${Math.round(n * 10) / 10}`

/** Wall time as `<1m`, `45m`, `3h 20m` or `2d 4h`. */
export function duration(ms: number): string {
  const m = Math.floor(ms / 60_000), h = Math.floor(m / 60), d = Math.floor(h / 24)
  if (d) return `${d}d ${h % 24}h`
  if (h) return `${h}h ${m % 60}m`
  return m ? `${m}m` : '<1m'
}

export type CompletionInput = TaskFiles & {
  /** The live conversation's cost; it has no session record until it ends. */
  liveCostUsd: number | null
  /** Commits since the task started; null when git could not say. */
  commits: number | null
  how: 'checks' | 'user'
  checks: number
  now: number
}

/** The completion summary (plan 12): what the task took, in one or two transcript lines. */
export function completionSummary(c: CompletionInput): string[] {
  const s = aggregate([c])
  const start = [c.events[0]?.at, ...c.sessions.map(x => x.startedAt), c.state.sessionStart?.at].filter(x => x !== undefined).sort()[0]
  const n = c.state.rotationCount
  const parts = [
    n ? `${n} handover${n === 1 ? '' : 's'}` : 'no handovers',
    ...(c.commits === null ? [] : [`${c.commits} commit${c.commits === 1 ? '' : 's'}`]),
    c.how === 'checks' ? `${c.checks}/${c.checks} checks passed` : c.checks ? 'confirmed by you' : 'no checks set, confirmed by you',
  ]
  const lines = [`Jeeves: task completed${start ? ` in ${duration(c.now - Date.parse(start))}` : ''}: ${parts.join(', ')}.`]
  const known = s.costKnown + (c.liveCostUsd === null ? 0 : 1), unknown = s.costUnknown + (c.liveCostUsd === null ? 1 : 0)
  const second = [
    ...(s.clearedPoints > 0 ? [`context cleared ${one(s.clearedPoints)} points${s.clearedTokens !== null ? ` (${k(s.clearedTokens)} tokens)` : ''}.`] : []),
    ...(known ? [`Cost: $${(s.costUsd + (c.liveCostUsd ?? 0)).toFixed(2)}${unknown ? ` (${unknown} session${unknown === 1 ? '' : 's'} unknown)` : ''}.`] : []),
  ]
  if (second.length) lines.push(`Jeeves: ${second.join(' ')}`)
  return lines
}

export function statsLines(title: string, s: Stats): string[] {
  return [
    title,
    `Tasks: ${s.tasks}${s.unreadable ? ` (${s.unreadable} unreadable, not counted)` : ''}`,
    `Rotations: ${s.rotations}  Sessions: ${s.sessions}`,
    `Avg context at rotation: ${s.avgAtRotation === null ? 'none yet' : `${one(s.avgAtRotation)}%`}`,
    `Context cleared: ${one(s.clearedPoints)} points${s.clearedTokens !== null ? ` (${k(s.clearedTokens)} tokens)` : ''}`,
    `Cost: ${s.costKnown ? `$${s.costUsd.toFixed(2)} over ${s.costKnown} session(s)` : 'unknown'}${s.costKnown && s.costUnknown ? `, ${s.costUnknown} unknown` : ''}`,
    `Failures: ${s.failures.length ? s.failures.map(([c, n]) => `${c} ${n}`).join(', ') : 'none'}`,
  ]
}
