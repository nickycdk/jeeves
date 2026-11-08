// ST-11.3: `/jeeves history --full`: per rotation, its sessions, context, cost, end reason and handover file with its
// first next actions. Plain ASCII, 50 columns. Reads only; a handover that is missing or changed is said, not printed.
import { HANDOVER_REF_RE, handoverFile } from '../core/handover/render.ts'
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
export const sessionFile = (n: number) => `sessions/${String(n).padStart(3, '0')}.json`

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

/** Each handover's SHA-256 from its VALIDATING > ROTATING event (v0.2), plus the latest from state.json (all v0.1 has). */
export function handoverHashes(s: State, events: readonly string[]): Map<string, string> {
  const sha = new Map<string, string>()
  for (const l of events) {
    let e: EventLine
    try { e = JSON.parse(l) as EventLine } catch { continue }
    const m = e.to === 'ROTATING' ? HANDOVER_REF_RE.exec(e.detail) : null
    if (m) sha.set(m[1]!, m[2]!)
  }
  const latest = s.lastValidatedHandover ? HANDOVER_REF_RE.exec(s.lastValidatedHandover) : null
  if (latest) sha.set(latest[1]!, latest[2]!)
  return sha
}

export async function fullHistory(rt: Runtime, dir: string, s: State, events: readonly string[]): Promise<string[]> {
  const sha = handoverHashes(s, events)
  const last = Math.max(s.rotationCount, ...[...sha.keys()].map(f => Number(/(\d+)\.md$/.exec(f)![1])))
  if (last === 0) return ['', 'No rotations yet.']
  const out = ['', 'Rotations:']
  for (let n = 1; n <= last; n++) {
    out.push(`Rotation ${n}: session ${n} > ${n + 1}`)
    const rec = await rt.port.read(join(dir, sessionFile(n))).then(t => parseJson('session', t), () => null)
    if (rec?.ok) {
      const r = rec.value
      out.push(`  context ${pct(r.startPct)} > ${pct(r.endPct)}, cost ${r.costUsd === undefined ? 'unknown' : `$${r.costUsd.toFixed(2)}`}`, `  ended: ${r.endReason ?? 'unknown'}`)
    } else out.push(`  ${sessionFile(n)}: ${rec ? 'unreadable' : 'missing'}`)
    const file = handoverFile(n)
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
    const names = (await rt.port.listFiles(join(t.dir, 'sessions')).catch(() => [] as string[])).filter(n => /^\d{3,}\.json$/.test(n))
    const recs = await Promise.all(names.map(n => rt.port.read(join(t.dir, 'sessions', n)).then(x => parseJson('session', x), () => null)))
    const events = (await rt.storage.readEvents(t.dir)).flatMap(l => { try { return [JSON.parse(l) as EventLine] } catch { return [] } })
    return { dir: t.dir, files: { state: t.state, sessions: recs.flatMap(r => (r?.ok ? [r.value] : [])), events } }
  }))
  const cur = current ? files.find(f => f.dir === current.dir) : undefined
  return [
    ...statsLines('Jeeves stats, this project:', aggregate(files.map(f => f.files), unreadable)),
    ...(cur ? ['', ...statsLines(`Task ${cur.files.state.taskId}:`, aggregate([cur.files])).filter(l => !l.startsWith('Tasks:'))] : []),
  ].join('\n')
}
