// Generates docs/state-machine.md (Mermaid) from the transition table in docs/plans/02 §4.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const plan = readFileSync(resolve(root, '../docs/plans/02-architecture-and-adrs.md'), 'utf8')
const section = plan.slice(plan.indexOf('## 4. State machine'), plan.indexOf('**Invariants'))
const STATES = ['DISABLED', 'MONITORING', 'ROTATION_REQUESTED', 'QUIESCING', 'HANDOVER_GENERATING', 'VALIDATING', 'ROTATING', 'RESTORING', 'CONTINUING', 'PAUSED', 'BLOCKED', 'NEEDS_REVIEW', 'FAILED', 'COMPLETED']
const ACTIVE = ['MONITORING', 'ROTATION_REQUESTED', 'QUIESCING', 'HANDOVER_GENERATING', 'VALIDATING', 'ROTATING', 'RESTORING', 'CONTINUING']
const NOTES = `How \`src/core/machine.ts\` reads the table where it is open to interpretation:

- \`any\` + \`session.end(clear)\` -> PAUSED(USER_CLEAR) applies to active states and PAUSED only; DISABLED, BLOCKED, NEEDS_REVIEW, FAILED and COMPLETED have no running task to pause, so they ignore it.
- \`any active\` + \`/relay pause\` while a handover is in flight (HANDOVER_GENERATING, ROTATING, RESTORING) sets \`pauseRequested\`; at \`CONTEXT_READY\` the continuation is still submitted, then the task goes to PAUSED(USER_PAUSE) instead of CONTINUING (ST-2.5). In ROTATION_REQUESTED/QUIESCING the pause cancels the request. VALIDATING pauses at once: nothing is cleared yet, and it is only left standing when the state write after a saved handover failed (M3).
- \`/relay on\` writes rev 1 when the goal is given; without one the state is MONITORING with \`taskRevision: 0\` until the next composer prompt is captured (\`REVISED\`). Revisions and \`/relay threshold\` (\`SET_THRESHOLD\`) keep the status and log a from = to event.
- \`/relay off\` and \`/relay resume\` from another session first take the lock if it is free or stale (owner silent > 120 s); a live lock gives LOCK_HELD. \`OFF\` records the session that turned it off, which releases the lock.
- \`session.end\` for any reason but \`clear\` releases the ending session's lock and changes no state, so the next session can resume at once. A user's \`session.end(clear)\` (not ROTATING) gives PAUSED(USER_CLEAR) for the task of the ending session id and releases that id's lock; \`/relay resume\` then continues it in the new conversation by the restore path.
- ROTATING + \`session.end(clear)\` counts as the rotation's only at step CLEAR_SCHEDULED (Jeeves scheduled it): it records the source id and writes \`sessions/NNN.json\` once (NNN = \`sessionSequence\`, start/end time and %). At an earlier step the /clear is the user's: PAUSED(USER_CLEAR) (ST-4.2). SessionStart(clear) takes any clearing rotation of the project and refuses a target id equal to the source.
- A revision file left by a failed state write is adopted as that revision before the next one is written, so a retry never stops on "already exists".
- \`T\` is the task's threshold, or the test-only override (06 §1) when \`JEEVES_TEST=1\`; the override is never stored.
- PAUSED(USER) is written with reason code \`USER_PAUSE\`; NEEDS_REVIEW(DISK) is added for a handover that cannot be saved.
- Resume after USER_CLEAR enters RESTORING with a new MANUAL rotation; the command takes the lock first, and the context goes into the continuation prompt itself (restore path, 02 §5.3, ADR-003 channel note; not \`$.session.append\`). \`CONTEXT_READY\` then moves RESTORING -> CONTINUING in both paths. After /clear it is raised when \`$.command.run('clear')\` resolves, which 2.1.319 does after the fresh SessionStart.
- SessionStart(clear) carries \`handoverOk\`: the handover to inject read back with its SHA-256. False: the fresh session takes the task and lock, nothing is injected, NEEDS_REVIEW(HANDOVER_INVALID). A continuation prompt that is refused or rejected gives \`SUBMIT_FAILED\`: CONTINUING -> NEEDS_REVIEW(ROTATE_UNAVAILABLE), mode assisted.
- Stop (M3): only a main-loop \`classic.Stop\` counts, and not when another hook beneath already blocked it (the turn goes on). Safe = no background task and no \`running\` agent (crons only listed). The handover Stop is checked again for in-flight work: if any, the handover counts as invalid (retry). A handover outcome can be \`fatal\` (the branch moved during the handover, or git did not answer): NEEDS_REVIEW(REPO_MISMATCH or HANDOVER_INVALID) at once, no retry.
- Validation (D-20): file paths, branch/HEAD and "passed" claims are checked in \`[verified]\` bullets and under "Tests and checks"; \`[inferred]\`/\`[unknown]\` bullets are guesses and are not checked.
- \`turn.complete\` (main loop): an interrupt in HANDOVER_GENERATING pauses (USER_INTERRUPT). In ROTATING at step HANDOVER_PERSISTED the adapter re-reads the saved handover and passes \`handoverVerified\`; only true gives RUN_CLEAR (run by the adapter from \`$.clock.after(0)\`, once per rotation by the persisted step), anything else gives NEEDS_REVIEW(HANDOVER_INVALID) (ST-4.1).
- \`IDLE\` (D-23): the main loop has no open turn while ROTATION_REQUESTED, so no Stop will come by itself; the adapter submits one nudge prompt per rotation (\`rotation.nudged\`). It is raised after a normal turn end and after a reading taken with no turn open.
- ADR-010: \`HOLD_PROMPT\` (a composer prompt, not a slash command) in HANDOVER_GENERATING..RESTORING keeps the status, stores the full text in \`heldPrompts\` (max 50; past that the prompt goes through) and logs a redacted copy. The hook drops it and empties the box from \`$.clock.after(0)\`. In the window after the old session ended, the clearing task holds it.
- ST-4.5: every request (threshold, manual, compaction) first checks \`consecutiveFailures >= maxConsecutiveFailures\` -> FAILED(last error code) and \`rotationCount >= maxRotationsPerTask\` -> PAUSED(MAX_ROTATIONS). A rotation that ends in an error (from a rotation state or CONTINUING) adds one failure; \`CONTEXT_READY\` resets it. CONTINUING never requests on a reading.
- Every input not listed for a state is a no-op that returns a reason (\`ignored\`).`
const clean = s => s.replace(/`/g, '').replace(/"/g, "'").replace(/[|]/g, '/').trim()
const lines = new Set()
for (const row of section.split('\n').filter(l => /^\| [A-Za-z]/.test(l) && !l.startsWith('| From'))) {
  const [from, input, guard, to] = row.split('|').slice(1, 5).map(c => c.trim())
  const froms = from === 'any' ? STATES.filter(s => s !== 'DISABLED') : from === 'any active' ? ACTIVE : from.split('/').map(s => s.trim())
  const target = to.split(/[ (]/)[0].split('→')[0].trim()
  const label = clean(guard && guard !== '—' ? `${input} [${guard}]` : input).slice(0, 60)
  for (const f of froms) if (STATES.includes(f) && STATES.includes(target)) lines.add(`  ${f} --> ${target}: ${label}`)
}
const out = `# State machine\n\nGenerated by \`scripts/state-diagram.mjs\` from the table in \`docs/plans/02-architecture-and-adrs.md\` §4. Do not edit by hand.\n\n${NOTES}\n\n\`\`\`mermaid\nstateDiagram-v2\n  [*] --> DISABLED\n${[...lines].join('\n')}\n\`\`\`\n`
writeFileSync(resolve(root, 'docs/state-machine.md'), out)
console.log(`state-machine.md: ${lines.size} transitions`)
