# Handoff: M4 built, gate not passed → finish the M4 gate

**Date:** 2026-11-07 · **Claude Code:** 2.1.319 · **OS:** macOS, Darwin 27.2 · **Node:** 22.22 · **Repo:** `~/Desktop/Projects/jeeves` (branch `main`, local only)

This file is enough to continue in a clean session. Read `handoff-m3.md` §0, §1, §4, §5 for the rename, the working rules, the code map and the engine rules; this file adds what M4 changed.

## 1. Before anything

1. `git status` clean; `git log --oneline -1` shows the commit that added this file.
2. `SR_TEST_TMP=<scratchpad> jeeves/scripts/check-all.sh`: expected **217 unit, 97 mod, validate passes**, exit 0. (The script now fails on a mod-test failure; before M4 it hid them behind a pipe.)
3. `claude --version` (2.1.319 at handoff).

## 2. Where things stand

All ten M4 stories are implemented and committed; ST-4.8's live two-rotation run is the open item, so **the M4 gate is not passed** (`evidence/m4-e2e/RESULT.md`).

```
28bd873 ST-4.1 rotation executor + idle nudge (D-23)   bde8a5d ST-5.1 completion block + evaluator
c37323c ST-4.2 boundary, session record, lock          6088399 ST-5.2 completion gate, /relay done
c71fec1 ST-4.3 context injection + continuation        23f24f2 review fixes 1-3 + debug run 1 fixes
05775ed ST-4.4 held prompts                            e89de31 debug run 2 fixes
e9b41a3 ST-4.5 limits                                  1691d49 readings at every tool result (run 3)
f2b7c15 ST-4.6 assisted mode, /relay continue        dce1fea gate report, D-24, this handoff
7d7a400 ST-4.7 /relay rotate                         29343ff review 2 fixes (queued revisions, lean)
312d007 ST-4.8 fixture + PTY harness
```

Met: AC-13 (U, I, live E), AC-15 (I trace diff), AC-25 (I + README). Live: the task completes unattended in one session with zero keystrokes after setup and one commit per step (runs 3, 4). **Not yet seen live:** Jeeves's own `/clear`, the SessionStart injection, the continuation prompt, rearm, held prompts, `$.prompt.fill`. They are proven in `claude plugin test` only (and `/clear` + submit in the S-04 spike).

Two `/ponytail:ponytail-review` passes over the M4 range; all findings fixed (23f24f2, 29343ff). Live budget: 4 of the first 5 runs used (≈ US$0.09); D-25 adds 2 gate runs on top.

## 3. Next session: build D-25, then the gate (decided)

The maintainer delegated the choice and the lead engineer's recommendation is recorded as **D-25 (Accepted)**: a relative test threshold, then 2 live gate runs.

Why: haiku's whole `six-steps` task adds ~2.3 points of a 1M window, a session ~0.6-1.0, and the start reading varies ~1.1 points between runs (global plugins). No absolute test threshold fires reliably without tripping the loop guard (`evidence/m4-e2e/RESULT.md`).

Steps:
1. `runtime.ts`: accept `JEEVES_TEST_THRESHOLD_OVERRIDE=+<d>` (only with `JEEVES_TEST=1`) as a relative override; status says `TEST OVERRIDE +d`.
2. `machine.ts` (`Ctx`): in relative mode, `T = state.sessionStart.pct + d` (no request while `sessionStart.pct` is null). Loop guard in that mode: in CONTINUING, the first reading must be below the absolute threshold that ended the previous session; store it when the request is made (e.g. `rotation.thresholdAt`, optional). Unit tests per rule; the absolute override and real thresholds unchanged (existing tests).
3. Mod test: relative override requests at start + d, rearms in the fresh session, refuses a fresh session already at the old threshold.
4. Live: `npm run e2e:pty -- <scratch> --override +0.8 --chars 6000 --minutes 40`. Expect ≥ 2 rotations; if the first run shows a different growth, adjust `d` from its driver log (it logs tokens at every state change). Keep 2 clean runs as the gate evidence in `evidence/m4-e2e/gate-run5/`, `gate-run6/`; then mark ST-4.8 and M4 solved.
5. Watch in those runs (first live sight): Jeeves's `/clear`, the injected context, the continuation, rearm, handover parse rate, `$.prompt.fill`.

## 4. What M4 added (code map additions)

