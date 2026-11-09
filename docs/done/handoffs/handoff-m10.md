# Handover: M10 (v0.3.1): all stories done, ST-17.3 passed live, v0.3.1 zip waits for sign-off

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Branch:** `main`. `origin/main` is at `37f9cc3`; everything after it is local only (not pushed). Paths are relative to the repo root. Previous handovers: `docs/done/handoffs/handoff-m9-after-ST-17.2.md`, and `docs/done/handoffs/handoff-m9-after-gate-review-fixes.md` (its §3 code map, §4 facts and §6 rules still hold).

## 1. What happened this session (after the previous handover)

- **The maintainer signed off the v0.3.0 zip** at `d10e215` (SHA-256 `4621adb7…cfa5`); the v0.3.0 tag goes on `d10e215` (`f3748e3`). The tag is the maintainer's; the agent does not tag.
- **ST-15.4 findings 3 and 4 fixed** with the maintainer's approval, each with an ADR note:
  - `4616c55`, ADR-003 A2 note: in turn mode, while the handover is awaited, only a turn Jeeves's own submit opened is read as the handover.
  - `564ffbd`, ADR-002 A3 note: after a refused submit, an auto task ends and an explicit task gives up its lock.
- **Ponytail-review of the whole session's changes** (`b4b1648..564ffbd`), run as an independent review. Four fixes:
  - `b0354b9`: the opener is matched by prompt text, not one slot.
  - `3250460`: the void check counts `./verify.sh n` as reading module n. This commit also carries the driver's `--no-1m` and `/context` capture.
  - `765dda1`: no heartbeat once the process is unsupported.
  - `e10190f`: a misplaced doc comment.
- **ST-17.3 solved, live** (`aa8a4cf`), evidence `docs/done/evidence/v0.3.1/200k-auto/RESULT.md`:
  - **A real 200K window** is haiku with `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`. `/context` reads `31.1k/200k` with an auto-compact buffer of 33K, so compaction comes at about 83.5%, and the 60% grace end is below it. This was read live and costs nothing.
  - Three runs, US$0.86 of US$2:
    - **Run 1** (18 modules): no rotation; Haiku skimmed the case tables and finished at 30%.
    - **Run 2** (40 modules): two rotations. Then Claude ended a continuation turn announcing its next step without taking it, so the outcome was not reached.
    - **Run 3** (40 modules): **PASS**. Four rotations with nothing typed, every module committed and verified, median growth 77K, no retries, NFR-10 clean, US$0.56.
  - Qualifications on run 3:
    - Module 39 was committed twice: a model fix after the final verify.
    - The task ended `NEEDS_REVIEW (DOD_UNMET)` when Claude said it was done. This is designed: an auto task has no checks.
  - **Risk:** run 3's first handover turn took the context to 79%, about 4.5 points from compaction.
- **ST-17.4 solved** (`46fcea2`, `8fced1c`):
  - version 0.3.1;
  - CHANGELOG and `jeeves/docs/release-notes/v0.3.1.md`;
  - README status lines;
  - `jeeves/docs/architecture.md` gained Auto-start and Turn mode sections;
  - the compatibility matrix was regenerated;
  - the evidence pack `docs/done/evidence/v0.3.1/README.md`;
  - the zip is identical from two clean clones of `46fcea2`: SHA-256 `c1fa9565e9b39d309dbfacd26d6e49dc1a6c374628c5577054d81aaf3c13ca71`, 249 files.
- **Checks at `46fcea2`:**
  - Unit: 303 pass.
  - Mod: 321 tests in each of the three runs. All pass except `tests/perf/stats.test.ts` under load, which is known to be flaky. It also causes the one failure in each pre-2.1.319 compatibility row.
  - Typecheck, lint, `void_check_test.py` and both validates pass.

## 2. Next, in order

1. **Maintainer:**
   - Sign off the v0.3.1 zip (`46fcea2`, `c1fa9565…ca71`).
   - Tag v0.3.0 at `d10e215` and v0.3.1 at `46fcea2`, then publish (theirs).
   - Decide whether the M10 gate's code-review is wanted. The M10 range had a ponytail-review, not a code-review.
   - v0.2.0 public (D-37) is still a gate item.
2. **Agent, if asked:**
   - Code-review (high) of `b4b1648..46fcea2`. Any fix under `jeeves/` means a new zip and a new SHA.
   - The open behaviour from run 2: a continuation turn that ends by announcing the next step leaves an unattended task waiting. Whether Jeeves's hidden completion row makes this likelier is unknown. Investigating it needs a design decision and live runs.
3. **Push** when asked: `git grep -n "$(whoami)" HEAD` printed nothing at `8fced1c`.

## 3. Facts worth keeping

- **Driver:**
  - `tests/pty/ac41.py auto <scratch> --config-dir ~/jeeves-fresh --modules 40 --cap <US$> --window 200000 --no-1m` is the 200K run.
  - `--fixture long-task` reproduces v0.3.0's evidence.
  - The void check runs every minute.
  - After the run, the driver types `/context` (`context_screen`). It came back empty in run 2, so it is not reliable yet.
- **Fixture size:** 18 modules is too small to rotate on 200K when Haiku skims the tables, so use 40, the maximum `DISTINCT` allows.
- **`tests/mod/kit.ts`:** `turnStart($, id, text)` takes the turn's text, which is how the opener is matched; `turnGenerating` returns `refuse`.
- **Opener matching (`hooks/register.ts`)** keys on `prompt.submit`'s text versus `turn.start`'s text. Live, a hook beneath Jeeves could rewrite the text. Then the opener is unknown and the turn counts, as before the fix. This is unverified live.

## 4. Gaps carried

- No Stop-mode live run for v0.3 (needs a non-Team account).
- One cost pair only (v0.3.0); none for 0.3.1.
- The `later` + grace edge is unconfirmed.
- The "decisions to confirm" list in `handoff-m9-after-gate-review-fixes.md` §5 is still unanswered.
- Two skipped review cleanups (ST-15.4 items 5 and 6).
- The 200K heavy-turn margin.

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
