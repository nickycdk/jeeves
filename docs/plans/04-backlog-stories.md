# 04 — Backlog Stories

Stories are listed in dependency order; implement top to bottom. IDs are `ST-<epic>.<n>`. Sizes: **S** ≤ 0.5 day, **M** 1–2 days, **L** 3–4 days.

**Standard story DoD (applies to every story; each story lists only its extra items):**
1. Behaviour meets the story's AC. 2. Unit tests (core) and/or `claude plugin test` tests (adapter) added; all tests pass. 3. `npm run typecheck`, `npm run lint`, `claude plugin validate .` pass. 4. Error, cancellation and recovery paths covered by a test. 5. No secrets or transcripts logged (redaction test where text is persisted). 6. User-facing text is plain, has a text label (no colour/emoji-only meaning). 7. Docs/CHANGELOG updated if behaviour is visible. 8. Reviewed; no Critical/High findings open.

Module names refer to `02-architecture-and-adrs.md` §3.

**Progress (2026-11-08):** E0, E1, E2, E3, E4, E5 solved (M4 gate passed); E6 solved (M5 gate passed); E7 and E8 solved (M6 gate passed: AC-01 fresh macOS user and AC-02 Cursor checklist, maintainer-reported); E9: ST-9.1 solved, ST-9.2 agent part done, ST-9.3 prepared (M7 built, gate open); plus ST-7.3. M8 (v0.2, E10–E12) built 2026-11-08: E10 and E11 solved, E12 solved with ST-12.5 signed off (`handoff-m8.md`). Each solved story has a **Status** line under its heading. Everything without one is open.

---

## E0 — Feasibility closeout

### ST-0.1 Cursor rotation manual spike (S-01) — S
- **Status:** Solved (M0; docs/done/evidence/m0-m7/s-01-cursor, partial Cursor checklist accepted in D-14).
- **Cites:** SPIKE-01, NFR-02, AC-02.
- **Scope:** Prove the spike mod rotates inside Cursor's integrated terminal with normal interaction. Out: product code.
- **Approach:** `claude --plugin-dir docs/done/evidence/m0-m7/spike-01-mod-rotation/mod --model haiku` in a scratch git repo inside Cursor; follow 06 §6 checklist (type during turns, resize pane, Ctrl+C at idle and mid-turn, Esc, trigger a Bash permission prompt with default mode, paste Unicode/emoji).
- **Depends on:** none.
- **AC:** (1) rotation completes with new session ID in the log; (2) each checklist item behaves the same before and after rotation; (3) screen recording saved (secrets-free).
- **Tests:** manual checklist; log diff.
- **DoD:** + `docs/done/evidence/m0-m7/s-01-cursor/RESULT.md` with versions (Cursor, Claude Code, macOS).

### ST-0.2 Work-in-flight spike (S-02) — S
- **Status:** Solved (M0; docs/done/evidence/m0-m7/s-02-work-in-flight).
- **Cites:** SPIKE-05, FR-04, AC-07.
- **Scope:** Observe Stop/`$.agent.list()` with a background shell and a background subagent.
- **Approach:** Extend spike mod: log `background_tasks`, `session_crons`, `$.agent.list()` at Stop; prompt starts `sleep 45 &` via Bash `run_in_background` and a background Agent.
- **Depends on:** none.
- **AC:** (1) non-empty `background_tasks` observed with types; (2) rotation deferred until empty; (3) `ps` shows no orphan after rotation.
- **Tests:** PTY driver run, `ps` snapshot.
- **DoD:** + RESULT.md incl. exact field shapes.

### ST-0.3 Soft-quiesce spike (S-03) — S
- **Status:** Solved (M0; docs/done/evidence/m0-m7/s-03-soft-quiesce).
- **Cites:** FR-04.
- **Scope:** Measure whether a hidden `$.session.append` note mid-turn makes Claude stop soon.
- **Approach:** Long multi-file fixture prompt; at first `tool.call` result after a fake threshold, append note; count further tool calls; 5 runs.
- **Depends on:** none.
- **AC:** result recorded; pass if ≤ 3 further tool calls in ≥ 4/5 runs, else ADR-004 drops soft quiesce.
- **Tests:** PTY runs.
- **DoD:** + RESULT.md with counts.

### ST-0.4 `/clear` carry-over spike (S-04) — S
- **Status:** Solved (M0; docs/done/evidence/m0-m7/s-04-clear-carryover).
- **Cites:** SPIKE-06, FR-08.
- **Scope:** `--add-dir`, session-granted permission, plan mode, session cron across `/clear`.
- **Approach:** Spike mod logs `permission_mode`; probe add-dir by asking Claude to read a file there; grant "yes, for this session" on a Bash command then repeat it after rotation; create a cron with `/loop`.
- **Depends on:** none.
- **AC:** table kept/lost for each; ADR-004/README updated accordingly.
- **Tests:** PTY run(s).
- **DoD:** + RESULT.md.

### ST-0.5 Handover size and parse spike (S-05) — M
- **Status:** Solved (M0; docs/done/evidence/m0-m7/s-05-handover-size-parse).
- **Cites:** FR-06, FR-07, AC-08.
- **Scope:** Deliverability of 4K/12K/30K-char `additionalContext`; parse rate of draft template.
- **Approach:** Inject marker text at end of each payload and ask the model to quote it; run draft instruction (ST-3.4) 10× on fixture repo with a throwaway parser.
- **Depends on:** none.
- **AC:** 12K delivered intact; parse ≥ 9/10 first try, 10/10 within 2 retries; else adopt fallback (prompt.submit channel and/or tool-based handover).
- **Tests:** PTY runs.
- **DoD:** + RESULT.md, chosen channel recorded in ADR-003.

### ST-0.6 Status coexistence and queued input spike (S-06) — S
- **Status:** Solved (M0; docs/done/evidence/m0-m7/s-06-status-queued-input).
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
- **Scope:** register `relay` (fallback `jeeves` on collision); parse subcommands; unknown subcommand → help; `status` shows mode, task, state, context (or unknown), threshold, rotation count, last success/error, state path.
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
- **Status:** Solved (3c2a5a2, review fixes 92f7941). M4: `/relay dod|check` before the first prompt are queued and written as revisions 2.. right after it (23f24f2, 29343ff).
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
- **Status:** Solved (28bd873).
- **Note (D-23):** also covers a request that lands after the turn's Stop: submit a short plugin prompt to get a Stop, so rotation never waits for the user.
- **Cites:** FR-08, AC-10.
- **Scope:** on main `turn.complete` with state ROTATING and verified handover: `$.clock.after(0)` → `$.command.run({ command: 'clear' })`; dedupe by `rotationId:clear`; rejection → ST-4.6.
- **Depends on:** ST-3.8.
- **AC:** (1) exactly one `/clear` per rotation even with duplicate events or worker respawn; (2) never runs without verified handover; (3) never `--resume`/`--continue`/fork.
- **Tests:** plugin tests with duplicated `turn.complete`; respawn simulation.
- **DoD:** standard.

### ST-4.2 Rotation boundary detection and lock transfer — M
- **Status:** Solved (c37323c).
- **Cites:** FR-08, §7 invariants.
- **Scope:** `session.end(reason clear)` while ROTATING → record `sourceSessionId`, write `sessions/NNN.json`; `classic.SessionStart(source clear)` → `targetSessionId`, lock owner := new id, state RESTORING.
- **Depends on:** ST-4.1.
- **AC:** (1) source ≠ target asserted; (2) `/clear` not initiated by Jeeves is not treated as rotation (→ ST-6.3); (3) session file immutable.
- **Tests:** plugin tests raising `$.classic.SessionStart({source:'clear'})` with/without pending rotation.
- **DoD:** standard.

### ST-4.3 Context injection and continuation prompt — M
- **Status:** Solved (c71fec1; review fix 23f24f2).
- **Note (D-23):** the continuation prompt is generated from the validated handover and states what has been built (completed work, files, checks and results) and exactly where to pick up (next actions).
- **Cites:** FR-09, AC-11.
- **Scope:** SessionStart(clear) returns `additionalContext` = current task revision + DoD + latest handover (channel per S-05); after `/clear` resolves, `$.prompt.submit` continuation: "You are session N of managed task X. First verify repository state against the handover (git status, files, last test results). Do not redo items under 'Completed' or 'Do not repeat'. Continue with 'Exact next actions' item 1." plus held prompts (ST-4.4); state CONTINUING.
- **Depends on:** ST-4.2.
- **AC:** (1) new conversation contains task + handover and no prior transcript; (2) continuation turn starts with no keystroke; (3) continuation text deterministic (snapshot).
- **Tests:** plugin tests; PTY E2E (ST-4.8).
- **DoD:** standard.

### ST-4.4 Held prompts during rotation — S
- **Status:** Solved (05775ed; review fix 23f24f2).
- **Cites:** ADR-010.
- **Scope:** `prompt.submit` composer prompts during HANDOVER_GENERATING…RESTORING → `{ drop: "Held by Jeeves…" }`, stored (redacted copy for events, full text in state for delivery), appended to continuation.
- **Depends on:** ST-4.3, ST-0.6.
- **AC:** (1) typed prompt is neither lost nor sent to the old conversation; (2) delivered once; (3) slash commands like `/relay pause` still work during rotation; (4) the composer draft is cleared after holding (`$.prompt.fill` replace with empty text), because the engine leaves dropped text in the box (S-06); (5) the continuation quotes held prompts verbatim as the user's own words (ADR-010 A1).
- **Tests:** plugin tests.
- **DoD:** standard.

### ST-4.5 Rearm, loop guard, max rotations — S
- **Status:** Solved (e9b41a3).
- **Cites:** FR-03, §7 last invariant, §11 "new session > threshold".
- **Scope:** CONTINUING + fresh reading `< T−10` → MONITORING, `armedFired=false`, `sessionSequence++`; `≥ T−10` → FAILED(POSSIBLE_LOOP); `rotationCount ≥ maxRotationsPerTask` → PAUSED(MAX_ROTATIONS); `consecutiveFailures ≥ max` → FAILED.
- **Depends on:** ST-4.3.
- **AC:** each rule has a test; no rotation ever triggered from CONTINUING directly.
- **Tests:** unit.
- **DoD:** standard.

### ST-4.6 Assisted-mode fallback and `/relay continue` — M
- **Status:** Solved (f2b7c15; review fix 23f24f2). Context goes in the prompt, not `$.session.append` (D-24).
- **Cites:** AC-25, ADR-002, PRD §3.3 go/no-go.
- **Scope:** if probe ≠ full or `/clear` rejects: keep validated handover, state NEEDS_REVIEW(ROTATE_UNAVAILABLE), message "Run /clear, then /relay continue"; `/relay continue` in a fresh conversation performs injection (via `$.session.append`) + continuation; status shows "assisted".
- **Depends on:** ST-4.3.
- **AC:** (1) in assisted mode, status/README never claim automatic rotation; (2) continue works only in a conversation with no prior turns (`$.session.turns() === 0`), else refuses with explanation.
- **Tests:** plugin tests with `$.command.run` mocked to reject.
- **DoD:** standard.

### ST-4.7 Manual `/relay rotate` — S
- **Status:** Solved (7d7a400).
- **Cites:** FR-11, AC-15; Flow C.
- **Scope:** sets ROTATION_REQUESTED(MANUAL); identical pipeline; if idle, the next Stop happens only after a turn, so `rotate` while idle submits a tiny plugin prompt ("Jeeves: prepare handover") to obtain a Stop.
- **Depends on:** ST-4.3.
- **AC:** (1) same effects sequence as threshold path (asserted by comparing effect logs); (2) no restart before validated handover.
- **Tests:** plugin test comparing effect traces.
- **DoD:** standard.

### ST-4.8 Fixture task and two-rotation PTY E2E harness — L
- **Status:** Solved (312d007; relative threshold 17d8379 … f54c910; live fixes bdb8655, af7a534; review fixes 29343ff, 55b0231). Gate runs 5 and 6 (`docs/done/evidence/m0-m7/m4-e2e/gate-run5/`, `gate-run6/`): 5 and 4 live rotations, zero keystrokes after setup, one commit per step, COMPLETED.
- **Cites:** AC-10, AC-11, AC-12; §14.3.
- **Scope:** `fixtures/build-repo.ts` (creates git repos: clean, dirty, detached, worktrees, failing tests); fixture task "implement 6 small functions with tests in order, one per step" sized to force rotations; `tests/pty/driver.ts` (generalised spike driver) with env flag `JEEVES_TEST_THRESHOLD_OVERRIDE` honoured only when `JEEVES_TEST=1` so rotations happen at low % cheaply; assertions on event log + git state.
- **Depends on:** ST-4.5, ST-5.2 (for clean end) — harness can start earlier with rotation-only assertions.
- **AC:** (1) ≥ 2 rotations, distinct session IDs, each start % < end %; (2) no function implemented twice (git log/diff check), final tests pass; (3) zero keystrokes after the initial prompt; (4) run cost noted.
- **Tests:** this is the test.
- **DoD:** + `npm run e2e:pty` documented; evidence artifact format defined (06 §5).

---

## E5 — Completion

### ST-5.1 Completion block and DoD evaluator — M
- **Status:** Solved (bde8a5d).
- **Cites:** FR-10, AC-13; ADR-007.
- **Scope:** parse `<<<JEEVES-COMPLETE v1 … >>>`; evaluate each verification command: last ledger entry with exact command, exit 0, timestamp after last edit; blockers list empty.
- **Depends on:** ST-3.1, ST-2.2.
- **AC:** (1) "done" without block → nothing; (2) block without evidence → missing list; (3) edit after passing test invalidates evidence.
- **Tests:** unit tables.
- **DoD:** standard.

