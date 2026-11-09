# Handover: M9 (v0.3 auto-start), after ST-13.2

**Date:** 2026-11-08 · **Claude Code:** 2.1.319 · **Branch:** `main`, **12 commits ahead of `origin`, not pushed** (`f683378` … this handover). Paths are relative to the repo root. The previous handover (v0.2.0 release steps, the spec's road to approval) is `docs/done/handoffs/handoff-v0.2-release-v0.3-spec.md`.

## 1. Where things stand

- **The auto-start spec is approved** (`docs/specs/auto-start.md`, revision 4 plus editorial fixes from plan reviews 2 and 3; D-40). Design frozen: new ideas go to its §13.
- **The v0.3 plan is written** into the numbered plans (02 ADR-009 A3, 03 E13–E15, 04 ST-13.1 … ST-15.3, 05 M9, 06 AC-35 … AC-47, 07 D-40 … D-43, R-26, R-27, Q-13, Q-14) and gathered in `docs/plans/09-v0.3-auto-start-plan.md`. **09 is generated:** after changing 02–07, run `python3 -I docs/plans/tools/gen-09.py` from the repo root. Its own sections (header, §1, §5, §8, §10) live in that script; never edit 09 by hand. The numbered plans win when they differ.
- **Built:** ST-13.1 (`a818e6a`) and ST-13.2 (`3304ed1`); each story's **Status** line in 04 says what was decided and what was not done.
- **Checks at HEAD:** 275 unit, 188 mod tests pass; typecheck, lint, `claude plugin validate --strict` pass. Live spend this session: none.
- **Also this session:** the AC-41 cost estimate (spec §11.1: US$9–35, most likely ~US$29, budget US$40 with per-run caps), checked against M4 gate run 5's real call count (~1.3K tokens per call); the README now states the dependency on plugins running `/clear` (Q-1, `e524a01`).

## 2. Next, in order

1. **ST-13.3 Eligibility at session start, reasons and model switch (M)**, 04 and 09 §4. Notes for it:
   - Decide once at `session.start`: `isInteractive`, probe mode `full`, git work tree (`rt.identity.kind === 'git'`), `$.session.usage().window` > 200K, `$.session.turns()` 0, and `autoStartNow(rt, opts.autoStart)` from `src/adapter/auto.ts`. Keep the result and every failed reason in process memory or the store (no task file). A reload reruns `session.start` with turns > 0, so store the decision keyed by session id (as `autoOffSession` does) rather than recomputing it.
   - Reason order and `(+N more)`: spec §5.1. The `/jeeves status` line that names the reason (and the auto-start source, left over from ST-13.2) lands here; the status view has an 8-line limit (`statusText` in `src/adapter/ui.ts`, `tests/unit/ui.spec.ts`).
   - Messages: R-25 re-check `Jeeves: not watching any more (this account isn't supported); /jeeves status for details`; model switch `Jeeves: not watching any more (this model's window is 200K); /jeeves on to watch anyway`. They end only **auto** tasks; no auto task exists until ST-13.4, so test them with a state whose `origin` is `auto`.
2. ST-13.4 (lazy start, first-run notice `autoNoticeShown`, near-threshold, grace), then ST-13.5 … ST-13.9, E14, ST-15.1. ST-15.2 (live) is approved (D-46) once the account (D-44) is set up.
3. **Still the maintainer's (from the v0.2 handover):** the v0.2.0 public release steps (install test from a tag, make the repo public, tag, publish the draft; optionally purge old commit ids, decide on `jeeves-release-test`). Team accounts (R-25, Q-11) unchanged.

## 3. Open items for the maintainer (none blocks E13 or E14)

- **Q-13 and Q-14 are decided** (delegated to the agent, D-44, D-45): the maintainer logs in a non-Team, dollar-billed account (Console API key preferred) on a separate macOS user, the agent builds and runs AC-41, target 2026-11-20 after E13 and ST-15.1; 200K auto-start widens only if the outcome passes, median growth between rotations is ≥ 40K tokens (none under 20K), no loop or review stops (at most one handover retry) and no work is repeated.
- **AC-41 go-ahead and US$40 budget approved (D-46)**, with the per-run caps in ST-15.2, valid once E13 and ST-15.1 pass, the D-44 account and macOS user are set up, and the dry run's redone estimate stays within US$40; otherwise stop and ask. Any other live run still needs its own go-ahead.
- Still the maintainer's: setting up that account and the separate macOS user.

## 4. Facts worth keeping

- **Versions are per file kind:** `state.json` 2 (adds `origin`, v0.2 tasks migrate to `explicit`), project `config.json` 2 only while `autoStart` is set (else written as 1, so v0.2 keeps the threshold and checks), `auto.json` 1, everything else 1. Constants in `src/core/types.ts`; `defaultsVersion` in `src/core/schema.ts`.
- **Downgrade evidence:** `tests/unit/downgrade.spec.ts` runs a byte-exact copy of the 0.2.0 reader (`jeeves/tests/fixtures/v0.2-core/`, never edit it); `docs/done/evidence/v0.3.0/ST-13.1-downgrade.md` lists every v0.2 write into the state folder. Only user-typed `defaults clear` and `purge` reach v0.3 files: both go into the v0.3 release notes (ST-15.3).
- **Plugin-store keys:** `firstActivationShown` (v0.2 only; v0.3 only reads it), `activationNoticeShown` (v0.3's `/jeeves on` notice), `upgradeCheck` (`fresh` | `upgrader`, written once per install), `autoOff:<session id>` (`/jeeves off`), `eligibility:<session id>` (`{ reasons }`, ST-13.3), `autoNoticeShown` (ST-13.4). Per-session keys because the store is shared by every session on the machine; both are carried over a `/clear` and cleared on exit. Port: `storeGet`/`storeSet` in `src/adapter/ports.ts`.
- **Test kit:** `memHost(on, env, store)` seeds the plugin store; `test(name, { options: { autoStart: 'on' } }, body)` sets the `/config` row; tests that submit prompts need `bottom(on)`. The kit's default state root is `/home/t/.local/state/jeeves`.
- **Haiku 5.5 prices** (read 2026-11-08): up to 100K-token prompts input 0.10, cache read 0.01, output 0.50 US$/MTok; over 100K every price ×5, cached tokens included in the prompt size.
- README rows for `auto`, `defaults auto` and the `Auto-start` setting wait for ST-13.9, so the README never describes auto-start before it starts anything.

## 5. Rules (from the maintainer, still in force)

- Work in this repo only; one local commit per finished story or fix. Push only when the maintainer asks.
- Never make the repo public, publish, post, change the maintainer's Claude settings or install plugins.
- Load the plugin-authoring skill before changing hooks (never write into its dev-mods folder; Jeeves is its own plugin here).
- Zero runtime dependencies. No live runs without the maintainer's go-ahead and budget (haiku, scratch `JEEVES_STATE_DIR`).
- If a story conflicts with an ADR, stop and ask. Report honestly what failed, was skipped or is unverified.
- Before every push: `git grep -n "$(whoami)" HEAD` must print nothing.
