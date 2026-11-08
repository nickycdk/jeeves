# M8 (v0.2) handover: solved

**Date:** 2026-11-08 · **Claude Code:** 2.1.319 · **Branch:** `main` (local commits, not pushed) · **Range:** `b493501..HEAD`. Paths are relative to the repo root. Earlier state: `handoff-m8-progress.md`.

## 1. Gate status

M8 is solved: the maintainer signed off ST-12.5 (its DoD) on 2026-11-08. Tag and publication stay the maintainer's (D-37: no public release).

| Story | Result |
|---|---|
| ST-10.1 … ST-10.3, ST-11.1 … ST-11.4 | Solved (see `handoff-m8-progress.md` §1) |
| ST-12.1 | Closed, floor stays 2.1.319 (D-38) |
| ST-12.2 | Dropped (D-36) |
| ST-12.3 | Solved (Q-9) |
| ST-12.4 | Solved, AC met: d, e, h PASS; **c and g FAIL, external cause (R-25)**; f not exercised |
| ST-12.5 | Solved, signed off |

Acceptance table with evidence: `docs/done/evidence/v0.2.0/README.md`.

## 2. The main finding: Team accounts skip Jeeves's hooks (R-25, Q-11, D-39)

Live phases c (`/compact`) and g (AC-07) failed because Claude Code 2.1.319 seats a built-in plugin, `cc-plugin-sec-default@builtin`, in the **prepend** tier when "the organization is team". It hooks `classic.*`, `session.compact` and `prompt.compose` and passes each event on past the user tier. So Jeeves's `classic.Stop` (ADR-004 boundary, ADR-003 handover read), `classic.SessionStart` (handover delivery), `session.compact` and `prompt.compose` never run, and no rotation is possible on such an account. A user-tier plugin cannot override a prepend hook. The cause was found in run 1's own screen captures and confirmed with a free `--debug-file` session. The paid rerun of c and g was skipped, since it would fail the same way (maintainer's choice).

The maintainer chose **document + detect** for v0.2.0:
- Detection (`a07c0b1`, hardened in `d17baaf`): a main turn that ends with an answer, not interrupted, without reaching Jeeves's `classic.Stop` switches the probe to `unsupported`. Then the status line shows `off: Stop hook skipped` and a toast explains it once. `/jeeves status` shows it, and `on`, `rotate`, `retry` and `resume` are refused. Measuring and prompt holding stop, so a task started before the detection cannot hang in ROTATION_REQUESTED. Verified live on this account (run 2, US$0.0062) before the review hardening. After it, only the I layer was run.
- Documented in both READMEs, the release notes, the CHANGELOG and `jeeves/docs/troubleshooting.md`.
- Still open in Q-11: (b) redesign onto events that still arrive (`turn.complete` cannot block a stop, so ADR-003/004 would change), (c) ask upstream whether skipping user plugins there is intended. Any live E run for Stop-based paths (AC-07 E, compaction) needs an account outside a Team organization.

## 3. What changed this session

| Commit | What |
|---|---|
| `1c40081` | `/jeeves` menu hint lists every command; a unit test keeps it in step with help |
| `c559253` | ST-12.4 diagnosis recorded: R-25, Q-11, troubleshooting entry |
| `a07c0b1` | R-25 detection, tests first, verified live |
| `1445a9d` | ST-12.5: version 0.2.0, CHANGELOG, release notes, evidence pack; VS Code claim removed from the root README (AC-33 dropped) |
| `d17baaf` | `/code-review` fixes (below) |
| `c5ff1b1` | `jeeves/docs/compatibility.md` regenerated for 0.2.0 |
| (this commit) | statuses in 00, 03, 04, 05, 06; this handover |

**Release artifact:** `release-zip.sh` from two clean clones of `c5ff1b1`: identical, SHA-256 `a721d510979f2376ffb90bd7e6a1694a2bfff290264ed1495590c63f1d03ceee`. `claude plugin validate` passes on the unzipped artifact (root, and `--strict` on `jeeves/`). No home path in it.

## 4. Code review (`/code-review b493501..HEAD`, 10 findings)

Fixed in `d17baaf`, tests first:
1. + 2. A skipped Stop hook blocked only `/jeeves on`. A running task could still cross the threshold and then hold every prompt, and `rotate`, `retry` and `resume` could start a rotation that never finishes. Now measuring, holding and those commands stop while the mode is unsupported.
3. An interrupt reported with `isAborted` was counted as a skip. Fixed and tested.
4. + 5. The detection rebuilt the runtime (a new storage and write queue) on every skipped turn. Now the probe is updated in place, once.
9. `defaults threshold|check` overwrote an unreadable `config.json` (it could be a newer Jeeves's) from an empty base. Now refused; `defaults clear` is the way out.

Not changed, with reasons:
6. The failure count is not reset after a rotation into a session with no context reading. This follows from review fix 1 / ST-10.3 (reset at rearm); without a reading there is no threshold rotation anyway.
7. After a POSSIBLE_LOOP retry the threshold does not fire again in that session. Intended by D-31 ("returns to MONITORING without rotating in that session").
8. The status output was cut at 8 lines, which could hide `Warning: defaults unreadable` and the reason line. **Fixed after M8 in `145f99f`:** Path, Last, Rotations, Waiting and TEST OVERRIDE give way first.
10. `statsText` and `fullHistory` duplicated the session-file reading. **Fixed after M8 in `f6adff1`** (one shared reader).

After M8: ponytail review of this session's code, 4 findings, all fixed in `76b27a9`. AC-32 P profiled (`214ca1d`): stays borderline, bound kept.

## 5. Checks at HEAD

Typecheck ok, lint ok, **262 unit pass**, `claude plugin validate --strict` passes, **175 mod tests**: every functional test passes. `tests/mod/stats.test.ts` "P: stats over 50 tasks < 100 ms" (AC-32 P) fails under load (load average 13–20 this session: other Claude sessions and an iOS simulator were running) at 130–150 ms and passes otherwise. The bound was not loosened. Profiling it (per task: listFiles sessions, session reads, readEvents with 2 `exists` + 1 read) is the open option from the progress handover.

Compatibility (`jeeves/docs/compatibility.md`): 2.1.302, 2.1.303, 2.1.310 and 2.1.319 pass 175/175; the 2.1.316 row shows the timing test failing (175/175 on a rerun). The doc was committed as generated, without hand edits.

## 6. Live spend (D-36 budget US$1)

Run 1 US$0.1049, free probe US$0, run 2 (detection) US$0.0062: **US$0.1111 used, about US$0.889 left.** Raw run folders (`docs/done/evidence/v0.2.0/e-layers/run1/`, `run2-detect/`, including `probe-free-debug-excerpt.log`) are gitignored and hold scratch paths.

## 7. Next (maintainer)

1. ~~Sign off ST-12.5~~: done.
2. Decide Q-11 (b)/(c) for a later version.
3. Push to `origin` (private) when you want. Tagging `v0.2.0` makes `release.yml` draft a release; it needs the tag on a commit with all three version fields at 0.2.0 and `jeeves/docs/release-notes/v0.2.0.md`, both present now.

## 8. Rules (unchanged)

Work in this repo only; one local commit per finished story or fix. Push only when the maintainer asks. Never make the repo public, publish, post, change the maintainer's Claude settings or install plugins. Load the plugin-authoring skill before changing hooks. Zero runtime dependencies. Live runs: haiku, scratch `JEEVES_STATE_DIR`, within the budget. A story that conflicts with an ADR: stop and ask. Report honestly what failed, was skipped or is unverified. No home path in tracked files.
