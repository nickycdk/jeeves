# Handover: M9 (v0.3 auto-start), after ST-13.5

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Branch:** `main`, **17 commits ahead of `origin` (this handover included), not pushed**. Paths are relative to the repo root. The previous handover (after ST-13.2) is `docs/done/handoffs/handoff-m9-after-ST-13.2.md`.

## 1. Where things stand

- **The auto-start spec is approved** (`docs/specs/auto-start.md`, D-40). Design frozen: new ideas go to its §13.
- **The v0.3 plan** lives in the numbered plans (02–07) and is gathered in `docs/plans/09-v0.3-auto-start-plan.md`. **09 is generated:** after changing 02–07, run `python3 -I docs/plans/tools/gen-09.py` from the repo root; never edit 09 by hand. The numbered plans win when they differ.
- **Built:** ST-13.1 (`a818e6a`), ST-13.2 (`3304ed1`), ST-13.3 (`5971d39`), ST-13.4 (`0e3ac35`), review fixes for 13.3/13.4 (`f990b28`), ST-13.5 (`e1fc64c`). Each story's **Status** line in 04 says what was decided and what was not done.
- **Checks at HEAD:** 284 unit, 239 mod tests pass; typecheck, lint, `claude plugin validate --strict` pass. Live spend: none. One run of the mod suite saw the perf test `stats over 50 tasks < 100 ms` at 156 ms under load; it passed on every re-run.
- **ponytail-review** ran on ST-13.3/13.4 (2026-11-09). Its must-fix (single store keys overwritten by a second session running at once) and the rest are fixed in `f990b28`. The M9 gate still needs ponytail-review and code-review over the whole M9 range at the end.

## 2. Next, in order

1. **ST-13.6 Current goal heading and the continuation order (M)**, 04 and 09 §4. DoD includes the ADR-003 amendment text in 02, the handover instruction template and the handover corpus (`jeeves/tests/fixtures/handover/`). Parser/validator: `src/core/handover/{parse,validate,template,render}.ts`; continuation: `src/core/continuation.ts` (snapshot `tests/fixtures/continuation.txt`). "Pre-upgrade task accepts a v1 block": decide how a task is known as pre-upgrade (e.g. its `origin`/schema history or a state field) and write it in the Status line.
2. **ST-13.7** (user `/clear` in auto tasks, `(auto)`/`(explicit)` in status, auto-recovery), then ST-13.8, ST-13.9, ST-15.1; E14 alongside (ST-14.1 … 14.5); then ST-15.2 (live, approved under D-46 once its preconditions hold) and ST-15.3.
3. **Still the maintainer's:** v0.2.0 public release steps; setting up the D-44 account and separate macOS user for AC-41; final sign-off.

## 3. How auto-start works now (code map)

- `src/core/autostart.ts`: precedence resolver (ST-13.2); `NOT_WATCHED` reasons in §5.1 order, `startReasons`, `autoReason`, `reasonLine` (`Auto off: <reason> (+N more)`), `largeWindow` (> 200K).
- `src/core/machine.ts`: in `MEASURE`, the model-switch end (auto task, MONITORING/CONTINUING, known window ≤ 200K), the near-threshold end (first known reading of a new auto task within `NEAR_MARGIN` 10, or 0.5 under the test threshold), the grace period (`graceTurns`, counted in `TURN_COMPLETE`, `GRACE_TURNS` 3, before the first rotation only), `LATER` with `laterCap`/`capText`.
- `src/adapter/eligible.ts`: decision at `session.start` (`decideAtStart`), `/clear` carry-over, `forget` on exit, `eligibility()` (kept facts + live auto-start setting + "this session" when a task of this session ended), the R-25 ending (`stopSkipped`), the first-run notice (`autoNotice`), the lazy start (`startAuto`, one at a time per process).
- `hooks/register.ts`: `session.start` → upgrade check, eligibility, notice; `prompt.submit` → hold, auto start, capture; `turn.complete` → R-25 ending; `classic.SessionStart(clear)` → carry-over; `session.end` (not clear) → forget.
- Status (`/jeeves status`) shows the auto line only when this session owns no task; `--diagnose` lists every reason.

