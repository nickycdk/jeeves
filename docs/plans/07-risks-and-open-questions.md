# 07 — Risks, Decisions and Open Questions

Owner roles: **M** = maintainer, **L** = lead engineer (implementing agent/developer). Likelihood/Impact: L/M/H.

## 1. Risk register

| ID | Risk | L | I | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| R-01 | Mod API cannot start a fresh interactive conversation | L | H | **Retired by SPIKE-01** (live). Remaining: depends on undocumented-but-typed plugin `/clear` → R-11 | L | Mitigated |
| R-02 | PTY wrapper breaks TUI/permissions | — | — | **Eliminated**: no wrapper (ADR-001). Cursor checklist still run (S-01) | L | Closed |
| R-03 | Handover misses implicit context | M | H | Immutable task revisions; verified section from git + ledger; "do not repeat" section; continuation verifies repo first; multi-rotation E2E; collect real failures as fixtures in v0.0.x dogfooding | L | Open |
| R-04 | Claude declares done without verification | M | H | ADR-007 evidence gate; text alone never completes | L | Mitigated by design |
| R-05 | Races at session switch | M | H | Pure reducer; serial write queue; dedupe keys; `mkdir` lock; crash matrix | L | Open |
| R-06 | Mods API changes between releases (header: "early access … may change without notice") | H | H | Version range + capability probe; compatibility job per release; assisted-mode fallback; adapter isolated behind `EnginePort` | L | Open |
| R-07 | Subagents/background tools at rotation | M | H | Stop `background_tasks` + `$.agent.list()` gate; quiesce timeout → pause. S-02 (live): running shell + subagent listed, rotation deferred until empty, no orphan; finished jobs wake a new turn, so the next Stop re-checks | L | Mitigated (long-running subagent not exercised) |
| R-08 | Secrets in handovers/logs | M | H | Instruction, redaction, validator blocks secrets, events store no raw text, user-only file perms, PRIVACY.md residual risk. S-05: handovers copied text that the user's own SessionStart hooks injected (style modes, attribution rules), so anything in context can leak into a handover. The instruction should ask for task-relevant facts only, and redaction is mandatory | L | Open |
| R-09 | Long tasks need re-approval; cannot run unattended | H | M | Native prompts preserved; status explains "waiting for your approval"; never auto-approve; document permission-mode choices | M | Accepted |
| R-10 | Naming/trademark conflict | M | M | ST-9.3 check; no "Claude" in name (legal doc) | M | Open |
| R-11 | Anthropic restricts plugin-invoked `/clear` (works and is typed, but not documented) | M | H | Ask upstream (ST-0.7); probe per session; assisted mode; README states dependency | M | Open |
| R-12 | No fsync/rename in `$.fs` → torn writes on power loss | L | M | Immutable files + verify + `mv` swap; derive state from events on corruption | L | Mitigated |
| R-13 | Threshold semantics surprise users (50% of 1M = 500K tokens; percent is of full window, not the compaction window) | H | M | Show tokens next to % in status; document; allow 20–90 | M | Open |
| R-14 | `$.ui.status` placement next to custom status lines unknown | — | — | S-06 (live): own line `⚠ <plugin>: <text>` above the unchanged custom status line. Engine adds the `⚠ <name>:` prefix (copy must not repeat the name) | L | Closed |
| R-15 | Cost: each rotation spends a handover turn plus a new baseline (~34–57K input tokens observed) | H | L | Document; rotation count capped; handover budget ≤ 12K chars | M | Accepted |
| R-16 | Org policy disables mods/hooks (`allowManagedModsOnly`, `disableAllHooks`) | M | M | Probe can't run if not loaded → README "Requirements" + troubleshooting entry | M | Accepted |
| R-17 | Modal dialogs or queued user prompts delay or reorder queued `/clear` | M | L | S-06 (live): a dialog delays `/clear` until it closes (16 s), with no reorder and no error; typed prompts are held (ADR-010). Rotation timeout → PAUSED with message covers a dialog left open | L | Mitigated |
| R-18 | Model ignores the Stop-block instruction or loops; Stop block cap (8) reached | L | M | ≤ 4 blocks per rotation; then NEEDS_REVIEW | L | Mitigated |
| R-19 | Prompt injection: repo text or handover tries to change SessionRelay policy | M | M | Policy lives in code, not text; parsed fields are data only; no shell execution of handover text; permissions stay with Claude Code | L | Mitigated by design |
| R-20 | A held prompt is sent twice: after `{ drop }` the engine leaves the text in the prompt box (S-06) | H | M | ADR-010 A1: clear the draft with `$.prompt.fill` after holding; ST-4.4 AC (4) tests it. `$.prompt.fill` returns `isFilled: false` under a dialog, so retry when the dialog closes | L | Open |
| R-21 | Silent mod-API misuse: `claude plugin validate` does not type-check, and wrong arguments are ignored at runtime (S-05: `$.prompt.submit({ context })`) | M | M | `tsc --strict` against the engine-written types in CI (ST-1.1 AC 4); integration tests assert effects, not calls | L | Mitigated by process |
| R-22 | Race in `classic.SessionStart`: `$.command.run('clear')` resolves while hooks beneath still run, so state read after `await next` is stale (S-05) | M | H | Read rotation state before `await next`; persisted state, not module variables, is the truth (02 §7); reducer test for this ordering | L | Mitigated by design |

