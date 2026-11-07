# Handoff: M4 solved → start M5 (Recovery & safety)

**Date:** 2026-11-07 · **Claude Code:** 2.1.319 · **OS:** macOS, Darwin 27.2 · **Node:** 22.22 · **Repo:** `~/Desktop/Projects/jeeves` (branch `main`, local only)

This file is enough to start M5 in a clean session. Read `handoff-m3.md` §0, §1, §4, §5 (rename, working rules, code map, engine rules) and `handoff-m4.md` §4, §5 (what M4 added, M4 engine rules). This file adds what the M4 gate session changed.

## 1. Before anything

1. `git status` clean; `git log --oneline -1` shows the commit that added this file.
2. `SR_TEST_TMP=<scratchpad> jeeves/scripts/check-all.sh`: expected **220 unit, 101 mod, validate passes**, exit 0.
3. `claude --version` (2.1.319 at handoff).

## 2. Where things stand

**M0-M4 solved.** The M4 gate passed on two clean live runs in a row (`evidence/m4-e2e/RESULT.md`):

| Gate run | Rotations | Sessions | Checks | Cost |
|---|---|---|---|---|
| `gate-run5/` | 5 | 6 | 10/10, COMPLETED | US$0.088 |
| `gate-run6/` | 4 | 5 | 10/10, COMPLETED | US$0.086 |

Zero keystrokes after setup, one commit per step, `./verify.sh` exit 0, every session start% < end%.

Commits this session:

```
17d8379 D-25 relative test threshold (+d)        f54c910 D-25 start once the reading moves (run 9)
bdb8655 fresh session continues on a 1 s timer   214ca0e gate evidence: runs 5 and 6 pass
332b9e2 D-25 amended: tool reading, end guard    55b0231 review fixes (ponytail-review 1-3)
f235eb5 D-25 second tool reading (run 7)         (+ evidence commits and this handoff)
af7a534 handover Stop: regex is no path; refused lookup = missing; driver debug lines
```

Live runs: 7 this session (runs 5-11; the maintainer approved 3, then 3, then 3 more), about US$0.27 recorded; M4 in all about US$0.36. Runs 5-9 each found one live-only fault, fixed before the next run (`evidence/m4-e2e/debug-run5..9/`, each with a RESULT.md or NOTE.md).

## 3. What changed in the code

- **Relative test threshold (D-25, amended):** `JEEVES_TEST_THRESHOLD_OVERRIDE=+d` with `JEEVES_TEST=1` (`runtime.ts` → `Ctx.thresholdRelative`). `T` = session start + d. The start is the first **tool-result** reading that **differs** from the session's first one (`sessionStart.firstPct` holds the first). `MEASURE.fromTool` marks tool-result readings. At the rotation's `session.end(clear)` the source session's last reading becomes `rotation.guardPct`. In CONTINUING, once the start is known, a reading below `guardPct` rearms, otherwise POSSIBLE_LOOP. Status shows `TEST OVERRIDE +d`. Real thresholds and the absolute override are unchanged.
- **Fresh-session continuation (D-26):** `onFreshSession` schedules `continueFresh` with `FRESH_CONTINUE_MS` (1 s). `runClear` calls the same function when its promise resolves. Only the call that finds RESTORING submits (serial queue + reducer). Live, the timer is what continues.
- **Handover Stop:** `asPath` refuses tokens with a backslash (a regex is not a path). A `$.fs.exists` the engine refuses counts as missing, instead of throwing out of `handoverStop` and stranding the rotation. That second change has no automated test: the mod kit skips a throwing hook instead of rejecting.
- **PTY driver:** passes `--debug-file <scratch>/claude-debug.log` and keeps only Jeeves's own lines (`(jeeves)`, `[jeeves]`, `jeeves@`) in `<out>/jeeves-debug.log`; survives a `claude` that already exited. Run: `npm run e2e:pty -- <scratch> --override +0.8 --chars 6000 --minutes 30 --out <evidence dir>`.
- Tests: `tests/mod/relative.test.ts`; the `gate run 5` case in `tests/mod/continue.test.ts`; D-25 cases in `tests/unit/machine.spec.ts`; `generating(…, { env, readings, viaTool })` in `tests/mod/kit.ts`.

