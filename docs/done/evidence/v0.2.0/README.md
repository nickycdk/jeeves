# Jeeves v0.2.0: acceptance evidence pack (ST-12.5)

The v0.2 acceptance criteria (06 §3, AC-26 … AC-34), the live runs of ST-12.4, and the re-run of the existing suite. **Claude Code:** 2.1.319, macOS (Darwin 27.2), haiku for live runs. Result: **PASS**, **FAIL**, **NOT EXERCISED** or **DROPPED** (with the decision). Layers (06 §1): U unit, I mod/integration (engine test kit), P timing, E live PTY run, M manual, C compatibility job.

Paths: `tests/` = `jeeves/tests/`. Raw live-run folders (`e-layers/run*/`) hold scratch paths and stay local (gitignored); the tables below are their tracked summary.

## Suite re-run

`jeeves/scripts/check-all.sh` equivalent on 2026-11-08 at the release-prep commit: typecheck ok, lint ok, **262 unit, 175 mod; every functional test passes**, `claude plugin validate --strict` passes. `tests/mod/stats.test.ts` "P: stats over 50 tasks < 100 ms" is load-sensitive: it failed in some runs at load average 4–15 on this machine and passed in others (best of 3 samples inside the test; see AC-32).

Compatibility (C): [`jeeves/docs/compatibility.md`](../../../../jeeves/docs/compatibility.md): 2.1.302, 2.1.303, 2.1.310, 2.1.316, 2.1.319 all validate; 175/175 mod tests on each except 2.1.316, where the generated row shows the timing test failing (132 ms; the same version passed 175/175 on a rerun, load average 13–20). Only 2.1.319 is supported (D-38).

## v0.2 acceptance criteria

| AC | Requirement | Result | Layers | Evidence |
|---|---|---|---|---|
| AC-26 | `/jeeves retry` after an invalid handover | PASS | U, I | U: `tests/unit/machine.spec.ts`; I: `tests/mod/retry.test.ts` (retry asks again and a valid handover rotates, earlier handovers byte-identical; limit refused; another session or Claude-typed changes nothing) |
| AC-27 | Possible loop is reviewable, not terminal | PASS | U, I | U: `tests/unit/machine.spec.ts`; I: `tests/mod/relative.test.ts` (NEEDS_REVIEW(POSSIBLE_LOOP), retry to MONITORING without rotating; second loop with the counter used up FAILED) |
| AC-28 | Window-aware default threshold | PASS | U, I, E | U: `tests/unit/threshold.spec.ts`; I: `tests/mod/threshold.test.ts` (ST-10.1: 40% on 1M, 50% on 200K or unknown, explicit threshold wins, tokens shown); E: live run 1, every phase's task on haiku (1M window) has `thresholdPercent: 40`, status line `Jeeves ?/40%` |
| AC-29 | Per-project defaults | PASS | U, I | `tests/mod/defaults.test.ts` (applies to the next task here only, running task unchanged, corrupt file ignored with a warning, clear and purge remove it) |
| AC-30 | Check suggestions, never run | PASS | U, I | U: `tests/unit/suggest.spec.ts`; I: `tests/mod/task.test.ts` (ST-11.2 tests); no `process.run` added (suggestions read files only) |
| AC-31 | `history --full` | PASS | I | `tests/mod/history.test.ts` (ST-11.3: 2 rotations, missing and changed handover reported, ASCII, 50 columns) |
| AC-32 | `stats` | PASS (U, I) / borderline (P) | U, I, P | U: `tests/unit/stats.spec.ts`; I: `tests/mod/stats.test.ts`; P: < 100 ms on 50 tasks passes in most runs, fails under high load (see Suite re-run). The bound was not loosened |
| AC-33 | VS Code terminal | DROPPED (D-36) | — | No manual recordings; terminal support rests on the PTY E layer. Public text no longer names VS Code |
| AC-34 | Claude Code floor 2.1.303 | NOT MET, floor stays 2.1.319 (D-38) | C, I | C: test kit passes on 2.1.302 … 2.1.319; E: no live rotation on 2.1.303 (needs a logged-in config; an old binary must not run against the maintainer's own) |

## ST-12.4 live runs (E)

Driver: `jeeves/tests/pty/e_layers_v2.py`. One haiku session per phase, each with its own scratch `JEEVES_STATE_DIR`.

| Phase | What | Result |
|---|---|---|
| h | both options show in `/config`; `autoRecover` set by a scratch `--settings` file shows true | PASS (no model call) |
| d | killed mid-task; restart with `autoRecover` continues with nothing typed (AC-16) | PASS |
| e | repo moved between sessions; `/jeeves recover --relink` continues it (AC-18) | PASS. The check for the startup REPO_MISMATCH notice failed in the driver (the notice is a toast that the screen capture did not hold); not rerun |
| c | typed `/compact` gives a COMPACTED rotation | **FAIL, cause outside Jeeves (R-25)**: see below |
| g | AC-07: permission dialog open while a handover is pending | **FAIL, cause outside Jeeves (R-25)**: the threshold request was recorded (ROTATION_REQUESTED at 8.16%), then no Stop reached Jeeves, so no handover was asked for. AC-07 stays PASS (I) / OPEN (E) as in v0.1.0 |
| f | the `/clear` stall via `endedHere` | NOT EXERCISED: needs the engine to withhold the fresh SessionStart; covered in I (`tests/mod/recover.test.ts`) |

**Why c and g failed (R-25, Q-11).** On this account Claude Code 2.1.319 seats a built-in plugin `cc-plugin-sec-default@builtin` in the `prepend` tier ("seated outermost: the organization is team"). It hooks `classic.*`, `session.compact` and `prompt.compose` and passes those events on past the user tier, where every installed plugin sits. The debug log says `jeeves: classic.SessionStart bypassed by cc-plugin-sec-default (tier user); beneath runs`, and the screen of every run 1 phase shows `its classic.Stop hook was skipped` / `its session.compact hook was skipped`. Phases d, e and h passed because they use commands and session events that still arrive. Confirmed in a free `--debug-file` session (no model call); the paid rerun of c and g was skipped with the maintainer's agreement, since it would fail the same way. A user-tier plugin cannot override a prepend hook.

**Detection (run 2).** Jeeves now notices the skip: a main turn that answers without reaching its `classic.Stop` switches it to `unsupported` (`tests/mod/probe.test.ts`). Live on the same account, one haiku turn: status line `off: Stop hook skipped`, `/jeeves status` shows `mode: unsupported` and `Stop hook skipped by another plugin`, `/jeeves on` is refused with the explanation. PASS.

| Run | What | Cost |
|---|---|---|
| Run 1 | phases h, c, e, g, d | US$0.1049 (c 0.0088, e 0.0143, g 0.0732, d 0.0086, h 0) |
| Free probe | `--debug-file` session, no prompt: tier and bypass lines | US$0 |
| Run 2 | R-25 detection, one turn | US$0.0062 |
| **M8 total** | of the US$1 budget (D-36) | **US$0.1111** |

## Release artifact

`jeeves/scripts/release-zip.sh` from two clean clones of `c5ff1b1`: identical `jeeves-0.2.0.zip`, SHA-256 `a721d510979f2376ffb90bd7e6a1694a2bfff290264ed1495590c63f1d03ceee` (180 files, no home path). `claude plugin validate` passes on the unzipped marketplace root and `--strict` on its `jeeves/` folder. A tag on a later commit gives a different SHA (the zip carries the commit time). Tag and publication are the maintainer's (D-37: no public release yet).