- `src/core/continuation.ts`: `freshContext` (SessionStart additionalContext), `continuationPrompt` (D-23: completed, files, checks with results, do-not-repeat, open work, exact next actions, held prompts quoted verbatim), `changedFiles`. Snapshot: `tests/fixtures/continuation.txt` (`UPDATE_SNAPSHOTS=1` regenerates).
- `src/core/completion.ts`: `parseComplete`, `evaluate` (latest exact-text ledger run, exit 0, after the last edit, by ledger order), `completionInstruction`.
- `machine.ts` new inputs: `IDLE`, `HOLD_PROMPT`, `QUEUE_CHANGE`, `SUBMIT_FAILED`, `CONTINUE_CMD`, `DONE_CMD`; `TOOL_RESULT.reading`; `SESSION_START_CLEAR.handoverOk`; `TURN_COMPLETE.handoverVerified`; `COMPLETE_BLOCK {commands, blockers}` (judged in the reducer). New effects `SUBMIT_NUDGE`, `WRITE_SESSION`; `RUN_CLEAR` is now hook-bound.
- `adapter/task.ts`: `onTurnComplete` (verify hash, `$.clock.after(0)` → `runClear` → `CONTEXT_READY` → submit continuation), `nudgeIfWaiting`, `onFreshSession`, `restoreHere` (restore path for `/relay resume` after USER_CLEAR and `/relay continue`), `holdPrompt`, `completionStop`, `taskSection`, `takeLock`.
- `hooks/register.ts`: wired `turn.start`, `classic.SessionStart`, `prompt.compose`; module state `turnOpen` (idle detection) and `endedHere` (session ids this process ended; locks are handed on only from those).
- Commands: `/relay rotate`, `/relay continue`, `/relay done`; `/relay dod|check` before the first prompt are queued (`flushPending` writes them wherever a revision is written, so a failed write is retried at the next prompt or revision).
- State (all optional, no migration): `sessionStart`, `completionAsked`, `pendingChanges`, `rotation.nudged`; `sessions/NNN.json` with `costUsd`.
- Tests: `tests/mod/{rotate,boundary-clear,continue,held,assisted,manual,complete}.test.ts`; `tests/unit/{continuation,completion,build-repo}.spec.ts`; `tests/fixtures/build-repo.ts`; `tests/pty/{driver,ptylib}.py`.
- Readings and plan changes: D-24 in `07` §2 (Proposed, for the maintainer).

## 5. Engine rules learned in M4 (2.1.319)

1. `$.prompt.submit` **resolves `{ drop }`** when a hook refuses the prompt; it does not reject. `engine-mod.ts` turns that into a rejection.
2. A **slash command typed while Claude works waits** until the turn ends.
3. **`session.measure` is sparse mid-turn**: one context event in a 60 s turn of ~20 tool calls. `$.session.usage()` at a tool result is current.
4. Order at `/clear`: `session.end(clear, old id)` → `classic.SessionStart(clear, new id)` → `$.command.run('clear')` resolves (S-04, used as designed).
5. Test kit: `$.classic.SessionStart({ source, session_id })` (session_id is optional; without it the kit invents one); a hook that throws is *skipped*, it does not reject the call; a hook registered after the test's first `$` call is refused; raise `ui.log` bottoms or `rt.port.log` fails noisily.
6. `node --test` inside a script run by `node --test` reports to the outer runner (strip `NODE_TEST_CONTEXT`).
7. Haiku's habits matter for E2E: it chains commands (`./verify.sh; echo`), reads big files with grep/wc, and pipes noisy output to `/dev/null`.

## 6. Open items

- **M4 gate:** live ≥ 2 rotations (AC-10/11/12), demo across 3 sessions: §3 (D-25).
- Live-unverified: `$.prompt.fill` emptying the box (ADR-010 A1), `$.session.turns()` counting for `/relay continue`, `prompt.compose` section actually seen by the model (runs 3-4 wrote correct blocks, which suggests it is).
- Failure counter: once `classic.StopFailure` is wired (ST-6.2), a rate limit during a handover would count as a rotation failure; exclude those codes then.
- Shortcuts in code: `onFreshSession`/`holdPrompt` take any clearing rotation of the project (ST-6.6); a `/clear` that resolves without its SessionStart leaves ROTATING (ST-6.1).
- Carried from M3: A-05, CI never run, Q-1 not posted, AC-07/AC-09 E-layers, Q-9, ST-9.3 naming check.
