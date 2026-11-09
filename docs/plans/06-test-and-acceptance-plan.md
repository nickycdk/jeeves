# 06 — Test and Acceptance Plan

Rule from PRD §13: every AC has an automated test or reproducible manual evidence. "The agent says it works" is not evidence.

## 1. Test layers

| Layer | Runs | Tool | Scope | Speed / cost |
|---|---|---|---|---|
| **Unit (U)** | every commit, CI macOS + Linux | `node --test --experimental-strip-types` | `src/core/**`: reducer, threshold, parser, validator, redaction, completion, recovery, schemas | < 10 s, free |
| **Mod integration (I)** | every commit where Claude Code is installed; nightly CI | `claude plugin test .` (`claude-code/testing`: engine `$`, `mock` clock/store, `$.classic.*`, `$.tool.call`, `command.run`) | adapter + register wiring with engine stand-ins | < 1 min, free (no model calls) |
| **Storage/process (P)** | every commit (macOS, Linux) | Node scripts against a temp dir; real `mv`/`mkdir`; kill injection | atomic swap, lock, crash points | < 1 min, free |
| **PTY E2E (E)** | before each milestone gate, nightly opt-in | `tests/pty/driver.ts` (generalised from spike `drive.py`): real interactive `claude` in a pseudo-terminal, `--plugin-dir .`, `--model haiku`, test threshold override | full rotations, recovery, concurrency | minutes; small model cost per run (record it) |
| **Manual Cursor (M)** | M0, M6, M7 | scripted checklist §6, screen recording | terminal fidelity in Cursor | ~30 min |
| **Compatibility (C)** | per supported Claude Code version, release | `claude plugin validate/test` + one PTY rotation smoke | API drift (A-01) | per version |

The test-only threshold override (`JEEVES_TEST=1` + `JEEVES_TEST_THRESHOLD_OVERRIDE`) exists so E2E rotations happen at a few percent, keeping cost low. It is ignored unless both variables are set, and `/relay status` shows "TEST OVERRIDE" when active. At least one release run (ST-9.2) uses the real 50% default. The test-only window override (`JEEVES_TEST=1` + `JEEVES_TEST_WINDOW_OVERRIDE=<tokens>`, ST-15.1) makes a session behave as one with that window: eligibility, the threshold default and every reading are based on it (a 1M session under 200000 rotates at about 100K tokens); also ignored unless both are set, and status shows `TEST OVERRIDE window 200K`. Never a user setting.

## 2. Fixtures

Built by `fixtures/build-repo.ts` into a temp dir per test (never committed state):

| Fixture | Contents | Used by |
|---|---|---|
| `clean` | git repo, 1 commit | identity, facts |
| `dirty` | modified + untracked files | AC-09, edge "uncommitted edits" |
| `detached` | detached HEAD | facts |
| `worktrees` | main + linked worktree | AC-18, multi-worktree |
| `failing-tests` | `npm test` exits 1 | AC-09, AC-13 |
| `no-git` | plain dir | non-git support |
| `six-steps` | spec + empty `src/` with 6 function stubs, tests per function, `verify.sh` | AC-11, AC-12, AC-13 (E2E task) |
| `moved` | repo whose path changes between runs | REPO_MISMATCH |
| `long-task` | a task with about 1M tokens of work in modules with their own tests and a `verify.sh`, so a 1M session passes 40% twice with margin (about 750K needed); the 200K run and the dry run use only its first modules | AC-35 (E), AC-41 (v0.3, ST-15.2) |
| `autostart` | state folders for a fresh install, a v0.2 upgrader (store key, a project), a custom `stateDir`, auto tasks of known age and origin, v0.3 state for the downgrade check | AC-35, AC-38, AC-43, AC-44, AC-45 |
| Handover corpus | ≥ 20 Markdown samples: valid, missing heading, two blocks, no block, CRLF, fenced, wrong IDs, secret inside, oversize, false "pass" claim | parser/validator |
| Secret corpus | synthetic keys of each supported format + clean code | redaction |
| State corpus | valid/corrupt/old-version/new-version `state.json`, stray tmp files, stale/live locks | recovery |

## 3. Acceptance criteria → tests

