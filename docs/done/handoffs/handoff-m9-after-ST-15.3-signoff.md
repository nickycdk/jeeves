# Handover: M9 (v0.3): ST-15.3 signed off, M9 gate items open, v0.3.x plan proposed

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Branch:** `main`. `origin/main` is at `37f9cc3`; everything after it is local only (not pushed). Paths are relative to the repo root. Previous handovers: `docs/done/handoffs/handoff-m9-after-ST-15.3-prep.md` (its §3 facts still hold), `docs/done/handoffs/handoff-m9-after-gate-review-fixes.md` (§3 code map, §4 facts, §5 decisions to confirm, §6 rules still hold).

## 1. What happened this session

- **ST-15.3 signed off** by the maintainer (2026-11-09), with no changes to the release texts. The zip at `5f463e7` stands, SHA-256 `8780f4f4…f102`. Recorded in 03, 04 and 05 and in the evidence pack (`e70e2df`).
- **The M9 gate is not fully met** (`b86bc44`, 05 M9 row):
  - The gate's ponytail-review and code-review covered the source only up to `0156488`. E16 (ST-16.1 … ST-16.8) and D-50 were never reviewed: about 207 lines added and 39 removed in 11 files under `jeeves/src`.
  - v0.2.0 is not public (D-37 not lifted), which the gate lists.
- **v0.3.x plan proposed** (`595e880`, `docs/plans/10-v0.3.x-plan.md`). It is not approved and not yet copied into 02–07.
  - ST-15.4: review the E16 range before the v0.3.0 tag.
  - E17: ST-17.1 200K auto-start (ADR-009 A4 needed), ST-17.2 a fixture that cannot be scripted plus a void check in the driver, ST-17.3 one live auto-started 200K session (US$2 cap proposed), ST-17.4 v0.3.1 prep.
  - Decisions P-1 … P-4 in its §2.
- The 09 progress table now shows 25 of 25 stories done.

## 2. Next, in order

1. **Maintainer:**
   - Decide whether to run ST-15.4 before tagging (recommended). If a fix lands, the zip is rebuilt and the SHA and sign-off change.
   - Decide P-1 … P-4 in `10-v0.3.x-plan.md` §2 (ADR-009 A4: an ADR change, so the agent must not start ST-17.1 without it).
   - Tag and publish v0.3.0 (theirs).
2. **Agent, once allowed:**
   - ST-15.4 (no live run). Load the plugin-authoring skill before touching hooks or the test kit.
   - Then copy the approved plan into 02–07, and run ST-17.1 and ST-17.2.
   - ST-17.3 only on go-ahead and budget.
3. **Push** when asked (`git grep -n "$(whoami)" HEAD` prints nothing at `53edb8e`).

## 3. Facts worth keeping

- 200K eligibility lives in `jeeves/src/core/autostart.ts` (`AUTO_MIN_WINDOW`, `largeWindow`, `NOT_WATCHED`, `HINTABLE`), the model-switch end in `src/core/machine.ts:265`, and the threshold in `src/core/task.ts` `windowThreshold`.
- The `long-task` fixture is in `jeeves/tests/fixtures/build-repo.ts` (`STEPS[i % STEPS.length]` is the six-function cycle that let Haiku script it).
- Gaps carried (plan 10 §6):
  - no Stop-mode live run for v0.3;
  - one cost pair only;
  - the `later` + grace edge is unconfirmed;
  - `architecture.md` describes neither auto-start nor turn mode;
  - the "decisions to confirm" list is unanswered.

## 4. Rules (unchanged)

- This repo only.
- One local commit per finished story or fix; push only when asked.
- Never make the repo public, publish, post, tag, change Claude settings or install plugins.
- Zero runtime dependencies.
- No live runs without go-ahead and budget.
- Never edit `jeeves/` while a live `--plugin-dir` run is going.
- ADR conflict: stop and ask.
- Report honestly.
- Before every push, `git grep -n "$(whoami)" HEAD` prints nothing.
- Handover at about 35% context.
