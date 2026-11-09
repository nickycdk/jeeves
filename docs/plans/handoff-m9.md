# Handover: M9 (v0.3 auto-start), after ST-14.5

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Branch:** `main`, **31 commits ahead of `origin` (this handover included), not pushed**. Paths are relative to the repo root. The previous handover (after ST-14.1) is `docs/done/handoffs/handoff-m9-after-ST-14.1.md`.

## 1. Where things stand

- **The auto-start spec is approved** (`docs/specs/auto-start.md`, D-40). Design frozen: new ideas go to its §13.
- **The v0.3 plan** lives in the numbered plans (02–07) and is gathered in `docs/plans/09-v0.3-auto-start-plan.md`. **09 is generated:** after changing 02–07, run `python3 -I docs/plans/tools/gen-09.py` from the repo root; never edit 09 by hand. Its header text lives in `docs/plans/tools/gen-09.py` (line 36): update "… solved; next …" there after each story. 09 §4 opens with a progress table built from each story's Status line in 04.
- **Built:** E13 complete: ST-13.1 (`a818e6a`) … ST-13.8 (`5d3206e`), **ST-13.9 (`cdcbc5d`)**; **ST-15.1 (`0a66060`)**; E14 complete: ST-14.1 (`8f657f0`), **ST-14.2 (`f7d1de2`), ST-14.3 (`3c4f70b`), ST-14.4 (`47dd344`), ST-14.5 (`13dbe1b`)**. Each story's **Status** line in 04 says what was decided and what was not done.
- **Checks at HEAD:** 297 unit; 276 mod tests pass in both suite modes (`npm run test:mod`, `npm run test:mod:on`); typecheck, lint, `claude plugin validate --strict` and the marketplace validate pass. `tests/perf/stats.test.ts` (`< 100 ms`) fails intermittently when the machine is loaded (load average 24–34 in the last two sessions; it failed 3 times this session under `npm run test:mod` and passed on re-runs; CI does not run `tests/perf`). Live spend: none.
- **Not reviewed yet:** ST-13.6 … ST-14.5 had no ponytail-review or code-review. The M9 gate needs both over the whole M9 range at the end.

## 2. Next, in order

