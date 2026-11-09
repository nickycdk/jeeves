# Handover: M9 (v0.3 auto-start), after ST-13.8

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Branch:** `main`, **22 commits ahead of `origin` (this handover included), not pushed**. Paths are relative to the repo root. The previous handover (after ST-13.5) is `docs/done/handoffs/handoff-m9-after-ST-13.5.md`.

## 1. Where things stand

- **The auto-start spec is approved** (`docs/specs/auto-start.md`, D-40). Design frozen: new ideas go to its §13.
- **The v0.3 plan** lives in the numbered plans (02–07) and is gathered in `docs/plans/09-v0.3-auto-start-plan.md`. **09 is generated:** after changing 02–07, run `python3 -I docs/plans/tools/gen-09.py` from the repo root; never edit 09 by hand. Its header text (and which amendments it gathers) lives in `docs/plans/tools/gen-09.py`: update "ST-13.1 … ST-13.N solved; next …" there after each story. 09 §4 opens with a **progress table** built from each story's Status line in 04.
- **Built:** ST-13.1 (`a818e6a`), ST-13.2 (`3304ed1`), ST-13.3 (`5971d39`), ST-13.4 (`0e3ac35`), review fixes 13.3/13.4 (`f990b28`), ST-13.5 (`e1fc64c`), **ST-13.6 (`dcc17e5`), ST-13.7 (`d45b438`), ST-13.8 (`5d3206e`)**. Each story's **Status** line in 04 says what was decided and what was not done.
- **Checks at HEAD:** 294 unit, 257 mod tests pass; typecheck, lint, `claude plugin validate --strict` pass. Live spend: none.
- **Amendments written this session:** ADR-003 A1 (Current goal) and ADR-010 A2 (user `/clear` in auto tasks, auto-recovery) in 02, both gathered into 09 §2; four new 02 §4 rows; R-27 marked mitigated in code.
- **Not reviewed yet:** ST-13.6 … 13.8 had no ponytail-review or code-review. The M9 gate needs both over the whole M9 range at the end.

## 2. Next, in order

