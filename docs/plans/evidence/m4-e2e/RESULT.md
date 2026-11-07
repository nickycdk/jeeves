# M4 PTY E2E: gate NOT passed (no live rotation yet)

**Date:** 2026-11-07 · **Claude Code:** 2.1.319 · **macOS** Darwin 27.2 · **Model:** haiku · **Driver:** `jeeves/tests/pty/driver.py` (`npm run e2e:pty`) · **Fixture:** `six-steps` (`jeeves/tests/fixtures/build-repo.ts`)

Live-run budget: 5 approved (3 debug + 2 gate). Used 4 (3 debug + 1 gate), about **US$0.09** in total. Run 5 is unspent on purpose (see "Why the gate stops here").

| Run | Commit | Settings | Outcome | What it taught |
|---|---|---|---|---|
| debug 1 | 6088399 | override 9%, verify padding | NEEDS_REVIEW (DOD_UNMET), 0 rotations, $0.015 | A slash command typed while Claude works waits for the turn to end: `/relay check` landed after haiku finished all six steps in one turn. Haiku sent the padded `verify.sh` output to `/dev/null`. |
| debug 2 | 23f24f2 | override 9%, check queued before the prompt, case tables | NEEDS_REVIEW (DOD_UNMET), 0 rotations, $0.020 | The queued check worked. Haiku ran `./verify.sh; echo "exit=$?"`, which the exact-command evidence rightly refuses; it ignored the reminder. Context grew ~3K tokens: haiku read tables with grep/wc, and the engine's percent is whole on a 1M window. |
| debug 3 | e89de31 | override 8.5% (exact readings), per-case verify output | **COMPLETED**, 0 rotations, $0.025 | The completion gate works live (`./verify.sh` run alone, exit 0 after the last edit). Only **one** `session.measure` context event arrived in the 60 s turn, so the threshold never saw the growth. |
| gate 4 | 1691d49 | as run 3 + a reading at every main-loop tool result | **COMPLETED**, 0 rotations, $0.026 | Readings now arrive every few seconds mid-turn (5.68% -> 7.93%). The whole six-step task grew only ~22.5K tokens (2.3 points), so 8.5% was never reached. |

Per-run folders: `debug-run1/` … `gate-run4/` (RESULT.md, result.json, events.jsonl, driver.log with every keystroke, git-log.txt).

## Gate checklist (05, M4 row)

| Item | Status | Evidence |
|---|---|---|
| PTY E2E >= 2 rotations, distinct sessions, start% < end% (AC-10, AC-12) | **Not met** | No live run rotated. `/clear` -> SessionStart injection -> continuation is proven only in `claude plugin test` (`tests/mod/continue.test.ts`, `manual.test.ts`) and in the S-04 spike |
| No keystrokes after setup (AC-11) | Met for setup -> completion (runs 2-4: 0 keystrokes after `/relay on`, `/relay check`, the task); **not shown across a rotation** | `gate-run4/driver.log` |
| No repeated work (AC-12) | Met within one session (6 steps, 6 commits, each step file in exactly one commit, runs 1-4); not across rotations | `git-log.txt` per run |
| AC-13 completion only on verified DoD | **Met** (U, I, E) | E: run 2 (claim, check only ran chained -> NEEDS_REVIEW DOD_UNMET), runs 3-4 (claim after `./verify.sh` exit 0 -> COMPLETED). U: `completion.spec.ts`; I: `complete.test.ts` |
| AC-15 manual = same pipeline | **Met** (I) | `tests/mod/manual.test.ts` (trace equal except THRESHOLD -> MANUAL) |
| AC-25 assisted mode honest | **Met** (I, M) | `tests/mod/assisted.test.ts`, `tests/unit/ui.spec.ts`, README "Modes" |
| Demo: fixture completes across 3 sessions unattended | **Not met** (completes unattended in 1 session) | runs 3-4 |

## Why the gate stops here

The start reading differs by ~1.1 points between runs (6.32%, ~6.8%, 5.68%: the maintainer's global plugins), while haiku's whole six-step task adds only ~2.3 points and a session ~0.6-1.0. An absolute test threshold therefore either never fires or trips the loop guard, depending on the run. Spending run 5 on another guess would not give gate-quality evidence. Decided as **D-25** (maintainer delegated, 2026-11-07): a **relative test threshold** (`JEEVES_TEST_THRESHOLD_OVERRIDE=+0.8`: rotate when this session has grown 0.8 points from its first reading; loop guard: a fresh session's first reading must be below the threshold that ended the previous one), test-only like the override itself; then 2 gate runs.
