// Shared helpers for the mod tests (not a *.test.ts, so the runner does not run it).
import type { On, PromptOrigin, SessionMeasureInput, ToolCallResult } from 'claude-code'
import { expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { memHost, type MemHost } from './memfs.ts'

export type Kit = Engine
export const start = ($: Kit) => $.session.start({ cwd: '/work/proj', surface: 'terminal', isInteractive: true })
export const typed = (args: string, kind: 'composer' | 'plugin' = 'composer') => ({
  command: 'relay', args, origin: (kind === 'composer' ? { kind } : { kind, name: 'other' }) as PromptOrigin, presentation: { isFullscreen: false, columns: 80 },
})
export const relay = async ($: Kit, args: string, kind: 'composer' | 'plugin' = 'composer') => (await $.command.run(typed(args, kind))).text ?? ''
export const submit = ($: Kit, text: string, origin: PromptOrigin = { kind: 'composer' }, command?: { name: string; args: string }) =>
  $.prompt.submit({ text, origin, wait: false, ...(command ? { command } : {}) })

/** Task folders the host holds, with what is in them. */
export const taskDirs = (h: MemHost) => [...new Set([...h.files.keys()].filter(f => f.includes('/tasks/')).map(f => f.replace(/(\/tasks\/[^/]+)\/.*$/, '$1')))]
export const stateOf = (h: MemHost, dir: string) => JSON.parse(h.files.get(`${dir}/state.json`)!)
/** Every prompt that reached the engine beneath the plugin, with its origin. */
/** `ctl.drop`: a prompt the engine refuses (a test of a rejected submit). */
export const bottom = (on: On, ctl: { drop?: (text: string) => boolean } = {}) => {
  const got: { text: string; origin: string }[] = []
  on('prompt.submit', (_, e) => {
    if (ctl.drop?.(e.text)) return { drop: 'refused in this test' }
    got.push({ text: e.text, origin: e.origin.kind })
    return { text: e.text }
  })
  return got
}

/** A main-loop turn opening and ending, as the engine raises them. */
export const turnStart = ($: Kit, turnId = 't1') => $.turn.start({ text: 'x', turnId })
export const turnEnd = ($: Kit, reason: 'answer' | 'aborted' = 'answer', turnId = 't1') =>
  $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: reason === 'aborted', turnId, reason })

/** What /clear does in 2.1.319 (S-04): session.end(clear) for the old id, then SessionStart(clear) under the new one. */
export async function engineClear($: Kit, h: MemHost, to: string) {
  const from = h.sessionId
  await $.session.end({ reason: 'clear', sessionId: from, resume: { id: from } })
  h.sessionId = to
  return $.classic.SessionStart({ source: 'clear', session_id: to })
}

export const PROMPT = 'Build the parser.\n\n  - keep CRLF?\r\n  - emoji: 🚀 ✅ — ÆØÅ  \n\ttrailing tab\t'


/** Settle the mock clock until `ready()` holds (work a timer started runs past one settle). Gives up after 1000 rounds (load). */
export async function until(h: MemHost, ready: () => boolean): Promise<void> {
  for (let i = 0; i < 1000 && !ready(); i++) await h.clock.settle()
}

// ---- A task at the handover Stop (ST-3.8), shared by the handover and rotation tests ----

export const ROOT = '/work/proj'
/** A handover in the instruction's format; `over` replaces lines of it. */
export function handover(taskId: string, rotationId: string, over: Record<string, string> = {}) {
  let t = [
    `<<<JEEVES-HANDOVER v1 task=${taskId} rotation=${rotationId}`,
    '## Completed since last handover', '- [verified] Added `sub` to `src/calc.js`.',
    '## Decisions and constraints', '- [inferred] Keep zero dependencies.',
    '## Tests and checks', '- [verified] `npm test` fails: 2 cases.',
    '## Open work and blockers', '- [unknown] Whether unary minus is in scope.',
    '## Exact next actions', '1. [inferred] Fix precedence in `src/parse.js`.',
    '## Do not repeat / do not change', '- [verified] Do not touch `src/tokenize.js`.',
    'JEEVES-HANDOVER>>>',
  ].join('\n')
  for (const [from, to] of Object.entries(over)) t = t.replace(from, to)
  return t
}
export const sha256 = async (t: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join('')
export const stop = ($: Kit, message: string) => $.classic.Stop({ stop_hook_active: true, last_assistant_message: message, background_tasks: [], session_crons: [] })

/** A task whose handover was just requested: the safe Stop already answered with the instruction. */
/** `viaTool`: each reading comes at a main-loop tool result (as live, after a model call) instead of session.measure. */
export async function generating($: Kit, on: Parameters<typeof memHost>[0], opts: { env?: Record<string, string>; readings?: number[]; viaTool?: boolean } = {}) {
  const h = memHost(on, opts.env)
  const refuse: { drop?: (text: string) => boolean } = {}
  const prompts = bottom(on, refuse)
  const clears: string[] = []
  /** `onClear`: what the engine does while /clear runs (session.end, the fresh SessionStart), before it resolves. */
  const ctl: { rejectClear: boolean; onClear: (() => Promise<void>) | null } = { rejectClear: false, onClear: null }
  on('command.run', async (_, e) => {
    if (ctl.rejectClear) throw new Error('clear is not allowed here')
    clears.push(e.command)
    await ctl.onClear?.()
    return { text: '' }
  })
  on('tool.call', (_, e) => (((e as { command?: string }).command ?? '').startsWith('npm test')
    ? { isError: true, result: 'Exit code 1', text: 'Exit code 1' } : { result: { stdout: '', stderr: '', interrupted: false }, text: '' }) as ToolCallResult)
  for (const f of ['src/calc.js', 'src/parse.js', 'src/tokenize.js']) h.files.set(`${ROOT}/${f}`, '// code\n')
  await start($)
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await until(h, () => stateOf(h, dir).ledger.length === 1)
  // The reading comes mid-turn, so that turn's Stop asks (no nudge); tests end the turn with turnEnd.
  await turnStart($)
  for (const percent of opts.readings ?? [52]) {
    if (!opts.viaTool) { await $.session.measure({ context: { window: 1_000_000, percent }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput); continue }
    h.usage = { window: 1_000_000, percent }
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    await until(h, () => stateOf(h, dir).lastContext?.percent === percent)
  }
  const ask = await $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'step done', background_tasks: [], session_crons: [] })
  expect(ask.block).toContain('JEEVES-HANDOVER')
  const s = stateOf(h, dir)
  expect(s.status).toBe('HANDOVER_GENERATING')
  return { h, dir, clears, prompts, ctl, refuse, taskId: s.taskId as string, rotationId: s.rotation.rotationId as string }
}

