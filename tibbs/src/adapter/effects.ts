// Executes core effects (02 §3). Effects whose answer belongs to a hook (block a Stop, inject context, ...)
// are handed back to that hook as `forHook`; the stories that add those hooks (M3, M4) consume them.
import type { Effect, Input } from '../core/machine.ts'
import { join } from '../core/paths.ts'
import type { State } from '../core/types.ts'
import type { EnginePort } from './ports.ts'
import type { Storage } from './storage.ts'

export type EffectResult = {
  /** Effects the calling hook must turn into its own answer. */
  forHook: Effect[]
  /** Inputs to feed back into the reducer. */
  followUps: Input[]
  /** Effects that failed, with why; the caller logs them (an effect failure never throws into a hook). */
  failed: { effect: Effect; error: string }[]
}

// RUN_CLEAR and SUBMIT_NUDGE wait for the hook to return (a turn.complete hook holds the turn), so the caller schedules them.
const HOOK_BOUND = new Set<Effect['type']>(['BLOCK_STOP', 'INJECT_CONTEXT', 'CAPTURE_FACTS', 'PERSIST_HANDOVER', 'APPEND_NOTE', 'SUBMIT_CONTINUATION', 'SUBMIT_HELD', 'RUN_CLEAR', 'SUBMIT_NUDGE'])

/** Run effects in order. `state` is the state after the transition (already persisted by the caller). */
export async function runEffects(effects: Effect[], deps: { port: EnginePort; storage: Storage; taskDir: string; state: State }): Promise<EffectResult> {
  const out: EffectResult = { forHook: [], followUps: [], failed: [] }
  const { port, storage, taskDir, state } = deps
  for (const effect of effects) {
    if (HOOK_BOUND.has(effect.type)) { out.forHook.push(effect); continue }
    try {
      switch (effect.type) {
        case 'LOG_EVENT':
          await storage.appendEvent(taskDir, {
            v: 1, at: state.updatedAt, taskId: state.taskId, rotationId: effect.rotationId,
            from: effect.from, to: effect.to, code: effect.code, pct: state.lastContext?.percent ?? null,
            sessionId: state.activeSessionId, detail: effect.detail,
          })
          break
        case 'TOAST':
          port.toast(effect.text)
          break
        case 'RELEASE_LOCK':
          if (state.activeSessionId) await storage.releaseLock(taskDir, state.activeSessionId)
          break
        case 'WRITE_SESSION':
          await storage.writeImmutable(join(taskDir, `sessions/${String(effect.n).padStart(3, '0')}.json`), JSON.stringify(effect.record, null, 2) + '\n')
          break
        case 'TRANSFER_LOCK':
          if (effect.from && !(await storage.transferLock(taskDir, effect.from, effect.to, state.updatedAt))) throw new Error(`lock not owned by ${effect.from}`)
          break
      }
    } catch (err) {
      out.failed.push({ effect, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return out
}
