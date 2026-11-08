# Handoff: M2 Monitoring & task done → start M3 (Handover)

**Date:** 2026-11-07 · **Claude Code:** 2.1.319 · **OS:** macOS, now Darwin 27.2 (updated after M2; M2 was built on Darwin 23.6) · Read `handoff-m1.md` too: its run instructions and engine rules still apply.

## 0. Before anything else

- **git is blocked** after the OS update: `/usr/bin/git` exits 69, "You have not agreed to the Xcode license agreements". The maintainer must run `sudo xcodebuild -license` once (it needs sudo; do not try to work around it). Until then: no commits, the unit tests that build real git repos fail, and the plugin's own git calls fail (`repoIdentity` → "git did not answer").
- **Uncommitted at handoff:** this file and `07-risks-and-open-questions.md` (D-17, D-18 marked Accepted). Commit both once git works: `Handoff: M2 done, next is M3`.
- Then run the checks once on the new OS before touching code: `cd sessionrelay && SR_TEST_TMP=<scratchpad> scripts/check-all.sh` (expected: 103 unit, 44 mod, validate passes). Not yet run on Darwin 27.2.

## 1. Where things stand

M2 (ST-2.1 … ST-2.5, ST-7.3) is solved and its gate passed; a ponytail-review found 4 issues, all fixed. Plans are marked (`04` Status lines, `05` § Status, `03`, `00`, `06`).

```
e9ab583 ST-2.1 on/off + verbatim capture     4e2b542 ST-7.3 notice + reason catalogue
3c2a5a2 ST-2.2 revisions                     9bc5fce M2 gate: live demo, D-17..D-19, handoff
bd666b0 ST-2.3 context reading               92f7941 M2 review fixes 1-4
bac704b ST-2.4 threshold + test override     c9cffcd Plans: mark M0-M2 solved
42b42c8 ST-2.5 pause/resume
```

Live demo: `docs/done/evidence/m0-m7/m2-demo/RESULT.md` (2 haiku runs, $0.07 each): verbatim capture, context = status line figure, warning, one request, TEST OVERRIDE, heartbeat, lock released on exit.

Decisions: D-17 (M2 backlog readings) and D-18 (lock released on exit; LOCK_HELD for a second task in one worktree) **accepted by the maintainer**. D-19 records the engine rule below.

## 2. What exists after M2

- `src/core/task.ts`: new task state; revision files (rev 1 = prompt verbatim; rev 2+ = change records); fold; `/relay task` text.
- `src/core/machine.ts`: inputs `REVISED`, `SET_THRESHOLD`, `OFF { sessionId }`; `ctx.thresholdOverride` (test only, never stored); deferred pause (`state.pauseRequested`) applied at `CONTEXT_READY`. Threshold/warn/rearm logic lives in the `MEASURE` branch (no `threshold.ts`, D-17).
- `src/adapter/task.ts`: the wiring cycle. `apply()` = read `state.json` → `reduce` → `writeState` → `runEffects`, all inside `rt.serial` (one queue per process; this is what dedupes concurrent hooks). Also `startTask`, `captureFirstPrompt`, `addRevision` (adopts a leftover rev file first), `readTask`, `measure`, `heartbeat`, `claim` (lock free or stale), `heldByOther`, `releaseOnExit`, `onUserClear`.
- `hooks/register.ts`: `prompt.submit` (capture), `session.measure` (only when `changed` has `context`), `session.end` (`clear` → PAUSED(USER_CLEAR) + release old id's lock; other reasons → release lock), heartbeat `$.clock.every(30 s)` started in `session.start`. `quietly()` keeps hook failures out of the user's way. **Still pass-through:** `tool.call`, `turn.complete`, `session.compact`, `classic.Stop`, `classic.StopFailure`, `classic.SessionStart`.
- `/relay`: on, off, pause, resume, threshold, task, dod, check, status, help. Task-changing subcommands need `origin.kind === 'composer'`.
- `src/adapter/ui.ts`: `MSG` (command replies), `REASON_TEXT` (one line per reason code), status ≤ 8 lines × 40 cols.
- Tests: `tests/mod/kit.ts` (helpers, `until()`), `tests/mod/memfs.ts` (in-memory host with mock clock/store, bottoms for `session.start/measure/end`, `classic.Stop`; switchable `sessionId`, `usage`, `failWrite`).

## 3. Engine rules learned in M2 (add to handoff-m1 §5)

1. `$.prompt.submit` is refused inside a `command.run` hook; defer with `$.clock.after(0, …)` (port `submitPromptSoon`). Other `$` calls from `command.run` (e.g. `$.session.append`) are untested there.
2. The kit needs a bottom answer for every event a test raises; register bottoms before the test's first `$` call (memHost does).
3. `mock.clock.advance` resolves before a timer's async file work finishes: use `until(h, pred)`.
4. Live haiku sessions on this machine start at ~6% of a 1M window (global plugins load too). Use a test override above 6 to see a warning (9 worked).
5. `$.store` for a `--plugin-dir` plugin lives at `~/.claude/plugins/store/sessionrelay_inline-<hash>.json` (holds `firstActivationShown`; delete it to see the notice again).
6. After `/clear` the process continues under a new session id and no `session.start` fires; `session.end` carries the old id.

## 4. Open items

- `/relay on <goal>` submission tested under `claude plugin test` only, not live.
- `/relay resume` after a user `/clear` refuses until ST-4.3 builds the restore path (`shortcut:` in `commands.ts`).
- `/relay resume` cannot adopt a MONITORING task left by a crashed session (only PAUSED); recovery is ST-6.1.
- `projectTasks` reads every task's `state.json` per hook call (`shortcut:` in `task.ts`).
- Carried from M1: A-05 (real OS state root write, needs the maintainer's OK), CI never run (no remote), Q-1 upstream question drafted but not posted.
- Maintainer's weekly usage was 84% at handoff: keep live runs minimal.

## 5. Next: M3 Handover (ST-3.1 … ST-3.8, ~12 d)

**Gate (05):** AC-07, AC-08, AC-09, AC-17 tests pass; validator fixture suite ≥ 20 cases; handover persisted + hash-verified before any `/clear` effect. **Demo:** rotation pipeline up to a persisted, validated handover file; invalid handover → NEEDS_REVIEW.

Already in place for M3:
- The reducer handles `TOOL_RESULT` (one soft-quiesce note), `STOP` (safe/unsafe, quiesce count/timeout → PAUSED(UNSAFE_BOUNDARY), handover ok/retry/NEEDS_REVIEW), `HANDOVER_PERSISTED`, with table + property tests.
- `effects.ts` returns hook-bound effects (`BLOCK_STOP`, `CAPTURE_FACTS`, `PERSIST_HANDOVER`, `APPEND_NOTE`) as `forHook`; `apply()` hands them back to the calling hook. M3 turns them into the Stop hook's answer.
- `storage.writeImmutable` (write-once + SHA-256 read-back), `writeState` (atomic `mv` swap), `gitFacts`, `core/redact.ts` (event redaction, extend in ST-3.7).
- S-05 spike code to start from: `docs/done/evidence/m0-m7/s-05-handover-size-parse/mod-parse/hooks/` (`instruction`, `parse`); its parse rate was 10/10.
- ST-3.1's ledger in state (ring of 200) is a `State` schema change: still v1 and unreleased, so extend v1 and its fixtures (as M2 did with `pauseRequested`).

Watch: Stop blocks per rotation ≤ 4 (engine cap 8); read rotation state before `await next(e)`; Stop hook failure must fail open for the user and closed for rotation; ledger must never alter or block a tool call.
