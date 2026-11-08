# M8 (v0.2) progress handover: mid-milestone

**Date:** 2026-11-08 · **Claude Code:** 2.1.319 · **Repo:** this folder, branch `main`, remote `origin` = github.com/nickycdk/jeeves (private). Paths below are relative to the repo root.

This file hands M8 to a fresh session. The final `handoff-m8.md` is still to be written (see §4).

## 1. Done (committed on `main`)

| Story | Commit | Note |
|---|---|---|
| ST-10.1 window default (40% above 200K) | `2455f8a` | status shows `Threshold: 40% (~400K)`; test kit default window is now 200K |
| ST-10.2 + ST-10.3 `/jeeves retry`, POSSIBLE_LOOP reviewable | `9866ab6` | failure count now resets at rearm (and on pause in CONTINUING, review fix 1) |
| ST-11.1 `/jeeves defaults` | `cdbf69a` | `projects/<id>/config.json`; `defaults clear` writes an empty file |
| ST-11.2 check suggestions | `ce10a23` | package.json scripts + Makefile; never added or run |
| ST-11.3 `/jeeves history --full` | `729c6e9` | each handover's ref now goes into its VALIDATING > ROTATING event |
| ST-11.4 `/jeeves stats` | `bc4b59a` | |
| ST-12.3 Q-9 | `1c07042` | answered in 07; kit's Stop stand-in can block (`h.stopBlock`) |
| ponytail-review fixes 1–3 | `65a90d3`, `c3bee7e`, `1559005` | pause reset; history pairs handovers with sessions by time, stats skips recovers; one retry-limit check |
| parallel task reads | `6c49f3a` | for ST-11.4 AC 4 |
| ST-12.1 closed, floor stays 2.1.319 | (this commit) | D-38 |
| ST-12.2 dropped | earlier | D-36 |

Checks at `6c49f3a`: 261/261 unit, 171 mod with **one borderline**: `tests/mod/stats.test.ts` "P: stats over 50 tasks < 100 ms" passes about 2 of 3 runs (best of 3, in-kit memfs; ~100–130 ms when it fails, even at load average 4). Not solved: profile it (per task: listFiles sessions, session reads, readEvents does 2 `exists` + 1 read) or record AC 4 as borderline. Do not loosen the bound without saying so.

## 2. Live run 1 for ST-12.4 (US$0.105 of the US$1 budget, D-36)

Driver: `jeeves/tests/pty/e_layers_v2.py` (new, committed here). Raw evidence (gitignored, contains scratch paths): `docs/done/evidence/v0.2.0/e-layers/run1/` (`RESULT.md`, `result.json`, per phase `s1/`, `s2/` with `plain.txt`, `driver.log`, task copies; `h/` free phase; `compat-matrix.log`).

| Phase | Result |
|---|---|
| h: both options in `/config`; autoRecover set via a scratch `--settings` file (`pluginConfigs."jeeves@inline".options`) shows true | PASS (free) |
| d: killed mid-task, restart with autoRecover → continued with nothing typed | PASS |
| e: repo moved → `/jeeves recover --relink` continued it | PASS; the check for the startup REPO_MISMATCH notice FAILED: probably the driver (the notice may be a toast not in the captured screen); look at `e/s2/plain.txt` |
| c: typed `/compact` → COMPACTED rotation | **FAIL**: the screen shows "Compacted", but no event at all reached Jeeves (only `DISABLED>MONITORING`, rev 1) |
| g: AC-07 permission dialog | **FAIL**: threshold request at 8.16% (ROTATION_REQUESTED), the quiesce note made Claude stop ("…still not done"), then **no handover request for 6 minutes**: no STOP reached the reducer. No dialog appeared (Claude stopped before the Bash call) |
| f: `/clear` stall via endedHere | NOT EXERCISED (needs the engine to withhold the fresh SessionStart) |

**Hypothesis for c and g:** Jeeves's `session.compact` / `classic.Stop` hooks did not run because something above them answered: installed plugins with hooks on these events: openai-codex 1.0.6 (Stop "stop-review-gate-hook"), pstack 0.9.82, superpowers 7.0.0, stripe 0.11.17. The v0.1 live runs (M4–M7) passed the same Stop path, so a changed environment fits; unproven: phases c and g ran **without** `--debug-file`.

## 3. Next, in order

1. **Diagnose c and g:** add `--debug-file <scratch>/claude-debug.log` to phases c and g in `e_layers_v2.py` (like `e_layers.py` phase b), rerun `--only c,g` (~US$0.10). In the debug log look for `jeeves: classic.Stop bypassed by <plugin>` / `session.compact` lines and Jeeves's own `(jeeves)` lines. Then:
   - if another plugin bypasses Jeeves: record it (07 risk + troubleshooting "other plugins' Stop hooks"); consider rerunning with `--strict-plugin-config`-style isolation only if Claude Code offers a flag to load just `--plugin-dir` plugins (check `claude --help`), never by changing the maintainer's settings;
   - if Jeeves's hook ran and failed: fix it, test first (I layer), then rerun.
   For g, also make the task's step after the threshold unavoidable, since Claude obeys the quiesce note and stops, so the dialog never opens (AC-07 needs the dialog *open while a request is pending*).
2. **Fix the command description** shown in the `/jeeves` autocomplete: it still lists `on [goal] | off | pause | … | status [--dia…` without `retry`, `defaults`, `stats`, `history --full` (grep `threshold <n> | task` in `jeeves/src`).
3. Regenerate `jeeves/docs/compatibility.md`: `npm run compat -- <scratch>/compat 2.1.302 2.1.303 2.1.310 2.1.316 2.1.319` from `jeeves/` (run 1 had a timing flake on 2.1.316).
4. **ST-12.5 release prep:** version 0.2.0 in `jeeves/.claude-plugin/plugin.json`, `jeeves/package.json`, `jeeves/package-lock.json`; CHANGELOG `0.2.0` heading; `jeeves/docs/release-notes/v0.2.0.md`; `docs/done/evidence/v0.2.0/README.md` (AC-26 … AC-34, tracked summaries of the E runs without home paths); `release-zip.sh` twice → identical SHA; `claude plugin validate` on the unzipped artifact. Tag/publication stay the maintainer's (D-37: no public release).
5. `/code-review` on the M8 range `b493501..HEAD` (the ponytail-review is done: 3 findings, all fixed).
6. Write `docs/done/handoffs/handoff-m8.md`; mark ST-12.4/12.5 and M8 status in 04, 05, 00, 06, 03 only for what passed.

## 4. Rules (from the maintainer, still in force)

Work in this repo only; one local commit per finished story or fix. Push to `origin` (private) only when the maintainer asks; never make it public, never publish, post, change the maintainer's Claude settings or install plugins. Load the plugin-authoring skill before changing hooks. Zero runtime dependencies. Live runs: scratch `JEEVES_STATE_DIR`, haiku, within the US$1 budget (US$0.895 left). If a story conflicts with an ADR, stop and ask. Report honestly what failed, was skipped or is unverified. No home path in tracked files (`.gitignore` lists the old ones; raw run folders are ignored).
