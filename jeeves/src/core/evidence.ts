// Evidence ledger (ST-3.1, FR-06): what a finished tool call adds to the ledger. Pure.
import { redact } from './redact.ts'
import type { GitFacts } from './git.ts'
import type { CapturedFacts } from './handover/template.ts'
import { LEDGER_COMMAND_MAX, LEDGER_TAIL_LINES, LEDGER_TAIL_MAX, LEDGER_TAILS, type CommandEntry, type EditEntry, type LedgerEntry } from './types.ts'

/** A ledger entry before the reducer stamps its time. */
export type LedgerRecord = Omit<CommandEntry, 'at'> | Omit<EditEntry, 'at'>

/** What the hook saw: the call's tool and arguments, and how it ended. */
export type ToolOutcome = {
  tool: string
  args: Record<string, unknown>
  agentId?: string | undefined
  denied: boolean
  isError: boolean
  /** The result as the model read it (holds "Exit code N" for a failed Bash call). */
  text?: string | undefined
  backgrounded: boolean
}

const EDIT_TOOLS: Record<string, string> = { Edit: 'file_path', Write: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' }

/** A command as the ledger keeps it; a verification command is compared in this form too (audit 5). */
// Cut before redacting (a heredoc can be megabytes), with room past the cap so a secret is never cut in half at it.
export const ledgerCommand = (raw: string) => redact(raw.slice(0, 4000)).replace(/\s+/g, ' ').trim().slice(0, LEDGER_COMMAND_MAX)

/** A command that only looks something up: its exit 1 means "nothing found", not a failure. */
export const LOOKUP = /^(grep|egrep|fgrep|rg|diff|test|ls|cat|find)\s/

/** Whether a Bash command's exit status is a lookup's: the first word of its last command (after the last `|`, `&&`, `||` or `;`). */
// shortcut: separators inside quotes are split too, which can only drop a tail; parse shell words if that ever matters.
export const isLookup = (raw: string) => LOOKUP.test(`${(raw.split(/&&|\|\||;|\|/).at(-1) ?? '').trim()} `)

const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g
const CONTROL_RE = /[\x00-\x08\x0b-\x1f\x7f]/g
const KEY_END_RE = /-----END [A-Z ]*PRIVATE KEY-----/

/** The last lines of a failed command's output, as the ledger keeps them: redacted, at most LEDGER_TAIL_LINES lines and LEDGER_TAIL_MAX code units; null when nothing is left. */
export function outputTail(raw: string): string | null {
  let text = raw.slice(-8000)
  // A cut first line is partial and may be half a secret.
  if (text.length < raw.length) text = text.slice(text.indexOf('\n') + 1 || text.length)
  // A key block that straddles the cut has its END line but not its BEGIN line, which redact() needs.
  const end = KEY_END_RE.exec(text)
  if (end && !text.slice(0, end.index).includes('-----BEGIN ')) text = `[REDACTED:private-key]${text.slice(end.index + end[0].length)}`
  text = text.replace(/^Exit code \d+\n?/, '')
  const lines = text.split('\n')
    .map(l => l.replace(/\r+$/, '').split('\r').at(-1)!.replace(ANSI_RE, '').replace(CONTROL_RE, '').trimEnd())
    .filter(l => l.trim())
  let tail = redact(lines.join('\n')).split('\n').slice(-LEDGER_TAIL_LINES).join('\n')
  if (tail.length > LEDGER_TAIL_MAX) {
    tail = tail.slice(-LEDGER_TAIL_MAX)
    const nl = tail.indexOf('\n')
    tail = nl >= 0 ? tail.slice(nl + 1) : tail.replace(/^[\udc00-\udfff]/, '')
  }
  return tail.trim() ? tail : null
}

/** Keep a tail only on the newest run of a command, only while no later run passed, and on at most LEDGER_TAILS
 *  commands (subagent tails dropped before main-loop ones, oldest first). "Same command" is the stored text. */
export function pruneTails(ledger: readonly LedgerEntry[]): LedgerEntry[] {
  const settled = new Set<string>()
  const out = [...ledger]
  for (let i = out.length - 1; i >= 0; i--) {
    const e = out[i]!
    if (e.kind !== 'cmd') continue
    if (e.tail !== undefined && settled.has(e.command)) out[i] = untail(e)
    if (e.exit === 0 || e.tail !== undefined) settled.add(e.command)
  }
  const held = out.flatMap((e, i) => (e.kind === 'cmd' && e.tail !== undefined ? [{ i, sub: e.agent !== null }] : []))
  const drop = [...held.filter(h => h.sub), ...held.filter(h => !h.sub)].slice(0, Math.max(0, held.length - LEDGER_TAILS))
  for (const { i } of drop) out[i] = untail(out[i] as CommandEntry)
  return out
}
const untail = ({ tail: _t, ...e }: CommandEntry): CommandEntry => e

/** The entry a call adds, or null (another tool, or an edit that did not happen). Never throws. */
export function toolRecord(o: ToolOutcome): LedgerRecord | null {
  const agent = o.agentId ?? null
  if (o.tool === 'Bash') {
    const raw = typeof o.args.command === 'string' ? o.args.command : ''
    const command = ledgerCommand(raw)
    const ok = !o.denied && !o.isError
    const code = o.isError ? /Exit code (\d+)/.exec(o.text ?? '')?.[1] : undefined
    // A backgrounded command has not ended: no exit status is known yet.
    const exit = o.denied || o.backgrounded ? null : ok ? 0 : code !== undefined ? Number(code) : null
    const tail = o.isError && !o.denied && !o.backgrounded && !isLookup(raw) ? outputTail(o.text ?? '') : null
    return { kind: 'cmd', command, ok, exit, agent, ...(tail === null ? {} : { tail }) }
  }
  const field = EDIT_TOOLS[o.tool]
  const path = field ? o.args[field] : undefined
  if (typeof path !== 'string' || !path || o.denied || o.isError) return null
  return { kind: 'edit', path: path.slice(0, 4096), agent }
}

/** The summary the handover instruction lists (git facts plus ledger counts); null when git facts are unknown. */
export function capturedFacts(git: GitFacts, ledger: readonly LedgerEntry[]): CapturedFacts | null {
  const commands = ledger.filter(e => e.kind === 'cmd').length
  const edits = ledger.length - commands
  if (git.kind === 'unknown') return null
  if (git.kind === 'none') return { branch: null, head: null, changedFiles: null, commands, edits }
  return { branch: git.branch, head: git.head, changedFiles: (git.changedSinceStart ?? git.status.map(e => e.path)).length, commands, edits }
}
