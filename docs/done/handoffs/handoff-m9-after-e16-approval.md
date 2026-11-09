# Handover: M9 (v0.3), E16 turn mode approved, ready to build

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Branch:** `main`. `origin/main` is at `37f9cc3`; everything after it is local only. Paths are relative to the repo root. Previous handovers: `docs/done/handoffs/handoff-m9-after-e16-plan.md` (its §2 item 2 lists the code to change first) and `docs/done/handoffs/handoff-m9-after-gate-review-fixes.md` (its §3 code map, §4 facts and §6 rules still hold).

## 1. What happened this session

- Turn-mode ADR amendments revision 2 accepted (`88c8387`).
- E16 planned (`66c2d7e`): 03 E16, 04 ST-16.1 … ST-16.8, 05 M9 order, 06 AC-48 … AC-54, 07 R-25; `docs/plans/tools/gen-09.py` covers E16. ST-14.4's misplaced Status line fixed.
- **The maintainer approved the E16 plan** with its three choices (one probe session before ST-16.2; mod suite runs stop × autoStart off, stop × on, turn × off; an auto task keeps running at the skip), recorded in 03 E16's status.
- **Probe session go-ahead: hard cap US$1** (haiku, Team account, throwaway probe mod in the scratchpad only, never in the repo, as in `8d99bf9`). Not run yet.
- **D-49** (`2d912de`): ST-15.2 (AC-41) runs on the maintainer's Team account in turn mode, normal macOS user, separate `CLAUDE_CONFIG_DIR` logged in once, `JEEVES_TEST=1` + scratch `JEEVES_STATE_DIR`; caps are API-equivalent dollars; after ST-16.8. Amends D-44/D-46; 03 E15, 04 ST-15.2, 05, gen-09 §8 updated.
- No code written this session.

## 2. Next, in order

1. **ST-16.1** (no live part). Load the plugin-authoring skill first. Start from `jeeves/src/adapter/eligible.ts` (`stopSkipped`), `jeeves/src/adapter/runtime.ts` (`markStopSkipped`, `withoutStopHook`), `jeeves/src/adapter/commands.ts:94`, `jeeves/src/adapter/task.ts:260,318`, `jeeves/src/adapter/ui.ts:158`. The background count must start at `session.start` (used by ST-16.2).
2. **Probe session** (cap US$1): one throwaway probe mod answering ST-16.2 … ST-16.6's live checks (killed background shell → `task-notification`?; engine `session.start` after a plugin `/clear` vs `$.command.run('clear')` resolving; a ~12K answer and a multi-text-block final message in `turn.complete.answer`; `$.session.append` reaching the model before its next answer; context-token drop for `/compact` and for a rewind). Interactive where the check needs it (PTY via `jeeves/tests/pty/ptylib.py`), else `claude -p --model haiku` with the prompt on stdin (a prompt after a variadic flag is swallowed). Record the result in the spec §4 and each story; stop at the cap.
3. ST-16.2 → ST-16.3 → ST-16.4, ST-16.5, ST-16.6 → ST-16.7 → ST-16.8 (live: estimate and ask for go-ahead and budget first). One commit per story; Status line in 04, then `python3 -I docs/plans/tools/gen-09.py`.
4. ST-15.2 under D-49 (its own go-ahead per D-46), then ST-15.3.

## 3. Rules (unchanged)

This repo only; one local commit per finished story or fix; push only when asked; never make the repo public, publish, post, change Claude settings or install plugins; zero runtime dependencies; no live runs without go-ahead and budget (the probe has US$1); ADR conflict → stop and ask; report honestly; before every push `git grep -n "$(whoami)" HEAD` prints nothing; handover at about 35% context.
