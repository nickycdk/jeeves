// `/jeeves status --diagnose` (ST-8.3): what a bug report needs, as plain lines to copy. The home folder is shown as
// `~`, session ids are cut to 8 characters, and the whole text goes through redact().
import { redact } from '../core/redact.ts'
import { MIN_VERSION } from '../core/probe.ts'
import { gitVersion } from './git.ts'
import type { Runtime } from './runtime.ts'
import type { Task } from './task.ts'
import type { AutoRow } from '../core/autostart.ts'
import { eligibility } from './eligible.ts'

/** Why a missing primitive may be missing: a hint, not a verdict. */
const HINT: Record<string, string> = {
  '$.process.run': 'plugins cannot start processes (an organization policy or a sandbox may block them)',
  '$.session.usage': 'the context reading is unavailable to plugins',
  'classic.Stop hook': 'a main turn ended without Jeeves\'s Stop hook running: a plugin above it skips it (claude --debug-file names it: "bypassed by")',
}

/** `t`: the task status would show; `errors`: unreadable task folders. */
export async function diagnose(rt: Runtime, me: string, t: Task | null, errors: readonly string[], row: AutoRow = 'default'): Promise<string> {
  const run = (argv: string[]) => rt.port.run(argv, { timeoutMs: 5000 }).catch(() => ({ exitCode: -1, stdout: '', stderr: '' }))
  const v = await rt.port.version().catch(() => null)
  const os = (await run(['uname', '-sr'])).stdout.trim() || 'unknown'
  const git = (await gitVersion(rt.port, await rt.port.cwd().catch(() => '/'))) ?? 'not found'
  const writable = rt.stateRoot ? ((await run(['test', '-w', rt.stateRoot])).exitCode === 0 ? 'yes' : 'NO') : '-'
  const lines = [
    'Jeeves diagnose (safe to paste: home folder shown as ~, secrets redacted)',
    `Jeeves: ${(await rt.port.pluginVersion()) ?? 'unknown'}`,
    `Claude Code: ${v ? v.version : 'unknown'}${v?.base && v.base !== v.version ? ` (base ${v.base})` : ''}, needs ${MIN_VERSION}+`,
    `Mode: ${rt.probe.mode}${rt.probe.missing.length ? `, missing ${rt.probe.missing.join(', ')}` : ''}`,
    ...rt.probe.missing.flatMap(m => (HINT[m] ? [`Hint: ${HINT[m]}`] : [])),
    `OS: ${os}`,
    rt.stateRoot ? `State folder: ${rt.stateRoot} (${rt.stateRootSource}), writable: ${writable}` : `State folder: none (${rt.stateRootError ?? 'unset'})`,
    `Git: ${git}; this folder: ${rt.identity ? (rt.identity.kind === 'git' ? `repository, project ${rt.projectId}` : `no repository, project ${rt.projectId}`) : 'git did not answer'}`,
    await autoDiagnose(rt, row),
    ...(rt.thresholdOverride || rt.thresholdRelative || rt.crashAt ? [`Test settings: ${[rt.thresholdOverride && `threshold ${rt.thresholdOverride}%`, rt.thresholdRelative && `threshold +${rt.thresholdRelative}`, rt.crashAt && `crash at ${rt.crashAt}`].filter(Boolean).join(', ')}`] : []),
  ]
  if (!t) lines.push(`Task: none${errors.length ? ` (${errors.length} unreadable: ${errors[0]})` : ''}`)
  else {
    const s = t.state
    const l = await rt.storage.readLock(t.dir, await rt.port.now()).catch(() => null)
    const owner = l?.kind === 'held' ? l.owner?.ownerSessionId ?? null : null
    lines.push(
      `Task: ${s.taskId} ${s.status}${s.reason ? ` (${s.reason})` : ''}, mode ${s.mode}, schema ${s.schemaVersion}, rotations ${s.rotationCount}, session ${s.sessionSequence}`,
      `Lock: ${!l ? 'unreadable' : l.kind === 'free' ? 'free' : `${owner === me ? 'this session' : owner ? `session ${owner.slice(0, 8)}` : 'unknown owner'}${l.stale ? ', stale' : ''}`}`,
      `Last error: ${s.lastErrorCode ?? 'none'}`,
    )
  }
  const home = await rt.port.env('HOME')
  const text = lines.join('\n')
  return redact(home ? tilde(text, home.replace(/\/+$/, '')) : text)
}

/** The home folder as `~` wherever it is a whole path segment: /Users/al must not turn /Users/alice into ~ice. */
export function tilde(text: string, home: string): string {
  if (!home) return text
  let out = '', i = 0
  for (let j = text.indexOf(home); j >= 0; j = text.indexOf(home, i)) {
    out += text.slice(i, j) + (/[\w.-]/.test(text[j + home.length] ?? '') ? home : '~')
    i = j + home.length
  }
  return out + text.slice(i)
}

/** ST-13.3: auto-start's setting with its source, and every reason this session is not auto-watched (§5.1 order). */
async function autoDiagnose(rt: Runtime, row: AutoRow): Promise<string> {
  const e = await eligibility(rt, row)
  return `Auto-start: ${e.auto.on ? 'on' : 'off'} (${e.auto.source}); ${e.reasons.length ? `not watched: ${e.reasons.join(', ')}` : 'this session is eligible'}`
}