### ST-5.2 Completion gate, `/relay done`, summary — S
- **Status:** Solved (6088399; review fix 23f24f2).
- **Cites:** FR-10, AC-13; Flow F.
- **Scope:** at Stop: evidence missing → one `{ block }` listing checks to run; still missing → NEEDS_REVIEW(DOD_UNMET); passing → COMPLETED + summary (rotations, sessions, checks) + lock release; no verification commands → NEEDS_REVIEW, `/relay done` confirms (records user approval event).
- **Depends on:** ST-5.1, ST-3.3.
- **AC:** (1) AC-13 scenario passes; (2) COMPLETED stops all rotation; (3) user approval recorded as distinct event.
- **Tests:** plugin tests; E2E end state in ST-4.8.
- **DoD:** standard.

---

## E6 — Recovery and safety

### ST-6.1 Recovery classifier and `/relay recover` — L
- **Status:** Solved (M5; `src/core/recovery.ts`, `src/adapter/recover.ts`; `tests/unit/recovery.spec.ts` one test per 02 §8 row, `tests/mod/recover.test.ts`). Per the maintainer (2026-11-07) the handover goes into the continuation prompt's text (ADR-003 channel note, D-13), not `$.session.append`. Readings: a MONITORING task whose session crashed or exited is recoverable too (carried "MONITORING crash adoption"); a VALIDATING task whose handover file was saved adopts it (carried "VALIDATING left standing"); a lock owned by a session this process ended can be taken at once (a `/clear` that never brought its SessionStart); `autoRecover` is a `userConfig` row. Startup notice also names a task another session holds. REPO_MISMATCH row: ST-6.5.
- **Cites:** FR-12, AC-16; Flow E; 02 §8.
- **Scope:** `recovery.ts` maps on-disk state → action (table in 02 §8); `session.start` scan shows notice; `/relay recover` executes (takeover lock, inject last validated handover via `$.session.append`, continuation prompt noting possible gap); `autoRecover` option.
- **Depends on:** ST-4.3, ST-1.4.
- **AC:** (1) each row of 02 §8 has a test; (2) recover twice → second refuses (idempotent); (3) never starts when lock live; (4) corrupt `state.json` re-derived or NEEDS_REVIEW, never deleted.
- **Tests:** unit tables; plugin tests with seeded dirs.
- **DoD:** + troubleshooting doc section.

### ST-6.2 Error classification and pauses — M
- **Status:** Solved (M5; `tests/mod/stopfailure.test.ts`, `tests/unit/messages.spec.ts` snapshot `tests/fixtures/messages.txt`, reducer test). An API-error pause does not count toward `maxConsecutiveFailures`. `turn.complete` reason `error` needs nothing extra: the StopFailure hook classifies, and the IDLE nudge only fires in ROTATION_REQUESTED, which the pause ends.
- **Cites:** FR-12, AC-23, §10 rate limits.
- **Scope:** `classic.StopFailure.error` and `turn.complete.reason` → PAUSED codes (`RATE_LIMIT`, `AUTH`, `BILLING`, `OVERLOADED`, `API_ERROR`); no retries by the plugin; messages tell the user what to do (e.g. "/login", "wait for reset at …" from `rateLimits` when known).
- **Depends on:** ST-1.7.
- **AC:** (1) each error code → distinct reason and message; (2) no automatic resubmission loops; (3) rate limit ≠ threshold code.
- **Tests:** plugin tests raising `$.classic.StopFailure` per error.
- **DoD:** standard.

### ST-6.3 User interrupt and user `/clear` — S
- **Status:** Solved (M5). USER_INTERRUPT and USER_CLEAR were built in M3/M4; M5 closed one gap: an interrupt while a handover is only requested also rules out the later nudge (a late reading with no turn open sent one). Tests: `clear.test.ts` (user /clear in ROTATION_REQUESTED and HANDOVER_GENERATING, no prompt until `/relay resume`, then exactly one), `rotate.test.ts`, reducer test.
- **Cites:** FR-11, §11 Ctrl+C.
- **Scope:** aborted turn during HANDOVER_GENERATING → PAUSED(USER_INTERRUPT); user `/clear` outside rotation → PAUSED(USER_CLEAR), `/relay resume` restores via injection.
- **Depends on:** ST-4.2.
- **AC:** Ctrl+C never followed by automatic plugin prompts; user `/clear` never auto-continues.
- **Tests:** plugin tests.
- **DoD:** standard.

### ST-6.4 Compaction policy — S
- **Status:** Solved (M5; `tests/mod/compact.test.ts`). "Active managed" = this session owns a task that is not inert (MONITORING … CONTINUING and the rotation states). A subagent's compaction passes through. The event line says which trigger (`after manual compaction`); a compaction outside MONITORING/CONTINUING is logged to the debug log only. A manual `/compact` leaves Claude idle, so the request gets the D-23 nudge. Not run live.
- **Cites:** SPIKE-04, §11 compaction row; ADR-006.
- **Scope:** `session.compact` hook: skip `precompute` while managed; log others; after compaction → ROTATION_REQUESTED(COMPACTED).
- **Depends on:** ST-2.4.
- **AC:** (1) manual/auto compaction not blocked; (2) precompute skipped only for active managed tasks; (3) rotation requested after compaction.
- **Tests:** plugin tests per trigger.
- **DoD:** standard.

### ST-6.5 Disk errors, repo mismatch, relink — M
- **Status:** Solved (M5; `tests/mod/repo.test.ts`, reducer test, AC-23 snapshot). Readings: "branch switched" = the repository's branch differs from the `- Branch:` line of the handover being restored (checked on every restore-path continuation: recover, resume after USER_CLEAR, assisted continue); a branch Claude switches to during the task is fine, since each handover records the branch at its time. "Path moved" = a task of another project whose `project.json` worktree no longer exists (with git, its start commit must exist here); `project.json` is now written at task start. Unverified: the `git cat-file -e` filter on a real moved git repository (mod test is non-git).
- **Cites:** FR-12, §11 disk/path rows, AC-23.
- **Scope:** write failures → BLOCKED(DISK), keep last checkpoint; project path moved/branch switched → BLOCKED(REPO_MISMATCH) with `/relay recover --relink` after confirmation.
- **Depends on:** ST-6.1.
- **AC:** messages name the path and the fix; no continuation on mismatch.
- **Tests:** mocked fs failures; fixture repo moved.
- **DoD:** standard.

### ST-6.6 Concurrency: processes, worktrees, repos — M
- **Status:** Solved (M5; `tests/mod/concurrency.test.ts` path audit, `tests/pty/concurrency.py` live: `docs/done/evidence/m0-m7/m5-concurrency/RESULT.md`, 17/17, 4 processes, US$0.00). Per the maintainer (2026-11-07), `/relay on` while another live session owns the project's task starts a separate task (D-18 follow-up). The fresh SessionStart and held prompts take a clearing rotation only from a session this process ended (closes the M4 shortcut). Audit rule: a session writes only in its own task folder; it reads another task's `state.json` and `lock.d/owner.json` only (discovery).
- **Cites:** FR-13, AC-18, §10 multi-worktree.
- **Scope:** tests and fixes for: two `claude` processes same project (second gets LOCK_HELD, may create its own task), two worktrees, two repos simultaneously.
- **Depends on:** ST-1.4, ST-1.6, ST-2.1.
- **AC:** no cross-task file access (asserted by path audit in tests); same task single owner.
- **Tests:** multi-process PTY test (two drivers).
- **DoD:** standard.

### ST-6.7 Crash matrix harness — L
- **Status:** Solved (M5; `tests/mod/crash.test.ts`, `npm run crash:report` -> `docs/done/evidence/m0-m7/m5-crash/crash-matrix.md`, 6/6). The test-only flag `JEEVES_TEST_CRASH=<point>` (with `JEEVES_TEST=1`) makes the plugin log `jeeves: crash point <point>` and never return, which is a dead process from the plugin's view; the mod test restarts as a new session, the live demo's driver kills the real process on the marker. "No duplicated edit" is asserted as: one continuation, no handover file written twice, continuation built from the saved handover.
- **Cites:** AC-16, NFR-04.
- **Scope:** fault-injection env flag (test-only) that kills the process at named points: after THRESHOLD, mid-handover, after persist before swap, after swap before `/clear`, after `/clear` before inject, after inject before submit; then restart + `/relay recover`; assert exactly one continuation and no duplicated edit.
- **Depends on:** ST-6.1, ST-4.8.
- **AC:** all six points pass; report generated.
- **Tests:** this is the test.
- **DoD:** + crash-matrix.md evidence.

---

## E7 — Terminal UX

### ST-7.1 Status and transition output — M
- **Status:** Solved (M6). `statusLine`/`transitionLine` in `ui.ts`, wired in `task.ts` `transition`; `tests/mod/ui.test.ts`, `tests/unit/ui.spec.ts`. Plan change: no `userConfig.plainText`, because every Jeeves string is already plain ASCII with a word label (`ui.ts` rule, unit-tested), so the option would change nothing. Screenshots come from the M6 live run.
- **Cites:** §4.3, FR-14, FR-17, NFR-02, NFR-08.
- **Scope:** `$.ui.status("Relay 34%/50%")`-style entry (unknown → "Relay ?/50%"); one `$.ui.log` line per transition (`Handover requested`, `Validated`, `Starting fresh`, `Session 2 · 4%`, `Paused: <reason>`); toast on errors; ASCII-only mode via `userConfig.plainText`; never per tool call.
- **Depends on:** ST-0.6, ST-1.9.
- **AC:** (1) strings ≤ 40 chars for status; (2) each state has a word label; (3) user's status line untouched.
- **Tests:** plugin UI tests on terminal surface; snapshot strings.
- **DoD:** + screenshots.

### ST-7.2 `/relay history` — S
- **Status:** Solved (M6). `/jeeves history`: `historyText` in `ui.ts`; `tests/mod/history.test.ts`.
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
- **Status:** Solved (M6) for the scripted clean user; the manual run on a fresh macOS user account (AC-01 M layer, timed, recorded) is the maintainer's. Root `.claude-plugin/marketplace.json` (`source: ./jeeves`: the plugin sits in `jeeves/`, not at the root as 08 §1 assumed); README install/update/uninstall; `/jeeves purge` (`src/adapter/purge.ts`, `tests/mod/purge.test.ts`): scope, folder list, code, confirm within 2 min, refuses running or live-locked tasks, deletes only under `<root>/projects`. `tests/pty/clean_install.py` (fresh `HOME`, no login, no model call): 11/11, installed in 2 s, `/jeeves status` at 15 s, uninstall diff = only the `enabledPlugins` entry, state folder kept (`docs/done/evidence/m0-m7/m6-install/RESULT.md`). The recording is `plain.txt`/`raw.txt` of that run. Confirmation is a code, not a dialog, because a `command.run` answer cannot wait for input.
- **Cites:** FR-15, AC-01, AC-20; §10 cleanup.
- **Scope:** `.claude-plugin/marketplace.json`; README install line; verify `claude plugin uninstall` leaves `~/.claude/settings.json` without Jeeves entries beyond what Claude itself manages; `/relay purge [--task id|--project|--all]` with typed confirmation; uninstall never touches the state dir (documented manual delete path).
- **Depends on:** ST-7.3.
- **AC:** clean machine install → working `/relay status` in < 5 minutes; uninstall diff of settings = only plugin enable entry removed; purge requires confirmation and scope.
- **Tests:** scripted clean-user (`HOME=$(mktemp -d)`) install/uninstall where auth allows; manual on clean macOS user.
- **DoD:** + recording.

