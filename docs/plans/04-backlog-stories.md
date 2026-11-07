# 04 — Backlog Stories

Stories are listed in dependency order; implement top to bottom. IDs are `ST-<epic>.<n>`. Sizes: **S** ≤ 0.5 day, **M** 1–2 days, **L** 3–4 days.

**Standard story DoD (applies to every story; each story lists only its extra items):**
1. Behaviour meets the story's AC. 2. Unit tests (core) and/or `claude plugin test` tests (adapter) added; all tests pass. 3. `npm run typecheck`, `npm run lint`, `claude plugin validate .` pass. 4. Error, cancellation and recovery paths covered by a test. 5. No secrets or transcripts logged (redaction test where text is persisted). 6. User-facing text is plain, has a text label (no colour/emoji-only meaning). 7. Docs/CHANGELOG updated if behaviour is visible. 8. Reviewed; no Critical/High findings open.

Module names refer to `02-architecture-and-adrs.md` §3.

**Progress (2026-11-07):** E0, E1, E2 and E3 solved, plus ST-7.3. Each solved story has a **Status** line under its heading. Everything without one is open.

---

## E0 — Feasibility closeout

### ST-0.1 Cursor rotation manual spike (S-01) — S
- **Status:** Solved (M0; evidence/s-01-cursor, partial Cursor checklist accepted in D-14).
- **Cites:** SPIKE-01, NFR-02, AC-02.
- **Scope:** Prove the spike mod rotates inside Cursor's integrated terminal with normal interaction. Out: product code.
- **Approach:** `claude --plugin-dir docs/plans/evidence/spike-01-mod-rotation/mod --model haiku` in a scratch git repo inside Cursor; follow 06 §6 checklist (type during turns, resize pane, Ctrl+C at idle and mid-turn, Esc, trigger a Bash permission prompt with default mode, paste Unicode/emoji).
- **Depends on:** none.
- **AC:** (1) rotation completes with new session ID in the log; (2) each checklist item behaves the same before and after rotation; (3) screen recording saved (secrets-free).
- **Tests:** manual checklist; log diff.
- **DoD:** + `evidence/s-01-cursor/RESULT.md` with versions (Cursor, Claude Code, macOS).

### ST-0.2 Work-in-flight spike (S-02) — S
- **Status:** Solved (M0; evidence/s-02-work-in-flight).
- **Cites:** SPIKE-05, FR-04, AC-07.
- **Scope:** Observe Stop/`$.agent.list()` with a background shell and a background subagent.
- **Approach:** Extend spike mod: log `background_tasks`, `session_crons`, `$.agent.list()` at Stop; prompt starts `sleep 45 &` via Bash `run_in_background` and a background Agent.
- **Depends on:** none.
- **AC:** (1) non-empty `background_tasks` observed with types; (2) rotation deferred until empty; (3) `ps` shows no orphan after rotation.
- **Tests:** PTY driver run, `ps` snapshot.
- **DoD:** + RESULT.md incl. exact field shapes.

### ST-0.3 Soft-quiesce spike (S-03) — S
- **Status:** Solved (M0; evidence/s-03-soft-quiesce).
- **Cites:** FR-04.
- **Scope:** Measure whether a hidden `$.session.append` note mid-turn makes Claude stop soon.
- **Approach:** Long multi-file fixture prompt; at first `tool.call` result after a fake threshold, append note; count further tool calls; 5 runs.
- **Depends on:** none.
- **AC:** result recorded; pass if ≤ 3 further tool calls in ≥ 4/5 runs, else ADR-004 drops soft quiesce.
- **Tests:** PTY runs.
- **DoD:** + RESULT.md with counts.

### ST-0.4 `/clear` carry-over spike (S-04) — S
- **Status:** Solved (M0; evidence/s-04-clear-carryover).
- **Cites:** SPIKE-06, FR-08.
- **Scope:** `--add-dir`, session-granted permission, plan mode, session cron across `/clear`.
- **Approach:** Spike mod logs `permission_mode`; probe add-dir by asking Claude to read a file there; grant "yes, for this session" on a Bash command then repeat it after rotation; create a cron with `/loop`.
- **Depends on:** none.
- **AC:** table kept/lost for each; ADR-004/README updated accordingly.
- **Tests:** PTY run(s).
- **DoD:** + RESULT.md.

### ST-0.5 Handover size and parse spike (S-05) — M
- **Status:** Solved (M0; evidence/s-05-handover-size-parse).
- **Cites:** FR-06, FR-07, AC-08.
- **Scope:** Deliverability of 4K/12K/30K-char `additionalContext`; parse rate of draft template.
- **Approach:** Inject marker text at end of each payload and ask the model to quote it; run draft instruction (ST-3.4) 10× on fixture repo with a throwaway parser.
- **Depends on:** none.
- **AC:** 12K delivered intact; parse ≥ 9/10 first try, 10/10 within 2 retries; else adopt fallback (prompt.submit channel and/or tool-based handover).
- **Tests:** PTY runs.
- **DoD:** + RESULT.md, chosen channel recorded in ADR-003.

### ST-0.6 Status coexistence and queued input spike (S-06) — S
- **Status:** Solved (M0; evidence/s-06-status-queued-input).
- **Cites:** FR-17, §4.3, ADR-010.
- **Scope:** `$.ui.status` next to a custom `statusLine`; typed prompt during queued rotation; modal dialog during rotation; per-plugin data dir discovery (`$.env.get` candidates).
- **Approach:** spike mod variants with PTY driver.
- **Depends on:** none.
- **AC:** findings recorded; ADR-005/010 confirmed or amended.
- **Tests:** PTY runs, screenshots.
- **DoD:** + RESULT.md.

