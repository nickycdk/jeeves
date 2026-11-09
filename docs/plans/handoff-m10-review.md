# Handover: M10 code-review and ponytail-audit done, fixes in, v0.3.1 zip rebuilt, ready for a Team-plan hand test

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Branch:** `main`, local only after `37f9cc3` (not pushed). Previous handover: `docs/done/handoffs/handoff-m10.md`. Its §3 facts and §5 rules still hold, and so do §3, §4 and §6 of `docs/done/handoffs/handoff-m9-after-gate-review-fixes.md`.

## 1. What happened this session

- **Code-review (high) of `b4b1648..46fcea2`**, run as an independent agent. Findings:
  - **1 (confirmed), fixed in `fd7648c`:** an auto task ended by a refused submit dropped the user's held prompts. They are now shown with `MSG.heldNotSent`.
  - **4 (confirmed, test driver only), fixed in `4a6ee2b`:** the void check read `./verify.sh 2>&1` as reading module 2.
  - **2 (plausible, needs a live check), open:** if the engine merges a foreign queued prompt and Jeeves's handover request into one turn, and `turn.start` names the foreign text, the handover is skipped as foreign. Nothing retries it, and typed prompts stay held until `/jeeves pause|off`. The proposed fix is to skip a foreign turn only when its answer has no `<<<JEEVES-HANDOVER v1` line. That bends the ADR-003 A2 note, so it is the maintainer's call.
  - **3 (plausible, low), open:** `/loop 5m /cmd`. `prompt.submit` sees `/cmd`, while `turn.start` likely sees the expanded text, so the opener is unknown and the turn counts. This is the behaviour from before the fix, so nothing regresses.
- **Ponytail-audit of `jeeves/`**, run as an independent agent. Nothing was in Must fix.
  - **Fixed:**
    - **2** (`e5ab683`): `/jeeves off` no longer ends a COMPLETED or FAILED task.
    - **3** (`018f5c0`): the heartbeat takes a free lock back for its own task (after `claude --resume`). It uses `acquireLock` only, never a takeover, because ADR-005 allows a stale lock to be taken only through recover.
    - **4** (`d1a75be`): a refused `/jeeves recover` names both tasks and the steps.
    - **5** (`f935fe1`): verification commands are compared in the ledger's form, through a shared `ledgerCommand()` in `src/core/evidence.ts`.
    - **7 and 8** (`5bf4530`): `followUps` deleted, so `transition` is one pass; `sameRepo` and `dirname` deleted.
  - **Not changed:**
    - **1:** a PAUSED(USER_CLEAR) task anywhere in the project keeps auto-start off there, across sessions. The status shows `Auto off: this session`, and no hint appears. This is the recorded "review fix 3" decision (m9 handover §5), so it waits for the maintainer. The audit's fix: set `sessionOffKey(old session)` in `onUserClear` and drop the project-wide check at `src/adapter/eligible.ts:85`.
    - **6:** turn mode, a `/clear` promise that never resolves. Seen live only in Stop mode, so low confidence.
- **Run-2 stall (static look, no live run):** Claude ends a continuation turn by announcing its next step. This is not specific to turn mode. In Stop mode `onStop` also returns null for a MONITORING task with no completion block, so Claude stops there too. An unattended task then waits for a person. Changing this, for example with one bounded "carry on" prompt for auto tasks, is a design change with ADR-007 impact, so it is the maintainer's call.
- **Docs:** CHANGELOG 0.3.1 and `jeeves/docs/release-notes/v0.3.1.md` list the fixes (`680a316`). The compatibility matrix was regenerated (`a0e2232`): 323 tests; the one failure on older versions is the known perf flake.
- **v0.3.1 zip rebuilt** (`1dfc8a1`): identical from two clean clones of `a0e2232`, SHA-256 `6684647a10be6203a51c296d21a1aef53ff62b348250c443b53a4e2474603b71`, 249 files, no home path, and both validates pass on the unzipped copy. It replaces `46fcea2`/`c1fa9565…`, which was never signed off.
- **Checks at `a0e2232`:**
  - Unit: 304 pass.
  - Mod: 323 tests in each of three runs. On and turn pass fully; stop passes except `tests/perf/stats.test.ts`, which is flaky under load.
  - Typecheck, lint, `void_check_test.py` and both validates pass.
  - Nothing was run live.

## 2. Next, in order

1. **Maintainer:**
   - Sign off the v0.3.1 zip (`a0e2232`, `6684647a…3b71`), then tag and publish (theirs).
   - Hand test on the Team plan: install from a clone with `/plugin install jeeves --marketplace /path/to/clone`. The GitHub repo is private, so `nickycdk/jeeves` works only for people with access.
   - Decide: audit 1 (keep or narrow the project-wide auto-off), code-review 2 (accept a foreign turn that carries a handover block), and the run-2 stall (add a bounded carry-on prompt or not).
   - The m9 §5 decision list is still open, and so is v0.2.0 public (D-37).
2. **Agent, if asked:** implement whichever of those decisions is taken (each one fix with a test; a `jeeves/` change means a new zip and SHA). Live checks for code-review 2 and 3 need a go-ahead and a budget.

## 3. Facts worth keeping

- **Mod tests run the whole suite only:** `claude plugin test .` has no file filter, about 15 s. `npm run test:mod:on` and `npm run test:mod:turn` run copies.
- **`tests/fixtures/messages.txt`** does not hold the recover messages, so a new `MSG` entry there needs no snapshot update.
- **`scripts/check-all.sh`** stops at the first failing step, so the perf flake under load stops it. To see the rest, run the steps one by one.
- **Compatibility run:** `node scripts/compat.mjs <scratch> 2.1.302 2.1.303 2.1.310 2.1.316 2.1.319`. It installs from npm into the scratch folder (several minutes). Don't edit `jeeves/` while it runs, because it copies the plugin for each version.

## 4. Rules

Unchanged; see the previous handover §5. Before every push, `git grep -n "$(whoami)" HEAD` must print nothing.
