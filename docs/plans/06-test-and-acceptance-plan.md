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

The test-only threshold override (`JEEVES_TEST=1` + `JEEVES_TEST_THRESHOLD_OVERRIDE`) exists so E2E rotations happen at a few percent, keeping cost low. It is ignored unless both variables are set, and `/relay status` shows "TEST OVERRIDE" when active. At least one release run (ST-9.2) uses the real 50% default.

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
| Handover corpus | ≥ 20 Markdown samples: valid, missing heading, two blocks, no block, CRLF, fenced, wrong IDs, secret inside, oversize, false "pass" claim | parser/validator |
| Secret corpus | synthetic keys of each supported format + clean code | redaction |
| State corpus | valid/corrupt/old-version/new-version `state.json`, stray tmp files, stale/live locks | recovery |

## 3. Acceptance criteria → tests

**Status (2026-11-07, after M2):** passing: AC-04 (I), AC-05 (U, I), AC-06 (U, I), AC-14 (U, I), AC-03 (I layer; its E-layer session run is still open). Status shows "unknown" rather than "?" for AC-06 (D-17). 
**Status (2026-11-07, after M3):** also passing: AC-07 (I: no handover request with a running background shell or subagent, an interrupt during the handover pauses, a Stop-hook failure lets Claude stop; the E-layer permission-prompt case is open), AC-08 (U: validator table over 31 fixtures; E: the M3 demo's live handover validated and saved), AC-09 (U + I: a "passed" claim for a command whose last run failed is refused, naming it; the E-layer `failing-tests` fixture run is open), AC-17 (U + I: 2 retries, then NEEDS_REVIEW, earlier handover byte-identical, no `/clear`). Every other AC is open.

| AC | Requirement (short) | Primary test(s) | Layer | Evidence |
|---|---|---|---|---|
| AC-01 | Install on clean macOS, no service/API key | Quickstart on fresh macOS user account; timed | M (+ P for settings diff) | recording + timing |
| AC-02 | Cursor terminal, normal TUI/permissions | §6 checklist before/after rotation | M | recording + checklist |
| AC-03 | No rotation without opt-in | I: measures 0→95% with no task → zero effects; E: 1 session without `/relay on` past test threshold | I, E | test report |
| AC-04 | Measurement = documented source, no rate limits | I: reading equals mocked `usage().context.percent`; rate-limit-only measure leaves it unchanged | I | test report |
| AC-05 | 49% none, 50% one | U: threshold table; I: concurrent duplicate measures | U, I | test report |
| AC-06 | null/stale no trigger, no false 0% | U + I: `undefined`, stale; status string "?" | U, I | test report |
| AC-07 | No interruption during tool call/permission prompt | I: threshold during `tool.call` → no effect until Stop; E: threshold crossed while a permission prompt is open (default mode, Bash) → prompt stays, rotation after answer; S-02 background case | I, E | logs |
| AC-08 | Handover fields, short, validatable, references task | U: validator; E: produced handover validated | U, E | handover files |
| AC-09 | Git truth; failed tests stay failed | U: false-pass claim rejected; E: `failing-tests` fixture | U, E | validator log |
| AC-10 | New ID, fresh context | E: session IDs differ; first reading after rotation < end reading; model probe question "quote earlier messages" → none (as in spike) | E | event log |
| AC-11 | Continue without prompt | E: zero keystrokes after initial prompt (driver asserts it typed nothing) | E | driver log |
| AC-12 | ≥ 2 rotations, no drift/repeat | E: `six-steps` → ≥ 2 rotations; each function implemented once (git diff per session); task rev unchanged | E | report |
| AC-13 | Completion only on verified DoD | U: evaluator; E: claim before `verify.sh` → NEEDS_REVIEW; after → COMPLETED | U, E | logs |
| AC-14 | Pause prevents, resume re-enables | U + I | U, I | report |
| AC-15 | Manual rotate = same pipeline | I: effect traces identical except trigger code | I | trace diff |
| AC-16 | Crash recovery at each point | P + E: crash matrix (ST-6.7), 6 points | P, E | crash-matrix.md |
| AC-17 | Corrupt handover → NEEDS_REVIEW | U + I: 2 failed retries; previous file hash unchanged | U, I | report |
| AC-18 | Isolation, single owner | E: two drivers (two repos; same repo two worktrees; same task twice → LOCK_HELD) | E | report |
| AC-19 | No git mutation / permission bypass | E: snapshot `git reflog`, `stash list`, refs, settings files before/after rotation → identical (except files Claude edited by task); static check: no `git commit/push/reset/stash/checkout` argv in source | E, U | diff report |
| AC-20 | Uninstall clean | P/M: settings diff after uninstall; repo untouched | P, M | diff |
| AC-21 | Contributor docs work | Fresh clone walkthrough | M | log |
| AC-22 | Compatibility matrix | C job output → compatibility.md | C | matrix |
| AC-23 | Clear failure messages | I: each StopFailure code, outdated version, disk error, wrong path → message snapshot | I | snapshots |
| AC-24 | OSS artifacts | Release checklist (08) | M | release page |
| AC-25 | Honest assisted mode | I: `$.command.run` rejects → assisted status + message; README claims reviewed | I, M | snapshots |

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

Each E/M run writes `docs/evidence/<version>/<test-id>/`:
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
