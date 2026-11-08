// ST-11.3: `/jeeves history --full`: per rotation, its sessions, context, cost, end reason and handover file with its
// first next actions. Plain ASCII, 50 columns. Reads only; a handover that is missing or changed is said, not printed.
import { HANDOVER_REF_RE } from '../core/handover/render.ts'
import { join } from '../core/paths.ts'
import { parseJson } from '../core/schema.ts'
import type { EventLine, State } from '../core/types.ts'
import type { Runtime } from './runtime.ts'
import { sha256Hex } from './storage.ts'
import { aggregate, statsLines } from '../core/stats.ts'

const COLS = 50
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, '?')
const cut = (s: string) => { const a = ascii(s); return a.length <= COLS ? a : `${a.slice(0, COLS - 3)}...` }
const pct = (p: number | null) => (p === null ? '?' : `${Math.round(p * 10) / 10}%`)

/** The first numbered lines under "## Exact next actions". */
function nextActions(text: string, max: number): string[] {
  const lines = text.split('\n')
  const at = lines.findIndex(l => l.trim() === '## Exact next actions')
  if (at < 0) return []
  const out: string[] = []
  for (const l of lines.slice(at + 1)) {
    if (l.startsWith('## ') || out.length === max) break
    if (/^\d+\.\s/.test(l.trim())) out.push(l.trim())
  }
  return out
}

const parseEvents = (lines: readonly string[]) => lines.flatMap(l => { try { return [JSON.parse(l) as EventLine] } catch { return [] } })

/** A task's session records in file order; `r` is null when a file could not be read. */
async function readSessions(rt: Runtime, dir: string) {
  const names = (await rt.port.listFiles(join(dir, 'sessions')).catch(() => [] as string[])).filter(f => /^\d{3,}\.json$/.test(f)).sort()
  return Promise.all(names.map(async f => ({ f, r: await rt.port.read(join(dir, 'sessions', f)).then(t => parseJson('session', t), () => null) })))
}

/** Each handover's SHA-256 and time from its VALIDATING > ROTATING event (v0.2), plus the latest from state.json (all v0.1 has). */
export function handoverHashes(s: State, events: readonly string[], at = new Map<string, string>()): Map<string, string> {
  const sha = new Map<string, string>()
  for (const e of parseEvents(events)) {
    const m = e.to === 'ROTATING' ? HANDOVER_REF_RE.exec(e.detail) : null
    if (m) { sha.set(m[1]!, m[2]!); at.set(m[1]!, e.at) }
  }
  const latest = s.lastValidatedHandover ? HANDOVER_REF_RE.exec(s.lastValidatedHandover) : null
  if (latest) sha.set(latest[1]!, latest[2]!)
  return sha
}

export async function fullHistory(rt: Runtime, dir: string, s: State, events: readonly string[]): Promise<string[]> {
  const rotatedAt = new Map<string, string>()
  const sha = handoverHashes(s, events, rotatedAt)
  // Handover files that exist or were recorded: a /jeeves recover counts in rotationCount but writes no handover.
  const onDisk = (await rt.port.listFiles(join(dir, 'history')).catch(() => [] as string[])).filter(f => /^handover-\d{3,}\.md$/.test(f)).map(f => `history/${f}`)
  const files = [...new Set([...onDisk, ...sha.keys()])].sort()
  if (!files.length) return ['', 'No handovers yet.']
  // Session records are written only when a rotation's /clear ends a session; pair each handover with the first one
  // that ended after it was saved (in order, for a v0.1 task whose events carry no refs).
  const recs = await readSessions(rt, dir)
  const used = new Set<string>()
  const out = ['', 'Handovers:']
  for (const file of files) {
    const t = rotatedAt.get(file)
    const pick = recs.find(x => !used.has(x.f) && (!t || (x.r?.ok && (x.r.value.endedAt ?? '') >= t)))
    out.push(`${file.replace('history/', '')}${pick ? ` (session ${Number(pick.f.slice(0, -5))})` : ''}`)
    if (pick) used.add(pick.f)
    if (pick?.r?.ok) {
      const r = pick.r.value
      out.push(`  context ${pct(r.startPct)} > ${pct(r.endPct)}, cost ${r.costUsd === undefined ? 'unknown' : `$${r.costUsd.toFixed(2)}`}`, `  ended: ${r.endReason ?? 'unknown'}`)
    } else out.push(`  session record: ${pick ? 'unreadable' : 'none'}`)
    const text = await rt.port.read(join(dir, file)).catch(() => null)
    const want = sha.get(file)
    if (text === null) out.push(`  ${file}: missing`)
    else if (want && (await sha256Hex(text)) !== want) out.push(`  ${file}: changed since saved`)
    else out.push(`  ${file}${want ? '' : ' (hash not recorded)'}`, ...nextActions(text, 2).map(a => `    ${a}`))
  }
  return out.map(cut)
}

/** ST-11.4: `/jeeves stats`, for this project and the task status shows. Reads only. */
export async function statsText(rt: Runtime, tasks: readonly { state: State; dir: string }[], unreadable: number, current: { state: State; dir: string } | null): Promise<string> {
  const files = await Promise.all(tasks.map(async t => {
    const [recs, events] = await Promise.all([readSessions(rt, t.dir), rt.storage.readEvents(t.dir).then(parseEvents)])
    return { dir: t.dir, files: { state: t.state, sessions: recs.flatMap(({ r }) => (r?.ok ? [r.value] : [])), events } }
  }))
  const cur = current ? files.find(f => f.dir === current.dir) : undefined
  return [
    ...statsLines('Jeeves stats, this project:', aggregate(files.map(f => f.files), unreadable)),
    ...(cur ? ['', ...statsLines(`Task ${cur.files.state.taskId}:`, aggregate([cur.files])).filter(l => !l.startsWith('Tasks:'))] : []),
  ].join('\n')
}
