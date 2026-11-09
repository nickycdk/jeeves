# Handover: M9 (v0.3 auto-start), after ST-14.1

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Branch:** `main`, **26 commits ahead of `origin` (this handover included), not pushed**. Paths are relative to the repo root. The previous handover (after ST-13.8) is `docs/done/handoffs/handoff-m9-after-ST-13.8.md`.

## 1. Where things stand

- **The auto-start spec is approved** (`docs/specs/auto-start.md`, D-40). Design frozen: new ideas go to its §13.
- **The v0.3 plan** lives in the numbered plans (02–07) and is gathered in `docs/plans/09-v0.3-auto-start-plan.md`. **09 is generated:** after changing 02–07, run `python3 -I docs/plans/tools/gen-09.py` from the repo root; never edit 09 by hand. Its header text lives in `docs/plans/tools/gen-09.py` (line 36): update "… solved; next …" there after each story. 09 §4 opens with a progress table built from each story's Status line in 04.
- **Built:** E13 complete: ST-13.1 (`a818e6a`) … ST-13.8 (`5d3206e`), **ST-13.9 (`cdcbc5d`)**; **ST-15.1 (`0a66060`)**; **ST-14.1 (`8f657f0`)**. Each story's **Status** line in 04 says what was decided and what was not done.
- **Checks at HEAD:** 296 unit; 267 mod tests pass in both suite modes (`npm run test:mod`, `npm run test:mod:on`); typecheck, lint, `claude plugin validate --strict` and the marketplace validate pass. `tests/perf/stats.test.ts` (`< 100 ms`) fails intermittently when the machine is loaded (load average was 34 this session; the pre-session commit fails it the same way; CI does not run `tests/perf`). Once, under that load, `crash.test.ts` reported "the file ran to its end" as a failure; it did not recur in 8 later runs. Live spend: none.
- **Not reviewed yet:** ST-13.6 … ST-14.1 had no ponytail-review or code-review. The M9 gate needs both over the whole M9 range at the end.

## 2. Next, in order

