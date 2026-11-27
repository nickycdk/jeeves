// The task's plan: the steps Claude lists in a JEEVES-PLAN block and ticks off with JEEVES-PROGRESS. Jeeves keeps the
// list in state so it outlives handovers, and shows "X/Y tasks done". Display only: it never decides completion. Pure.
import { PLAN_MAX, PLAN_STEP_MAX, type PlanStep } from './types.ts'

export const PLAN_OPEN = '<<<JEEVES-PLAN'
export const PLAN_CLOSE = 'JEEVES-PLAN>>>'
const OPEN_RE = /^\s*(?:`{3,}\w*\s*)?<<<\s*JEEVES-PLAN\s*$/i
const CLOSE_RE = /^\s*JEEVES-PLAN\s*>>>/i
const STEP_RE = /^(\s*)(\d+[.)]|[-*•+])\s+(?:\[[ xX]\]\s+)?(.*\S)\s*$/
const PROGRESS_RE = /<<<\s*JEEVES-PROGRESS\s+done\s*=\s*([\d\s,]+?)\s*>>>/gi

/** The steps of the last closed JEEVES-PLAN block in a message (a revised plan wins); null when there is none. */
export function parsePlan(text: string): string[] | null {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  let found: string[] | null = null
  for (let i = 0; i < lines.length; i++) {
    if (!OPEN_RE.test(lines[i]!)) continue
    const end = lines.findIndex((l, j) => j > i && CLOSE_RE.test(l))
    if (end < 0) break
    // Only items like the first step (same indent, numbered or bulleted alike) are steps: a sub-bullet would shift
    // every step number Claude reports.
    const items = lines.slice(i + 1, end).flatMap(l => {
      const m = STEP_RE.exec(l)
      return m ? [{ like: `${m[1]!.length}:${/\d/.test(m[2]!)}`, text: m[3]! }] : []
    })
    const steps = items.filter(s => s.like === items[0]?.like).map(s => s.text.slice(0, PLAN_STEP_MAX))
    if (steps.length) found = steps.slice(0, PLAN_MAX)
    i = end
  }
  return found
}

/** Every step number named by the message's JEEVES-PROGRESS markers, 1-based, ascending, without repeats. */
export function parseProgress(text: string): number[] {
  const done = new Set<number>()
  for (const m of String(text).matchAll(PROGRESS_RE)) {
    for (const n of m[1]!.split(/[\s,]+/)) if (/^\d+$/.test(n) && Number(n) >= 1) done.add(Number(n))
  }
  return [...done].sort((a, b) => a - b)
}

const same = (a: string) => a.trim().toLowerCase().replace(/\s+/g, ' ')

/** A new plan replaces the old one; a step with the same text keeps its tick. Then the named steps are ticked. */
export function applyPlan(old: readonly PlanStep[] | undefined, steps: readonly string[] | null, done: readonly number[]): PlanStep[] | undefined {
  const base = steps ? steps.map(text => ({ text, done: (old ?? []).some(o => o.done && same(o.text) === same(text)) })) : old?.map(s => ({ ...s }))
  if (!base) return undefined
  for (const n of done) if (base[n - 1]) base[n - 1]!.done = true
  return base
}

/** "3/7 tasks done", or null without a plan. */
export const planText = (plan: readonly PlanStep[] | undefined) =>
  plan?.length ? `${plan.filter(s => s.done).length}/${plan.length} tasks done` : null

/** The plan for a fresh conversation, ticks included; null without a plan. */
export const planList = (plan: readonly PlanStep[] | undefined) =>
  plan?.length ? plan.map((s, i) => `${i + 1}. [${s.done ? 'x' : ' '}] ${s.text}`) : null
