// Evidence ledger (ST-3.1, FR-06): what a finished tool call adds to the ledger. Pure.
import { redact } from './redact.ts'
import { LEDGER_COMMAND_MAX, type CommandEntry, type EditEntry } from './types.ts'

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

/** The entry a call adds, or null (another tool, or an edit that did not happen). Never throws. */
export function toolRecord(o: ToolOutcome): LedgerRecord | null {
  const agent = o.agentId ?? null
  if (o.tool === 'Bash') {
    const raw = typeof o.args.command === 'string' ? o.args.command : ''
    const command = redact(raw).replace(/\s+/g, ' ').trim().slice(0, LEDGER_COMMAND_MAX)
    const ok = !o.denied && !o.isError
    const code = o.isError ? /Exit code (\d+)/.exec(o.text ?? '')?.[1] : undefined
    // A backgrounded command has not ended: no exit status is known yet.
    const exit = o.denied || o.backgrounded ? null : ok ? 0 : code !== undefined ? Number(code) : null
    return { kind: 'cmd', command, ok, exit, agent }
  }
  const field = EDIT_TOOLS[o.tool]
  const path = field ? o.args[field] : undefined
  if (typeof path !== 'string' || !path || o.denied || o.isError) return null
  return { kind: 'edit', path: path.slice(0, 4096), agent }
}