1. **ST-14.2 `/jeeves` alone (S)**, 04 and spec §6.5: status plus watched/reason and one line of 2–3 commands that fit now; 8-line limit at 40 columns; the reason, commands and warnings stay when lines give way. `statusText` in `src/adapter/ui.ts` already drops lines by prefix (`Path: `, `Last: `, …); the reason line comes from `autoLine` in `src/adapter/commands.ts`.
2. **ST-14.3** rotation line ends with `Previous conversation: claude --resume <full session id>` (id in `sessions/NNN.json`; line built from ST-13.6's `goalLine`/`rotation.goal`); a resumed old conversation cannot drive the task.
3. **ST-14.4** `/jeeves handover` (read-only; reuse `history --full`'s missing/changed-file handling in `src/adapter/history.ts`). DoD includes the README command table.
4. **ST-14.5** quiet status line in auto tasks (empty until within 15 points of the threshold).
5. Then ST-15.2 (live, approved under D-46 once its preconditions hold: E13 and ST-15.1 done now; still needs the D-44 account and macOS user, and the dry run's redone estimate within US$40) and ST-15.3 (release: version bump, README status line still says 0.2.0, finish `jeeves/docs/release-notes/v0.3.0.md`).
6. **Still the maintainer's:** v0.2.0 public release steps; setting up the D-44 account and separate macOS user for AC-41; final sign-off.

## 3. How auto-start works now (code map)

- `src/core/autostart.ts`: precedence resolver; `NOT_WATCHED` reasons; `reasonLine`; `largeWindow`; **ST-14.1** `hintable`, `HINT_LIMIT`.
- `src/core/machine.ts`: near-threshold end, grace period, `LATER`; user `/clear` ends auto / pauses explicit; a held prompt's event detail is now `held prompt N (M chars)` (ST-13.9, NFR-10).
- `src/core/task.ts`: `windowThreshold`; **ST-15.1** `simulateWindow` (reading re-based on a test window, capped at 100).
- `src/core/handover/`, `src/core/continuation.ts`, `src/core/cleanup.ts`: as in the previous handover (Current goal, user's words first, cleanup rule).
- `src/adapter/eligible.ts`: decision at `session.start`, `/clear` carry-over, first-run notice, lazy start, **`hint`/`hintAnswered`**.
- `src/adapter/runtime.ts`: **`windowOverride`** read from `JEEVES_TEST_WINDOW_OVERRIDE` (only with `JEEVES_TEST=1`); wraps `port.usage()`; `measure()` in `src/adapter/task.ts` re-bases `session.measure` readings the same way.
- `hooks/register.ts`: `session.measure` calls `hint` when no task of this session took the reading. `session.start` order: upgrade check, eligibility, notice, cleanup, recovery scan.

## 4. Facts worth keeping

- **Two-mode suite (ST-13.9):** mod tests cannot read the environment (no `process` in the test runtime). `tests/mod/mode.ts` holds `AUTO_START = 'off'`; the kit's `test` (`tests/mod/kit.ts`) passes it as the `/config` row `autoStart` unless a test sets the row. **New mod tests import `test` from `./kit.ts`**, not from `claude-code/testing`. `scripts/test-mod-on.sh` runs a temporary copy with `on` (CI's mod job and `scripts/check-all.sh` run both). `auto`, `autostart`, `eligible`, `cleanup` keep the engine kit's `test` (they seed the install state). A test whose behaviour depends on auto-start states its row (`hint.test.ts` uses `default`). Only the row changes between modes; most sessions in the suite are not eligible (no git, 200K window), see ST-13.9's Status for the trial with eligible-by-default sessions (25 expected differences, no defect).
- **Kit:** `generating($, on, { auto: true, readings: [10, 52] })` gives an auto task at the handover Stop (git, 1M at start, grace skipped; needs the row `on`; the first reading must be low or the near-threshold rule ends it). `memHost(on, env, store)` seeds the plugin store; `fakeGit(h)` + `h.usage = { window: 1_000_000 }` makes a session eligible; tests whose turns end call `stop($, …)` before `turnEnd`.
- **Plugin-store keys:** `firstActivationShown` (v0.2 only), `activationNoticeShown`, `upgradeCheck`, `autoNoticeShown`, `autoOff:<session id>`, `eligibility:<session id>`, **`hinted:<session id>`**, **`hintsUnanswered`**. The three per-session keys are carried over a `/clear` and set to null on any other session end (a crashed process leaves them: accepted shortcut, in code).
- **Versions per file kind:** `state.json` 2, project `config.json` 2 only while `autoStart` is set, `auto.json` 1, everything else 1. Downgrade evidence: `tests/unit/downgrade.spec.ts` against `jeeves/tests/fixtures/v0.2-core/` (never edit it).
- **Messages:** catalogue snapshot `tests/fixtures/messages.txt` (`UPDATE_SNAPSHOTS=1 npm test` rewrites it) now has the hint. Instruction snapshot `tests/fixtures/handover-instruction.txt` has no switch (see `dcc17e5`).
- **Texts (ST-13.9):** PRIVACY.md has "When it records"; plugin README has an Auto-start section (with the hint); root README, CONTRIBUTING, CHANGELOG (`## Unreleased (0.3)`) updated; release notes draft `jeeves/docs/release-notes/v0.3.0.md` (AC-41 wording and E14 items left for ST-15.3). `jeeves/docs/architecture.md` and `troubleshooting.md` were not reviewed for auto-start.
- **Haiku 5.5 prices** (read 2026-11-08): up to 100K-token prompts input 0.10, cache read 0.01, output 0.50 US$/MTok; over 100K every price ×5.

## 5. Open items for the maintainer (none blocks E14)

- AC-41 go-ahead and US$40 budget approved (D-46), valid once E13 and ST-15.1 pass (both done now), the D-44 account and macOS user exist, and the dry run's redone estimate stays within US$40; otherwise stop and ask.
- Decisions to confirm or reverse: (ST-13.4) the first-run notice also shows for an upgrader who typed `/jeeves auto on`; (ST-13.7) `/jeeves on` without a goal in an auto task stays "Already on"; a PAUSED auto task is also ended by a user `/clear`; (ST-13.8) PAUSED/NEEDS_REVIEW/FAILED/BLOCKED auto tasks are never cleaned; **(ST-13.9)** the first-run and upgrade notices keep their spec wording (the §5.10 recording text is in PRIVACY.md and the READMEs, not in the notices); a held prompt's event line no longer quotes it (a fix against NFR-10, changes ST-4.4's test); **(ST-14.1)** any typed `/jeeves on` or `/jeeves auto on` resets the hint count, and the count is machine-wide.

## 6. Rules (from the maintainer, still in force)

- Work in this repo only; one local commit per finished story or fix. Push only when the maintainer asks.
- Never make the repo public, publish, post, change the maintainer's Claude settings or install plugins.
- Load the plugin-authoring skill before changing hooks or the test kit (never write into its dev-mods folder; Jeeves is its own plugin here).
- Zero runtime dependencies. No live runs without the maintainer's go-ahead and budget (haiku, scratch `JEEVES_STATE_DIR`).
- If a story conflicts with an ADR, stop and ask. Report honestly what failed, was skipped or is unverified.
- Before every push: `git grep -n "$(whoami)" HEAD` must print nothing.
- Write a handover when the context reaches about 35%.