## 4. Facts worth keeping

- **Versions are per file kind:** `state.json` 2 (adds `origin`; v0.2 tasks migrate to `explicit`; optional `graceTurns`, `laterCapped` added in v0.3 before release, no bump), project `config.json` 2 only while `autoStart` is set, `auto.json` 1, everything else 1. Constants in `src/core/types.ts`; `defaultsVersion` in `src/core/schema.ts`.
- **Downgrade evidence:** `tests/unit/downgrade.spec.ts` runs a byte-exact copy of the 0.2.0 reader (`jeeves/tests/fixtures/v0.2-core/`, never edit it); `docs/done/evidence/v0.3.0/ST-13.1-downgrade.md`. Only user-typed `defaults clear` and `purge` reach v0.3 files: both go into the v0.3 release notes (ST-15.3).
- **Plugin-store keys** (the store is shared by every session on the machine, so session-scoped keys carry the id): `firstActivationShown` (v0.2 only; v0.3 only reads it), `activationNoticeShown` (`/jeeves on` notice), `upgradeCheck` (`fresh` | `upgrader`, once per install), `autoNoticeShown` (first-run notice), `autoOff:<session id>` (`/jeeves off`), `eligibility:<session id>` (`{ reasons }`). The two per-session keys are carried over a `/clear` and set to null on any other session end; a crashed process leaves them (accepted shortcut, noted in code). Port: `storeGet`/`storeSet` in `src/adapter/ports.ts`.
- **Port addition:** `autoCompactTokens()` reads `$.session.usage({ breakdown: 'summary' })` (local estimate, no model call).
- **Test kit:** `memHost(on, env, store)` seeds the plugin store; `h.autoCompact` sets the auto-compaction point; `fakeGit(h)` + `h.usage = { window: 1_000_000 }` makes a session eligible; tests whose turns end must call `stop($, …)` before `turnEnd`, or R-25 reads the Stop hook as skipped. Auto tasks in tests: `/jeeves on` then set `origin: 'auto'` (and `graceTurns: 3` to skip the grace period), or a real auto start (`tests/mod/autostart.test.ts`). Default state root `/home/t/.local/state/jeeves`.
- **Messages:** the auto-task endings and the first-run notice are in the catalogue snapshot (`tests/fixtures/messages.txt`; `UPDATE_SNAPSHOTS=1` rewrites it). An auto-task ending also leaves the usual `Jeeves: off (task files kept)` transcript line.
- **Haiku 5.5 prices** (read 2026-11-08): up to 100K-token prompts input 0.10, cache read 0.01, output 0.50 US$/MTok; over 100K every price ×5.
- README: `/jeeves later` rows are in (it works for explicit tasks too); rows for `auto`, `defaults auto` and the `Auto-start` setting still wait for ST-13.9.

## 5. Open items for the maintainer (none blocks E13 or E14)

- Q-13, Q-14 decided (D-44, D-45); AC-41 go-ahead and US$40 budget approved (D-46), valid once E13 and ST-15.1 pass, the D-44 account and macOS user exist, and the dry run's redone estimate stays within US$40; otherwise stop and ask.
- A decision made in ST-13.4 to confirm or reverse: the first-run notice also shows for an upgrader who typed `/jeeves auto on` (spec §5.4 names fresh installs only).

## 6. Rules (from the maintainer, still in force)

- Work in this repo only; one local commit per finished story or fix. Push only when the maintainer asks.
- Never make the repo public, publish, post, change the maintainer's Claude settings or install plugins.
- Load the plugin-authoring skill before changing hooks (never write into its dev-mods folder; Jeeves is its own plugin here).
- Zero runtime dependencies. No live runs without the maintainer's go-ahead and budget (haiku, scratch `JEEVES_STATE_DIR`).
- If a story conflicts with an ADR, stop and ask. Report honestly what failed, was skipped or is unverified.
- Before every push: `git grep -n "$(whoami)" HEAD` must print nothing.
- Write a handover when the context reaches about 35%.
