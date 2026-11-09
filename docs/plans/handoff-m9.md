# Handover: M9 (v0.3): ST-16.8 done, ST-15.2 partial (waits for a decision)

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Branch:** `main`. `origin/main` is at `37f9cc3`; everything after it is local only (not pushed). Paths are relative to the repo root. Previous handovers: `docs/done/handoffs/handoff-m9-after-ST-16.7.md` (its §3 test-kit facts still hold), `docs/done/handoffs/handoff-m9-after-ST-16.2.md` (probe method) and `docs/done/handoffs/handoff-m9-after-gate-review-fixes.md` (its §3 code map, §4 facts and §6 rules still hold).

## 1. What happened this session

- **ST-16.8** (`ed9cf77`, fix `27d6bc6`; Status line in 04; evidence `docs/done/evidence/v0.3.0/turn-mode/RESULT.md`), about US$0.34 API-equivalent. Two rotations, AC-07, a typed `/compact` (turn-mode form: fill, `/compact`, type one prompt) and auto-start after a user `/clear` all PASS live. Q-12 answered. **Defect:** the completion row appended at `turn.start` reached no request of its turn; it now goes in at the turn's first main tool result (`rowDue`/`sendRow` in `jeeves/hooks/register.ts`), else at the turn-end reading. **Open:** (a) the engine drops rows appended mid-turn before the turn's last request (rules and threshold note both gone there), so a completion claim may be written without the rules; another channel would amend ADR-007 A1; (b) the first turn of a `claude` process gets no row (turn mode known only at its end).
- **ST-15.2** (`9fd3165`, partial; Status line in 04; evidence `docs/done/evidence/v0.3.0/AC-41/RESULT.md`), US$6.97 of US$40. Dry run PASS; 200K PASS with all four D-45 parts met; 1M without Jeeves: one auto-compaction at about 962K, outcome passes; **1M with Jeeves did not measure rotation**: with nothing typed the task is one turn, and the auto grace period (`GRACE_TURNS` = 3 main turns, `jeeves/src/core/machine.ts:111`, threshold skipped while in grace, line 281) lasted the whole task, so the context reached 972K, the engine compacted, and Jeeves rotated once afterwards as COMPACTED.
- New tools: `jeeves/tests/pty/transcripts.py` (API-equivalent cost from transcript usage; which requests carried the rules row, from the recorded `api-request`/`api-request-blob` entries), `jeeves/tests/pty/ac41.py`, `--config-dir` on `driver.py` and `e_layers_v2.py`, phases `k` (turn-mode compaction) and `u` (user `/clear` carry-over) in `e_layers_v2.py`, fixture `long-task`.
- Checks at `9fd3165`: 302 unit; 310 mod in each of the three runs; typecheck, lint, both validates pass (check-all at `27d6bc6`; `9fd3165` adds only tests, fixture, driver, docs; unit, typecheck, lint re-run).

## 2. Next, in order

1. **Maintainer decisions** (ask; do not decide alone):
   - **Grace period** (auto-start spec): should it also end at a context amount (or at the threshold), so a one-turn task can still be handed over? Applies in Stop mode too. If changed: re-run only the 1M auto run (`python3 -I jeeves/tests/pty/ac41.py auto <scratch> --config-dir ~/jeeves-fresh --modules 64 --cap 14`, likely US$3–7), then write Q8 into 07 (D-45 met on 200K) and README cost wording if any.
   - **ADR-007 A1 channel:** rows appended mid-turn are dropped before the turn's last call; options: also put the rules in the continuation prompt itself, accept the limit, or other. Also a one-turn auto task in a new process never gets the rules in that turn.
2. ST-15.3 (release prep) after ST-15.2.

## 3. Facts worth keeping

- **`session.measure` arrives only at a turn's end on 2.1.319** (8 in 40 model calls, each right after `turn.complete`). Mid-turn readings come from `port.usage()` at tool results (`recordTool`).
- A row appended with `$.session.append` at a tool result reaches the next request; at `turn.start` it reaches no request of that turn; late in a turn appended rows vanish from the request.
- `--plugin-dir` hot-reloads Jeeves when files under `jeeves/` change: **never edit `jeeves/` while a live run with `--plugin-dir` is going** (it voided one run).
- Haiku does a whole nothing-typed task in one turn (64 modules, about 1.2M tokens of work, 91 calls before and after compaction).
- `/cost` and Jeeves's session records show dollars on this Team (subscription) account; transcripts agree within cents.
- The fresh-install config folder is `~/jeeves-fresh` (logged in, Team). `ac41.py dry|auto` moves its Jeeves store `plugins/store/jeeves_*.json` into the scratch folder (the pre-session original was copied to the scratchpad; not restored, it held only test keys).
- `ac41.py`'s own `./verify.sh` once hung 17 minutes beside Claude's (same `.verify.log`); now bounded at 300 s.

## 4. Rules (unchanged)

This repo only; one local commit per finished story or fix; push only when asked; never make the repo public, publish, post, change Claude settings or install plugins; zero runtime dependencies; no live runs without go-ahead and budget; ADR conflict → stop and ask; report honestly; before every push `git grep -n "$(whoami)" HEAD` prints nothing; load the plugin-authoring skill before touching hooks or the test kit; handover at about 35% context.