**Status (2026-11-07, after M2):** passing: AC-04 (I), AC-05 (U, I), AC-06 (U, I), AC-14 (U, I), AC-03 (I layer; its E-layer session run is still open). Status shows "unknown" rather than "?" for AC-06 (D-17). 
**Status (2026-11-07, after M3):** also passing: AC-07 (I: no handover request with a running background shell or subagent, an interrupt during the handover pauses, a Stop-hook failure lets Claude stop; the E-layer permission-prompt case is open), AC-08 (U: validator table over 31 fixtures; E: the M3 demo's live handover validated and saved), AC-09 (U + I: a "passed" claim for a command whose last run failed is refused, naming it; the E-layer `failing-tests` fixture run is open), AC-17 (U + I: 2 retries, then NEEDS_REVIEW, earlier handover byte-identical, no `/clear`). Every other AC is open.

| AC | Requirement (short) | Primary test(s) | Layer | Evidence |
|---|---|---|---|---|
| AC-01 | Install on clean macOS, no service/API key | Quickstart on fresh macOS user account; timed | M (+ P for settings diff) | recording + timing |
| AC-02 | Cursor terminal, normal TUI/permissions | §6 checklist before/after rotation | M | recording + checklist | **v0.1.0 (D-34):** maintainer-reported M6 run, one rotation, no recording; the two-rotation Cursor demo was dropped.
| AC-03 | No rotation without opt-in | I: measures 0→95% with no task → zero effects; E: 1 session without `/relay on` past test threshold | I, E | test report |
| AC-04 | Measurement = documented source, no rate limits | I: reading equals mocked `usage().context.percent`; rate-limit-only measure leaves it unchanged | I | test report |
| AC-05 | 49% none, 50% one | U: threshold table; I: concurrent duplicate measures | U, I | test report |
| AC-06 | null/stale no trigger, no false 0% | U + I: `undefined`, stale; status string "?" | U, I | test report |
| AC-07 | No interruption during tool call/permission prompt | I: threshold during `tool.call` → no effect until Stop; E: threshold crossed while a permission prompt is open (default mode, Bash) → prompt stays, rotation after answer; S-02 background case | I, E | logs |
**Status (2026-11-08, M7 built):** the AC table with links is `docs/done/evidence/v0.1.0/README.md`. New E layers (`docs/done/evidence/v0.1.0/e-layers/RESULT.md`, `tests/pty/e_layers.py`): AC-03 E PASS (no `/jeeves on`, context 12% past an 8% test threshold, no task, no request); AC-09 E PASS (`failing-tests`: both live handovers report `npm test` exit 1); AC-10 E: the probe is inconclusive (Claude wrote the marker into its handover), ids distinct and context 12.4% → 3.6% across `/clear`; AC-07 E (permission prompt open at the threshold) not exercised in 2 attempts and still open. Security review: `jeeves/docs/threat-model.md`.

**Status (2026-11-08, M6 solved):** AC-01 M layer PASS and AC-02 PASS (all 7 items before and after a rotation), both run and reported by the maintainer; recordings to attach under `docs/done/evidence/v0.1.0/` (`docs/done/evidence/m0-m7/m6-gate/RESULT.md`). Earlier, at M6 built: AC-01 P layer (`tests/pty/clean_install.py`: fresh HOME, local marketplace, install 2 s, `/jeeves status` mode full at 15 s, no login; `docs/done/evidence/m0-m7/m6-install/`); its M layer (fresh macOS user, timed, recorded) is open for the maintainer. AC-02 open (Cursor checklist, maintainer). AC-20 P layer: uninstall leaves settings as before install except the `enabledPlugins` entry, the state folder stays, no plugin data folder is used (same evidence). AC-21: fresh-clone walkthrough by a fresh agent, unit + mod tests from the docs alone (ST-8.4 status). AC-22: `docs/compatibility.md` from `npm run compat` (2.1.303 … 2.1.319 pass, 2.1.287/2.1.295 refuse the module); the `compat.yml` job has never run (no remote).

**Status (2026-11-08, M5 solved):** also passing: AC-16 I layer (`tests/mod/crash.test.ts`, 6 points, `docs/done/evidence/m0-m7/m5-crash/crash-matrix.md`), P layer (`tests/unit/crash.spec.ts`) and E layer (`docs/done/evidence/m0-m7/m5-demo/RESULT.md`, live run 2: a real SIGKILL at `before-clear` with the task ROTATING, then `/jeeves recover` in a new process, exactly one recovery and one continuation from handover-001, then a normal rotation; 17/17 checks, about US$0.25; run 1, which froze in system sleep, is in `run1-sleep/NOTE.md`). AC-18 (I: path audit in `concurrency.test.ts`; E: 4 real processes, `docs/done/evidence/m0-m7/m5-concurrency/RESULT.md`, 17/17, US$0.00). AC-19 (U: `no-git-mutation.spec.ts`; E: git and settings snapshots around the live run 1 and run 2 rotations unchanged except Claude's own commits). AC-23 (U snapshot `tests/fixtures/messages.txt`: every StopFailure code, outdated version, disk error, wrong branch, moved path, lock held, unreadable state; I: `stopfailure.test.ts`, `repo.test.ts`).

| AC-08 | Handover fields, short, validatable, references task | U: validator; E: produced handover validated | U, E | handover files |
| AC-09 | Git truth; failed tests stay failed | U: false-pass claim rejected; E: `failing-tests` fixture | U, E | validator log |
| AC-10 | New ID, fresh context | E: session IDs differ; first reading after rotation < end reading; model probe question "quote earlier messages" → none (as in spike) | E | event log **Status (M4):** Met. U/I (`rotate.test.ts`, `boundary-clear.test.ts`); E: gate runs 5-6, distinct session ids, each session start% < end%, fresh start below the source end. The "quote earlier messages" probe was not asked (the driver types nothing after setup). |
| AC-11 | Continue without prompt | E: zero keystrokes after initial prompt (driver asserts it typed nothing) | E | driver log **Status (M4):** Met. I (`continue.test.ts`); E: gate runs 5-6, 0 keystrokes after setup across 5 and 4 rotations. |
| AC-12 | ≥ 2 rotations, no drift/repeat | E: `six-steps` → ≥ 2 rotations; each function implemented once (git diff per session); task rev unchanged | E | report **Status (M4):** Met. Gate runs 5-6: ≥ 2 rotations, each step committed once, each step file in one commit, task revision unchanged. |
| AC-13 | Completion only on verified DoD | U: evaluator; E: claim before `verify.sh` → NEEDS_REVIEW; after → COMPLETED | U, E | logs **Status (M4):** met: U `completion.spec.ts`, I `complete.test.ts`, E runs 2-4. |
| AC-14 | Pause prevents, resume re-enables | U + I | U, I | report |
| AC-15 | Manual rotate = same pipeline | I: effect traces identical except trigger code | I | trace diff **Status (M4):** met: `manual.test.ts` trace diff. |
| AC-16 | Crash recovery at each point | P + E: crash matrix (ST-6.7), 6 points | P, E | crash-matrix.md |
| AC-17 | Corrupt handover → NEEDS_REVIEW | U + I: 2 failed retries; previous file hash unchanged | U, I | report |
| AC-18 | Isolation, single owner | E: two drivers (two repos; same repo two worktrees; same task twice → LOCK_HELD) | E | report |
| AC-19 | No git mutation / permission bypass | E: snapshot `git reflog`, `stash list`, refs, settings files before/after rotation → identical (except files Claude edited by task); static check: no `git commit/push/reset/stash/checkout` argv in source | E, U | diff report |
| AC-20 | Uninstall clean | P/M: settings diff after uninstall; repo untouched | P, M | diff |
| AC-21 | Contributor docs work | Fresh clone walkthrough | M | log |
| AC-22 | Compatibility matrix | C job output → compatibility.md | C | matrix |
| AC-23 | Clear failure messages | I: each StopFailure code, outdated version, disk error, wrong path → message snapshot | I | snapshots |
| AC-24 | OSS artifacts | Release checklist (08) | M | release page |
| AC-25 | Honest assisted mode | I: `$.command.run` rejects → assisted status + message; README claims reviewed | I, M | snapshots **Status (M4):** met: `assisted.test.ts`, `ui.spec.ts`, README Modes. |
| AC-26 | `/jeeves retry` after an invalid handover (v0.2, ST-10.2) | U: reducer rows; I: invalid ×3 → retry → valid → rotation; limit, non-owner, Claude-typed refused; handover hashes unchanged | U, I | test report |
| AC-27 | Possible loop is reviewable, not terminal (ST-10.3) | U + I: fresh session ≥ T−10 → NEEDS_REVIEW(POSSIBLE_LOOP), retry → MONITORING without rotating here; second loop with the counter used up → FAILED; v0.1 FAILED state unchanged | U, I | test report |
| AC-28 | Window-aware default threshold (ST-10.1) | U: chooser boundaries (≤ 200K → 50, > 200K → 40, unknown → 50); I: `/jeeves on` with mock 1M/200K windows, explicit threshold kept, v0.1 state kept; E: status on a live haiku (1M) session shows 40% | U, I, E | test report + status capture |
| AC-29 | Per-project defaults (ST-11.1) | I: set/show/clear, applies to the next task in this project only, running task unchanged, corrupt file ignored with warning, purge removes it; nothing written in the repo | U, I | test report |
| AC-30 | Check suggestions, never run (ST-11.2) | U: picker table (scripts, Makefile, unsafe names, bad JSON); I: `on` message snapshots; audit: no `process.run` added | U, I | snapshots |
| AC-31 | `history --full` (ST-11.3) | I: snapshots for 2 rotations, missing and changed handover files; plain-text ASCII | I | snapshots |
| AC-32 | `stats` (ST-11.4) | U: aggregator over fixture sessions; I: snapshot; P: < 100 ms on 50 tasks | U, I, P | test report + timing |
| AC-33 | VS Code terminal (ST-12.2) | §6 checklist in VS Code before/after one rotation | M | recording + checklist |
| AC-34 | Claude Code floor 2.1.303 (ST-12.1) | C: test kit on 2.1.303 and current; E: one rotation on 2.1.303; I: probe boundary 2.1.302/2.1.303 | C, E, I | matrix + run log |
| AC-35 | Auto-start on a fresh install (ST-13.4) | I: notice at `session.start`, then the same session's first `composer` prompt creates the auto task word for word; state-folder snapshot shows nothing written before it; one test per other origin kind; E: ST-15.2's dry run (one prompt, fresh-install state, interactive pty) shows the first-run notice and the auto task | U, I, E | test report + dry-run log |
| AC-36 | Eligibility (ST-13.3) | U: eligibility and reason-order table; I: not eligible under `-p`/SDK, assisted, unsupported, outside git, 200K at start (no file), resumed; decided once (later switch to 1M does not watch); first reason plus `(+N more)` **Amended (ADR-009 A4, ST-17.1, D-53):** 200K or more is eligible; below 200K is not (reason `window below 200K at start`); U table at 199,999, 200,000 and 1M. | I | test report |
| AC-37 | Near-threshold, grace, model switch (ST-13.3, ST-13.4) | U: rules; I: near-threshold end with message, no rotation in turns 1–3, model switch to 200K ends the auto task with message **Amended (ADR-009 A4, ST-17.1):** a switch from 1M to 200K keeps the auto task and its threshold; only a window below 200K ends it; on 200K the grace period ends at 60%. | U, I | test report |
| AC-38 | Opt-out levels and precedence (ST-13.2) | U: resolver table with sources; I: `/jeeves auto` writes only `auto.json`, override message, Claude settings snapshot unchanged, `/jeeves on` after `/jeeves off` gives an explicit task | U, I | test report |
| AC-39 | `/jeeves later` (ST-13.5) | U: cap arithmetic (90%, auto-compaction − 5, compaction off); I: +10 and warning, cap message, auto and explicit, refused during a rotation | U, I | test report |
| AC-40 | User `/clear` by origin (ST-13.7) | I: auto task ends with its message and the next prompt starts a new one; explicit task pauses with its message; status shows auto/explicit | I | snapshots |
| AC-41 | Live cost, rotation rate and outcome (ST-15.2) | E, after the dry run: 1M with Jeeves (auto mode, nothing typed but the task; at least one rotation, two the target, count reported) and without; 200K simulated with the window override on the fixture's first modules (4–5 rotations); tokens, cost with cache reads, rotations, outcome; per-run caps and a US$40 total | E | `docs/done/evidence/v0.3.0/AC-41/RESULT.md` |
| AC-42 | Current goal and continuation order (ST-13.6) | U: parser/validator corpus cases, continuation snapshot; I: v1 block valid for older tasks, rotation line shows the goal, a goal claiming a new task changes nothing | U, I | test report |
| AC-43 | Upgrade path (ST-13.2) | I: check once per install (`upgradeCheck`); a fresh install stays on in its second session after its first auto task; `/jeeves on` on a fresh install never makes it an upgrader; a new `stateDir` defaults from `upgradeCheck`; a wiped store with projects kept reads as an upgrader (pinned, safe direction); store key or a project → `auto.json` off, upgrade notice once, never watched until `auto on` or the row, tasks/defaults/settings byte-identical; fresh → on; distinct store keys | I | test report |
| AC-44 | Cleanup (ST-13.8) | U: selection rule; I: 7-day boundary on `updatedAt`, custom `stateDir`, auto-start off, explicit and rotated tasks kept | U, I | test report |
| AC-45 | Downgrade (ST-13.1) | U: the frozen v0.2.0 reader (`tests/fixtures/v0.2-core/`) refuses v0.3 tasks with `SCHEMA_TOO_NEW`, ignores a `config.json` with `autoStart` and reads every other one in full, has no code for `auto.json`; audit: every v0.2 write into the state folder goes through a successful read (user-typed `defaults clear` and `purge` excepted). No whole v0.2 build is run (no I or C layer) | U, audit | `downgrade.spec.ts` + `docs/done/evidence/v0.3.0/ST-13.1-downgrade.md` |
| AC-46 | Auto-recovery for auto tasks (ST-13.7) | I: recovers in an interactive, full-mode, fresh session with a message; waits under `-p`, assisted, resumed; typed `/jeeves recover` anywhere; explicit tasks follow `autoRecover` | I | test report |
| AC-47 | §6 polish (E14) | I: hint rules (reasons 3b and 4–6 only, once, stops after 3, no files); `/jeeves` alone ≤ 8 lines at 40 columns; rotation line with the full resume id; resumed old conversation cannot drive the task; `/jeeves handover`; quiet status line | U, I | snapshots |
| AC-48 | Turn mode chosen at the skip only (ST-16.1) | U: probe with the boundary; I: skip simulated → `mode: full (turn)`, every command accepted, an auto task survives; Stop delivered → no turn-mode state and the event trace of v0.2.0; a failed submit in turn mode → `unsupported` | U, I | test report |
| AC-49 | Turn-mode safe boundary (ST-16.2) | U: background count table (clamp, resets); I: no request with a background shell, a running subagent, an aborted turn or an open permission dialog; a lost notification costs at most one `PAUSED(UNSAFE_BOUNDARY)` | U, I (E in AC-54) | test report |
| AC-50 | Handover by submit, read from `answer` (ST-16.3) | I: valid handover saved as in Stop mode (crons line `not available in turn mode`); a queued typed prompt held and quoted; two invalid answers → NEEDS_REVIEW, no `/clear`; a 12K answer read whole | U, I | test report |
| AC-51 | Delivery after Jeeves's `/clear` (ST-16.4) | I: two rotations with nothing typed; same session id → rotation fails with its message; crash matrix 6/6 in turn mode | I | test report |
| AC-52 | Compaction from `session.measure` (ST-16.5) | U: drop rule; I: compaction → one rotation; small drop or drop after `/clear` → nothing; rewind case documented | U, I | test report |
| AC-53 | Completion rules row (ST-16.6) and both-mode suite (ST-16.7) | U: row cadence; I: rows at task start, continuation, compaction, every 10 turns; completion pass and fail; the mod suite green in stop × off, stop × on, turn × off, each skip with its reason | U, I | test report |
| AC-54 | Turn mode live on the Team account (ST-16.8) | E: two rotations with nothing typed, AC-07 with a permission dialog, typed `/compact` → one rotation; status `mode: full (turn)` | E | `docs/done/evidence/v0.3.0/turn-mode/RESULT.md` |
| AC-55 | `long-task` that one script cannot solve (ST-17.2) | U: no two modules share a function name or rule text; the fixture builds and its verify fails on the stubs; the AC-41 driver marks a recorded scripted transcript void (more than one module in a commit, or a module committed before its test was read) | U | test report |

**v0.2 E-layer additions (ST-12.4):** phases c–h of `tests/pty/e_layers.py` cover compaction (typed `/compact`), `autoRecover`, REPO_MISMATCH on a moved repo with `--relink`, the `/clear` stall via `endedHere`, AC-07 (one Bash permission call as the only step after the threshold) and `/plugin configure`. Q-9 (a second blocking Stop hook) is I if the test kit loads two plugins, else E. Each result goes into `docs/done/evidence/v0.2.0/e-layers/RESULT.md` with its cost.

**Status (2026-11-08, M8 solved):** the v0.2 AC table with links is `docs/done/evidence/v0.2.0/README.md`. AC-26, AC-27, AC-29, AC-30, AC-31 PASS (U, I); AC-28 PASS (U, I, E: 40% on live haiku 1M sessions); AC-32 PASS (U, I), P borderline under load (bound not loosened); AC-33 dropped (D-36); AC-34 not met, floor stays 2.1.319 (D-38). E layers (`tests/pty/e_layers_v2.py`): d, e, h PASS; c and g FAIL because a prepend-tier plugin on Team accounts skips Jeeves's hooks (R-25, D-39); f not exercised. AC-07 E stays open.

**v0.3 (M9, D-40):** AC-03 now reads as amended by ADR-009 A3 (no rotation unless the user typed `/jeeves on` or the session was auto-watched; nothing recorded before the first typed prompt; never auto-watched for an upgrader who has not turned it on); its I test is updated in ST-13.9. The whole I-layer suite runs twice in CI, with `autoStart` off (v0.2 behaviour) and on. AC-41 needs a non-Team account (Q-12, Q-13).

## 4. Non-functional tests

| NFR | Test |
|---|---|
| NFR-01 | Timed quickstart (AC-01) < 5 min |
| NFR-02 | §6 checklist (Cursor) + PTY resize/Ctrl+C scripted cases |
| NFR-03 | Micro-benchmark of `tool.call` and `session.measure` hooks: p50/p95 recorded, target p95 < 100 ms incl. state write, < 5 ms for ledger record without write; no repo scans |
| NFR-04 | Crash matrix + property tests |
| NFR-05 | Diagnose output reviewed for secrets (redaction corpus) |
| NFR-06 | Probe tests + compatibility job |
| NFR-07 | `tsc --strict` + guards coverage check (every persisted type has a guard test) |
| NFR-08 | Snapshot: every status/message has a text label; plain-text mode has no non-ASCII |
| NFR-09 | Schema migration tests; handover is valid Markdown (round-trip) |
| NFR-10 | Grep test over state dir after E2E: no full transcript, no prompt text outside `task-rev-*` and `heldPrompts` |

## 5. Evidence production

Each E/M run writes `docs/done/evidence/<version>/<test-id>/`:
- `RESULT.md`: date, Claude Code version, OS, terminal, model, pass/fail per assertion, cost estimate.
- `events.jsonl` (copied from state dir, already redacted), `driver.log` (driver actions + timestamps), session IDs.
- Screenshots/recording for M tests (review for secrets before commit).
The AC table in the release evidence pack links each AC to these folders.

## 6. Manual Cursor checklist (S-01, AC-02, NFR-02)

Setup: macOS, Cursor stable, integrated terminal, fixture `six-steps`, `claude --plugin-dir <repo>` (or installed plugin), default permission mode.

Before rotation and again after each rotation:
1. Type while Claude is working; text appears in the prompt box and is queued (during rotation: held message shown).
2. Resize the terminal pane narrower (≤ 50 cols) and wider; no garbled layout; status still readable.
3. Ctrl+C at idle clears input; Esc interrupts a running turn; no Jeeves prompt follows an interrupt.
4. Trigger a Bash permission prompt; approve and deny once each; behaviour identical to without the plugin.
5. Paste Unicode (æøå, emoji, CJK) into a prompt; renders correctly.
6. `/help`, `/config`, `/mcp` open normally; keyboard shortcuts (e.g. history up-arrow) work.
7. `/relay status` shows the right session number and context.
Record pass/fail per item per phase in RESULT.md.

## 7. Release test gates (PRD §14.4)

`npm run typecheck`, `lint`, `test`, `test:mod`, `validate` pass → crash matrix and PTY suite pass on the release candidate → compatibility job on every listed version → manual Cursor checklist → AC table complete with pass/fail/not-supported → security review closed.
