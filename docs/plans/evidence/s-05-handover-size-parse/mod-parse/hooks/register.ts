import type { Register, EngineInterface } from 'claude-code'

let chain: Promise<void> = Promise.resolve()
function log($: EngineInterface, ev: string, data: Record<string, unknown> = {}) {
  chain = chain.then(() => logNow($, ev, data)).catch(() => {})
  return chain
}
async function logNow($: EngineInterface, ev: string, data: Record<string, unknown>) {
  const path = await $.env.get('SRSPIKE_LOG')
  if (!path) return
  let prev = ''
  try { prev = (await $.fs.read(path)) as string } catch {}
  const u = await $.session.usage().catch(() => null)
  const row = { t: await $.clock.now(), ev, sid: await $.session.id(), pct: u?.context.percent ?? null, usd: u?.cost?.usd ?? null, ...data }
  await $.fs.write(path, prev + JSON.stringify(row) + '\n')
}

const TASK = 't_20261107_spike0'
const HEADINGS = ['Completed since last handover', 'Decisions and constraints', 'Tests and checks', 'Open work and blockers', 'Exact next actions', 'Do not repeat / do not change']

// Draft of the ST-3.4 instruction (kept under 2,500 chars).
export function instruction(rotation: string) {
  return [
    'SessionRelay: this conversation will be replaced by a fresh one to free context. Write a handover so the next conversation can continue the task without repeating work.',
    'Rules: do not run any new tool or command now; summarise only. Never include secrets, tokens, passwords or .env contents. SessionRelay already records git status, branch, HEAD, edited files and command exit codes, so do not restate raw diffs.',
    'Reply with exactly one block in this exact format, nothing inside it but the six sections, at most 12000 characters:',
    '',
    `<<<SESSIONRELAY-HANDOVER v1 task=${TASK} rotation=${rotation}`,
    ...HEADINGS.flatMap(h => [`## ${h}`, h === 'Exact next actions' ? '1. [inferred] <first concrete step>' : '- [verified] <fact you checked> / [inferred] <your conclusion> / [unknown] <open question>']),
    'SESSIONRELAY-HANDOVER>>>',
    '',
    'Every bullet starts with one tag: [verified] (you saw it in tool output this session), [inferred], or [unknown]. Every section has at least one bullet; write "- [verified] none" if empty. "Exact next actions" is a numbered list with at least one item. Copy the first and last line of the block exactly.',
  ].join('\n')
}

// Throwaway tolerant parser; returns the list of problems (empty = parsed).
export function parse(text: string, rotation: string): { errors: string[]; untagged: number } {
  const t = text.replace(/\r\n/g, '\n')
  const re = /<<<SESSIONRELAY-HANDOVER v1 task=(\S+) rotation=(\S+)[^\n]*\n([\s\S]*?)\n\s*SESSIONRELAY-HANDOVER>>>/g
  const blocks = [...t.matchAll(re)]
  if (blocks.length !== 1) return { errors: [`expected exactly one handover block, found ${blocks.length}`], untagged: 0 }
  const [, task, rot, body] = blocks[0]
  const errors: string[] = []
  if (task !== TASK) errors.push(`task id is ${task}, expected ${TASK}`)
  if (rot !== rotation) errors.push(`rotation id is ${rot}, expected ${rotation}`)
  if (body.length > 12000) errors.push(`block is ${body.length} chars, limit 12000`)
  const parts = body.split(/^\s*##\s+/m).slice(1)
  const sections = new Map(parts.map(p => { const nl = p.indexOf('\n'); return [p.slice(0, nl < 0 ? undefined : nl).trim().toLowerCase(), nl < 0 ? '' : p.slice(nl + 1).trim()] as const }))
  let untagged = 0
  for (const h of HEADINGS) {
    const s = sections.get(h.toLowerCase())
    if (s === undefined) { errors.push(`missing section "## ${h}"`); continue }
    if (!s) { errors.push(`section "## ${h}" is empty`); continue }
    const items = s.split('\n').filter(l => /^\s*([-*]|\d+[.)])\s+/.test(l))
    if (!items.length) errors.push(`section "## ${h}" has no bullet`)
    untagged += items.filter(l => !/\[(verified|inferred|unknown)\]/i.test(l)).length
    if (h === 'Exact next actions' && !/^\s*\d+[.)]\s+\S/m.test(s)) errors.push('"## Exact next actions" needs a numbered item')
  }
  if (untagged) errors.push(`${untagged} bullet(s) lack a [verified]/[inferred]/[unknown] tag`)
  return { errors, untagged }
}

let trial = 0, phase: 'idle' | 'work' | 'handover' = 'idle', attempt = 0

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await log($, 'session.start', { surface: e.surface })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' && !e.command) { trial++; phase = 'work'; attempt = 0; await log($, 'trial.start', { trial }) }
    return next(e)
  })

  on('classic.Stop', async ($, e, next) => {
    const rotation = `r_${String(trial).padStart(3, '0')}`
    if (phase === 'work') {
      phase = 'handover'
      await log($, 'handover.requested', { trial, instructionChars: instruction(rotation).length })
      return { block: instruction(rotation) }
    }
    if (phase === 'handover') {
      attempt++
      const msg = e.last_assistant_message ?? ''
      const { errors, untagged } = parse(msg, rotation)
      await log($, 'handover.attempt', { trial, attempt, ok: errors.length === 0, errors, untagged, chars: msg.length, text: msg.slice(0, 12000) })
      if (errors.length && attempt <= 2) return { block: `SessionRelay: the handover is invalid: ${errors.join('; ')}. Reply again with one corrected block in the exact format.` }
      phase = 'idle'
      await log($, 'trial.result', { trial, firstTry: attempt === 1 && errors.length === 0, okWithin2Retries: errors.length === 0, attempts: attempt })
    }
    return next(e)
  })
}
