# Handover: M9 (v0.3), turn mode accepted and planned (E16)

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Branch:** `main`. `origin/main` is at `37f9cc3`; everything after it is local only (`8d99bf9` … this handover). Paths are relative to the repo root. Previous handovers: `docs/done/handoffs/handoff-m9-after-turn-mode-proposal.md` (its §3 facts still hold) and `docs/done/handoffs/handoff-m9-after-gate-review-fixes.md` (its §3 code map, §4 facts and §6 rules still hold).

## 1. What happened this session

- **Turn-mode ADR amendments, revision 2, approved by the maintainer** (`88c8387`): ADR-002 A3, ADR-003 A2, ADR-004 A2, ADR-006 A1, ADR-007 A1 and the ROTATING (turn mode) row in 02 §4 are accepted; D-48 in 07 updated. Turn-mode code may now be written.
- **E16 planned** (`66c2d7e`), **not yet reviewed by the maintainer**: epic E16 in 03; stories ST-16.1 … ST-16.8 in 04 (6 M, 2 S, ≈ 10 days), each with its live items to verify; M9 order in 05 (E16 before ST-15.2/ST-15.3, M9 now 25.5 d); AC-48 … AC-54 in 06; R-25 mitigation in 07; the spec's changed rows and items marked **amended by revision 2**. `docs/plans/tools/gen-09.py` now covers E16 and 09 was regenerated (title "auto-start and turn mode").
- **Fixed in passing:** `47dd344` had put ST-14.4's Status line under ST-11.3, so 09 showed ST-14.4 as not started; moved.
- **Proposed to the maintainer, not applied:** ST-15.2 (AC-41) on the Team account (§3 below).

## 2. Next, in order

1. **Get the maintainer's review of the E16 plan** (04 ST-16.1 … ST-16.8). Choices made in it that they may change:
   - one throwaway probe-mod session for every live check, before ST-16.2 (haiku, est. US$0.10–0.30, needs go-ahead and budget);
   - the mod suite runs three ways: stop × autoStart off, stop × on, turn × off (not turn × on);
   - an auto task is no longer ended by the Stop skip (ST-16.1).
2. **Build E16** in order ST-16.1 → probe → ST-16.2 → ST-16.3 → ST-16.4, ST-16.5, ST-16.6 → ST-16.7 → ST-16.8 (live). Load the plugin-authoring skill before touching hooks or the test kit. Code to change first: `jeeves/src/adapter/eligible.ts` (`stopSkipped`), `jeeves/src/adapter/runtime.ts` (`markStopSkipped`, `withoutStopHook`), `jeeves/src/adapter/commands.ts:94`, `jeeves/src/adapter/task.ts:260,318`, `jeeves/src/adapter/ui.ts:158`. Pattern for the mode suite: `jeeves/tests/mod/mode.ts` and `jeeves/scripts/test-mod-on.sh`. After each story: Status line in 04, then `python3 -I docs/plans/tools/gen-09.py`.
3. **ST-15.2 decision** (§3): apply after the maintainer answers, as a new decision D-49 that amends D-44/D-46, plus ST-15.2, E15 status and gen-09's §8 text.
4. ST-15.3 release prep.

## 3. ST-15.2 proposal (awaiting the maintainer)

Run AC-41 on the maintainer's Team account in turn mode, on their own macOS user, with the fresh-install command (separate `CLAUDE_CONFIG_DIR`, logged in once, plus `JEEVES_TEST=1 JEEVES_STATE_DIR=<scratch>`), instead of a non-Team account on a separate macOS user. Depends on E16 (ST-16.8 passing). Consequences: AC-41 measures turn mode, so cost wording says so; the account is subscription-billed, so caps are API-equivalent dollars computed from token counts (whether `/cost` shows dollars there must be checked in the dry run); a usage limit that stops a run makes it partial; whether a 1M haiku window is offered is checked in the dry run.

## 4. Rules (unchanged)

As in the previous handover §4: this repo only; one local commit per finished story or fix; push only when asked; never make the repo public, publish, post, change Claude settings or install plugins; zero runtime dependencies; no live runs without go-ahead and budget; ADR conflict → stop and ask; report honestly; before every push `git grep -n "$(whoami)" HEAD` prints nothing; handover at about 35% context.
