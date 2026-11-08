# Handover: v0.2.0 release and the v0.3 auto-start spec

**Date:** 2026-11-08 · **Claude Code:** 2.1.319 · **Branch:** `main`, in sync with `origin` (github.com/nickycdk/jeeves, **private**). Paths are relative to the repo root. The finished M8 handover is `docs/done/handoffs/handoff-m8.md`.

## 1. Where things stand

- **M8 (v0.2) is solved and signed off.** Version 0.2.0 is in all three version fields, with CHANGELOG, `jeeves/docs/release-notes/v0.2.0.md` and the evidence pack `docs/done/evidence/v0.2.0/README.md`. Not tagged, not released (D-37).
- **History was rewritten and force-pushed** (maintainer's go, 2026-11-08). `/Users/<name>` became `~` and the user name became `user` in 107 old evidence files and all history; nothing else changed. Every commit got a new ID. `docs/done/old-commit-ids.md` maps old to new, because older docs cite the old IDs. Your local reflog still holds the old history (it expires by itself, never pushed). The private practice repo `nickycdk/jeeves-release-test` still has the old history with the home path.
- **Docs layout:**
  - `docs/plans/`: the living plans 00–08 and this handover
  - `docs/specs/`: the PRD, `auto-start.md`, `team-accounts-turn-mode.md`
  - `docs/done/`: finished handovers M1–M8, the M0–M7 evidence, the v0.1.0 and v0.2.0 evidence packs
- **Checks at HEAD:** 263 unit, 175 mod (all functional tests pass), validate passes. The AC-32 timing test lives in `jeeves/tests/perf/`. It runs locally only (CI deletes the folder first) and fails under high load; it's borderline with the 100 ms bound kept. It also makes `scripts/check-all.sh` stop early under load. CI was green on the rewritten history (`5198e0d`); the last two commits are docs only.

## 2. Open work, in order

### A. The v0.2.0 public release (maintainer's steps)

1. Test the README install from a tag on a clean macOS user.
2. Q-1: confirm the README states plainly that Jeeves relies on plugins being allowed to run `/clear` (or post the question upstream). An agent may check the wording but never posts.
3. Optionally ask GitHub support to purge the old commit IDs, and delete or keep private `jeeves-release-test`.
4. Make the repo public, tag `v0.2.0`, publish the draft release that `release.yml` builds. The zip SHA will differ from the one in the evidence pack, since every commit ID changed.

### B. The auto-start spec (`docs/specs/auto-start.md`), v0.3

- **Status:** revision 4 plus review-4 editorial fixes, design frozen (new ideas go to its §13).
- **The one blocker to approval is Q7:** an owner, a date, and the AC-41 cost estimate recomputed from **current Haiku prices** (look them up, e.g. through the claude-api skill; never from memory), for a 1M fixture that reaches 40% and rotates twice.
- The 200K question is settled: the 200K fixture uses a test-only window override, measuring rotation rate and outcome only; cost is compared on 1M only.
- **After approval:** write the v0.3 plan in the style of 03/04/05/06: epics and stories for §5 (core, about 5 days) and §6 (polish, about 2 days), AC-35 … AC-47 in 06, decision-log entries in 07 (installing is the opt-in for fresh installs, 1M first, auto tasks recover by themselves), and the ADR-009 A3 amendment text in 02.

### C. Team accounts (R-25, Q-11, `docs/specs/team-accounts-turn-mode.md`)

- On Team-organization accounts, Claude Code 2.1.319's built-in `cc-plugin-sec-default` (prepend tier) skips Jeeves's `classic.Stop`, `classic.SessionStart`, `session.compact` and `prompt.compose`. v0.2.0 detects this, turns itself off and says so.
- The maintainer's own account is a Team account, so no live rotation can run on it.
- The spec recommends asking upstream first (the maintainer posts), then turn mode as a later epic.
- Q-12: the Stop-based live checks (AC-07 E, compaction) and AC-41 need a non-Team account.

## 3. Facts worth keeping

- **The plugin can read, with no model call:** the context window from the model setting (`$.session.usage().window`, known before the first reading), the auto-compaction point (`autoCompactThreshold` in a locally estimated breakdown), and whether a session is resumed (`$.session.turns()`).
- **Prompt origins** come from `PromptOrigin.kind` (`composer` is typed at the terminal; `bridge`, `sdk`, `task-notification` and others are not).
- **Markers:** v0.2's first-activation marker is the plugin-store key `firstActivationShown`, not a file.
- **Old data:** v0.2 refuses newer-schema state (`SCHEMA_TOO_NEW`) and rejects unknown fields in `config.json`.
- **Haiku** has a 1M window on the maintainer's account.
- **Live spend:** M8 used US$0.1111 of its US$1 budget. Any new live run needs a fresh go-ahead and budget from the maintainer.

## 4. Rules (from the maintainer, still in force)

- Work in this repo only; one local commit per finished story or fix.
- Push only when the maintainer asks (pushes of finished docs were approved this session).
- Never make the repo public, publish, post, change the maintainer's Claude settings or install plugins.
- Load the plugin-authoring skill before changing hooks.
- Zero runtime dependencies.
- Live runs: haiku, scratch `JEEVES_STATE_DIR`, within an approved budget.
- If a story conflicts with an ADR, stop and ask.
- Report honestly what failed, was skipped or is unverified.
- No home path in tracked files: check with `git grep -n "$(whoami)" HEAD` before every push (it must print nothing).