## 4. Engine rules learned (2.1.319): do not rediscover

1. **`$.command.run('clear')` from `$.clock.after(0)` at the end of a turn resolves when the command is queued** (~200 ms, before the clear runs); once it never resolved. Never treat its resolution as "the fresh session exists". Use the fresh `classic.SessionStart`.
2. **A fresh session's first model call is ~24K tokens smaller than its second** (37.5K, then ~64K with the maintainer's global plugins). Probably attachments re-added after `/clear` (unverified). Every tool result of one model response reads the same `$.session.usage()` figure.
3. **The session transcript is the best evidence:** `~/.claude/projects/<escaped cwd>/<sessionId>.jsonl` holds every assistant message with its `usage`, every Stop-hook feedback text and the `stop_hook_summary`. The exact handover text of run 8 came from there.
4. **`--debug-file <path>`** writes the engine's debug log, including every `$.ui.log(…, { to: 'debug' })` line (`jeeves: …`), `$.prompt.submit (jeeves): …`, `$.command.run (jeeves): … queued`, hook timings. Before this, `quietly()` errors were invisible.
5. `$.fs.exists` "rejects only a network location". A path-looking token from Claude can reach it, so always `.catch` it.
6. Stop hooks of the maintainer's own setup run too (`afplay …`, codex `stop-review-gate-hook.mjs`); they show in `stop_hook_summary.hookInfos`, Jeeves's mod hook does not.

## 5. Open items (carry into M5)

- **Handover first-try validity is low with haiku on `six-steps`:** 2/9 in the gate runs, and two handovers used both retries (one more bad block → NEEDS_REVIEW). All 12 rejections were placeholder or relative paths in `[verified]` bullets: `src/stepk.js`, `src/stepK.js`, `src/stepN.js`, `tests/stepk.test.js`, `tests/stepN.test.js`, `../src/step3.js`. The fixture's own task text says `src/stepK.js`. Options for the maintainer: reword the fixture; skip placeholder-shaped paths (`stepK`, `stepN`) in the validator; resolve `../` against the test file; or add a line to the instruction. Not decided. The validator is right that these files do not exist (D-20).
- **Live-unverified:** `$.prompt.fill` emptying the box (ADR-010 A1, nothing was typed during a rotation); `$.session.turns()` for `/relay continue`; the AC-10 "quote earlier messages" probe.
- **Shortcuts in code now relevant to M5:** a `/clear` that never brings its SessionStart leaves the task ROTATING (ST-6.1, and live rule 1 makes this the path to watch); `onFreshSession`/`holdPrompt` take any clearing rotation of the project (ST-6.6); VALIDATING left standing after a failed state write (ST-6.1).
- Failure counter: once `classic.StopFailure` is wired (ST-6.2), exclude rate limits during a handover from rotation failures.
- `/relay threshold` and `/relay resume` messages do not mention the relative override (status does). Test-only, cosmetic.
- Carried: A-05 (OS state-root write needs the maintainer's OK), CI never run (no remote), Q-1 not posted, AC-07/AC-09 E-layers, Q-9, ST-9.3 naming check.

## 6. Next: M5 (ST-6.1 … ST-6.7)

**Read first:** `04-backlog-stories.md` E6 and the standard DoD at its top; `05` M5 row; `06` AC-16, AC-18, AC-19, AC-23 and the crash matrix; `02` ADR-005 (storage, locks), ADR-006 (compaction), ADR-010 (user `/clear`), §7 concurrency model, §8 recovery procedures and the §4 recovery rows; `07` R-rows for crashes and concurrency.

**Gate (05):** crash matrix 6/6; AC-16, AC-18, AC-19, AC-23 pass; no git mutation (audit test). **Demo:** kill the process mid-rotation → `/relay recover` continues once.

**Live runs:** ask the maintainer for a budget before the first one. The crash matrix should run as plugin/unit tests where it can. The PTY driver with `--debug-file` is ready for the demo.
