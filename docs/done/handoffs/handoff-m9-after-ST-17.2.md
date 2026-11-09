# Handover: M9/M10: ST-15.4 done (v0.3.0 zip rebuilt, sign-off needed again), plan 10 approved, ST-17.1 and ST-17.2 done

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Branch:** `main`. `origin/main` is at `37f9cc3`; everything after it is local only (not pushed). Paths are relative to the repo root. Previous handovers: `docs/done/handoffs/handoff-m9-after-ST-15.3-signoff.md`, and `docs/done/handoffs/handoff-m9-after-gate-review-fixes.md` (its §3 code map, §4 facts and §6 rules still hold).

## 1. What happened this session

- **Plan 10 approved** by the maintainer: P-1 … P-4 as proposed (D-53). Copied into 02 (ADR-009 A4: a window of 200K or more is eligible), 03 (E17), 04 (ST-15.4, ST-17.1 … ST-17.4), 05 (M10), 06 (AC-36 and AC-37 amended, AC-55 new) and 07 (D-52 accepted, D-53) in `f4f1674`. `gen-09.py` now stops at E17 and reads every "Solved" status line, so 09 shows 26 of 26 M9 stories.
- **ST-15.4 solved** (`067b9b9`). Two independent reviews (ponytail-review and code-review, high) over `0156488..b4b1648`:
  - **Fixed**, one commit each, each with a mod test that fails without it:
    - `b85e86e`: in turn mode, a handover turn that ended in a refusal or an API error left the task in HANDOVER_GENERATING, holding every typed prompt. A refusal now gets the retry; an error pauses with `API_ERROR`.
    - `117e83b`: a turn whose Stop did reach Jeeves after turn mode was chosen was judged twice.
  - **For the maintainer** (each touches an ADR gap; see §2).
  - **Skipped:** two small cleanups (`completionRow` repeats `taskSection`; an extra project scan per tool result in turn mode with no task).
  - CHANGELOG 0.3.0 has the fixes (`d10e215`).
  - **The v0.3.0 zip was rebuilt** from two clean clones of `d10e215`: SHA-256 `4621adb78268e41aaf2f591166f6a2146fa1bd1ac38e046ce0d0f56969c5cfa5`, 248 files, no home path. Both validates pass on the unzipped tree. Recorded in `docs/done/evidence/v0.3.0/README.md`. **ST-15.3's sign-off was for the old zip (`5f463e7`) and is needed again.**
- **ST-17.2 solved** (`3a2182f`):
  - a `distinct-task` fixture (40 functions, each with its own name, prose rule and case table; default 18 modules);
  - `tests/pty/ac41.py` gets `--fixture` (default `distinct-task`), `--window` and `--model`, and stops a run as void by itself (one commit with several modules, or a module committed before its test file was named);
  - `tests/pty/void_check_test.py`, run by `check-all.sh`;
  - v0.3.0's scripted run kept no transcript, so the void check is tested on synthetic runs of the same shape.
- **ST-17.1 solved** (`7269e18`):
  - Eligibility at a window of 200K or more; the reason is `window below 200K at start`.
  - A model switch ends an auto task only below 200K.
  - Two tests changed expectations (reported in the Status line); `autoStart on` changed nothing else.
  - The grace margin check could not be done in the test kit. By the documented engine buffer the 200K auto-compaction point is about 83%, above 60%; this is unverified live.
  - Texts and CHANGELOG `Unreleased (0.3.1)` updated.
- **Checks at HEAD:**
  - Unit: 303 pass. `void_check_test` passes.
  - Mod: 317 tests in each run (stop × off, stop × on, turn × off); all pass except `tests/perf/stats.test.ts` (< 100 ms), which failed in Stop runs at load average 16–19 (known flaky, not in CI).
  - Typecheck, lint and both validates pass.
- **Live spend:** none.

## 2. Next, in order

1. **Maintainer:**
   - Sign off the rebuilt v0.3.0 zip (`d10e215`, SHA `4621adb7…cfa5`).
   - **Tag v0.3.0 at `d10e215`, not at HEAD:** HEAD has the 0.3.1 work (200K auto-start) while its version still says 0.3.0, and a tag on another commit gives another SHA.
   - Decide the two review findings:
     - **(3)** In turn mode, any answered main turn in HANDOVER_GENERATING counts as the handover attempt. So a `/loop` (`scheduled-trigger`) or `task-notification` turn that runs before Jeeves's request uses up a retry. This is inferred from the code, not seen live. A fix records the opening prompt's origin and needs a one-line note on ADR-003 A2.
     - **(4)** A refused submit makes the process unsupported but leaves its task as it is: mid-rotation, with the lock renewed until the process exits. v0.2 ended an auto task there; ADR-002 A3 says only "unsupported".
   - Go-ahead for ST-17.3 (US$2 cap approved in D-53; the run itself still needs the go-ahead).
   - v0.2.0 public (D-37) remains a gate item.
2. **Agent:**
   - Fix (3)/(4) only if the maintainer says so (ADR notes first).
   - ST-17.3 only on go-ahead:
     - Run `python3 tests/pty/ac41.py auto <scratch> --config-dir ~/jeeves-fresh --modules 18 --cap 2 --window 200000 --model <a 200K model>`.
     - Check first, without spending, which model setting gives a real 200K window on the Team account: haiku has shown 1M in every run so far.
     - Read `autoCompactThreshold` from that session for the grace margin check.
   - Then ST-17.4, which also brings `jeeves/docs/architecture.md` up to date (auto-start, turn mode).
3. **Push** when asked: `git grep -n "$(whoami)" HEAD` printed nothing at `7269e18`.

## 3. How to try it on a Team account (no publishing needed)

- **Exact v0.3.0:** `git worktree add ../jeeves-v030 d10e215`, then `claude --plugin-dir ../jeeves-v030/jeeves` in any git repo.
- **With 200K auto-start (0.3.1 work):** `claude --plugin-dir jeeves` from this checkout.
- **Fresh-install state:** a separate `CLAUDE_CONFIG_DIR` (as `~/jeeves-fresh` in D-49) and a scratch `JEEVES_STATE_DIR`.
- **What to expect:**
  - Team accounts run in turn mode: `/jeeves status` shows `mode: full (turn)`.
  - The first typed prompt in a fresh session becomes an auto task.
  - `/jeeves status --diagnose` names any reason it does not.

## 4. Gaps carried

- No Stop-mode live run for v0.3 (needs a non-Team account).
- One cost pair only.
- The `later` + grace edge is unconfirmed.
- `architecture.md` is not updated (ST-17.4).
- The "decisions to confirm" list in `handoff-m9-after-gate-review-fixes.md` §5 is still unanswered.
- The 200K grace margin is unverified live.

## 5. Rules (unchanged)

- This repo only.
- One local commit per finished story or fix; push only when asked.
- Never make the repo public, publish, post, tag, change Claude settings or install plugins.
- Load the plugin-authoring skill before touching hooks or the test kit.
- Zero runtime dependencies.
- No live runs without go-ahead and budget.
- Never edit `jeeves/` while a live `--plugin-dir` run is going.
- ADR conflict: stop and ask.
- Report honestly.
- Before every push, `git grep -n "$(whoami)" HEAD` prints nothing.
- Handover at about 35% context.
