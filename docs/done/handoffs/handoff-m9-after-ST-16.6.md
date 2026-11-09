# Handover: M9 (v0.3), E16 turn mode: ST-16.3 … ST-16.6 done

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Branch:** `main`. `origin/main` is at `37f9cc3`; everything after it is local only (not pushed). Paths are relative to the repo root. Previous handovers: `docs/done/handoffs/handoff-m9-after-ST-16.2.md` (ST-16.1, the probe session, ST-16.2; its §3 probe method still holds) and `docs/done/handoffs/handoff-m9-after-gate-review-fixes.md` (its §3 code map, §4 facts and §6 rules still hold).

## 1. What happened this session

One commit per story; each story's **Status** line in `docs/plans/04-backlog-stories.md` says what was decided, tested and left open. 09 regenerated after each.

- **ST-16.3** (`37fe82b`): `turnBoundary` (`jeeves/src/adapter/task.ts`) submits what a Stop would block with (request, retry) through `submitPromptSoon`; the next answered `turn.complete` goes through `onStop` → `handoverStop` with `answer` and `crons: null`; `renderHandover` writes `- Scheduled session crons: not available in turn mode`.
- **ST-16.4** (`0aee497`): `runClear` → `freshInTurnMode` in turn mode: new id from `$.session.id()` (same id → `CLEAR_FAILED`), `carryOver`, crash point `before-inject`, `SESSION_START_CLEAR`, then `continueFresh(…, withContext = true)` (the continuation carries `contextFor`'s text).
- **ST-16.5** (`21954d5`): `jeeves/src/core/compaction.ts` (`COMPACTION_DROP` = 10,000 tokens within one session id); `measure()` applies `COMPACTED` (trigger `recognised`) in turn mode only.
- **ST-16.6** (`244ac7a`): `completionRow` (hidden row at the first main `turn.start` of each conversation the task runs in, every 10 turns, at once after a recognised compaction); `turnBoundary` is now plain `onStop` on every answered main `turn.complete` in turn mode, so a JEEVES-COMPLETE block in `answer` is judged.
- **Kit:** `turnGenerating($, on, { env?, ask? })` and `wholeTurn($, answer?, reason?)` in `jeeves/tests/mod/kit.ts`: a turn-mode process with a task; a plugin `/clear` gives `session.end(clear)` + the next id from `ctl.ids` and no SessionStart (as live); `rows` records appended rows; `request()` runs the boundary turn. New test files: `turn-handover`, `turn-rotate` (incl. the 6-point crash matrix in turn mode), `turn-compact`, `turn-complete`.
- **Checks at `244ac7a`:** 301 unit; 309 mod in both suite modes (`npm run test:mod`, `npm run test:mod:on`); typecheck, lint, `validate --strict` pass. `tests/perf/stats.test.ts` failed on nearly every run (load average 34, known, CI does not run it). One intermittent `crash.test.ts` "a rejection nothing handled: The operation was aborted" (a Stop-mode file) in 1 of 8 full runs, not reproduced since. Live spend: none.

## 2. Next, in order

1. **ST-16.7** (M, no live run): load the plugin-authoring skill first. Like ST-13.9's mode file: add `BOUNDARY: 'stop' | 'turn' = 'stop'` (in `jeeves/tests/mod/mode.ts` or beside it), a `test:mod:turn` script copied from `jeeves/scripts/test-mod-on.sh` that seds it to `turn`, and in turn mode make the kit drop `classic.Stop`, `classic.SessionStart`, `session.compact` and `prompt.compose` (as the prepend plugin does). The shared helpers decide how far tests carry over: `stop($, msg)` should then hand `msg` to the turn's `turnEnd` as its `answer`; `engineClear` should send only `session.end` + the id change; `generating` should reach HANDOVER_GENERATING through the turn boundary. Tests that assert Stop-only facts (crons, `additionalContext`, `session.compact`'s precompute skip, `prompt.compose`) are skipped in turn mode with a written reason. Then CI (`.github/workflows`) and `scripts/check-all.sh`: stop × off, stop × on, turn × off. Texts: README, PRIVACY, `/jeeves help`, `jeeves/docs/compatibility.md`, `jeeves/docs/troubleshooting.md` ("not yet handing over until E16 ends" must go), CHANGELOG. Expect this to need its own session.
2. **ST-16.8**: estimate first, ask for go-ahead and budget (the estimate given to the maintainer at the end of this session is in §3). Probe items still open for it: a row appended at `turn.start` reaching that turn's first model call (ST-16.6); several text blocks in one final message (ST-16.3); what the fresh conversation does after a **user** `/clear` in turn mode, where no SessionStart carries the auto-start decision over (ST-16.4 Status, **Open**).
3. ST-15.2 under D-49 (its own go-ahead), then ST-15.3.

## 3. Facts worth keeping

- **ST-16.8 estimate given (2026-11-09), not yet approved:** three runs on haiku (two rotations `six-steps`; AC-07 with a permission dialog; a typed `/compact` → one rotation) plus the open probe items in the same sessions: about US$0.50–1.50 API-equivalent in total, most likely about US$1; suggested budget US$3 with a US$1 cap per run.
- In turn mode every answered main `turn.complete` runs `onStop` (one task read per turn); `turnBoundary` is that plus the submit.
- `completionRow` and the compaction tracker (`lastReading` in `task.ts`) and the background record (`runtime.ts`) are per process: a reload starts them over.
- `rotate.test.ts`'s D-23 test sends the turn's Stop first: any test that ends a main turn without `classic.Stop` puts the process in turn mode (previous handover §3).

## 4. Rules (unchanged)

This repo only; one local commit per finished story or fix; push only when asked; never make the repo public, publish, post, change Claude settings or install plugins; zero runtime dependencies; no live runs without go-ahead and budget; ADR conflict → stop and ask; report honestly; before every push `git grep -n "$(whoami)" HEAD` prints nothing; load the plugin-authoring skill before touching hooks or the test kit; handover at about 35% context.