### ST-0.7 ADR sign-off and upstream confirmation — S
- **Status:** Solved for ADR sign-off (D-15); upstream question drafted, not posted (Q-1).
- **Cites:** PRD §15 DoR.
- **Scope:** Maintainer review of ADR-001…010 and proposed PRD changes; open a GitHub discussion asking whether plugin-invoked `/clear` is supported.
- **Depends on:** ST-0.1…0.6.
- **AC:** ADRs marked Accepted/Amended; DoR checklist ticked; upstream link recorded in 07.
- **Tests:** n/a.
- **DoD:** + decision log entries in 07 §2.

---

## E1 — Foundation

### ST-1.1 Repo scaffold, toolchain and CI — M
- **Status:** Solved (f1f05c2); CI config written but never run (no remote).
- **Cites:** FR-15, NFR-07, AC-21.
- **Scope:** Layout per 02 §3; `package.json` (devDeps: `typescript` only), `tsconfig.json` (strict, `noUncheckedIndexedAccess`, mod JSX settings from the types header), `.gitignore`, `npm run typecheck|lint|test|test:mod|validate`; lint = `tsc --noEmit` + a tiny custom check script (no ESLint dependency; revisit if contributors ask). GitHub Actions: macOS + Linux, Node 22, lockfile install, minimal `permissions: contents: read`.
- **Approach:** Node `node --test --experimental-strip-types tests/unit` for core; `claude plugin test .` job only where Claude Code is installable in CI (see ST-8.3).
- **Depends on:** ST-0.7.
- **Modules:** root, `.github/`.
- **AC:** (1) fresh clone → `npm ci && npm test` passes; (2) CI green on PR; (3) `claude plugin validate .` passes locally with README/LICENSE stubs; (4) `npm run typecheck` type-checks `hooks/` against the engine-written `claude-code` types (`claude plugin validate` does not type-check; amended after S-05).
- **Tests:** a trivial core test; CI run.
- **DoD:** + CONTRIBUTING stub with commands.

### ST-1.2 Domain types, reason codes, schemas and migrations — M
- **Status:** Solved (112e391).
- **Cites:** NFR-07, NFR-09, §8.
- **Scope:** `types.ts` (states, reason codes, Task, TaskRevision, State, Rotation, Event, Config), `schema.ts` guards for every persisted file, `migrate(json)` pipeline, `SCHEMA_TOO_NEW`.
- **Approach:** hand-written guards returning `{ ok, value } | { ok: false, errors[] }` with path-qualified messages.
- **Depends on:** ST-1.1.
- **AC:** (1) every contract in 02 §6 has a guard; (2) invalid input yields specific errors; (3) v1 round-trips; (4) unknown higher version rejected.
- **Tests:** table tests per guard incl. missing/extra/wrong-type fields; fuzz with random JSON.
- **DoD:** standard.

### ST-1.3 Storage: state root, serial queue, immutable writes — M
- **Status:** Solved (541b645, ccaec06); AC 1 engine-level test closed in ST-2.4 (bac704b).
- **Cites:** FR-07, FR-13, NFR-04; ADR-005.
- **Scope:** resolve state root (config override → per-plugin dir if S-06 found one → OS default); create with user-only perms; `StorageQueue` serialising all writes; `writeImmutable(path, text)` = refuse if exists, write, read back, compare SHA-256.
- **Approach:** `$.fs.write/read/exists`, `crypto.subtle.digest`; `$.process.run(['chmod','700',dir])` once.
- **Depends on:** ST-1.2.
- **Modules:** `adapter/storage.ts`.
- **AC:** (1) concurrent writes from two hooks never lose data (regression of the spike race); (2) immutable file never overwritten; (3) hash mismatch → error `DISK`; (4) state root never inside repo unless configured.
- **Tests:** `claude plugin test` with 50 concurrent appends; mocked fs failure.
- **DoD:** + A-05 retired in 01.

### ST-1.4 Atomic pointer swap and lock — M
- **Status:** Solved (1670220).
- **Cites:** FR-07, FR-12, FR-13; ADR-005.
- **Scope:** `writeState()` via tmp + verify + `mv -f`; `acquireLock()` via `mkdir lock.d`; `owner.json`; heartbeat every 30 s; `isStale(120 s)`; `release()`; `takeover()` (re-check staleness first).
- **Depends on:** ST-1.3.
- **AC:** (1) killing the process at any point leaves either old or new `state.json`, never partial; (2) second acquirer gets `LOCK_HELD`; (3) stale lock detectable; (4) no permission prompt for `mv`/`mkdir` (A-04).
- **Tests:** plugin tests with mocked `$.process`; real-process test script that kills between steps (part of ST-6.7 harness).
- **DoD:** + A-04 retired.

### ST-1.5 Event log with redaction — S
- **Status:** Solved (63200c4).
- **Cites:** FR-14, FR-16, NFR-05, NFR-10.
- **Scope:** `appendEvent(e)` through the queue; file roll at 1 MiB; `detail` passed through `redact()` (ST-3.7 provides full patterns; this story ships a minimal version).
- **Depends on:** ST-1.3.
- **AC:** (1) each transition writes one line; (2) no line contains raw prompt/handover text; (3) roll-over keeps order.
- **Tests:** unit + plugin test.
- **DoD:** standard.