## 2. Decision log

| # | Decision (PRD §16 question) | Answer | Evidence | Status |
|---|---|---|---|---|
| D-1 | Mod-only or supervisor? | **Mod-only** (ADR-001) | SPIKE-01 live | Accepted 2026-11-07 |
| D-2 | What is the safe boundary with subagents/parallel tools? | Main-loop Stop with no background tasks, no running agents, turn not aborted (ADR-004; crons dropped by D-11) | Types + live Stop fields; S-02 | Accepted 2026-11-07 |
| D-3 | Events for continuation and completion? | `classic.Stop`, `turn.complete`, `session.end(clear)`, `classic.SessionStart(clear)`, `$.command.run`, `$.prompt.submit`; completion via sentinel block + ledger (ADR-003/007) | Live + types | Accepted 2026-11-07 |
| D-4 | Where is state stored? | OS user-level dir (or per-plugin data dir if found), never repo by default (ADR-005) | Types | Accepted 2026-11-07 |
| D-5 | Simplest install? | Plugin marketplace only, one line | Docs | Accepted 2026-11-07 |
| D-6 | Managed tasks only? How to create? | Yes; `/relay on [goal]` or capture next prompt (ADR-009) | — | Accepted 2026-11-07 |
| D-7 | OS/versions on release day | macOS + Cursor; Claude Code ≥ 2.1.319; Linux "expected, P1" | — | Accepted 2026-11-07 |
| D-8 | Hard stop or bounded wait after threshold? | Bounded wait (3 turns / 20 min), then PAUSED with explanation; assisted fallback only when rotation primitive unavailable | ADR-004 | Accepted 2026-11-07 |
| D-9 | Handover via tool or text? | Sentinel text block (ADR-003), delivered in SessionStart `additionalContext`; tool fallback not needed | S-05: 10/10 first-try parse; 30K delivered intact | Accepted 2026-11-07 |
| D-10 | Compaction policy | Skip precompute only; rotate after compaction (ADR-006) | Live manual skip | Accepted 2026-11-07 |
| D-11 | Do session crons block rotation? (amends ADR-004) | **No.** Crons survive `/clear`; list them in the handover's verified section | S-04 (live) | Accepted 2026-11-07 |
| D-12 | Held prompts: what else is needed? (amends ADR-010) | Clear the composer draft after `{ drop }`; quote held prompts verbatim as the user's words in the continuation | S-06 (live) | Accepted 2026-11-07 |
| D-15 | M0 gate sign-off | ADR-001…010 Accepted (incl. ADR-004 A1, ADR-010 A1); all 10 PRD changes in §4 approved; licence MIT; git init + one local commit per story, no push | Maintainer answers, 2026-11-07 | Accepted |
| D-14 | S-01 Cursor run: accept partial evidence? | **Yes.** 4 rotations in Cursor 3.27.14 worked (new session, unprompted continuation, mode kept). Typing mid-turn, permission prompt and Unicode were not exercised in Cursor; PTY evidence covers them; ST-9.2 must show them in Cursor before AC-02 is claimed | `evidence/s-01-cursor/RESULT.md` | Accepted by maintainer, 2026-11-07 |
| D-13 | Handover channel (ADR-003 record) | `additionalContext` at SessionStart(clear); prompt `text` on the restore path; never `$.prompt.submit({ context })` | S-05 (live) | Accepted 2026-11-07 |

