// Shared helpers for the mod tests (not a *.test.ts, so the runner does not run it).
import type { On, PromptOrigin, SessionMeasureInput, ToolCallResult } from 'claude-code'
import { expect, test as kitTest } from 'claude-code/testing'
import type { Engine, TestBody, TestOptions } from 'claude-code/testing'
import { memHost, type MemHost } from './memfs.ts'
import { AUTO_START } from './mode.ts'

export type Kit = Engine

/** The kit's `test`, under the suite's `autoStart` row (mode.ts) unless the test sets the row itself. */
export function test(name: string, ...rest: [TestBody] | [TestOptions, TestBody]) {
  const [opts, body] = rest.length === 1 ? [{}, rest[0]] : rest
  kitTest(name, { ...opts, options: { autoStart: AUTO_START, ...opts.options } }, body)
}
export const start = ($: Kit) => $.session.start({ cwd: '/work/proj', surface: 'terminal', isInteractive: true })
export const typed = (args: string, kind: 'composer' | 'plugin' = 'composer') => ({
  command: 'jeeves', args, origin: (kind === 'composer' ? { kind } : { kind, name: 'other' }) as PromptOrigin, presentation: { isFullscreen: false, columns: 80 },
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

/** A git repository at /work/proj on `branch.name` (a box, so a test can switch it), one commit, nothing changed. */
export function fakeGit(h: MemHost, branch = { name: 'main' }) {
  const HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
  h.dirs.add('/work/proj/.git')
  h.git = args => {
    const a = args.join(' ')
    if (a === 'rev-parse --git-common-dir --show-toplevel') return { exitCode: 0, stdout: '/work/proj/.git\n/work/proj\n' }
    if (a.startsWith('status ')) return { exitCode: 0, stdout: `## ${branch.name}\0` }
    if (a === 'rev-parse --verify -q HEAD') return { exitCode: 0, stdout: `${HEAD}\n` }
    if (a.startsWith('diff ') || a.startsWith('cat-file ')) return { exitCode: 0, stdout: '' }
    return { exitCode: 1, stdout: '' }
  }
  return branch
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
    '## Current goal', '- [inferred] Finish operator precedence in the calculator.',
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
export async function generating($: Kit, on: Parameters<typeof memHost>[0], opts: { env?: Record<string, string>; readings?: number[]; viaTool?: boolean; git?: boolean; auto?: boolean } = {}) {
  const h = memHost(on, opts.env)
  const branch = opts.git || opts.auto ? fakeGit(h) : { name: 'main' }
  // `auto`: an eligible session (git, 1M at start) whose first typed prompt starts the task; needs the row autoStart on.
  if (opts.auto) h.usage = { window: 1_000_000 }
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
  if (!opts.auto) await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  // Past the 3-turn grace period, as a task some turns old.
  if (opts.auto) h.files.set(`${dir}/state.json`, JSON.stringify({ ...stateOf(h, dir), graceTurns: 3 }, null, 2) + '\n')
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
  return { h, dir, clears, prompts, ctl, refuse, branch, taskId: s.taskId as string, rotationId: s.rotation.rotationId as string }
}


// ---- Turn mode (ST-16.3, ST-16.4): no classic.Stop and no classic.SessionStart reach Jeeves ----

let turnNo = 0
/** One main turn that answers `answer`; no classic.Stop reaches Jeeves (the skip). */
export async function wholeTurn($: Kit, answer = 'ok', reason: 'answer' | 'aborted' = 'answer') {
  const turnId = `w${++turnNo}`
  await turnStart($, turnId)
  await $.turn.complete({ answer, durationMs: 1, isAborted: reason === 'aborted', turnId, reason })
}

/**
 * A turn-mode process whose task's boundary turn just ended: the request was submitted, state HANDOVER_GENERATING.
 * A plugin /clear does what the probe saw live: session.end(clear), then the new id, and no SessionStart;
 * `ask` false: stop before the boundary turn (`request()` runs it). `ctl.sameId` keeps the old id, `ctl.ids` names the fresh sessions in order.
 */
export async function turnGenerating($: Kit, on: Parameters<typeof memHost>[0], opts: { env?: Record<string, string>; ask?: boolean } = {}) {
  const h = memHost(on, opts.env)
  const prompts = bottom(on)
  const clears: string[] = []
  const ctl = { sameId: false, ids: ['sess-2', 'sess-3', 'sess-4'] }
  on('command.run', async ($e, e) => {
    clears.push(e.command)
    const from = h.sessionId
    await $.session.end({ reason: 'clear', sessionId: from, resume: { id: from } })
    if (!ctl.sameId) h.sessionId = ctl.ids.shift()!
    return { text: '' }
  })
  on('tool.call', (_, e) => ((e as { command?: string }).command === 'npm test'
    ? { isError: true, result: 'Exit code 1', text: 'Exit code 1' } : { result: {}, text: '' }) as ToolCallResult)
  for (const f of ['src/calc.js', 'src/parse.js', 'src/tokenize.js']) h.files.set(`${ROOT}/${f}`, '// code\n')
  await start($)
  await wholeTurn($)
  expect(await relay($, 'status')).toContain('mode: full (turn)')
  await relay($, 'on')
  await submit($, PROMPT)
  const dir = taskDirs(h)[0]!
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await until(h, () => stateOf(h, dir).ledger.length === 1)
  const g = { h, dir, prompts, clears, ctl, taskId: stateOf(h, dir).taskId as string, rotationId: '', request: async () => {
    await turnStart($, 'boundary')
    await $.session.measure({ context: { window: 1_000_000, percent: 52 }, rateLimits: [], changed: ['context'] } satisfies SessionMeasureInput)
    await $.turn.complete({ answer: 'step done', durationMs: 1, isAborted: false, turnId: 'boundary', reason: 'answer' })
    expect(stateOf(h, dir).status).toBe('HANDOVER_GENERATING')
    const asked = prompts.filter(p => p.text.includes('JEEVES-HANDOVER')).length
    await until(h, () => prompts.filter(p => p.text.includes('JEEVES-HANDOVER')).length > asked)
    g.rotationId = stateOf(h, dir).rotation.rotationId
  } }
  if (opts.ask !== false) await g.request()
  return g
}