### ST-1.6 Project/task identity and git facts — M
- **Status:** Solved (bab8dca).
- **Cites:** FR-06, FR-13, §10 multi-worktree.
- **Scope:** `projectId` from `git rev-parse --git-common-dir` + `--show-toplevel` realpaths; non-git directories supported (projectId from cwd realpath, git facts "none"); `gitFacts()` = branch, HEAD, porcelain status, worktree, files changed since `taskStartHead`.
- **Approach:** `$.process.run(['git', ...], { cwd, timeoutMs: 10000 })`; parse porcelain v1.
- **Depends on:** ST-1.2.
- **Modules:** `core/ids.ts`, `adapter/git.ts`.
- **AC:** (1) two worktrees → two IDs; (2) same repo moved → mismatch detectable; (3) detached HEAD, no commits, non-git all handled; (4) timeout → facts marked unknown, not empty.
- **Tests:** fixtures (ST-4.8 fixture builder) for each repo shape.
- **DoD:** standard.

### ST-1.7 State machine reducer and invariants — L
- **Status:** Solved (8544bc2).
- **Cites:** §7, FR-03, FR-12; NFR-04, NFR-07.
- **Scope:** `reduce(state, input, now) → { state, effects[] }` implementing the table in 02 §4 (all rows; inputs not yet produced by adapters are still unit-testable); effects carry dedupe keys.
- **Depends on:** ST-1.2.
- **AC:** (1) every table row has a test; (2) every forbidden transition is a no-op with a logged reason; (3) property test: random input sequences never violate invariants (02 §4); (4) reducer is pure (no Date, no randomness — ids passed in).
- **Tests:** table tests + seeded random-walk property test (no library; simple PRNG).
- **DoD:** + state diagram in docs generated from the table (Mermaid).

### ST-1.8 Engine port, mod adapter, register wiring, capability probe — M
- **Status:** Solved (ce192a1; probe per ADR-002 A1 / D-16).
- **Cites:** FR-01, NFR-06; ADR-002, ADR-008.
- **Scope:** `ports.ts`, `engine-mod.ts`, `effects.ts`, `probe.ts`; `register.ts` subscribes to all events used later but forwards only `session.start` for now; probe result stored and shown.
- **Approach:** version check via `$.session.version()`; feature checks by harmless calls (not `typeof`: the 2.1.319 scanner refuses `$` nouns as values; ADR-002 A1); supported range constant.
- **Depends on:** ST-1.4, ST-1.7.
- **AC:** (1) supported version → `full`; (2) below range → `unsupported` with exact required version and no automation (FR-01 acceptance); (3) missing primitive → `assisted` (amended, ADR-002 A1: `session.usage`/`process.run` probed by a harmless call at startup; `command.run`/`prompt.submit` at first use); (4) never edits Claude settings.
- **Tests:** plugin tests with mocked version/nouns.
- **DoD:** standard.

### ST-1.9 `/relay` router, `status`, `help` — S
- **Status:** Solved (e3367c2).
- **Cites:** §4.2, FR-14.
- **Scope:** register `relay` (fallback `sessionrelay` on collision); parse subcommands; unknown subcommand → help; `status` shows mode, task, state, context (or unknown), threshold, rotation count, last success/error, state path.
- **Depends on:** ST-1.8.
- **AC:** (1) `/relay status` works with no task ("No managed task. Start with /relay on"); (2) collision fallback announced; (3) output ≤ 8 lines, fits 40 columns.
- **Tests:** plugin test via `command.run`.
- **DoD:** standard.

---

## E2 — Managed task and monitoring

### ST-2.1 `/relay on|off` and verbatim task capture — M
- **Status:** Solved (e9ab583, review fixes 92f7941).
- **Cites:** FR-05, §4.4, AC-03; ADR-009.
- **Scope:** `/relay on [goal]`; capture next composer prompt verbatim if no goal; create task dir, `task-rev-001.md`, `state.json` (MONITORING), lock; `/relay off` → DISABLED, lock released, files kept.
- **Approach:** `prompt.submit` hook with `origin.kind === 'composer'` while `awaitingGoal`; pass prompt through unchanged; slash commands ignored for capture.
- **Depends on:** ST-1.9, ST-1.6.
- **AC:** (1) rev-001 byte-identical to typed prompt (incl. Unicode, newlines); (2) without `on`, no task files and no rotation logic runs (AC-03); (3) `off` deletes nothing (FR-11); (4) lock held → `LOCK_HELD` message.
- **Tests:** plugin tests incl. multiline/emoji prompt; AC-03 negative test.
- **DoD:** + first-activation notice hook point (text in ST-7.3).

### ST-2.2 Task revisions, DoD and verification commands — M
- **Status:** Solved (3c2a5a2, review fixes 92f7941).
- **Cites:** FR-05, FR-10; ADR-007.
- **Scope:** `/relay dod <text>` and `/relay check <command>` append a new revision (never mutate); `/relay task` prints original vs current; revisions only from user commands, never from model text.
- **Depends on:** ST-2.1.
- **AC:** (1) after N edits, N+1 immutable revisions and a readable diff; (2) model output can never create a revision; (3) commands stored as text only, never executed by the plugin.
- **Tests:** unit for revision model; plugin test that a model "task change" text has no effect.
- **DoD:** standard.