## 3. Open questions

| # | Question | Why it matters | Resolution path | Owner | Needed by |
|---|---|---|---|---|---|
| Q-1 | Is plugin-invoked `/clear` an intended, supported use? | Core mechanism (R-11) | GitHub discussion/issue to anthropics/claude-code; link here. **Draft ready, not posted:** `evidence/q-1-upstream-question.md` | M | M7 (marketing) |
| Q-2 | ~~Do session-granted permissions, add-dirs, plan mode, crons survive `/clear`?~~ | UX after rotation | **Answered (S-04):** add-dirs, modes (incl. plan) and crons survive; 2.1.319 has no session-only Bash grant | L | Closed |
| Q-3 | Is there a documented per-plugin data directory for mods? | ADR-005 storage location | **Partly answered (S-06):** none for a `--plugin-dir` mod, so OS path stands; re-check an installed mod | L | M6 |
| Q-4 | Lowest Claude Code version to support? | Reach vs test cost | Compatibility job on 2.1.287…319 | M | M6 |
| Q-5 | Keep 50% default on 1M-window models? | R-13 | Maintainer decision after dogfooding | M | M6 |
| Q-6 | ~~Size limit of SessionStart `additionalContext` for mods~~ | Handover channel | **Answered (S-05):** ≥ 30K chars intact (budget is 12K) | L | Closed |
| Q-7 | ~~Licence: MIT or Apache-2.0?~~ | FR-15 | **Answered: MIT** (D-15) | M | Closed |
| Q-8 | Final product name | FR-15, R-10 | ST-9.3 | M | M7 |
| Q-9 | Should the plugin's own Stop block count toward user-configured Stop hooks' behaviour (other plugins also blocking)? | Interaction with user hooks | Test with a second blocking Stop hook in E2E | L | M4 |

## 4. Proposed PRD changes

Listed separately per PRD §18. None lowers a requirement. **Status: all 10 approved by the maintainer on 2026-11-07 (D-15).**

1. **Remove supervisor package and statusline fallback (§9.1, §17 repo structure, FR-02 fallback).** Justification: SPIKE-01 passed with mod APIs; `$.session.usage()` is the status-line figure itself. Keeping them adds code with no user benefit.
2. **Define context % precisely (FR-02/FR-03).** "Context % = `$.session.usage().context.percent`, equal to the status line `used_percentage`, measured against the model's full context window (input tokens of the last main-thread response)." Add: status shows tokens too. Justification: R-13.
3. **Replace "temp → fsync/rename" (FR-07, §10).** With "immutable write-once files verified by read-back hash; mutable state swapped atomically with `mv`; fsync unavailable to mods — documented residual risk". Justification: `$.fs` has no rename/fsync [V-TYPES]; the replacement provides the same crash guarantees except power loss.
4. **Compaction row in §11 and SPIKE-04.** "Do not block compaction at the context limit; skip pre-emptive compaction only; after any compaction during a managed task, rotate at the next safe boundary." Justification: blocking at the limit causes overflow errors.
5. **User `/clear` during managed task → PAUSED(USER_CLEAR)** (new edge case). Justification: user intent is ambiguous; never auto-continue on a manual action.
6. **Input typed during rotation is held and delivered to the fresh session** (new edge case). Justification: otherwise it is lost at `/clear` or lands in the old conversation.
7. **DoD verification commands are run by Claude through its Bash tool, never by the plugin (FR-10 with FR-16).** Justification: keeps Claude Code permissions authoritative.
8. **AC-02/NFR-02 evidence = manual Cursor checklist + PTY automation.** Justification: Cursor cannot be driven in CI; PTY covers the same process behaviour.
9. **Config contract (§8.2):** drop `requireValidatedHandover`, `requireExplicitOptIn`, `onUnsafeBoundary`, `mode` as user flags (always-on safety or derived), add `warnBeforePercent`, `quiesceMaxTurns`, `quiesceMaxMinutes`, `autoRecover`, `handoverMaxChars`, `verificationCommands`. Justification: "no config flag may promise an implementation that doesn't exist", and safety must not be switchable off.
10. **Command surface (§4.2):** add `/relay done` (user confirms completion when no machine checks), `/relay continue` (assisted mode), `/relay dod`, `/relay check`, `/relay task`, `/relay purge`. Justification: needed by FR-10, AC-25, FR-05, §10 cleanup.