1. **ST-15.2 AC-41 live runs (M)**: approved under D-46 only once its preconditions hold: E13, ST-15.1 and E14 are done; still needs **the D-44 account and separate macOS user (the maintainer's to set up)** and the dry run's redone estimate within US$40. Until the maintainer confirms the account and user exist, do not start it; ask.
2. **ST-15.3** (release): version bump, README status line still says 0.2.0, finish `jeeves/docs/release-notes/v0.3.0.md` (AC-41 wording and the E14 items: `/jeeves` alone, resume id, `/jeeves handover`, quiet status entry, hint). Can be prepared before ST-15.2 except the AC-41 wording.
3. **M9 gate review**: ponytail-review and code-review over the whole M9 range (ST-13.1 … ST-14.5), then fix what holds up. Can run before ST-15.2.
4. **Still the maintainer's:** v0.2.0 public release steps; the D-44 account and macOS user for AC-41; final sign-off; the decisions listed in §5.

## 3. How auto-start works now (code map)

- `src/core/autostart.ts`: precedence resolver; `NOT_WATCHED` reasons; `reasonLine`; `largeWindow`; **ST-14.1** `hintable`, `HINT_LIMIT`.
- `src/core/machine.ts`: near-threshold end, grace period, `LATER`; user `/clear` ends auto / pauses explicit; a held prompt's event detail is now `held prompt N (M chars)` (ST-13.9, NFR-10).
- `src/core/task.ts`: `windowThreshold`; **ST-15.1** `simulateWindow` (reading re-based on a test window, capped at 100).
- `src/core/handover/`, `src/core/continuation.ts`, `src/core/cleanup.ts`: as in the previous handover (Current goal, user's words first, cleanup rule).
- `src/adapter/eligible.ts`: decision at `session.start`, `/clear` carry-over, first-run notice, lazy start, **`hint`/`hintAnswered`**.
- `src/adapter/runtime.ts`: **`windowOverride`** read from `JEEVES_TEST_WINDOW_OVERRIDE` (only with `JEEVES_TEST=1`); wraps `port.usage()`; `measure()` in `src/adapter/task.ts` re-bases `session.measure` readings the same way.
- `src/adapter/ui.ts`: **ST-14.2** `commandsLine` (the `Try: /jeeves …` last line of status; `v.auto` set means this session does not own the shown task); **ST-14.3** the ROTATING transition line ends with `Previous conversation: claude --resume <activeSessionId>`, status adds `Owned by another session`; **ST-14.5** `statusLine` returns nothing for an auto MONITORING task below threshold − 15 (`QUIET_POINTS`). The 8-line rule now drops every `TEST OVERRIDE` line and, if still long, the lines just before the commands line.
- `src/adapter/history.ts`: **ST-14.4** `handoverText` (`/jeeves handover`, read-only, from `lastValidatedHandover`'s ref and hash) and `readSaved` (missing / changed since saved, shared with `history --full`).
- `hooks/register.ts`: `session.measure` calls `hint` when no task of this session took the reading. `session.start` order: upgrade check, eligibility, notice, cleanup, recovery scan.

## 4. Facts worth keeping

- **Two-mode suite (ST-13.9):** mod tests cannot read the environment (no `process` in the test runtime). `tests/mod/mode.ts` holds `AUTO_START = 'off'`; the kit's `test` (`tests/mod/kit.ts`) passes it as the `/config` row `autoStart` unless a test sets the row. **New mod tests import `test` from `./kit.ts`**, not from `claude-code/testing`. `scripts/test-mod-on.sh` runs a temporary copy with `on` (CI's mod job and `scripts/check-all.sh` run both). `auto`, `autostart`, `eligible`, `cleanup` keep the engine kit's `test` (they seed the install state). A test whose behaviour depends on auto-start states its row (`hint.test.ts` uses `default`). Only the row changes between modes; most sessions in the suite are not eligible (no git, 200K window), see ST-13.9's Status for the trial with eligible-by-default sessions (25 expected differences, no defect).
- **Kit:** `generating($, on, { auto: true, readings: [10, 52] })` gives an auto task at the handover Stop (git, 1M at start, grace skipped; needs the row `on`; the first reading must be low or the near-threshold rule ends it). `memHost(on, env, store)` seeds the plugin store; `fakeGit(h)` + `h.usage = { window: 1_000_000 }` makes a session eligible; tests whose turns end call `stop($, …)` before `turnEnd`.
- **Plugin-store keys:** `firstActivationShown` (v0.2 only), `activationNoticeShown`, `upgradeCheck`, `autoNoticeShown`, `autoOff:<session id>`, `eligibility:<session id>`, **`hinted:<session id>`**, **`hintsUnanswered`**. The three per-session keys are carried over a `/clear` and set to null on any other session end (a crashed process leaves them: accepted shortcut, in code).
- **Versions per file kind:** `state.json` 2, project `config.json` 2 only while `autoStart` is set, `auto.json` 1, everything else 1. Downgrade evidence: `tests/unit/downgrade.spec.ts` against `jeeves/tests/fixtures/v0.2-core/` (never edit it).
- **E14 tests:** `tests/mod/ui.test.ts` (status snapshots per state with the row `default`, quiet entry), `tests/mod/rotate.test.ts` (resume id, resumed old conversation changes nothing), `tests/mod/handover-cmd.test.ts`. Status snapshots normalise the task id and the `Path:` line.
- **Messages:** catalogue snapshot `tests/fixtures/messages.txt` (`UPDATE_SNAPSHOTS=1 npm test` rewrites it) now has the hint. Instruction snapshot `tests/fixtures/handover-instruction.txt` has no switch (see `dcc17e5`).
- **Texts (ST-13.9):** PRIVACY.md has "When it records"; plugin README has an Auto-start section (with the hint); root README, CONTRIBUTING, CHANGELOG (`## Unreleased (0.3)`) updated; release notes draft `jeeves/docs/release-notes/v0.3.0.md` (AC-41 wording and E14 items left for ST-15.3). `jeeves/docs/architecture.md` and `troubleshooting.md` were not reviewed for auto-start.
- **Haiku 5.5 prices** (read 2026-11-08): up to 100K-token prompts input 0.10, cache read 0.01, output 0.50 US$/MTok; over 100K every price ×5.

## 5. Open items for the maintainer (none blocks E14)

- AC-41 go-ahead and US$40 budget approved (D-46), valid once E13 and ST-15.1 pass (both done now), the D-44 account and macOS user exist, and the dry run's redone estimate stays within US$40; otherwise stop and ask.
- Decisions to confirm or reverse: (ST-13.4) the first-run notice also shows for an upgrader who typed `/jeeves auto on`; (ST-13.7) `/jeeves on` without a goal in an auto task stays "Already on"; a PAUSED auto task is also ended by a user `/clear`; (ST-13.8) PAUSED/NEEDS_REVIEW/FAILED/BLOCKED auto tasks are never cleaned; **(ST-13.9)** the first-run and upgrade notices keep their spec wording (the §5.10 recording text is in PRIVACY.md and the READMEs, not in the notices); a held prompt's event line no longer quotes it (a fix against NFR-10, changes ST-4.4's test); **(ST-14.1)** any typed `/jeeves on` or `/jeeves auto on` resets the hint count, and the count is machine-wide; **(ST-14.2)** `/jeeves status` shows the same `Try:` line as `/jeeves` alone, and `help` fills the line; with a typical task plus a reason line the `Path:` line now gives way; **(ST-14.3)** the new `Owned by another session` status line (spec §6.2 assumed it existed); the case is tested in `rotate.test.ts`, not `concurrency.test.ts`; **(ST-14.4)** a long goal is cut at 40 columns, not wrapped.

## 6. Rules (from the maintainer, still in force)

- Work in this repo only; one local commit per finished story or fix. Push only when the maintainer asks.
- Never make the repo public, publish, post, change the maintainer's Claude settings or install plugins.
- Load the plugin-authoring skill before changing hooks or the test kit (never write into its dev-mods folder; Jeeves is its own plugin here).
- Zero runtime dependencies. No live runs without the maintainer's go-ahead and budget (haiku, scratch `JEEVES_STATE_DIR`).
- If a story conflicts with an ADR, stop and ask. Report honestly what failed, was skipped or is unverified.
- Before every push: `git grep -n "$(whoami)" HEAD` must print nothing.
- Write a handover when the context reaches about 35%.
