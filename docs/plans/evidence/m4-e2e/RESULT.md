# M4 PTY E2E: gate PASSED (gate runs 5 and 6)

**Date:** 2026-11-07 · **Claude Code:** 2.1.319 · **macOS** Darwin 27.2 · **Model:** haiku · **Driver:** `jeeves/tests/pty/driver.py` (`npm run e2e:pty -- <scratch> --override +0.8 --chars 6000`) · **Fixture:** `six-steps` · **Threshold:** relative test override `+0.8` (D-25 as amended)

Two clean live runs in a row, both 10/10 checks:

| Gate run | Code | Rotations | Sessions | Result | Cost (recorded) |
|---|---|---|---|---|---|
| `gate-run5/` (live run 10) | f54c910 | 5 | 6 | COMPLETED, 10/10 | US$0.088 |
| `gate-run6/` (live run 11) | f54c910 | 4 | 5 | COMPLETED, 10/10 | US$0.086 |

## All live runs in M4

Budget: 5 approved for the first session, then 3 + 3 + 3 approved in this one (11 runs in all). Costs are the per-session `costUsd` Jeeves recorded plus `/cost` of the last session; a session killed by hand has no record, so runs 6-9 cost somewhat more than shown.

| Run | Code | Outcome | What it taught |
|---|---|---|---|
| debug 1-3, gate 4 | 6088399 … 1691d49 | 0 rotations (see below) | see the first table below; ~US$0.09 together |
| debug-run5 | 17d8379 | 1 rotation, then stuck in RESTORING; US$0.015 | `$.command.run('clear')` never resolved, so no continuation. Fix bdb8655: the fresh session continues on a 1 s timer |
| debug-run6 | bdb8655 | 4 rotations in 90 s, only step 1; stopped; ≥ US$0.036 | first live `/clear` → injection → continuation → rearm, 3x. A fresh session's first reading was 3.75% vs ~6.1% real level, so start + 0.8 fired at once. Fix 332b9e2 (start at a tool reading; guard on the source end reading) |
| debug-run7 | 332b9e2 | 1 rotation, then the same loop; stopped; ≥ US$0.017 | the first *tool* reading of a fresh session is low too. Fix f235eb5 (second tool reading) |
| debug-run8 | f235eb5 | 1 rotation, all 6 steps done, stuck at handover 2's Stop; ≥ US$0.016 | `asPath` took the regex `/\s+/` for a path; the live lookup threw out of the Stop. Fix af7a534 (+ driver keeps Jeeves's debug lines) |
| debug-run9 | af7a534 | 1 rotation (with a handover retry), then the loop; stopped; ≥ US$0.016 | the first response made 2 tool calls, both 3.76%: real (37,564 input tokens). Fix f54c910 (start = first reading that differs from the first) |
| **gate-run5** | f54c910 | **PASS** | |
| **gate-run6** | f54c910 | **PASS** | |

Recorded total for this session's 7 runs: about US$0.27 (plus the unrecorded killed sessions, each ≤ ~US$0.02). M4 in all: about US$0.36.

## Gate checklist (05, M4 row)

| Item | Status | Evidence |
|---|---|---|
| PTY E2E ≥ 2 rotations, distinct sessions, start% < end% (AC-10, AC-12) | **Met** | gate-run5: 5 rotations, 6 distinct ids, every session start < end (5.81→7.04 … 6.21→7.13); gate-run6: 4 rotations, 5 ids (5.83→7.38 … 6.66→7.89). `sessions/NNN.json`, `RESULT.md` per run. The AC-10 "quote earlier messages" probe was not asked (driver types nothing after setup); the fresh context is shown by the ids, the readings and `/clear` in the debug log |
| No keystrokes after setup (AC-11) | **Met** | both runs: `keystrokes_after_setup: []`, no permission dialog (`result.json`, `driver.log`) |
| No repeated work (AC-12) | **Met** | both runs: each step committed exactly once, each `src/stepN.js` in exactly one commit, task revision 2 (rev 1 + the check); `git-log.txt` |
| AC-13 completion only on verified DoD | **Met** (U, I, E) | both gate runs COMPLETED after `./verify.sh` exit 0 after the last edit; earlier E: runs 2-4 |
| AC-15 manual = same pipeline | **Met** (I) | `tests/mod/manual.test.ts` |
| AC-25 assisted mode honest | **Met** (I, M) | `tests/mod/assisted.test.ts`, README "Modes" |
| Demo: fixture completes across 3 sessions unattended | **Met** | gate-run5 across 6 sessions, gate-run6 across 5 |

## First live sightings (watched in these runs)

- **Jeeves's own `/clear`:** 9 in the two gate runs, every one followed by `session.end(clear)` and the fresh `classic.SessionStart(clear)`. Live, `$.command.run('clear')` resolves when the command is *queued* (`$.command.run (jeeves): 6 chars queued`, ~200 ms later, task still ROTATING), not after the SessionStart; once (run 5) it never resolved. The continuation therefore always came from the fresh session's 1 s timer (`jeeves-debug.log`: `$.prompt.submit (jeeves): "Jeeves: you are session N…"` ~0.9 s after each SessionStart).
- **Injected context:** SessionStart(clear) returned the context in every rotation; the fresh sessions acted on it and on the continuation (they re-checked the repo and picked up at the next step; no step was redone).
- **Continuation prompt:** 9/9 submitted unasked, one per rotation, plugin origin.
- **Rearm:** 9/9, always at the session's real start (6.08-6.66%), below the source session's end reading.
- **Handover parse rate:** parsed 9/9 handovers; **first-try valid 2/9** (gate-run5 retries 1,0,1,1,0; gate-run6 2,2,1,1). All 12 rejections were placeholder or relative paths in `[verified]` bullets (`src/stepk.js` ×5, `src/stepK.js` ×2, `src/stepN.js`, `tests/stepk.test.js`, `tests/stepN.test.js`, `../src/step3.js` ×2), copied from the fixture's own task text (`src/stepK.js`) and from test imports. Two handovers used both retries: one more invalid block would have been NEEDS_REVIEW. Open item for M5.
- **`$.prompt.fill`:** **not exercised**: nothing was typed during a rotation, so no prompt was held. Still unverified live (ADR-010 A1).
- **Engine reading worth keeping:** a fresh session's first model call really is ~24K tokens smaller than its second (run 9 transcript: 37,564 input tokens, then ~64K); every tool result of that first response reads the same figure.

---

# Earlier record (first session): gate not passed


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