### ST-2.3 Context reading adapter — S
- **Status:** Solved (bd666b0); A-02 subagent check stays in ST-4.8.
- **Cites:** FR-02, AC-04, AC-06.
- **Scope:** on `session.measure` (main thread) read `$.session.usage().context`; map missing `percent` → `unknown`; store `lastContext` with timestamp; staleness = reading older than the last turn → unknown.
- **Depends on:** ST-1.8.
- **AC:** (1) `undefined` → "unknown", no trigger, no "0%"; (2) value equals `usage().context.percent` (status-line figure); (3) rate-limit changes never change the context reading.
- **Tests:** plugin tests with mocked usage sequences incl. `undefined`, rate-limit-only measure events.
- **DoD:** + A-02 test hook (subagent run doesn't move reading) scheduled in ST-4.8.

### ST-2.4 Threshold trigger, warning, hysteresis, `/relay threshold` — M
- **Status:** Solved (bac704b).
- **Cites:** FR-03, AC-05.
- **Scope:** core `threshold.ts`: trigger at `p ≥ T` once per session (`armedFired`); warn once at `T−5`; rearm only after a fresh reading `< T−10` in a new session; `/relay threshold <n>` integer 20–90, else error with range.
- **Depends on:** ST-2.3, ST-1.7.
- **AC:** (1) 49 → nothing; 50 → exactly one `ROTATION_REQUESTED`; 51, 51, 70 → nothing more (AC-05); (2) jump 40 → 70 → one request; (3) concurrent duplicate measures dedupe by rotationId; (4) invalid threshold rejected with message.
- **Tests:** unit table tests; plugin test firing measures concurrently.
- **DoD:** standard.

### ST-2.5 Pause and resume — S
- **Status:** Solved (42b42c8, review fixes 92f7941); resume after a user /clear waits for ST-4.3.
- **Cites:** FR-11, AC-14.
- **Scope:** `/relay pause|resume`; persisted in `state.json`; survives restart; pause during `ROTATION_REQUESTED/QUIESCING` cancels the pending rotation (not after handover persisted — then pause applies after continuation).
- **Depends on:** ST-2.4.
- **AC:** (1) pause at 48% → no rotation at 55% until resume; resume at 55% → request at next measure (AC-14); (2) pause survives process restart.
- **Tests:** unit + plugin restart simulation.
- **DoD:** standard.

---

## E3 — Safe boundary and handover

### ST-3.1 Evidence ledger — M
- **Status:** Solved (6036289, review fixes 7a9f576).
- **Cites:** FR-06, AC-09.
- **Scope:** `tool.call` hooks (main loop and subagents tagged) record: Bash `{ command (redacted, ≤ 300 chars), exit/isError, at }`, Edit/Write/NotebookEdit `{ path, at }`; kept per session in state (bounded ring, last 200) and summarised into each handover.
- **Approach:** `await next(e)` then record result; never alter the call; hook with `.catch(... next.called ? next(e) : next(e))` so a ledger failure never blocks a tool.
- **Depends on:** ST-2.1.
- **AC:** (1) failed test command recorded as failed; (2) a ledger error never changes or blocks the tool call; (3) overhead p95 < 5 ms per call (NFR-03).
- **Tests:** plugin tests via `$.tool.call` with deny/error/success; micro-benchmark.
- **DoD:** + overhead number in docs/performance.md.

### ST-3.2 Soft quiesce note — S (conditional on S-03)
- **Status:** Solved (cf6b13b, review fixes 7a9f576).
- **Cites:** FR-04.
- **Scope:** first `tool.call` result after `ROTATION_REQUESTED` → `$.session.append` hidden note once per rotation.
- **Depends on:** ST-2.4, ST-0.3.
- **AC:** (1) exactly one note per rotation; (2) never during `PAUSED`; (3) skipped entirely if S-03 failed.
- **Tests:** plugin test counting appends.
- **DoD:** standard.

### ST-3.3 Safe-boundary evaluator and quiesce timeout — M
- **Status:** Solved (aa4d00f, review fixes 7a9f576).
- **Cites:** FR-04, AC-07; ADR-004.
- **Scope:** core `isSafe({ backgroundTasks, agents, turnReason })`; adapter `classic.Stop` hook gathers inputs (and passes `session_crons` to the facts snapshot, not to `isSafe`: ADR-004 A1, after S-04); QUIESCING counters; timeout → `PAUSED(UNSAFE_BOUNDARY)`.
- **Depends on:** ST-3.1, ST-0.2.
- **AC:** (1) background shell or running subagent → no handover request; (2) aborted turn → no handover request (Ctrl+C semantics); (3) after `quiesceMaxTurns` → paused with explanation; (4) Stop hook failure lets Claude stop normally (fail open for the user, closed for rotation).
- **Tests:** unit truth table; plugin tests via `$.classic.Stop` with each input shape.
- **DoD:** standard.

### ST-3.4 Handover instruction template — S
- **Status:** Solved (73535b4, review fixes 7a9f576). S-05 live parse re-run: 1/1 first try in the M3 demo; the 10-trial rate was on the draft text.
- **Cites:** FR-06, FR-16, §8.4.
- **Scope:** `template.ts` builds the Stop `block` text: purpose, sentinel format with task/rotation IDs, required headings, tagging rules, size budget, "no secrets/tokens/.env contents", "do not run new commands now; summarise only", list of plugin-captured facts so Claude does not restate them.
- **Depends on:** ST-0.5.
- **AC:** (1) deterministic for same input (snapshot test); (2) ≤ 2,500 chars; (3) S-05 parse rate met with final text.
- **Tests:** snapshot; S-05 re-run.
- **DoD:** standard.

### ST-3.5 Handover parser — M
- **Status:** Solved (7d76cc0, review fixes 7a9f576).
- **Cites:** FR-07.
- **Scope:** extract exactly one sentinel block from `last_assistant_message`; tolerate code fences, CRLF, extra prose, heading case/spacing; produce typed sections + bullets with tags; errors are specific.
- **Depends on:** ST-1.2.
- **AC:** (1) good fixtures parse; (2) 0 or 2 blocks, missing heading, empty section each yield a distinct error; (3) never throws on arbitrary input.
- **Tests:** fixture corpus (≥ 20 incl. real outputs from S-05); fuzz.
- **DoD:** standard.

### ST-3.6 Handover validator and cross-checks — L
- **Status:** Solved (6016f10, review fixes 7a9f576).
- **Cites:** FR-06, FR-07, AC-08, AC-09.
- **Scope:** rules in 02 §6.4: IDs, headings, next actions, size, paths exist or deleted, branch/HEAD consistency, test claims vs ledger, redaction hits, round-trip of merged file.
- **Depends on:** ST-3.5, ST-3.1, ST-1.6.
- **AC:** (1) "tests pass" for a command whose last ledger run failed → error naming the command (AC-09); (2) non-existent path → error; (3) wrong branch → error `REPO_MISMATCH` (edge case: branch changed during handover → stop rotation); (4) valid handover → ok with zero warnings.
- **Tests:** table tests over fixtures + facts/ledger combos.
- **DoD:** standard.

### ST-3.7 Redaction — M
- **Status:** Solved (7991dfa, review fixes 7a9f576).
- **Cites:** FR-16, §8.4 security, NFR-10.
- **Scope:** `redact(text)` for common key/token formats (AWS, GitHub, Anthropic, OpenAI, Stripe, Slack, JWT, private keys, `KEY=value` lines from env-like content, high-entropy strings with key-ish names); used for events, ledger commands, handover validation (block with request to remove) and diagnostics.
- **Depends on:** ST-1.5.
- **AC:** (1) corpus of known secrets fully masked; (2) false-positive rate on a corpus of normal code/handovers < 1 per 10K lines; (3) residual risk documented in PRIVACY.md.
- **Tests:** corpus tests (synthetic secrets only).
- **DoD:** standard.

### ST-3.8 Merged render, persistence, retries, NEEDS_REVIEW — M
- **Status:** Solved (b8dd7c3, review fixes 7a9f576).
- **Cites:** FR-06, FR-07, AC-08, AC-17; Flow D.
- **Scope:** render merged handover (verified section + narrative + metadata); `writeImmutable(history/handover-NNN.md)`; copy to `handover.md`; state → ROTATING via atomic swap; invalid → `{ block: errors }` up to `maxHandoverRetries`, then `NEEDS_REVIEW(HANDOVER_INVALID)` and allow stop.
- **Depends on:** ST-3.3, ST-3.4, ST-3.6, ST-1.4.
- **AC:** (1) handover file exists and hash-verified before any `/clear` effect is emitted; (2) after 2 failed retries no `/clear`, previous handover byte-identical (AC-17); (3) total Stop blocks per rotation ≤ 4 (under the engine cap of 8).
- **Tests:** plugin tests driving `$.classic.Stop` sequences with good/bad messages; crash injection between write and swap.
- **DoD:** standard.

---

## E4 — Fresh session and continuation

### ST-4.1 Rotation executor — M
- **Cites:** FR-08, AC-10.
- **Scope:** on main `turn.complete` with state ROTATING and verified handover: `$.clock.after(0)` → `$.command.run({ command: 'clear' })`; dedupe by `rotationId:clear`; rejection → ST-4.6.
- **Depends on:** ST-3.8.
- **AC:** (1) exactly one `/clear` per rotation even with duplicate events or worker respawn; (2) never runs without verified handover; (3) never `--resume`/`--continue`/fork.
- **Tests:** plugin tests with duplicated `turn.complete`; respawn simulation.
- **DoD:** standard.

### ST-4.2 Rotation boundary detection and lock transfer — M
- **Cites:** FR-08, §7 invariants.
- **Scope:** `session.end(reason clear)` while ROTATING → record `sourceSessionId`, write `sessions/NNN.json`; `classic.SessionStart(source clear)` → `targetSessionId`, lock owner := new id, state RESTORING.
- **Depends on:** ST-4.1.
- **AC:** (1) source ≠ target asserted; (2) `/clear` not initiated by SessionRelay is not treated as rotation (→ ST-6.3); (3) session file immutable.
- **Tests:** plugin tests raising `$.classic.SessionStart({source:'clear'})` with/without pending rotation.
- **DoD:** standard.

### ST-4.3 Context injection and continuation prompt — M
- **Cites:** FR-09, AC-11.
- **Scope:** SessionStart(clear) returns `additionalContext` = current task revision + DoD + latest handover (channel per S-05); after `/clear` resolves, `$.prompt.submit` continuation: "You are session N of managed task X. First verify repository state against the handover (git status, files, last test results). Do not redo items under 'Completed' or 'Do not repeat'. Continue with 'Exact next actions' item 1." plus held prompts (ST-4.4); state CONTINUING.
- **Depends on:** ST-4.2.
- **AC:** (1) new conversation contains task + handover and no prior transcript; (2) continuation turn starts with no keystroke; (3) continuation text deterministic (snapshot).
- **Tests:** plugin tests; PTY E2E (ST-4.8).
- **DoD:** standard.

### ST-4.4 Held prompts during rotation — S
- **Cites:** ADR-010.
- **Scope:** `prompt.submit` composer prompts during HANDOVER_GENERATING…RESTORING → `{ drop: "Held by SessionRelay…" }`, stored (redacted copy for events, full text in state for delivery), appended to continuation.
- **Depends on:** ST-4.3, ST-0.6.
- **AC:** (1) typed prompt is neither lost nor sent to the old conversation; (2) delivered once; (3) slash commands like `/relay pause` still work during rotation; (4) the composer draft is cleared after holding (`$.prompt.fill` replace with empty text), because the engine leaves dropped text in the box (S-06); (5) the continuation quotes held prompts verbatim as the user's own words (ADR-010 A1).
- **Tests:** plugin tests.
- **DoD:** standard.

### ST-4.5 Rearm, loop guard, max rotations — S
- **Cites:** FR-03, §7 last invariant, §11 "new session > threshold".
- **Scope:** CONTINUING + fresh reading `< T−10` → MONITORING, `armedFired=false`, `sessionSequence++`; `≥ T−10` → FAILED(POSSIBLE_LOOP); `rotationCount ≥ maxRotationsPerTask` → PAUSED(MAX_ROTATIONS); `consecutiveFailures ≥ max` → FAILED.
- **Depends on:** ST-4.3.
- **AC:** each rule has a test; no rotation ever triggered from CONTINUING directly.
- **Tests:** unit.
- **DoD:** standard.

### ST-4.6 Assisted-mode fallback and `/relay continue` — M
- **Cites:** AC-25, ADR-002, PRD §3.3 go/no-go.
- **Scope:** if probe ≠ full or `/clear` rejects: keep validated handover, state NEEDS_REVIEW(ROTATE_UNAVAILABLE), message "Run /clear, then /relay continue"; `/relay continue` in a fresh conversation performs injection (via `$.session.append`) + continuation; status shows "assisted".
- **Depends on:** ST-4.3.
- **AC:** (1) in assisted mode, status/README never claim automatic rotation; (2) continue works only in a conversation with no prior turns (`$.session.turns() === 0`), else refuses with explanation.
- **Tests:** plugin tests with `$.command.run` mocked to reject.
- **DoD:** standard.

### ST-4.7 Manual `/relay rotate` — S
- **Cites:** FR-11, AC-15; Flow C.
- **Scope:** sets ROTATION_REQUESTED(MANUAL); identical pipeline; if idle, the next Stop happens only after a turn, so `rotate` while idle submits a tiny plugin prompt ("SessionRelay: prepare handover") to obtain a Stop.
- **Depends on:** ST-4.3.
- **AC:** (1) same effects sequence as threshold path (asserted by comparing effect logs); (2) no restart before validated handover.
- **Tests:** plugin test comparing effect traces.
- **DoD:** standard.

### ST-4.8 Fixture task and two-rotation PTY E2E harness — L
- **Cites:** AC-10, AC-11, AC-12; §14.3.
- **Scope:** `fixtures/build-repo.ts` (creates git repos: clean, dirty, detached, worktrees, failing tests); fixture task "implement 6 small functions with tests in order, one per step" sized to force rotations; `tests/pty/driver.ts` (generalised spike driver) with env flag `SESSIONRELAY_TEST_THRESHOLD_OVERRIDE` honoured only when `SESSIONRELAY_TEST=1` so rotations happen at low % cheaply; assertions on event log + git state.
- **Depends on:** ST-4.5, ST-5.2 (for clean end) — harness can start earlier with rotation-only assertions.
- **AC:** (1) ≥ 2 rotations, distinct session IDs, each start % < end %; (2) no function implemented twice (git log/diff check), final tests pass; (3) zero keystrokes after the initial prompt; (4) run cost noted.
- **Tests:** this is the test.
- **DoD:** + `npm run e2e:pty` documented; evidence artifact format defined (06 §5).

---

## E5 — Completion

### ST-5.1 Completion block and DoD evaluator — M
- **Cites:** FR-10, AC-13; ADR-007.
- **Scope:** parse `<<<SESSIONRELAY-COMPLETE v1 … >>>`; evaluate each verification command: last ledger entry with exact command, exit 0, timestamp after last edit; blockers list empty.
- **Depends on:** ST-3.1, ST-2.2.
- **AC:** (1) "done" without block → nothing; (2) block without evidence → missing list; (3) edit after passing test invalidates evidence.
- **Tests:** unit tables.
- **DoD:** standard.

### ST-5.2 Completion gate, `/relay done`, summary — S
- **Cites:** FR-10, AC-13; Flow F.
- **Scope:** at Stop: evidence missing → one `{ block }` listing checks to run; still missing → NEEDS_REVIEW(DOD_UNMET); passing → COMPLETED + summary (rotations, sessions, checks) + lock release; no verification commands → NEEDS_REVIEW, `/relay done` confirms (records user approval event).
- **Depends on:** ST-5.1, ST-3.3.
- **AC:** (1) AC-13 scenario passes; (2) COMPLETED stops all rotation; (3) user approval recorded as distinct event.
- **Tests:** plugin tests; E2E end state in ST-4.8.
- **DoD:** standard.

---

## E6 — Recovery and safety

### ST-6.1 Recovery classifier and `/relay recover` — L
- **Cites:** FR-12, AC-16; Flow E; 02 §8.
- **Scope:** `recovery.ts` maps on-disk state → action (table in 02 §8); `session.start` scan shows notice; `/relay recover` executes (takeover lock, inject last validated handover via `$.session.append`, continuation prompt noting possible gap); `autoRecover` option.
- **Depends on:** ST-4.3, ST-1.4.
- **AC:** (1) each row of 02 §8 has a test; (2) recover twice → second refuses (idempotent); (3) never starts when lock live; (4) corrupt `state.json` re-derived or NEEDS_REVIEW, never deleted.
- **Tests:** unit tables; plugin tests with seeded dirs.
- **DoD:** + troubleshooting doc section.

### ST-6.2 Error classification and pauses — M
- **Cites:** FR-12, AC-23, §10 rate limits.
- **Scope:** `classic.StopFailure.error` and `turn.complete.reason` → PAUSED codes (`RATE_LIMIT`, `AUTH`, `BILLING`, `OVERLOADED`, `API_ERROR`); no retries by the plugin; messages tell the user what to do (e.g. "/login", "wait for reset at …" from `rateLimits` when known).
- **Depends on:** ST-1.7.
- **AC:** (1) each error code → distinct reason and message; (2) no automatic resubmission loops; (3) rate limit ≠ threshold code.
- **Tests:** plugin tests raising `$.classic.StopFailure` per error.
- **DoD:** standard.

### ST-6.3 User interrupt and user `/clear` — S
- **Cites:** FR-11, §11 Ctrl+C.
- **Scope:** aborted turn during HANDOVER_GENERATING → PAUSED(USER_INTERRUPT); user `/clear` outside rotation → PAUSED(USER_CLEAR), `/relay resume` restores via injection.
- **Depends on:** ST-4.2.
- **AC:** Ctrl+C never followed by automatic plugin prompts; user `/clear` never auto-continues.
- **Tests:** plugin tests.
- **DoD:** standard.

### ST-6.4 Compaction policy — S
- **Cites:** SPIKE-04, §11 compaction row; ADR-006.
- **Scope:** `session.compact` hook: skip `precompute` while managed; log others; after compaction → ROTATION_REQUESTED(COMPACTED).
- **Depends on:** ST-2.4.
- **AC:** (1) manual/auto compaction not blocked; (2) precompute skipped only for active managed tasks; (3) rotation requested after compaction.
- **Tests:** plugin tests per trigger.
- **DoD:** standard.

### ST-6.5 Disk errors, repo mismatch, relink — M
- **Cites:** FR-12, §11 disk/path rows, AC-23.
- **Scope:** write failures → BLOCKED(DISK), keep last checkpoint; project path moved/branch switched → BLOCKED(REPO_MISMATCH) with `/relay recover --relink` after confirmation.
- **Depends on:** ST-6.1.
- **AC:** messages name the path and the fix; no continuation on mismatch.
- **Tests:** mocked fs failures; fixture repo moved.
- **DoD:** standard.

### ST-6.6 Concurrency: processes, worktrees, repos — M
- **Cites:** FR-13, AC-18, §10 multi-worktree.
- **Scope:** tests and fixes for: two `claude` processes same project (second gets LOCK_HELD, may create its own task), two worktrees, two repos simultaneously.
- **Depends on:** ST-1.4, ST-1.6, ST-2.1.
- **AC:** no cross-task file access (asserted by path audit in tests); same task single owner.
- **Tests:** multi-process PTY test (two drivers).
- **DoD:** standard.

### ST-6.7 Crash matrix harness — L
- **Cites:** AC-16, NFR-04.
- **Scope:** fault-injection env flag (test-only) that kills the process at named points: after THRESHOLD, mid-handover, after persist before swap, after swap before `/clear`, after `/clear` before inject, after inject before submit; then restart + `/relay recover`; assert exactly one continuation and no duplicated edit.
- **Depends on:** ST-6.1, ST-4.8.
- **AC:** all six points pass; report generated.
- **Tests:** this is the test.
- **DoD:** + crash-matrix.md evidence.

---

## E7 — Terminal UX

### ST-7.1 Status and transition output — M
- **Cites:** §4.3, FR-14, FR-17, NFR-02, NFR-08.
- **Scope:** `$.ui.status("Relay 34%/50%")`-style entry (unknown → "Relay ?/50%"); one `$.ui.log` line per transition (`Handover requested`, `Validated`, `Starting fresh`, `Session 2 · 4%`, `Paused: <reason>`); toast on errors; ASCII-only mode via `userConfig.plainText`; never per tool call.
- **Depends on:** ST-0.6, ST-1.9.
- **AC:** (1) strings ≤ 40 chars for status; (2) each state has a word label; (3) user's status line untouched.
- **Tests:** plugin UI tests on terminal surface; snapshot strings.
- **DoD:** + screenshots.

### ST-7.2 `/relay history` — S
- **Cites:** FR-14, §4.2.
- **Scope:** last 20 transitions from events (time, from→to, code, %), rotations summary.
- **Depends on:** ST-1.5.
- **AC:** readable at 80 columns; no secrets.
- **Tests:** plugin test.
- **DoD:** standard.

### ST-7.3 First-activation notice and message catalogue — S
- **Status:** Solved (4e2b542).
- **Cites:** §4.1, AC-23.
- **Scope:** first `/relay on` per machine: 3-line notice (state stored locally at <path>, a fresh conversation will be started automatically, how to pause); all messages in `ui.ts` catalogue with codes.
- **Depends on:** ST-2.1.
- **AC:** notice shown once (`$.store` flag); every reason code has a message.
- **Tests:** unit coverage check that all codes map.
- **DoD:** standard.

---

## E8 — Distribution and docs

### ST-8.1 Marketplace, install/uninstall, purge — M
- **Cites:** FR-15, AC-01, AC-20; §10 cleanup.
- **Scope:** `.claude-plugin/marketplace.json`; README install line; verify `claude plugin uninstall` leaves `~/.claude/settings.json` without SessionRelay entries beyond what Claude itself manages; `/relay purge [--task id|--project|--all]` with typed confirmation; uninstall never touches the state dir (documented manual delete path).
- **Depends on:** ST-7.3.
- **AC:** clean machine install → working `/relay status` in < 5 minutes; uninstall diff of settings = only plugin enable entry removed; purge requires confirmation and scope.
- **Tests:** scripted clean-user (`HOME=$(mktemp -d)`) install/uninstall where auth allows; manual on clean macOS user.
- **DoD:** + recording.

### ST-8.2 Documentation set — M
- **Cites:** FR-15, §17 README list, AC-21.
- **Scope:** README (problem, demo GIF, requirements, install/update/uninstall, quickstart Cursor + Terminal, what auto does / doesn't / when it stops, data & privacy, commands, config, troubleshooting, FAQ), `docs/architecture.md`, `docs/troubleshooting.md`, `docs/compatibility.md`, `PRIVACY.md`.
- **Depends on:** ST-4.8, ST-6.1.
- **AC:** a newcomer follows quickstart without reading code; every command and config row documented with default.
- **Tests:** doc walkthrough by someone not on the project (or a fresh agent session) recorded.
- **DoD:** standard.

### ST-8.3 Diagnose and compatibility CI — M
- **Cites:** FR-01, NFR-06, AC-22.
- **Scope:** `/relay status --diagnose` (version, probe, org policy hints, state dir writable, git available, lock state; redacted, copyable); CI job that installs pinned Claude Code versions (where licensing/auth permits non-auth checks: `claude plugin validate`, `claude plugin test`) and runs mod tests; compatibility.md generated from results.
- **Depends on:** ST-1.8.
- **AC:** diagnose output contains no secrets; matrix lists exact versions tested.
- **Tests:** plugin test for diagnose; CI run.
- **DoD:** standard.

### ST-8.4 Contributor experience — S
- **Cites:** FR-15, AC-21.
- **Scope:** CONTRIBUTING (setup, tests, PTY E2E cost note), issue/PR templates, CODE_OF_CONDUCT, `npm run` scripts listed.
- **Depends on:** ST-1.1.
- **AC:** new contributor builds and runs unit + mod tests from docs alone.
- **Tests:** fresh-clone walkthrough.
- **DoD:** standard.

---

## E9 — Public beta

### ST-9.1 Security and privacy review — M
- **Cites:** FR-16, §10, PRD MVP DoD.
- **Scope:** threat model (prompt injection via repo/handover text, secret leakage, lock abuse, path traversal in state paths, `$.process.run` argv building); verify no shell strings executed, no permission changes, no network calls; dependency review (dev only).
- **Depends on:** E6 complete.
- **AC:** findings triaged; no Critical/High open; SECURITY.md published.
- **Tests:** targeted tests for each mitigated threat.
- **DoD:** + threat-model.md.

### ST-9.2 Real Cursor demo and AC evidence pack — M
- **Cites:** AC-01…AC-25, PRD §20.
- **Scope:** run the fixture task in Cursor on the default model with threshold 50% using a context-heavy task (or documented test override at e.g. 15% with the reason) → ≥ 2 rotations; fill the AC table with links to evidence.
- **Depends on:** all P0 stories.
- **AC:** every AC pass/fail/not-supported with evidence; demo video ≤ 3 min. Must include, in Cursor, before and after rotation: typing during a running turn, a Bash permission prompt (Yes and No), and a Unicode paste/reply (carried over from S-01, D-14).
- **Tests:** this is the test.
- **DoD:** + `docs/evidence/v0.1.0/`.

### ST-9.3 Naming check and release pipeline — M
- **Cites:** FR-15, R-10, PRD §17 branding.
- **Scope:** check name/domain/GitHub/npm availability and trademark conflicts; release workflow (tag → CI → GitHub release with zip + checksums + provenance attestation); CHANGELOG; version bump in plugin.json.
- **Depends on:** ST-9.1, ST-9.2.
- **AC:** reproducible artifact (same hash from clean checkout); release notes state exact capabilities and supported versions.
- **Tests:** dry-run release on a fork.
- **DoD:** + maintainer sign-off.

---

**Count:** 56 stories (E0 7, E1 9, E2 5, E3 8, E4 8, E5 2, E6 7, E7 3, E8 4, E9 3): 5 L, 30 M, 21 S. At the size midpoints (S 0.5 d, M 1.5 d, L 3.5 d) that is ≈ 73 engineer-days for one developer.