1. **ST-13.9 Privacy text and the two-mode suite (S)**, 04 and spec §5.10. Open design point first: "the I-layer suite runs twice in CI, `autoStart` off and on". Mod tests run in the engine kit (`claude plugin test .`), set options per test (`{ options: { autoStart: 'on' } }`) and probably cannot read `process.env`; find out (plugin-authoring skill, `reference.md` "what a test holds") how a whole run can be switched, e.g. a kit-level default in `tests/mod/memfs.ts`/`kit.ts`, or a seeded `auto.json`/store value. Most tests are not eligible anyway (no `fakeGit`, 200K window); tests asserting "no task files without `/jeeves on`" (AC-03) need the A3 wording. Then PRIVACY.md (`jeeves/PRIVACY.md`), both READMEs (rows for `auto`, `defaults auto`, the `Auto-start` setting, cleanup, the user `/clear` rule), `.github/workflows/ci.yml` (second `claude plugin test` run), CHANGELOG (none exists yet: create `jeeves/CHANGELOG.md`), release-notes draft (must name the downgrade facts from §5.11 and that only typed `defaults clear` and `purge` reach v0.3 files), NFR-10 grep test (AC 3).
2. **ST-15.1**, then **E14** (ST-14.1 … 14.5; ST-14.3/14.4 build on ST-13.6's `goalLine` and `rotation.goal`), then ST-15.2 (live, approved under D-46 once its preconditions hold) and ST-15.3.
3. **Still the maintainer's:** v0.2.0 public release steps; setting up the D-44 account and separate macOS user for AC-41; final sign-off.

## 3. How auto-start works now (code map)

- `src/core/autostart.ts`: precedence resolver; `NOT_WATCHED` reasons; `reasonLine`; `largeWindow`.
- `src/core/machine.ts`: near-threshold end, grace period, `LATER`; **ST-13.7:** `SESSION_END(clear)` not scheduled by Jeeves → DISABLED(USER_CLEAR) for auto, PAUSED(USER_CLEAR) for explicit (`USER_CLEAR_AUTO`/`_EXPLICIT`); input `EXPLICIT`; `HANDOVER_PERSISTED` carries `goal` into `rotation.goal`.
- `src/core/handover/`: `template.ts` (`GOAL`, seven headings, instruction ≤ 2,500 chars, 2,477 at worst), `parse.ts` (`requireGoal`, codes `GOAL_BULLETS`, `GOAL_TOO_LONG`), `validate.ts` (`Facts.preUpgrade`), `render.ts` (`goalLine`, 80 chars).
- `src/core/continuation.ts`: user's words first (`usersWords`, rev 1 cut at 1,500), then `summary` (Current goal, labelled), then as before. Takes `view: TaskView`.
- `src/core/task.ts`: revision kinds `dod`, `check`, **`goal`** (`/jeeves on <goal>` in an auto task).
- `src/core/cleanup.ts` + `src/adapter/purge.ts` `cleanupAuto`: ST-13.8 cleanup, at `session.start`.
- `src/adapter/eligible.ts`: decision at `session.start`, `/clear` carry-over, first-run notice, lazy start.
- `src/adapter/recover.ts`: `recoveryNotice` returns `auto` (auto task mid-rotation); `hooks/register.ts` recovers it when interactive, full mode, `turns()` 0.
- `hooks/register.ts` `session.start` order: upgrade check, eligibility, notice, **cleanup**, recovery scan.

## 4. Facts worth keeping

- **Versions are per file kind:** `state.json` 2 (adds `origin`; v0.2 tasks migrate to `explicit`; optional `graceTurns`, `laterCapped` added in v0.3 before release, no bump), project `config.json` 2 only while `autoStart` is set, `auto.json` 1, everything else 1. Constants in `src/core/types.ts`; `defaultsVersion` in `src/core/schema.ts`.
- **Downgrade evidence:** `tests/unit/downgrade.spec.ts` runs a byte-exact copy of the 0.2.0 reader (`jeeves/tests/fixtures/v0.2-core/`, never edit it); `docs/done/evidence/v0.3.0/ST-13.1-downgrade.md`. Only user-typed `defaults clear` and `purge` reach v0.3 files: both go into the v0.3 release notes (ST-15.3).
- **Plugin-store keys** (the store is shared by every session on the machine, so session-scoped keys carry the id): `firstActivationShown` (v0.2 only; v0.3 only reads it), `activationNoticeShown` (`/jeeves on` notice), `upgradeCheck` (`fresh` | `upgrader`, once per install), `autoNoticeShown` (first-run notice), `autoOff:<session id>` (`/jeeves off`), `eligibility:<session id>` (`{ reasons }`). The two per-session keys are carried over a `/clear` and set to null on any other session end; a crashed process leaves them (accepted shortcut, noted in code). Port: `storeGet`/`storeSet` in `src/adapter/ports.ts`.
- **Port addition:** `autoCompactTokens()` reads `$.session.usage({ breakdown: 'summary' })` (local estimate, no model call).
- **Test kit:** `memHost(on, env, store)` seeds the plugin store; `h.autoCompact` sets the auto-compaction point; `fakeGit(h)` + `h.usage = { window: 1_000_000 }` makes a session eligible; tests whose turns end must call `stop($, …)` before `turnEnd`, or R-25 reads the Stop hook as skipped. Auto tasks in tests: `/jeeves on` then set `origin: 'auto'` (and `graceTurns: 3` to skip the grace period), or a real auto start (`tests/mod/autostart.test.ts`). Default state root `/home/t/.local/state/jeeves`.
- **Messages:** the auto-task endings and the first-run notice are in the catalogue snapshot (`tests/fixtures/messages.txt`; `UPDATE_SNAPSHOTS=1` rewrites it). An auto-task ending also leaves the usual `Jeeves: off (task files kept)` transcript line.
- **Haiku 5.5 prices** (read 2026-11-08): up to 100K-token prompts input 0.10, cache read 0.01, output 0.50 US$/MTok; over 100K every price ×5.
- README: `/jeeves later` rows are in (it works for explicit tasks too); rows for `auto`, `defaults auto` and the `Auto-start` setting still wait for ST-13.9.
- **ST-13.6 facts:** a task is pre-upgrade when the state v1 → v2 migration set `preUpgrade: true`; the sentinel stays `v1`. Handover corpus: hand-written fixtures carry Current goal, the ten `s05-trial-*` stay real v1 output. Instruction snapshot `tests/fixtures/handover-instruction.txt` has no `UPDATE_SNAPSHOTS` switch: regenerate with a one-line node script (see git log of `dcc17e5`).
- **Test kit additions:** `tests/mod/kit.ts` `handover()` includes Current goal; recovery tests set `origin: 'auto'` by rewriting `state.json`; `h.turns`, `h.failProcess` (assisted), `isInteractive: false` (`-p`) are the gate levers; cleanup tests back-date `updatedAt` rather than advance the clock.

## 5. Open items for the maintainer (none blocks E13 or E14)

- AC-41 go-ahead and US$40 budget approved (D-46), valid once E13 and ST-15.1 pass, the D-44 account and macOS user exist, and the dry run's redone estimate stays within US$40; otherwise stop and ask.
- Decisions to confirm or reverse: (ST-13.4) the first-run notice also shows for an upgrader who typed `/jeeves auto on`; (ST-13.7) `/jeeves on` without a goal in an auto task stays "Already on" and does not make it explicit; a PAUSED auto task is also ended by a user `/clear`; (ST-13.8) PAUSED/NEEDS_REVIEW/FAILED/BLOCKED auto tasks are never cleaned.

## 6. Rules (from the maintainer, still in force)

- Work in this repo only; one local commit per finished story or fix. Push only when the maintainer asks.
- Never make the repo public, publish, post, change the maintainer's Claude settings or install plugins.
- Load the plugin-authoring skill before changing hooks (never write into its dev-mods folder; Jeeves is its own plugin here).
- Zero runtime dependencies. No live runs without the maintainer's go-ahead and budget (haiku, scratch `JEEVES_STATE_DIR`).
- If a story conflicts with an ADR, stop and ask. Report honestly what failed, was skipped or is unverified.
- Before every push: `git grep -n "$(whoami)" HEAD` must print nothing.
- Write a handover when the context reaches about 35%.