### ST-8.2 Documentation set — M
- **Status:** Solved (M6). README rewrite (problem, requirements, install/update/uninstall, quickstart, what it does and does not, stop reasons, modes, data, every command and setting with default, FAQ), `docs/troubleshooting.md`, `docs/architecture.md`, `docs/compatibility.md`, PRIVACY retention section. Walkthrough by a fresh agent that read only the docs: install, update, configure, uninstall worked; 13 doc problems found and fixed (2e329fc). Demo GIF left to ST-9.2.
- **Cites:** FR-15, §17 README list, AC-21.
- **Scope:** README (problem, demo GIF, requirements, install/update/uninstall, quickstart Cursor + Terminal, what auto does / doesn't / when it stops, data & privacy, commands, config, troubleshooting, FAQ), `docs/architecture.md`, `docs/troubleshooting.md`, `docs/compatibility.md`, `PRIVACY.md`.
- **Depends on:** ST-4.8, ST-6.1.
- **AC:** a newcomer follows quickstart without reading code; every command and config row documented with default.
- **Tests:** doc walkthrough by someone not on the project (or a fresh agent session) recorded.
- **DoD:** standard.

### ST-8.3 Diagnose and compatibility CI — M
- **Status:** Solved (M6) locally; the CI job is written but has never run (no remote). `/jeeves status --diagnose` (`src/adapter/diagnose.ts`, `tests/mod/diagnose.test.ts`); `scripts/compat.mjs` (`npm run compat`) installs each version from npm into a scratch folder and runs validate + test logged out; `.github/workflows/compat.yml`; `docs/compatibility.md`: 2.1.303 … 2.1.319 pass, 2.1.287 and 2.1.295 fail validation (`$` passed across an import). `claude plugin validate/test` need no login (checked with an empty `CLAUDE_CONFIG_DIR`).
- **Cites:** FR-01, NFR-06, AC-22.
- **Scope:** `/relay status --diagnose` (version, probe, org policy hints, state dir writable, git available, lock state; redacted, copyable); CI job that installs pinned Claude Code versions (where licensing/auth permits non-auth checks: `claude plugin validate`, `claude plugin test`) and runs mod tests; compatibility.md generated from results.
- **Depends on:** ST-1.8.
- **AC:** diagnose output contains no secrets; matrix lists exact versions tested.
- **Tests:** plugin test for diagnose; CI run.
- **DoD:** standard.

### ST-8.4 Contributor experience — S
- **Status:** Solved (M6). CONTRIBUTING (every script, test layers, PTY cost note, story/ADR process), `.github/ISSUE_TEMPLATE/{bug,feature,compatibility}.yml` (bug asks for `--diagnose`), PR template, CODE_OF_CONDUCT (Contributor Covenant 2.1 by reference; reporting address to be set at publication), root README. Fresh-clone walkthrough by a fresh agent: `npm ci`, 238 unit, 146 mod, lint, validate pass from the docs alone; full typecheck needs the engine types from one interactive `claude --plugin-dir .` (documented; `check-all.sh` falls back to core-only with a warning).
- **Cites:** FR-15, AC-21.
- **Scope:** CONTRIBUTING (setup, tests, PTY E2E cost note), issue/PR templates, CODE_OF_CONDUCT, `npm run` scripts listed.
- **Depends on:** ST-1.1.
- **AC:** new contributor builds and runs unit + mod tests from docs alone.
- **Tests:** fresh-clone walkthrough.
- **DoD:** standard.

---

## E9 — Public beta

### ST-9.1 Security and privacy review — M
- **Status:** Solved (M7, 2026-11-08). `jeeves/docs/threat-model.md` (T1-T9, findings F-1…F-8), `jeeves/SECURITY.md` (+ `.github/SECURITY.md` pointer). F-1 (git option injection from `state.json`, Medium) and F-2 (path segments from `state.json`, Medium) reproduced and fixed with schema patterns and an argv re-check; F-3 (commands named by a repo's own `.git/config`, Low) partly fixed (fsmonitor off; filter drivers accepted, same exposure as Claude Code's own `git status`); F-4 PRIVACY gap fixed; F-5…F-7 accepted; F-8 (Actions pinned by tag) open for ST-9.3. No Critical/High. Tests: `tests/unit/security.spec.ts`, ST-9.1 rows in `schema.spec.ts` and `git.spec.ts`.
- **Cites:** FR-16, §10, PRD MVP DoD.
- **Scope:** threat model (prompt injection via repo/handover text, secret leakage, lock abuse, path traversal in state paths, `$.process.run` argv building); verify no shell strings executed, no permission changes, no network calls; dependency review (dev only).
- **Depends on:** E6 complete.
- **AC:** findings triaged; no Critical/High open; SECURITY.md published.
- **Tests:** targeted tests for each mitigated threat.
- **DoD:** + threat-model.md.

### ST-9.2 Real Cursor demo and AC evidence pack — M
- **Status:** Solved (M7, 2026-11-08, scope amended by D-34). `docs/done/evidence/v0.1.0/README.md` (AC-01…AC-25 with results and links), E-layer runs (`e-layers/RESULT.md`, US$0.21: AC-03, AC-09 pass; AC-10 probe inconclusive; AC-07 E not exercised), `cursor-demo-script.md`. The Cursor two-rotation demo, the video and the AC-01/AC-02 recordings were dropped by the maintainer (D-34); AC-02 rests on the M6 one-rotation Cursor checklist. **Solved** with that amendment.
- **Cites:** AC-01…AC-25, PRD §20.
- **Scope:** run the fixture task in Cursor on the default model with threshold 50% using a context-heavy task (or documented test override at e.g. 15% with the reason) → ≥ 2 rotations; fill the AC table with links to evidence.
- **Depends on:** all P0 stories.
- **AC:** every AC pass/fail/not-supported with evidence; demo video ≤ 3 min. Must include, in Cursor, before and after rotation: typing during a running turn, a Bash permission prompt (Yes and No), and a Unicode paste/reply (carried over from S-01, D-14).
- **Tests:** this is the test.
- **DoD:** + `docs/done/evidence/v0.1.0/`.

### ST-9.3 Naming check and release pipeline — M
- **Status:** Prepared (M7, 2026-11-08); publishing is the maintainer's. Naming check: `docs/done/evidence/v0.1.0/naming-check.md` (usable for a free OSS beta; Medium trademark note on JEEVES.AI and a pending ASK JEEVES filing, confirm in TSDR). Release pipeline: `jeeves/scripts/release-zip.sh` (uncompressed `git archive`: same SHA-256 from two clean clones and the working tree, verified locally; the unzipped artifact passes `claude plugin validate`), `.github/workflows/release.yml` (tag → CI via `workflow_call` → zip + SHA-256 → provenance attestation → **draft** release), Actions pinned by SHA in all workflows; version 0.1.0 in `plugin.json`/`package.json`; release notes `jeeves/docs/release-notes/v0.1.0.md`. Not done: the dry run on a fork (no remote; maintainer), the tag, the publication, maintainer sign-off.
- **Cites:** FR-15, R-10, PRD §17 branding.
- **Scope:** check name/domain/GitHub/npm availability and trademark conflicts; release workflow (tag → CI → GitHub release with zip + checksums + provenance attestation); CHANGELOG; version bump in plugin.json.
- **Depends on:** ST-9.1, ST-9.2.
- **AC:** reproducible artifact (same hash from clean checkout); release notes state exact capabilities and supported versions.
- **Tests:** dry-run release on a fork.
- **DoD:** + maintainer sign-off.
- **Status:** Solved, signed off by the maintainer (M8, 2026-11-08: "OK to the sign off"). Version 0.2.0 in the three fields, CHANGELOG, `jeeves/docs/release-notes/v0.2.0.md`, `docs/done/evidence/v0.2.0/README.md`. Zip identical from two clean clones of `c5ff1b1` (SHA-256 `a721d510…ceee`); validate passes on the unzipped artifact. Notes list Team accounts as unsupported and no longer claim VS Code. No tag, no release (D-37).

---

## E10 — Fewer dead ends (v0.2)

### ST-10.1 Window-aware default threshold — S
- **Status:** Solved (M8, 2026-11-08). Status shows `Threshold: 40% (~400K)` (the word "tokens" dropped to fit 40 columns). The test kit default window is now 200K, so the v0.1 tests keep their 50%.
- **Cites:** FR-03, R-13, Q-5, D-32.
- **Scope:** a new task takes its threshold from, in order: `/jeeves threshold` (explicit), the project default (ST-11.1), else the window default: **50%** when the context window is ≤ 200K tokens or unknown, **40%** above 200K. Chosen once at task creation from `usage().window`; a later model switch does not change it (status shows tokens, so the user can see it and set it). Out: changing tasks that already exist; `warnBeforePercent` stays 5 points.
- **Depends on:** none.
- **AC:** (1) `/jeeves on` with a 1M window → threshold 40 and status `40% (~400K tokens)`; (2) 200K window → 50; (3) window unknown → 50; (4) an explicit `/jeeves threshold 60` on a 1M window stays 60; (5) a state.json written by v0.1 keeps its threshold.
- **Tests:** U (pure default chooser, boundary 200K / 200K+1); I (`threshold.test.ts`: on with 1M and 200K mock windows, explicit override, v0.1 state fixture).
- **DoD:** + README "Threshold" paragraph and `docs/compatibility.md` note; CHANGELOG.

### ST-10.2 `/jeeves retry` after an invalid handover — M
- **Status:** Solved (M8, 2026-11-08). The retry is counted by the failure it may end in, not when typed (same single retry with maxConsecutiveFailures 2); 02 §4 row updated. `help` always lists `retry` (static help text); status names it only when it applies.
- **Cites:** FR-08, AC-17, ADR-003, ADR-009 A2, D-31.
- **Scope:** new user-typed subcommand `retry`. From NEEDS_REVIEW(HANDOVER_INVALID) only: a new MANUAL rotation (new `rotationId`, reason `RETRY` in the event) → ROTATION_REQUESTED, so the next safe Stop asks for the handover again (or at once when idle, as `/jeeves rotate` does). The retry counts toward `maxConsecutiveFailures`: when it is used up, `retry` refuses with a message naming `/jeeves off`. Earlier handovers stay byte-identical. From any other state: a message saying what `retry` applies to. Out: retrying automatically; retrying DOD_UNMET (has `/jeeves done`), ROTATE_UNAVAILABLE (has `/jeeves continue`), STATE_CORRUPT (has `/jeeves recover`).
- **Depends on:** none.
- **AC:** (1) invalid ×3 → NEEDS_REVIEW(HANDOVER_INVALID) → `/jeeves retry` → handover requested again → a valid block rotates normally; (2) retry while not the lock owner → refused, no state change; (3) a second exhausted retry → refused, status names the limit; (4) `retry` typed by Claude (not the user) → `MSG.userOnly`; (5) `history/handover-*.md` hashes unchanged across (1)–(3); (6) status and help list `retry` only when it applies.
- **Tests:** U (reducer rows: RETRY from each NEEDS_REVIEW reason, failure counter); I (`retry.test.ts`: the five cases, idle and busy session).
- **DoD:** + 02 §4 rows (ADR-009 A2); message catalogue entry; README command table; CHANGELOG.

### ST-10.3 POSSIBLE_LOOP becomes reviewable — S
- **Status:** Solved (M8, 2026-11-08). consecutiveFailures now resets when a fresh session rearms below T−10 instead of at CONTEXT_READY (a paused continuation still resets at CONTEXT_READY).
- **Cites:** FR-08, R-18, D-31.
- **Scope:** the loop guard (fresh session already at ≥ T−10) goes to **NEEDS_REVIEW(POSSIBLE_LOOP)** instead of FAILED. `/jeeves retry` from there: back to MONITORING in this session with `armedFired=true` (no rotation in this session; the next fresh session re-arms as usual), counts toward `maxConsecutiveFailures`. The message suggests a higher threshold or a shorter task (`/jeeves threshold`, `/jeeves task`). A v0.1 state.json in FAILED(POSSIBLE_LOOP) stays FAILED (no migration). Out: changing the loop-guard margin.
- **Depends on:** ST-10.2.
- **AC:** (1) a fresh session at ≥ T−10 → NEEDS_REVIEW(POSSIBLE_LOOP), no `/clear`; (2) `/jeeves retry` → MONITORING, no rotation in this session even past T; (3) the next rotation from a later session works and re-arms; (4) a second loop after a retry with the counter used up → FAILED(POSSIBLE_LOOP); (5) v0.1 FAILED fixture unchanged.
- **Tests:** U (reducer rows, property test: no rotation from NEEDS_REVIEW without a user command still holds); I (`retry.test.ts` loop cases).
- **DoD:** + 02 §4 row amended; troubleshooting entry.

## E11 — Setup and insight (v0.2)

### ST-11.1 Per-project defaults — M
- **Status:** Solved (M8, 2026-11-08). `defaults clear` writes an empty defaults file rather than deleting it (no delete in the storage layer); read-only `/jeeves defaults` works for anyone, changes are user-typed only.
- **Cites:** FR-11, ADR-005, ADR-009 A2, D-30.
- **Scope:** `/jeeves defaults` shows this project's defaults; `/jeeves defaults threshold <20-90>`, `/jeeves defaults check <cmd>` (add; repeatable), `/jeeves defaults clear`. Stored in `<stateRoot>/projects/<projectId>/config.json` (schema-checked, atomic swap, never in the repository). `/jeeves on` copies them into the new task (threshold per ST-10.1 order; checks as revision 2 the way `/jeeves check` writes them, so they show in `/jeeves task`). Out: global defaults across projects; editing other config fields.
- **Depends on:** ST-10.1.
- **AC:** (1) defaults set in a project apply to the next `/jeeves on` there and not in another project; (2) a running task is unchanged when defaults change; (3) an invalid value is refused with the allowed range; (4) a corrupt `config.json` → defaults ignored with a warning in status, task still starts; (5) `purge` removes the file with the project; (6) user-typed only.
- **Tests:** U (schema guard, merge order); I (`defaults.test.ts`, memfs: set/show/clear, two projects, corrupt file, purge).
- **DoD:** + 02 §6.1 layout line; PRIVACY (what the file holds); README; CHANGELOG.

### ST-11.2 Verification-check suggestions — S
- **Status:** Solved (M8, 2026-11-08). Script names `<kind>:<x>` (e.g. `test:unit`) count too; package.json is read from the git worktree root (or the cwd outside git).
- **Cites:** FR-10, PRD change 7 (the plugin never runs checks), R-19.
- **Scope:** at `/jeeves on` with no checks set (task or project default), read the repo's `package.json` `scripts` (test, lint, typecheck, check) and a top-level `Makefile`'s `test`/`lint` targets, and add one line to the start message: `Suggested checks: /jeeves check npm test` …. Suggestions only: nothing is added or run. Names are shown only when they match `[A-Za-z0-9:_-]{1,40}` (no repo text echoed raw); at most 4. Out: other ecosystems (pyproject, Cargo) in v0.2: noted for later.
- **Depends on:** ST-11.1.
- **AC:** (1) a repo with `test` and `typecheck` scripts → two suggestions; (2) none → no line; (3) checks already set → no line; (4) a script name with shell characters or 500 chars → not shown; (5) unreadable/invalid `package.json` → no line, no error.
- **Tests:** U (suggestion picker over a fixture table); I (`on` message snapshot with and without suggestions).
- **DoD:** + README "Checks" paragraph.

### ST-11.3 `/jeeves history --full` — S
- **Status:** Solved (M8, 2026-11-08). Each handover ref is now written into its VALIDATING > ROTATING event so older handovers can be checked; v0.1 tasks show "hash not recorded" for all but the latest.
- **Cites:** FR-11, ST-7.2.
- **Scope:** `--full` adds, per rotation: the session's start and end context, cost when known, the end reason, and the handover file path with its first "Exact next actions" lines (already redacted at write). Plain text, readable at 50 columns. Out: printing whole handovers (the path is given).
- **Depends on:** none.
- **AC:** (1) a task with 2 rotations shows both with their numbers; (2) a missing or hash-mismatched handover file is reported as such, not printed; (3) without `--full` output is unchanged; (4) no non-ASCII in plain-text mode.
- **Tests:** I (`history.test.ts` snapshots, missing file, changed file).
- **DoD:** + README command table.

### ST-11.4 `/jeeves stats` — M
- **Status:** Solved (M8, 2026-11-08). The < 100 ms check runs in the test kit on its in-memory file system, not on a real disk. "Failures" counts every stop (NEEDS_REVIEW, FAILED, PAUSED, BLOCKED) not caused by the user, by reason. AC 4 borderline: Profiled 2026-11-08: one `stats` over 50 tasks makes 202 reads plus about 200 exists/list calls (state 2, sessions list 1 + 2 reads, events 2 exists + 1 read per task), about 0.25 ms each in the kit, so 99–106 ms warm and about 200 ms cold; no single slow step. The two cuts that would save about a quarter (read state.json without `exists`, find event files with one listing) were not made: reads give no ENOENT code to tell missing from unreadable (R-21), and `listFiles` swallows errors where recovery also reads events. Recorded as borderline; bound kept at 100 ms.
- **Cites:** FR-11, R-15, D-30.
- **Scope:** for this project (all its tasks) and the current task: tasks, rotations, sessions, average context at rotation, context cleared by rotations (points, and tokens when the window was recorded), cost per session where known, and failures by reason. Read-only; from `sessions/*.json`, `state.json` and `events.jsonl`. Wording says "context cleared", never "tokens saved" (claims policy, 08 §7). Out: cross-project totals; charts.
- **Depends on:** ST-11.3.
- **AC:** (1) figures match a fixture with known sessions; (2) a session without cost shows "unknown", not 0; (3) unreadable task folders are counted as unreadable, not skipped silently; (4) runs in < 100 ms on 50 tasks (NFR-03 style micro-benchmark).
- **Tests:** U (pure aggregator); I (`stats.test.ts` snapshot, unreadable task); P (timing on a generated 50-task state folder).
- **DoD:** + README.

## E12 — Compatibility and live coverage (v0.2)

### ST-12.1 Claude Code floor 2.1.303 — S
- **Status:** Closed without lowering (M8, 2026-11-08, D-38): floor stays 2.1.319. Test kit matrix 2.1.302/303/310/316/319: all pass (2.1.316 had one timing flake; 171/171 on rerun). No live run on 2.1.303.
- **Cites:** Q-4, NFR-06, AC-22, D-33.
- **Scope:** `compat.yml` matrix 2.1.303 … current; one PTY rotation (haiku) on 2.1.303 in a scratch config and state folder; if it passes, `MIN_VERSION` = 2.1.303 and `docs/compatibility.md` regenerated. If it fails: floor stays 2.1.319, result recorded, no further work.
- **Depends on:** none. **Live run:** ~US$0.05–0.10 (budget asked first).
- **AC:** (1) test kit passes on 2.1.303 and 2.1.319; (2) one live rotation on 2.1.303 continues the task; (3) 2.1.302 and lower get the unsupported-version message.
- **Tests:** C (compat job), E (one rotation), I (probe boundary).
- **DoD:** + `docs/done/evidence/v0.2.0/AC-22/`.

### ST-12.2 VS Code terminal checklist — S
- **Status:** Dropped (D-36): no manual recordings.
- **Cites:** NFR-02, AC-02, D-30.
- **Scope:** a script like `cursor-demo-script.md` for VS Code's integrated terminal (06 §6, before and after one rotation, haiku with a test threshold); the maintainer runs it. Out: other terminals.
- **Depends on:** none. **Cost (maintainer):** ~US$0.20 on haiku, or US$1–3 on the default model.
- **AC:** 7/7 items before and after a rotation in VS Code, versions recorded.
- **Tests:** M (checklist).
- **DoD:** + `docs/done/evidence/v0.2.0/AC-33/RESULT.md`; `docs/compatibility.md` terminal table.

### ST-12.3 Q-9: a second blocking Stop hook — S
- **Status:** Solved (M8, 2026-11-08). I layer: the test kit models the second hook as the engine stand-in beneath Jeeves (a settings Stop hook or a lower plugin). A plugin above Jeeves is not testable in the kit; recorded in 07 Q-9. The stats P test now takes the best of 3 runs (load).
- **Cites:** Q-9, ADR-004.
- **Scope:** add a second plugin's Stop hook that blocks once to the test kit (or, if the kit cannot load two plugins, to the E driver) and check the handover request and the rotation still happen once each, with neither block lost.
- **Depends on:** none.
- **AC:** (1) one rotation, one handover file; (2) the other hook's block reaches Claude; (3) result written into 07 Q-9.
- **Tests:** I if possible, else E (folded into ST-12.4's run).
- **DoD:** + Q-9 answered in 07.

### ST-12.4 Live runs for the unverified paths and AC-07 E — M
- **Cites:** AC-07, AC-16, AC-18, ADR-006, D-28, `handoff-m7.md` §5.
- **Scope:** extend `tests/pty/e_layers.py` with phases: (c) compaction via a typed `/compact` during a managed task → rotation at the next safe boundary; (d) `autoRecover` on: kill mid-task, restart → continues once without `/jeeves recover`; (e) REPO_MISMATCH: move the fixture repo between sessions → BLOCKED, `/jeeves recover --relink` continues; (f) the `/clear` stall via `endedHere`; (g) AC-07: a fixture whose only step after the threshold is one Bash call needing permission (left unanswered 20 s: no handover request); (h) `/plugin configure jeeves` shows both options. One haiku session per phase in a scratch `JEEVES_STATE_DIR`.
- **Depends on:** ST-10.x, ST-11.x built (runs once on the v0.2 candidate). **Live run:** ~US$0.30–0.60 for 6 phases (budget asked first).
- **AC:** each phase PASS, FAIL (with a fix or a filed follow-up) or NOT EXERCISED with the reason; nothing left "unverified" without a line in the evidence.
- **Tests:** E (this is the test).
- **DoD:** + `docs/done/evidence/v0.2.0/e-layers/RESULT.md` with cost per phase.
- **Status:** Solved (M8, 2026-11-08): AC met, not all phases pass. d, e (relink), h PASS; c and g FAIL with an external cause: on Team accounts Claude Code 2.1.319 seats `cc-plugin-sec-default` in the prepend tier and it skips Jeeves's Stop, SessionStart, compact and compose hooks (R-25, Q-11, D-39). Follow-up built: Jeeves detects the skip and turns itself off (verified live). e's startup-notice check failed in the driver only; f NOT EXERCISED (I layer). AC-07 E stays open. Tracked summary with costs: `docs/done/evidence/v0.2.0/README.md` (raw `e-layers/run*/` gitignored). Live spend US$0.1111 of US$1.

### ST-12.5 v0.2.0 release prep — S
- **Cites:** FR-15, 08 §6.
- **Scope:** version 0.2.0 in the three version fields, CHANGELOG, `jeeves/docs/release-notes/v0.2.0.md`, `docs/done/evidence/v0.2.0/README.md` (AC-26 … AC-34 plus re-runs of the existing suite), reproducible zip checked. Tag and publication stay the maintainer's.
- **Depends on:** ST-10.1 … ST-12.4.
- **AC:** release zip SHA-256 identical from two clean clones; notes claim only what the evidence shows.
- **Tests:** `release-zip.sh` twice; `claude plugin validate` on the unzipped artifact.
- **DoD:** + maintainer sign-off.

## E13 — Auto-start (v0.3)

Spec: `docs/specs/auto-start.md` (approved, D-40). Section numbers below (§) refer to it.

### ST-13.1 Task origin, schema bumps, `auto.json` and downgrade safety — M
- **Status:** Solved (2026-11-08). Versions are per file kind now: `state.json` 2, project `config.json` 2 (written as 1 unless `autoStart` is set), `auto.json` 1, the rest stay 1. AC 1, 2, 4, 5 tested in U (`downgrade.spec.ts`) against a byte-exact copy of the v0.2.0 reader in `tests/fixtures/v0.2-core/`, and the defaults writer in I (`defaults.test.ts` still sees schema 1). AC 3: `readAuto` reports a corrupt file instead of throwing (`auto.spec.ts`); the status warning is wired where the file is first read, in ST-13.2. AC 4's layers are U plus an audit, not I and C: every write in 0.2.0 into the state folder was traced (`docs/done/evidence/v0.3.0/ST-13.1-downgrade.md`); none reaches a v0.3 task without a successful read; the two that reach v0.3 files are user-typed (`defaults clear` replaces `config.json`, `purge` deletes) and go into the v0.3 release notes. ADR-005 never set one version for all files (each file carries its own), so per-file versions need no ADR change.
- **Cites:** §5.3, §5.5, §5.11, ADR-005, ADR-009 A3, NFR-09.
- **Scope:** state schema bump with a migration: `origin: auto | explicit` (v0.2 tasks read as `explicit`). Project `config.json` schema bump with an `autoStart` field (`on`/`off`, absent = not set), written **only when `autoStart` is set**: any other defaults change keeps a v0.2-shaped file v0.2-shaped, and `defaults auto` cleared (or `defaults clear`) writes it back in the v0.2 shape, so a downgrade loses at most the auto setting, never the project's threshold or checks. New `auto.json` in the state root (`{ default: on|off, reason? }`, schema-checked, atomic swap). A v0.2 build meeting v0.3 state refuses with `SCHEMA_TOO_NEW`, ignores the v0.3 `config.json` and never reads `auto.json`; nothing is rewritten. Out: any reader of these fields (later stories).
- **Depends on:** none.
- **AC:** (1) a v0.2 `state.json` loads as `origin: explicit` and is written back only on its next normal write; (2) a v0.2 `config.json` keeps its defaults; (3) corrupt `auto.json` → ignored with a status warning, the default applies; (4) v0.2's reader (frozen copy of the 0.2.0 core) given v0.3 state, `config.json` and `auto.json` → `SCHEMA_TOO_NEW` / ignored / never read, and every v0.2 write into the state folder shown to go through a successful read (AC-45); (5) changing the threshold or checks in v0.3 without setting `autoStart` leaves a `config.json` that a v0.2 build reads with its defaults intact; only a project with `autoStart` set gets the bumped schema.
- **Tests:** U (guards, migration table, `downgrade.spec.ts` against `tests/fixtures/v0.2-core/`, `auto.spec.ts`); audit of v0.2's write paths (`docs/done/evidence/v0.3.0/ST-13.1-downgrade.md`). No I or C layer: no whole v0.2 build runs against v0.3 files.
- **DoD:** + 02 §6.1 layout and §6.3 field; v0.3 release-notes line on downgrade.

### ST-13.2 Auto-start settings, precedence and upgrade detection — M
- **Status:** Solved (2026-11-08). Pure resolver and install rule in `src/core/autostart.ts` (U: `autostart.spec.ts`); check, `/jeeves auto`, session off in `src/adapter/auto.ts`; I: `tests/mod/auto.test.ts` (AC 1–12, plus ST-13.1's unreadable `auto.json` warning, shown by `/jeeves auto`). Decisions made in the story: an upgrader whose state folder already has an `auto.json` keeps it (a user's earlier `/jeeves auto on` is not overwritten); with no state folder the check waits and the install reads as an upgrader (off) until it runs; `/jeeves off` with no task now answers "No managed task. Auto-start is off for the rest of this session…"; the session-off mark is kept in the plugin store, so a reload keeps it (review fix 2026-11-09: one key per session, `autoOff:<session id>`, carried over a `/clear`; the single `autoOffSession` key was lost when two sessions ran at once). AC 6 (distinct keys) is shown by behaviour (the `/jeeves on` notice stays once across an emptied state folder), not by reading the store. Not yet: `/jeeves status` naming the source (ST-13.3 adds the watched/reason line there); README command and settings rows wait for ST-13.9, so the README never describes auto-start before it starts anything.
- **Cites:** §5.5, §5.6, D-41, AC-38, AC-43.
- **Scope:** the `/config` row `autoStart` (`default`, `on`, `off`); `/jeeves auto on|off` (writes only `auto.json`; when the row is `on`/`off` it says `Saved, but /config → Auto-start is set to on, which takes precedence.`); `/jeeves defaults auto on|off` (project), `defaults clear` resets it; `/jeeves off` stops auto-start for the rest of the session, and `/jeeves on` after it makes an explicit task while auto stays off. One resolver: session, project, row, `auto.json`, fresh/upgrade default; it returns the value and its source. Upgrade check **once per install**: it runs at a `session.start` only while the plugin store has no `upgradeCheck`. The install is an **upgrader** when `firstActivationShown` is set or the state folder holds a project, and **fresh** otherwise. An upgrader gets `auto.json` `{ default: off, reason: "upgraded from 0.2" }` and the upgrade notice once. `upgradeCheck` = `upgrader` or `fresh` is written in the same step. Every later session skips the check. v0.3 never writes `firstActivationShown`: the explicit-task first-activation notice moves to its own key (`activationNoticeShown`, skipped when either key is set). With no `auto.json` (a new `stateDir`), the default comes from `upgradeCheck`. User-typed only. Out: eligibility (ST-13.3).
- **Depends on:** ST-13.1.
- **AC:** (1) every precedence pair resolves as §5.5, with its source; (2) `/jeeves auto` writes only `auto.json`, Claude settings never written (settings snapshot); (3) the override message when the row wins; (4) upgrader → off, notice once, tasks, defaults and settings byte-identical after the first v0.3 session; (5) fresh → on; (6) `autoNoticeShown` and `firstActivationShown` are distinct keys; (7) Claude-typed `auto`/`defaults auto` → `MSG.userOnly`; (8) a fresh install stays on in its second session after its first auto task created a project; (9) `/jeeves on` on a fresh install, then a new `stateDir`, never makes it an upgrader and never writes `firstActivationShown`; (10) the check runs once: a second session with `upgradeCheck` set reads no project list for it; (11) an upgrader with a new `stateDir` stays off; (12) a plugin store without `upgradeCheck` and a state folder with projects (a reinstall) reads as an upgrader: auto-start off (the safe direction, spec §5.6), pinned so it is never changed towards on.
- **Tests:** U (resolver table); I (`auto.test.ts`, `upgrade.test.ts`).
- **DoD:** + README settings table and command table; message catalogue.

### ST-13.3 Eligibility at session start, reasons and model switch — M
- **Status:** Solved (2026-11-08). Pure reason table, §5.1 order and `(+N more)` in `src/core/autostart.ts` (`startReasons`, `autoReason`, `reasonLine`, `largeWindow`: above 200K); the model-switch rule in the reducer's `MEASURE` (`src/core/machine.ts`, `windowEndText`); decision, `/clear` carry-over and R-25 ending in `src/adapter/eligible.ts`, wired in `hooks/register.ts`. U: `autostart.spec.ts` (eligibility table, reason order, model switch); I: `tests/mod/eligible.test.ts` (AC 1–5). Decisions made in the story: the facts fixed at `session.start` (interactive, mode, git, window, turns) are kept in the plugin store as `eligibility:<session id>` = `{ reasons }`, so a reload keeps them (review fix 2026-11-09: first one key holding one session id, which a second session running at once overwrote); auto-start's own setting is read live, so `/jeeves off` or `/jeeves auto on|off` later in the session moves the reason at once; a Jeeves or user `/clear` carries the decision to the fresh conversation (spec §5.7: the next prompt may start a new auto task); a session end other than `/clear` forgets it, so `claude --resume` in a new process decides again (a crashed process keeps it: accepted shortcut, noted in the code); the model switch ends an auto task only in MONITORING or CONTINUING and never on an unknown window (0); the R-25 re-check replaces `assisted mode` with `unsupported` in the kept reasons. Status shows `Auto off: <reason> (+N more)` or `Auto-start: on (<source>)` when this session owns no task (the ST-13.2 source line); `--diagnose` adds `Auto-start: on|off (<source>); not watched: <all reasons>` or `this session is eligible`. Each ending also leaves the usual transcript line `Jeeves: off (task files kept)` beside its own message. Not yet: starting the auto task (ST-13.4), `(auto)`/`(explicit)` in status (ST-13.7), README rows (ST-13.9). Live: none.
- **Cites:** §5.1, D-42, AC-36, AC-37.
- **Scope:** at `session.start`, once per session: interactive, full mode, git work tree (subfolders and linked worktrees count), `$.session.usage().window` above 200K from the model setting, `$.session.turns()` 0, auto-start resolved on. The result and every failed reason are kept in process state (no task file). Status and `/jeeves status --diagnose` show the first reason in the §5.1 order with `(+N more)`, and all of them. The R-25 re-check after the first answer ends an auto task (DISABLED, files kept) with `Jeeves: not watching any more (this account isn't supported); /jeeves status for details`; a reading showing a non-eligible window ends it with `Jeeves: not watching any more (this model's window is 200K); /jeeves on to watch anyway`. Explicit tasks unchanged. Out: starting the task (ST-13.4).
- **Depends on:** ST-13.2.
- **AC:** (1) not eligible under `-p`/SDK, assisted, unsupported, outside git, 200K at start, resumed; no file written; (2) a later switch to 1M does not start watching, reason "200K window at start"; (3) reason order and `(+N more)` with several reasons; (4) model switch and R-25 re-check end an auto task with their messages; (5) an explicit task keeps its threshold across a model switch.
- **Tests:** U (eligibility and reason-order table); I (`eligible.test.ts` with mock windows, turns and probe results).

### ST-13.4 Lazy start, first-run notice, near-threshold rule, grace period — M
- **Status:** Solved (2026-11-09). Near-threshold and grace rules in the reducer (`src/core/machine.ts`: `NEAR_MARGIN`, `GRACE_TURNS`, `nearText`; new optional state field `graceTurns`, 0–3, no schema bump since state v2 is unreleased); lazy start and the notice in `src/adapter/eligible.ts` (`startAuto`, `autoNotice`), wired in `hooks/register.ts`; `startTask` takes the origin. U: `autostart.spec.ts` (near-threshold, grace), `messages.spec.ts` (the three auto-task endings and the notice added to the catalogue); I: `tests/mod/autostart.test.ts` (AC 1–6, one test per non-`composer` origin kind: 15 kinds, plus slash command and meta). Decisions made in the story: a session that already had a task (ended ones included, e.g. by the near-threshold rule, a model switch or `/jeeves off`) starts no auto task, and status then reads `Auto off: this session` (review fix 2026-11-09); a `/clear` brings a new session id, so its next prompt may (spec §5.7); a start needs the decision kept at `session.start` (no fallback reading); project defaults (threshold, checks) apply as for `/jeeves on`; the notice shows for the first eligible session of any install, upgraders who typed `/jeeves auto on` included (the spec names fresh installs; they never see it before that); the notice key is set before the toast, so a failed write never repeats it; the near-threshold margin is 10, or the test loop margin (0.5) under the test threshold, and it ends a reading at or past the threshold too; grace counts every main-turn end (answer or aborted) and applies only before the first rotation; compaction and `/jeeves rotate` still rotate in the grace period. `autoNoticeShown` distinct from the `/jeeves on` notice is shown in `autostart.test.ts`, not in `notice.test.ts`. Besides the notice key, `session.start` writes ST-13.3's `eligibility` store key (plugin store, not the state folder; the state-folder snapshot shows nothing written). Not yet: `/jeeves later`, which the notice names (ST-13.5); cleanup at `session.start` (ST-13.8). Live: none.
- **Cites:** §5.2, §5.4, FR-05, AC-35, AC-37.
- **Scope:** an eligible session that owns no task creates an auto task at its first `composer` prompt that is not a slash command, saved word for word as `task-rev-001.md`; any other origin kind (`bridge`, `sdk`, `task-notification`, a plugin's `$.prompt.submit`, others) never starts one. The first-run notice at `session.start` of the first eligible session, with the threshold that applies; `autoNoticeShown` stops repeats. Near-threshold: a first reading within 10 points of the threshold ends the task (DISABLED, files kept) with its one-line message. Grace: no rotation in the first 3 main turns. The only writes at `session.start` are the cleanup (ST-13.8), `auto.json` and the notice key.
- **Depends on:** ST-13.3.
- **AC:** (1) notice then the same session's first typed prompt creates the task, word for word; (2) nothing written before it (state-folder snapshot); (3) one test per non-`composer` origin kind; (4) near-threshold end with its message; (5) no rotation in turns 1–3 even past the threshold, rotation at turn 4; (6) a session already owning a task starts none.
- **Tests:** U (grace and near-threshold rules); I (`autostart.test.ts`, `notice.test.ts` extended).
- **DoD:** + message catalogue.

### ST-13.5 `/jeeves later` — S
- **Status:** Solved (2026-11-09). Cap and texts in `src/core/machine.ts` (`laterCap`, `capText`, `LATER_STEP`; reducer input `LATER`, allowed in MONITORING only; new optional state field `laterCapped`, cleared by `/jeeves threshold`); command in `src/adapter/commands.ts`; the auto-compaction point from `$.session.usage({ breakdown: 'summary' })` (`autoCompactThreshold` when `isAutoCompactEnabled`, a local estimate, no model call) through the port's `autoCompactTokens`, read at each `later`. U: `later.spec.ts` (cap arithmetic, reducer, cap warning); I: `tests/mod/later.test.ts` (AC 1–6, explicit and auto). README command rows added (both READMEs). Decisions made in the story: the cap is floored to a whole percent (`thresholdPercent` stays an integer), and a cap at or below the current threshold never lowers it; refused in any status but MONITORING (the rotation states name `/jeeves pause`; PAUSED, CONTINUING and the rest just say the status); the T−5 warning's key now carries the threshold, so the warning before a postponed threshold shows in the same session; under the test threshold the warning keeps its usual text. Live: none.
- **Cites:** §5.5, AC-39.
- **Scope:** skips the next handover: this task's threshold +10, warning again 5 points before, never past the cap (90%, or 5 points below `autoCompactThreshold` from `$.session.usage()` when lower, read at each `later`; auto-compaction off → 90%). At the cap: `Jeeves hands over at 85% (now 80%); can't postpone further. /jeeves off to keep this conversation.` Works in auto and explicit tasks; repeatable; does not stop a rotation already under way. User-typed only.
- **Depends on:** ST-13.1.
- **AC:** (1) +10 and a new warning; (2) cap from auto-compaction, and 90% when it is off or higher; (3) the cap message; (4) during ROTATION_REQUESTED or later → refused with `/jeeves pause` named; (5) explicit task too; (6) `later` typed by Claude (not the user) → `MSG.userOnly`, threshold unchanged.
- **Tests:** U (cap arithmetic); I (`later.test.ts`).
- **DoD:** + README command table.

### ST-13.6 Current goal heading and the continuation order — M
- **Cites:** §5.3, ADR-003, R-19, R-27, AC-42.
- **Scope:** a seventh required handover heading, **Current goal**: 1–2 bullets, each tagged `[verified]`, `[inferred]` or `[unknown]`, ≤ 300 characters; redaction and the secret check apply. Required in every new handover; a v1 block (six headings) stays valid for tasks created before the upgrade. The continuation puts the user's words first (original task and every `goal:`, `dod`, `check` revision, labelled "the user's words"), then the goal labelled "Claude's summary at the last handover (may be wrong)", then the rest as today. The rotation line shows the goal cut to one line. The summary never changes the task, DoD or checks.
- **Depends on:** ST-13.1.
- **AC:** (1) missing heading, 0 or 3 bullets, a missing tag or 301 characters → invalid with a reason; (2) a pre-upgrade task accepts a v1 block; (3) continuation order and labels (snapshot); (4) a goal that says "the task is now X" leaves task, DoD and checks unchanged; (5) rotation line shows it.
- **Tests:** U (parser and validator over new handover-corpus cases, continuation snapshot); I (`handover.test.ts`, `continue.test.ts` extended).
- **DoD:** + ADR-003 amendment text in 02; handover instruction template; handover corpus.
- **Status:** Solved (2026-11-09). Seventh heading `GOAL` with `GOAL_BULLETS_MAX` 2 and `GOAL_CHARS_MAX` 300 in `src/core/handover/template.ts`; the parser checks it (new codes `GOAL_BULLETS`, `GOAL_TOO_LONG`; missing tags give `UNTAGGED`, 0 bullets `EMPTY_SECTION`) and takes `requireGoal`, which only `validateHandover` sets (from `Facts.preUpgrade`); every other reader (merged-file round trip, continuation, recovery) reads leniently. The continuation (`src/core/continuation.ts`, `usersWords`, `summary`) now takes the task view; `goalLine` in `render.ts` gives the rotation line, carried by `HANDOVER_PERSISTED` into the new optional `rotation.goal`. ADR-003 A1 written in 02 (and §6.4); R-27 marked mitigated in code. U: `parse.spec.ts` (6 new corpus files: `v1-no-goal`, `goal-three-bullets`, `goal-untagged`, `goal-empty`, `goal-too-long`; 300 vs 301 characters; the hand-written fixtures gained a goal, the 10 S-05 samples stay as real v1 output), `validate.spec.ts` (S-05 samples valid for a pre-upgrade task, `MISSING_HEADING` otherwise), `continuation.spec.ts` (order and labels, v1 and no-handover cases, cut original; snapshot redone), `template.spec.ts` (snapshot redone, 2,477 of 2,500 characters at worst), `downgrade.spec.ts` (migration sets `preUpgrade`); I: `handover.test.ts` (AC 1 missing heading, 3 bullets, secret in the goal; AC 2; AC 5), `continue.test.ts` (AC 3, 4: a goal saying "the task is now X" leaves every `task-rev` file, `taskRevision`, the DoD and checks unchanged and comes after the user's words), `ui.test.ts` (rotation line). Decisions made in the story: **a task is pre-upgrade when the state v1 → v2 migration set `preUpgrade: true`** (optional field, no bump, as `graceTurns`); the sentinel stays `v1`, so a v0.2 build still reads v0.3 handovers; the instruction asks every task, pre-upgrade ones too, for seven headings; the 300 characters count the bullet text after its marker, tag included; the rotation line takes the first goal bullet only, tag removed, redacted, cut to 80 characters; the user's words are quoted line by line and the original is cut at 1,500 characters with a pointer to the full text in context; the gap note (`/jeeves recover`) comes after the summary. Not done: `goal:` revisions do not exist yet (ST-13.7 adds the kind; the continuation lists every revision by kind, so the type checker will ask for its label); `/jeeves handover` (ST-14.x) and the `claude --resume` part of the rotation line (E14). Hooks unchanged, so the plugin-authoring skill was not needed. Live: none.

### ST-13.7 User `/clear` in auto tasks and auto-recovery — M
- **Cites:** §5.7, §5.8, ADR-010, D-43, AC-40, AC-46.
- **Scope:** a user `/clear` in an auto task ends it (DISABLED, files kept) with `Jeeves: task ended (new conversation); the next prompt starts a new one`; the next typed prompt starts a new auto task. Explicit tasks pause as today, with `Jeeves: paused (you cleared the conversation); /jeeves resume continues the task`. `/jeeves on <goal>` in an auto task turns it explicit (the goal becomes a `goal:` revision). An auto task interrupted mid-rotation (HANDOVER_GENERATING … RESTORING) recovers by itself with a message whatever `autoRecover` says, only in an interactive, full-mode, fresh session; otherwise it waits. Typed `/jeeves recover` works anywhere. Status shows `(auto)` or `(explicit)`.
- **Depends on:** ST-13.3, ST-13.4.
- **AC:** (1) both `/clear` messages; (2) a new auto task after the ended one; (3) auto → explicit with `/jeeves on <goal>`; (4) auto-recovery runs in a fresh interactive session, waits under `-p`, assisted and resumed; (5) explicit tasks follow `autoRecover`; (6) Jeeves's own `/clear` unaffected.
- **Tests:** I (`clear.test.ts`, `recover.test.ts` extended).
- **DoD:** + ADR-010 amendment text in 02; 02 §4 rows.
- **Status:** Solved (2026-11-09). Reducer (`src/core/machine.ts`): `SESSION_END(clear)` not scheduled by Jeeves gives DISABLED(USER_CLEAR) for an auto task and PAUSED(USER_CLEAR) for an explicit one, with the spec's two texts (`USER_CLEAR_AUTO`, `USER_CLEAR_EXPLICIT`, in the message catalogue); new input `EXPLICIT`. `onUserClear` releases the lock for both. Revision kind `goal` in `src/core/task.ts` (`Added by: /jeeves on`), shown by `/jeeves task`, in the continuation's user's words and in the fresh context; `/jeeves on <goal>` in an auto task writes it, then `EXPLICIT` (`MSG.madeExplicit`). Recovery: `recoveryNotice` says whether the task is auto and mid-rotation; `hooks/register.ts` recovers it at `session.start` when interactive, full mode and `turns()` 0, else as before. `/jeeves status` shows `Task: <id> (auto|explicit)`. ADR-010 A2 and four §4 rows in 02 (also in 09). U: `machine.spec.ts` (auto `/clear` from four states, `EXPLICIT` once), `task.spec.ts` (goal revision round trip), `messages.spec.ts` (catalogue); I: `clear.test.ts` (AC 1, 2: ended, files kept, lock free, then a new auto task under the new id; AC 3: explicit with revision 2, then `/clear` pauses; AC 6: Jeeves's own `/clear` in an auto task rotates to CONTINUING), `recover.test.ts` (AC 4: recovers in a fresh interactive full session without `autoRecover`, waits under `-p`, resumed (turns 4) and assisted, `/jeeves recover` still works; AC 5: explicit task without `autoRecover` gets the notice only). Decisions made in the story: the ended auto task keeps reason USER_CLEAR (so status says why); a PAUSED auto task is also ended by a user `/clear`; `/jeeves on` without a goal in an auto task stays "Already on" (the spec names `on <goal>`); the goal is not submitted as a prompt (the task is under way; it is a revision like `dod`); a goal typed before rev 1 cannot happen (an auto task starts with rev 1) and is refused; the auto recovery gate is the start-time facts (`isInteractive`, probe mode, `turns()`), not the kept eligibility, so a 200K window or no git does not stop a recovery. Live: none.

### ST-13.8 Cleanup of ended auto tasks — S
- **Cites:** §5.9, AC-44.
- **Scope:** at `session.start`, through the existing purge code under the resolved state folder (custom `stateDir` included), delete auto tasks that ended (DISABLED or COMPLETED, or MONITORING with no live lock) without a single rotation, 7 days after `updatedAt`; runs with auto-start on or off; never explicit tasks or tasks with handovers.
- **Depends on:** ST-13.1.
- **AC:** (1) 6 days 23 h kept, 7 days deleted; (2) explicit and rotated auto tasks kept at any age; (3) a live lock keeps a MONITORING task; (4) custom `stateDir`; (5) auto-start off still cleans.
- **Tests:** U (selection rule); I (`cleanup.test.ts`, memfs with a mock clock).
- **Status:** Solved (2026-11-09). Rule `expired` in `src/core/cleanup.ts` (auto, `rotationCount` 0, no `lastValidatedHandover`, DISABLED/COMPLETED or MONITORING without a live lock, `updatedAt` at least 7 days back; an unparsable date keeps the task); `cleanupAuto` in `src/adapter/purge.ts` walks every project under the resolved state folder and deletes through the purge command's own `remove` (now shared; same guard that never deletes outside `<state root>/projects`); called at `session.start` before the recovery scan, whatever auto-start says. A task whose state or lock cannot be read is left alone; a folder that cannot be deleted is logged (debug), not shown. U: `cleanup.spec.ts`; I: `tests/mod/cleanup.test.ts` (AC 1–5; ages set by back-dating `updatedAt` instead of advancing the mock clock 7 days, which would run 20,000 heartbeats; a mutation check confirmed AC 1 and AC 3 fail when the age or the lock condition is changed). Decisions made in the story: "a lock that holds" means held and not stale (120 s), as for purge; PAUSED, NEEDS_REVIEW, FAILED and BLOCKED auto tasks are never cleaned (the spec names only ended ones); nothing tells the user a task was cleaned (spec §5.9 asks for no message; PRIVACY text in ST-13.9). Live: none.

### ST-13.9 Privacy text and the two-mode suite — S
- **Cites:** §5.10, §8, AC-03, NFR-10.
- **Scope:** PRIVACY.md, README and notices per §5.10 (fresh installs: what is recorded from the first typed prompt, on this machine only, never the transcript; upgraders: nothing changes until `/jeeves auto on`; opt-out levels; cleanup). The I-layer suite runs twice in CI, `autoStart` off and on. AC-03 test updated to the A3 wording.
- **Depends on:** ST-13.2 … ST-13.8.
- **AC:** (1) texts match the shipped behaviour (reviewed line by line against §5); (2) suite green in both modes; (3) NFR-10 grep over the state folder after an I-layer auto task with a rotation finds no prompt text outside `task-rev-*` and `heldPrompts` (the E-layer grep runs in ST-15.2).
- **Tests:** I (both modes); M (text review).
- **DoD:** + CHANGELOG; release notes draft.
- **Status:** Solved (2026-11-09). **Two modes:** a mod test cannot read the environment (checked: the test runtime has no `process`), so the mode is a file: `tests/mod/mode.ts` holds `AUTO_START = 'off'`, and the kit's `test` (`tests/mod/kit.ts`, now imported by every mod test in place of the engine kit's) passes it as the `/config` row `autoStart` unless the test sets the row itself. `npm run test:mod` runs it as written; `npm run test:mod:on` (`scripts/test-mod-on.sh`) runs a temporary copy with `on`, so the work tree is never changed; CI's mod job and `scripts/check-all.sh` run both. The four files that test auto-start's own settings and seed the install state themselves (`auto`, `autostart`, `eligible`, `cleanup`) keep the engine kit's `test` and run the same in both; the two ST-13.7 tests that need a real auto start set `autoStart: 'on'`. Green: 258 off, 258 on. **What the on run covers:** only the row changes; each test keeps the session it builds, and outside those four files almost none is eligible (no git, 200K window), so the on run shows that the v0.2 paths are unchanged with auto-start on in sessions it does not watch, plus explicit tasks under on. A trial with every session made eligible by default (git and 1M in `memHost` under on) failed 25 tests; each was read and all are expected differences (40% threshold on 1M, git mode `git` instead of `none`, the first typed prompt starting an auto task, relink and recover paths once a repository exists), none a defect; not kept, as it would need mode-specific expectations in 14 files. **AC 3:** `tests/mod/privacy.test.ts`, an auto task (kit `generating(…, { auto: true })`) with a held prompt and a rotation, then a typed prompt in session 2: the task prompt only in `task-rev-001.md`, the held prompt only in `state.json`'s `heldPrompts` while held and nowhere after delivery, the later prompt and Claude's text nowhere. **Defect found and fixed:** the event line for a held prompt quoted it in full (redacted) in `events.jsonl`, where it stayed after delivery, against NFR-10 and PRIVACY.md; it now reads `held prompt N (M chars)` (`src/core/machine.ts`; `held.test.ts` and `machine.spec.ts` updated; reverting the fix fails both the new test and `held.test.ts`). AC-03's two tests renamed to the A3 wording (sessions not auto-watched and without `/jeeves on`; they pass in both modes; the upgrader half of A3 is in `auto.test.ts`). **Texts:** PRIVACY.md (new "When it records": fresh installs from the first typed prompt, on this machine, never the transcript; upgraders unchanged until `/jeeves auto on`; the four opt-out levels; `auto.json`, project `autoStart`, the plugin-store flags; cleanup), the plugin README (new Auto-start section; rows for `auto`, `defaults auto`, `off`, `on <goal>`, `status`; the `autoStart` setting; `autoRecover` for auto tasks; the user `/clear` rule), the root README (how it works, `auto` row, data), CONTRIBUTING (both commands, which `test` to import), CHANGELOG, release notes draft `docs/release-notes/v0.3.0.md` (names the downgrade facts and that only a typed `defaults clear` or `purge` reaches v0.3 files; AC-41 wording and E14 left for ST-15.3). Reviewed line by line against spec §5 (one fix: the auto-start setting is read live, the other conditions once at session start). Decisions made in the story: the first-run and upgrade notices keep their §5.4/§5.6 wording (they are fixed in the spec; the §5.10 content is in PRIVACY.md and the READMEs); the README status line still says 0.2.0 (version and release are ST-15.3). Not done: architecture.md and troubleshooting.md were not reviewed for auto-start. Live: none.

## E14 — Part of the day (v0.3; may ship in v0.3.x)

If v0.3 must be smaller, ST-14.1 and ST-14.2 ship first (spec §11).

### ST-14.1 A hint instead of silence — S
- **Cites:** §6.1, R-26, AC-47.
- **Scope:** a non-watched session gets one hint at threshold − 5: `Jeeves: this session is at 45%. /jeeves on would hand it over to a fresh conversation before it fills up. /jeeves auto off hides this.` Once per session; only for reason 3b and reasons 4–6; never after an explicit off at any level, never under `-p`; stops after 3 hints in a row not followed by `/jeeves on` or `/jeeves auto on` (plugin-store counter, reset when the user acts). No tokens, no task files.
- **Depends on:** ST-13.3.
- **AC:** (1) shown for 3b, 4, 5, 6 and not for 1–3 or `-p`; (2) once per session; (3) silent after 3 unanswered, counter reset after `/jeeves on`; (4) no file in the state folder.
- **Tests:** I (`hint.test.ts`).
- **Status:** Solved (2026-11-09). Rule `hintable` and `HINT_LIMIT` in `src/core/autostart.ts` (U: `autostart.spec.ts`: only 3b and 4–6; any of `-p or SDK`, unsupported, assisted, this session, this project, everywhere silences it); `hint` in `src/adapter/eligible.ts`, called from the `session.measure` hook when no task of this session took the reading; the point is the project's default threshold, else the window default, minus 5 (re-based under ST-15.1's test window as `measure()` is). Plugin-store keys: `hinted:<session id>` (once per session; carried over a `/clear` and forgotten at any other session end, like the other two per-session keys) and `hintsUnanswered` (machine-wide count, set before the toast; reset to 0 by a typed `/jeeves on` or `/jeeves auto on`, whatever the command then answers). The hint is a toast; it is in the message catalogue. I: `hint.test.ts` (AC 1 per reason with its threshold, 45% on 200K and 35% on 1M, and not one point before; silent under `-p`, after `/jeeves off`, `defaults auto off`, `auto off` and the `/config` row off; AC 2 once per session; AC 3 three sessions hinted, the fourth silent, then a typed `/jeeves on` and the next session hinted again; AC 4 the state folder unchanged). The tests set the row `default` themselves, so they run the same in both suite modes. AC-03's measure test now allows the one hint (with auto-start on, a session outside git sees it; spec §6.1 makes it no file and no token). Decisions made in the story: "reset when the user acts on one" is any typed `/jeeves on` or `/jeeves auto on`, not only one right after a hint; the count is machine-wide, as the spec's single plugin-store counter. README Auto-start section and CHANGELOG updated. Live: none.

### ST-14.2 `/jeeves` alone — S
- **Cites:** §6.5, AC-47.
- **Scope:** `/jeeves` with no arguments shows status as today plus whether this session is watched and, if not, the reason (§5.1 order, `(+N more)`), and one line of 2–3 commands that fit now (`later`/`off` during a warning, `resume` when paused, `retry` after a failed handover, `on` when not watched, `handover` after a rotation). 8-line limit; the reason, commands and warnings stay when lines give way.
- **Depends on:** ST-13.3.
- **AC:** (1) a snapshot per state; (2) ≤ 8 lines at 40 columns; (3) plain-text mode ASCII only.
- **Tests:** I (`ui.test.ts` snapshots).
- **Status:** Solved (2026-11-09). `commandsLine` in `src/adapter/ui.ts` adds a last line to `statusText`, so `/jeeves` alone and `/jeeves status` both show it: `Try: /jeeves later | off | help` while this session's own task is in the warning band (threshold − 5 up to the threshold, against the threshold the run acts on), `resume | off` for a resumable task (PAUSED, or BLOCKED by DISK), `retry | off` for this session's NEEDS_REVIEW (HANDOVER_INVALID or POSSIBLE_LOOP) while retries are left, `on` when the auto line says `Auto off: …`, and `help` filling up to three. The watched/reason line is ST-13.3's (`Auto off: <reason> (+N more)` or `Auto-start: on (<source>)`). 8-line rule: the commands line is pushed last; `Path`, `Last`, `Rotations`, `Waiting for` and now every `TEST OVERRIDE` line give way first, and if still too long the lines just before the commands line go, so it always shows (with a typical task and a reason line the path now gives way). U: `ui.spec.ts` (each offer, another session's warning not offered, retries used up, the crowded case with every test setting). I: `ui.test.ts` snapshots with the row `default` (same in both suite modes): not watched, watching, warning, paused, eligible before the first prompt, failed handover, retries used up; each ≤ 8 lines, ≤ 40 columns, ASCII. Not done: `handover` after a rotation waits for ST-14.4 (the command does not exist yet). Decisions made in the story: `/jeeves status` shows the same as `/jeeves` alone; `help` fills the line so it always names at least two commands. Root and plugin README, CHANGELOG updated. Live: none.

### ST-14.3 Rotation line with the resume id — S
- **Cites:** §6.2, AC-47.
- **Scope:** the rotation line ends with `Previous conversation: claude --resume <full session id>` (the id already in `sessions/NNN.json`). A resumed old conversation is not auto-watched and does not own the task; status there says the task belongs to another session.
- **Depends on:** ST-13.6 (same line).
- **AC:** (1) full id in the line; (2) a resumed old conversation cannot drive the task (no rotation, no state change).
- **Tests:** I (`rotate.test.ts`, `concurrency.test.ts` extended).
- **Status:** Solved (2026-11-09). `transitionLine` (`src/adapter/ui.ts`) ends the ROTATING line with `. Previous conversation: claude --resume <id>`, the id being the task's `activeSessionId` at that transition: the ending session, the same id `sessions/NNN.json` records at its `/clear` (the line is printed before that file exists, so it is not read from it). Nothing changed in ownership: the lock already moves to the fresh conversation, a resumed conversation has turns so it is not auto-watched, and every changing command looks for this session's own task. New: status in a session whose shown task belongs to another session says `Owned by another session` (spec §6.2 says status says so "as today"; it did not, so the line was added). I: `rotate.test.ts` (AC 1 the full id in the line; AC 2 after the rotation to `sess-2`, the old id resumed with 12 turns: a typed prompt, a reading of 70%, and `rotate`, `pause`, `later`, `threshold 60`, `retry`, `dod x` leave `state.json` byte-identical and run no second `/clear`; status says `Owned by another session` and `Auto off: …`); the rotation line's three earlier tests (`handover.test.ts`, `ui.test.ts`) updated. `concurrency.test.ts` was not extended: the resumed-session case lives in `rotate.test.ts`, next to the rotation it follows. Plugin README and CHANGELOG updated. Live: none.

### ST-14.4 `/jeeves handover` — S
- **Cites:** §6.2, AC-47.
- **Scope:** shows the last handover: file path, Current goal, first next actions, cut to the status width. Read-only; a missing or hash-mismatched file is reported, not printed (as `history --full`).
- **Depends on:** ST-13.6.
- **AC:** (1) snapshot after a rotation; (2) none yet → one line saying so; (3) changed file reported.
- **Tests:** I (`handover-cmd.test.ts`).
- **DoD:** + README command table.
- **Status:** Solved (2026-11-09). `handoverText` in `src/adapter/history.ts`, read-only (not in the changing commands), for the task status shows (this session's, else the latest; anyone may read it, as `history`). Source: the task's `lastValidatedHandover` ref, so the file is checked against the hash recorded at validation; `history --full`'s missing/changed handling is now one helper, `readSaved`, used by both. Output: `Handover: <path cut from the left>`, `Goal: <first Current goal bullet, tag dropped>` (`none recorded` for a v1 handover), `Next:` and the first 3 numbered actions with tags dropped; every line cut to 40 ASCII columns. No validated handover → `No handover yet for this task.`; no task → the usual no-task line; a missing or changed file → `Not shown: the file is missing.` / `… changed since saved.` and nothing of its text. `/jeeves` alone now offers `handover` (ST-14.2's line) for this session's own task after a rotation. Help and the command menu list it. I: `handover-cmd.test.ts` (AC 1 snapshot after a rotation, typed by a plugin, nothing written; AC 2 none yet and no task; AC 3 changed and missing); U: `ui.spec.ts` (the `handover` offer). Not done: the goal is cut, not wrapped, so a long goal shows its first 34 characters (spec: "cut to the status width"). Root and plugin README command tables, CHANGELOG updated. Live: none.

### ST-14.5 Quiet status line in auto tasks — S
- **Cites:** §6.3, AC-47.
- **Scope:** in an auto task the status line is empty until the context is within 15 points of the threshold, then `Jeeves 28%/40%` as today. Explicit tasks unchanged.
- **Depends on:** ST-13.4.
- **AC:** (1) empty at 24% with threshold 40, shown at 25%; (2) explicit task shown from the start.
- **Tests:** I (`ui.test.ts`).
- **Status:** Solved (2026-11-09). `statusLine` in `src/adapter/ui.ts`: a MONITORING task with origin `auto` returns no entry unless its last reading is at least the shown threshold − 15 (`QUIET_POINTS`); an unknown reading, or a relative test threshold still `?`, stays quiet. Every other state, and every explicit task, unchanged. The entry is re-sent on every state change (each reading is one), so it appears at the reading that crosses the line and goes again if the context falls back (after a rotation, the fresh conversation's low reading empties it). I: `ui.test.ts` (AC 1 an auto task, row `on`: 10% and 24% of 40 leave the entry empty, 25% shows `Jeeves 25%/40%`, 12% empties it again; AC 2 an explicit task shows `Jeeves ?/50%` at `/jeeves on` and `Jeeves 10%/50%` at 10%). Plugin README and CHANGELOG updated. Live: none.

## E15 — v0.3 evidence and release

### ST-15.1 Test-only window override — S
- **Cites:** AC-41, the existing threshold override (06 §1).
- **Scope:** `JEEVES_TEST=1` with `JEEVES_TEST_WINDOW_OVERRIDE=<tokens>` makes Jeeves use that window for eligibility and the threshold default; ignored unless both are set; status shows "TEST OVERRIDE". Never a user setting.
- **Depends on:** ST-13.3.
- **AC:** (1) override 200000 on a 1M session → 50% rule, ~100K threshold, and not eligible for auto-start (D-42), so the 200K fixture starts its task with `/jeeves on`; the auto-only rules (grace, near-threshold) are covered in I; (2) ignored without `JEEVES_TEST`.
- **Tests:** U, I.
- **Status:** Solved (2026-11-09). Pure `simulateWindow` in `src/core/task.ts` (a reading re-based on the test window: percent from tokens when known, else the engine's percent scaled, capped at 100; U: `threshold.spec.ts`). The runtime (`src/adapter/runtime.ts`) reads `JEEVES_TEST_WINDOW_OVERRIDE` only with `JEEVES_TEST=1` (an integer of at least 1000 tokens, else ignored) and wraps `port.usage()`, so eligibility at `session.start`, the threshold default at `/jeeves on`, the first-run notice, `/jeeves later`'s cap and readings at tool results all see the simulated window; `measure()` re-bases `session.measure` readings the same way. Status shows `TEST OVERRIDE window 200K` (it gives way under the 8-line rule like the threshold override), `--diagnose` lists `window 200000` under test settings. `exactPercent` now caps at 100 (a real reading never exceeds it; a simulated one can). I: `threshold.test.ts` (AC 1: a 1M session under 200000 is `Auto off: 200K window at start`, a typed prompt starts nothing, `/jeeves on` gives an explicit task at 50%, 90K real tokens read 45% with the warning, `Threshold: 50% (~100K)`, the request at 100K; AC 2: without `JEEVES_TEST` the same session is auto-watched at 40% with readings unchanged). The auto-only rules under the override are not exercised: such a session is never auto-watched (D-42). Documented in 06 §1 and CHANGELOG. Live: none.

### ST-15.2 AC-41 live runs — M
- **Cites:** AC-35 (E), AC-41, NFR-10, Q-13 (spec Q7), Q-14 (Q8's bar), D-42, spec §11.1.
- **Scope:** a `long-task` fixture (06 §2) with about **1M tokens of work** in modules with their own checks, so two rotations at 40% (about 750K needed) have margin; the 200K run uses only its first modules (about 250–300K of work, 4–5 rotations). Three haiku runs on the maintainer's Team account in turn mode (D-49, amends D-44/D-46), after a dry run:
  - **Preconditions (all runs):** all runs use **the same macOS user**, in **fresh-install state** before the dry run (D-49): the maintainer's normal macOS user with a separate Claude config folder (`CLAUDE_CONFIG_DIR`, logged in once by the maintainer), whose plugin store has neither `upgradeCheck` nor `firstActivationShown`, and `JEEVES_TEST=1` with a scratch `JEEVES_STATE_DIR` that holds no project (the M9 fresh-install command). The config folder must be logged in (a throwaway one is logged out, M6). With ST-13.2's once-per-install check, the 200K run's `/jeeves on` and its project cannot turn the user into an upgrader afterwards. Also: a real interactive `claude` in a pseudo-terminal through `tests/pty/ptylib.py`, as in M4–M8 (never `-p` or the SDK: not eligible); the fixture is a git work tree; a fresh conversation. Without these, auto-start stays off and the run measures nothing.
  - **Dry run (AC-35 E, about US$0.01–0.05):** one prompt, the fixture's first module, below 100K. Checks: the first-run notice (not the upgrade notice), an auto task with the prompt word for word, nothing recorded before it; `/cost` is local (no model call). It also measures tokens per call and cost per call, and the estimate in spec §11.1 is redone from them before any paid run.
  - **Runs, cheapest first:** 200K simulated (ST-15.1, task started with `/jeeves on`); 1M with Jeeves in auto mode (nothing typed but the task); 1M without Jeeves (read `autoCompactThreshold` first; with 1M of work it reaches auto-compaction, which is reported as its outcome).
  - **Report:** tokens and cost (cache reads included), rotations, outcome; NFR-10 grep of the state folder after the auto run.
  - **Turn mode and cost (D-49):** the account is subscription-billed, so every cap below is API-equivalent dollars from token counts at Claude Haiku 5.5 prices. The dry run checks whether `/cost` shows dollars there (if not, spend is computed from Jeeves's session records and transcript usage) and that a 1M haiku window is offered; status must show `mode: full (turn)`. A run stopped by a plan usage limit is partial. Results and any README cost wording say they were measured in turn mode.
  - **Stop rules:** per-run caps of US$1 (dry run and 200K together), US$14 (1M with Jeeves), US$25 (1M without), and a hard total of US$40. Spend is read from `/cost` every 10 minutes in both 1M runs (a local command, no model call, checked in the dry run, so it does not break "nothing typed but the task") and from Jeeves's session records at each rotation. The 1M auto run starts by repeating the dry run's check that the first-run notice appears; without it the run stops before spending. A run that passes its cap is stopped and reported as partial; the total cap stops AC-41.
  - Q8's bar is D-45, set before the run; the 200K report states each of its four parts.
- **Depends on:** E13, ST-15.1, E16 (ST-16.8 passing: the runs are in turn mode); Q-13 and Q-14 answered (D-44, D-45, D-49); go-ahead and US$40 budget approved (D-46), valid once the preconditions hold. Not E14: nothing in it changes cost, rotation rate or outcome. **Live run:** estimated US$9–35, most likely about US$29 (spec §11.1); budget US$40 with the caps above (go-ahead and budget asked first).
- **AC:** (1) the dry run passes, or AC-41 does not start; (2) each run PASS/FAIL with cost, or partial with the cap that stopped it, or a recorded reason it did not run; AC-41 with Jeeves needs at least one rotation, reports the count, and two is the target; (3) Q8 answered in 07 against the bar set beforehand; (4) README cost wording, if any, states what was measured, on which window, with cache effects.
- **Tests:** E (this is the test).
- **DoD:** + `docs/done/evidence/v0.3.0/AC-41/RESULT.md`.

### ST-15.3 v0.3.0 release prep — S
- **Cites:** FR-15, 08 §6.
- **Scope:** version 0.3.0 in the three version fields, CHANGELOG, `jeeves/docs/release-notes/v0.3.0.md` (including downgrade and upgrader behaviour), `docs/done/evidence/v0.3.0/README.md` (AC-35 … AC-54 plus re-runs of the existing suite; release notes say what turn mode does and does not give), reproducible zip. Tag and publication stay the maintainer's.
- **Depends on:** ST-13.1 … ST-15.2, ST-16.1 … ST-16.8.
- **AC:** zip SHA-256 identical from two clean clones; notes claim only what the evidence shows.
- **Tests:** `release-zip.sh` twice; `claude plugin validate`.
- **DoD:** + maintainer sign-off.

## E16 — Turn mode for Team accounts (v0.3, before ST-15.3)

Spec `docs/specs/team-accounts-turn-mode.md` §5 (a)–(h); (a), the ADR amendments, is done (revision 2 accepted, D-48). Every story keeps Stop mode byte-identical where Stop arrives: its tests run the existing suite as well as its own. **Live checks:** each story names what it must verify; the ones that need a live session can be answered together in one throwaway probe-mod session (scratchpad only, as in `8d99bf9`; haiku, estimated US$0.10–0.30) before ST-16.2, on the maintainer's go-ahead and budget. A check that cannot be answered is recorded as unverified in the story, with the fallback the ADR names.

### ST-16.1 Turn mode chosen at the skip; status, diagnose, refusals — S
- **Cites:** ADR-002 A2, A3; spec §3, §6; D-39.
- **Scope:** where A2's check (`stopSkipped`, `markStopSkipped`) now sets `unsupported`, set turn mode instead: mode stays `full`, the probe records `boundary: turn`; status shows `mode: full (turn)`, `--diagnose` names the mode and the reason (`Stop hook skipped`); `on`/`resume`/`rotate`/`retry` work; an auto task is not ended by the skip any more (ST-13.3's `unsupported` reason applies only to a version refusal). A `$.prompt.submit` that fails in turn mode makes the process `unsupported` (not `assisted`); a version refusal keeps its own message. A skip seen while `ROTATION_REQUESTED` hands the rotation to the turn-mode boundary at the same `turn.complete` (ST-16.2). The background count (ST-16.2) starts at `session.start` in every process, before the mode is known.
- **Verify:** none live (the skip and its log line were seen in `8d99bf9`).
- **Depends on:** —.
- **AC:** (1) skip seen → `mode: full (turn)` and every command accepted; (2) Stop arrives → no turn-mode state, event trace identical to v0.2.0's for the same script; (3) failed submit in turn mode → `unsupported` with its message, no further requests; (4) an auto task survives the skip.
- **Tests:** U (probe with the boundary); I (skip simulated by never delivering `classic.Stop` after an answered turn).
- **Status:** Solved (2026-11-09). `Probe` has `boundary: 'stop' | 'turn'` (`src/core/probe.ts`); `withoutStopHook` is replaced by `turnMode` (mode kept, boundary `turn`; a version refusal unchanged) and `submitRefused` (turn mode only: `unsupported`, missing `$.prompt.submit`, message `SUBMIT_REFUSED`). `markStopSkipped` (`src/adapter/runtime.ts`) now sets turn mode, kept across `session.start`'s re-probe in the process; the runtime wraps `port.submitPrompt`/`submitPromptSoon`, so any refused submit in turn mode (goal, nudge, continuation, and ST-16.3's request) makes the process unsupported with one toast and the status `off: prompt refused`; the caller's own handling still runs (a refused continuation still goes NEEDS_REVIEW(ROTATE_UNAVAILABLE) as in A1). The skip itself gives no toast and no status entry, only a debug line. `eligible.ts`'s `stopSkipped` and `MSG.autoUnsupported` are gone: no task, auto or explicit, is ended by the skip, and the eligibility decision is unchanged by it. Status line 1 `mode: full (turn)`; `--diagnose` `Mode: full (turn: Stop hook skipped)` with the hint naming the skipping plugin. Commands are refused only when unsupported (comment in `commands.ts`). `jeeves/docs/troubleshooting.md` updated (turn mode, not yet handing over until E16 ends). U: `probe.spec.ts`, `ui.spec.ts`; I: `probe.test.ts` (AC 1 skip → turn and every command answered, AC 2 Stop/abort/subagent → no turn, AC 3 refused submit in turn mode vs stop mode, a later session start keeps turn mode), `eligible.test.ts` (AC 4, auto and explicit). AC 2's "event trace identical to v0.2.0" is covered by the whole suite passing unchanged in both modes, not by a trace diff. Background count: built in ST-16.2 (starts at `session.start`). Until ST-16.2, a turn-mode task reaches ROTATION_REQUESTED and waits. Live: none.

### ST-16.2 Safe boundary on `turn.complete` and the background count — M
- **Cites:** ADR-004 A2, AC-07; spec §3 row 1, §4 Q1.
- **Scope:** pure count in the core: +1 at a `tool.call` that started work in the background, −1 at `prompt.submit` with `origin.kind: 'task-notification'`, clamped at 0, reset at each Jeeves `/clear` and on leaving `PAUSED(UNSAFE_BOUNDARY)`. Boundary: main-loop `turn.complete` with `reason: 'answer'`, not aborted, no `$.agent.list()` entry `running`, count 0, state `ROTATION_REQUESTED`; otherwise QUIESCING exactly as at an unsafe Stop (`quiesceMaxTurns` 3, `quiesceMaxMinutes` 20, then `PAUSED(UNSAFE_BOUNDARY)`). Soft quiesce unchanged.
- **Verify (live):** does a background shell the user kills produce a `task-notification`? If not, record it; the reset covers it (at most one pause).
- **Depends on:** ST-16.1.
- **AC:** (1) no request while the count is above 0, a subagent runs, or the turn was aborted; (2) a lost notification costs at most one `PAUSED(UNSAFE_BOUNDARY)`, and the next rotation after resume is not blocked by it; (3) the count never goes negative; (4) a permission dialog open at the threshold gets no request (AC-07: `turn.complete` comes after the turn ended).
- **Tests:** U (count table); I (background shell, subagent, abort, lost notification, permission dialog).

### ST-16.3 Handover requested by submit, read from `answer`, retried — M
- **Cites:** ADR-003 A2, ADR-010, AC-08, AC-17; spec §3 rows 2–4.
- **Scope:** at the boundary, state → `HANDOVER_GENERATING`, then `$.prompt.submit` with the existing instruction (the idle-nudge path, `submitPromptSoon`); a prompt the user queued is held by ADR-010 and never runs ahead of the request. The next main-loop `turn.complete` with `reason: 'answer'` → its `answer` through the same parser and validator; an invalid one → the retry instruction submitted the same way (same counter, limit 2, then `NEEDS_REVIEW(HANDOVER_INVALID)`); an aborted or tool-only turn counts as no handover, as in Stop mode. The verified section lists crons as `not available in turn mode`.
- **Verify (live):** a handover near `handoverMaxChars` (12,000) arrives whole in `answer`; a final message with several text blocks (whether `answer` joins them).
- **Depends on:** ST-16.2.
- **AC:** (1) a valid handover is saved byte-identical to the Stop-mode file for the same answer (apart from the crons line); (2) a prompt typed between the boundary and the request is held and quoted in the continuation; (3) two invalid answers → NEEDS_REVIEW, earlier handover unchanged, no `/clear` (AC-17); (4) an interrupt during the request pauses as in Stop mode.
- **Tests:** U (crons line); I (valid, invalid ×2, queued prompt order, interrupt, 12K fixture answer).

### ST-16.4 Delivery through the continuation prompt after Jeeves's `/clear` — M
- **Cites:** ADR-003 A2, 02 §4 ROTATING (turn mode) row, S-05; spec §2.
- **Scope:** after the handover is saved, `$.command.run('clear')` as today; when it resolves: new id from `$.session.id()`, checked to differ from the old one (else the rotation fails as today), lock owner := new id, then the continuation prompt with task + handover through the restore path's `$.prompt.submit`, then CONTINUING. No `additionalContext`. Rotation line (ST-14.3) and `/jeeves handover` (ST-14.4) unchanged.
- **Verify (live):** does the engine's `session.start` after a plugin `/clear` arrive before `$.command.run('clear')` resolves? If it does and carries the new id first, use it as the row says.
- **Depends on:** ST-16.3.
- **AC:** (1) two rotations in a row with nothing typed (I); (2) an unchanged session id fails the rotation with the existing message; (3) a crash at each turn-mode step is recovered by the existing crash matrix (6/6 in turn mode).
- **Tests:** I (two rotations, same-id failure, crash matrix in turn mode).

### ST-16.5 Compaction recognised from `session.measure` — M
- **Cites:** ADR-006 A1; spec §3 compaction row.
- **Scope:** pure rule: a reading whose context tokens fall by more than a set amount below the previous reading, with no Jeeves `/clear` and no user `/clear` since, is a compaction → `COMPACTED` logged, the completion row re-appended (ST-16.6), `ROTATION_REQUESTED` at the next safe boundary. The story sets the amount from the live readings.
- **Verify (live):** the token drop of a typed `/compact` and of an auto-compaction, and of a rewind (a rewind read as a compaction causes one rotation that was not needed: harmless, noted).
- **Depends on:** ST-16.2.
- **AC:** (1) a drop above the amount → one rotation, not two; (2) a smaller drop, or one after any `/clear`, → nothing; (3) a rewind case documented with its result.
- **Tests:** U (rule table); I (compaction, small drop, after `/clear`, rewind-sized drop).

### ST-16.6 Completion rules as a hidden row — S
- **Cites:** ADR-007 A1, AC-13.
- **Scope:** the `prompt.compose` section's text goes in with `$.session.append` (hidden row) when a task starts (after its first prompt is captured or submitted), after every continuation, after a recognised compaction and every 10 turns. The completion block is read from `turn.complete`'s `answer`; "block Stop once with the missing checks" becomes one submitted prompt listing them; still missing after that turn → `NEEDS_REVIEW` as today.
- **Verify (live):** the row reaches the model before its next answer (a probe asks the model to repeat a marker from the row).
- **Depends on:** ST-16.3.
- **AC:** (1) rows at the four points and no more; (2) a claimed completion with failing checks gets one prompt, then NEEDS_REVIEW; (3) a passing completion → COMPLETED.
- **Tests:** U (cadence); I (rows, completion pass and fail).

### ST-16.7 Every I-layer rotation test in both modes — M
- **Cites:** spec §5 (g), §6; ST-13.9 (the mode-file pattern).
- **Scope:** like `tests/mod/mode.ts`: a `BOUNDARY = 'stop'` constant; `npm run test:mod:turn` runs a temporary copy with `turn`, where the kit drops `classic.Stop`, `classic.SessionStart`, `session.compact` and `prompt.compose` after an answered turn, as the prepend plugin does. Every rotation test (boundary, handover, retry, clear, continue, crash, compact, complete, held, recover, auto) passes in both; tests that assert Stop-only facts (crons in the handover, `additionalContext`) say so and are skipped in turn mode with the reason. CI and `scripts/check-all.sh` run stop × autoStart off, stop × on, turn × off (turn × on adds no path the auto tests do not already cover in turn × off; reconsidered if a failure says otherwise). README, PRIVACY, `/jeeves help` and `jeeves/docs/compatibility.md`: "Team accounts unsupported" replaced by turn mode and what it does not give (crons line, precompute skip).
- **Verify:** none live.
- **Depends on:** ST-16.1 … ST-16.6.
- **AC:** (1) green in all three runs; (2) every skip has a written reason; (3) texts match the shipped behaviour.
- **Tests:** I (three runs); M (text review).
- **DoD:** + CHANGELOG.

### ST-16.8 Live E runs on the Team account — M
- **Cites:** spec §5 (h), §6; AC-07 E, AC-10, AC-11, Q-12.
- **Scope:** through `tests/pty/e_layers.py` and `ptylib.py` on the maintainer's Team account (fresh-install command from the M9 handover §3), haiku: (1) two rotations in a row with nothing typed after the task (`six-steps`); (2) AC-07 with a permission dialog open at the threshold; (3) a typed `/compact` → one rotation; (4) any probe item from ST-16.2 … ST-16.6 still open. The handover is validated and saved as in Stop mode; status shows `mode: full (turn)`.
- **Depends on:** ST-16.7. **Live run:** estimate in the story before asking (M4–M8 runs cost US$0.03–0.43 each); go-ahead and budget asked first.
- **AC:** each run PASS/FAIL with cost, or a recorded reason it did not run; Q-12 answered for the Team account.
- **Tests:** E.
- **DoD:** + `docs/done/evidence/v0.3.0/turn-mode/RESULT.md`.

---

**Count:** 56 stories (E0 7, E1 9, E2 5, E3 8, E4 8, E5 2, E6 7, E7 3, E8 4, E9 3): 5 L, 30 M, 21 S. At the size midpoints (S 0.5 d, M 1.5 d, L 3.5 d) that is ≈ 73 engineer-days for one developer.

**M8 (v0.2) count:** 12 stories (E10 3, E11 4, E12 5): 4 M, 8 S ≈ 10 engineer-days.

**M9 (v0.3) count:** 17 stories (E13 9, E14 5, E15 3): 7 M, 10 S ≈ 15.5 engineer-days (E13 10.5, E14 2.5, E15 2.5). This is above the spec's rough 5 + 2 days (§11): the story midpoints include tests in both modes, the downgrade check and the live run.

**E16 (turn mode, D-48) count:** 8 stories: 6 M, 2 S ≈ 10 engineer-days (the spec's rough 6–8 days plus the three-run suite and the live runs). M9 with E16: 25 stories ≈ 25.5 engineer-days.
