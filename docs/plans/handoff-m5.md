# Handoff: M5 built → close the M5 gate, then M6 (UX & distribution)

**Date:** 2026-11-08 · **Claude Code:** 2.1.319 · **OS:** macOS, Darwin 27.2 · **Node:** 22.22 · **Repo:** `~/Desktop/Projects/jeeves` (branch `main`, local only)

This file is enough to start in a clean session. The working rules, code map and engine rules are in `handoff-m3.md` §0, §1, §4, §5, `handoff-m4.md` §4, §5 and `handoff-m4b.md` §4. This file adds what M5 changed.

## 0. The command is now `/jeeves` (D-29)

At the end of this session the maintainer renamed the command to match the product: **`/jeeves <sub>`** (fallback `/relay` only if another plugin or command owns `/jeeves`). ADR-009 has amendment A1. Code, tests, help, messages, README, CHANGELOG and the PTY drivers use `/jeeves`. **Every `/relay …` in older plans, handoffs and evidence means `/jeeves …`.** The PTY drivers (`driver.py`, `concurrency.py`, `demo_recover.py`) were updated by search-and-replace but have not run live since the rename: the first live run checks them.

M5 commits (99b976e..):

```
be7139d ST-6.2 StopFailure pauses          a54ff61 ST-6.6 concurrency
981b87f ST-6.3 interrupt / user /clear     0839275 ST-6.7 crash matrix
41dcd89 ST-6.4 compaction                  0259854 handover first-try (D-27)
6983e9c ST-6.1 recovery, /relay recover    25adbf2 AC-19 static audit
1fc4b9e ST-6.5 DISK, REPO_MISMATCH, relink 0515e5d review fixes 1-4 (ponytail 1)
9267452 demo driver fixes, live run 1      c01a06e plans, first handoff-m5
23f8f9e review fixes (ponytail 2)          906b551 code-review fixes 1-10
85f6b1c D-29 /jeeves                       (+ this handoff update)
```

## 1. Before anything

1. `git status` clean; `git log --oneline -1` shows the commit that added this file.
2. **The Mac must be awake and on power, lid open.** In the M5 session it was on battery with the lid closed: it kept sleeping (`pmset -g log`, `ioreg -r -k AppleClamshellState`), which froze live runs and made `claude plugin test` fail at random with `timed out after 5000 ms` (the pre-M5 code failed the same way). An Android emulator from another project also kept the load near 45. Check `uptime` and `pmset -g batt` first.
3. `SR_TEST_TMP=<scratchpad> jeeves/scripts/check-all.sh`: expected **237 unit, 137 mod, validate passes**, exit 0 (clean on 2026-11-08 06:40 after all three reviews). Under heavy load or sleep the mod suite fails at random with `timed out after 5000 ms` in files that differ per run (the pre-M5 code too): rerun before suspecting a fault.
4. `claude --version` (2.1.319 at handoff).

## 2. Close the M5 gate (do this before M6)

Gate (05): crash matrix 6/6; AC-16, AC-18, AC-19, AC-23; no git mutation; demo: kill mid-rotation → `/jeeves recover` continues once.

| Item | State |
|---|---|
| Crash matrix 6/6 (I layer) + storage SIGKILL (P layer) | PASS, `evidence/m5-crash/crash-matrix.md` (`npm run crash:report` regenerates it; rerun it once the suite is clean) |
| AC-18 | PASS: I path audit; E 4 real processes, 17/17, US$0.00 (`evidence/m5-concurrency/`) |
| AC-19 | PASS: U static audit; E snapshot in live run 1 (only Claude's own commits moved `main`) |
| AC-23 | PASS: snapshot `tests/fixtures/messages.txt` + mod tests |
| AC-16 E layer / **demo** | **Open.** Live run 1 (US$0.18) froze in system sleep before the crash point; it still showed a real SIGKILL → startup notice → one recovery → one continuation (gap note) → a normal rotation afterwards (`evidence/m5-demo/run1-sleep/NOTE.md`) |

**To finish:** with the machine awake, one demo run (2 of the 3 model runs approved for M5 remain):

```
cd jeeves && python3 tests/pty/demo_recover.py <scratch>/demo2 --out ../docs/plans/evidence/m5-demo --minutes 15
```

It kills `claude` at `JEEVES_TEST_CRASH=before-clear` (handover-001 saved, state ROTATING), starts a new `claude`, types `/jeeves recover` (again once the dead lock is stale, if the first is refused), lets the task rotate once more, and writes `RESULT.md` with the AC-16/AC-19 checks and cost. Then mark M5 solved in `05` § Status and `00`, add the demo to `06` AC-16, and record the run cost.

## 3. What M5 added (code map)

- `src/core/recovery.ts`: `classify(found, me, endedHere)` → none / mine / lock-held / rebuild / too-new / recover{gap, adopt} (02 §8, one unit test per row); `rebuildState` (NEEDS_REVIEW(STATE_CORRUPT) from events + write-once files).
- `src/adapter/recover.ts`: `/jeeves recover [--relink]`, `recoveryNotice` (startup toast), tmp cleanup (own `*.tmp-<12 hex>` older than 1 h), rebuild (old file kept as `state.json.corrupt-<time>`), moved-repository search (`project.json` worktree gone; with git, the start commit must exist here, `hasCommit`), `relinkHere` (moves the task folder), `restoredText`.
- `machine.ts` new inputs: `RECOVER`, `DISK_FAILED`, `REPO_MISMATCH`, `RELINKED`; `STOP_FAILURE.resetsAt`; `COMPACTED.trigger`; effect `SUBMIT_HELD`; `recoverable()`, `stopFailureText()`, `diskText()`. RESUME also leaves BLOCKED(DISK) and delivers held prompts.
- `task.ts`: `transition` → `blockOnDisk` on a failed state write; `restoreHere(…, { gap, adopt, relink })` checks the handover's `- Branch:` against git; `writeProjectRecord` at task start; `clearingHere(endedHere)` for the fresh session and held prompts; `stopFailure`, `managedNow`, `compacted`; `crashPoint` (test only).
- `hooks/register.ts`: `classic.StopFailure` (main loop), `session.compact` (precompute skipped while managed; afterwards COMPACTED + nudge when idle), startup recovery scan + `autoRecover` (new `userConfig` row).
- Commands: `/jeeves recover`, `/jeeves recover --relink`; `/jeeves on` with another live session's task starts a separate task (D-27).
- Tests: `tests/unit/{recovery,messages,no-git-mutation}.spec.ts`; `tests/mod/{recover,crash,repo,concurrency,compact,stopfailure}.test.ts`; `memfs.ts` gained `cwd`, `git` stub, `access` audit log, folder `mv`, `rateLimits`, StopFailure/compact bottoms; `kit.ts` `fakeGit`; `tests/pty/{concurrency,demo_recover}.py`; `scripts/crash-report.mjs` (`npm run crash:report`).
- Reviews: two `/ponytail:ponytail-review` passes and one `/code-review` pass on the M5 range, all findings fixed (0515e5d, 23f8f9e and the commit after this list): held messages delivered on resume; recover gives the lock back on refusal (also after relink); rebuild copies the old state aside; a read error is never "corrupt"; one task per session in recover; REPO_MISMATCH keeps an adopted handover and also blocks from assisted NEEDS_REVIEW; a disk error never overwrites a stop; unknown `recover` arguments refused; rate-limit reset from the fullest window that has one; rebuilt state keeps the default threshold and the start commit prefix.
- Docs: README Troubleshooting, CHANGELOG, `docs/state-machine.md` notes, 02 §4 recover row, 07 D-27 (Accepted) and D-28 (Proposed), R-05/R-12 updated.

## 4. Engine and environment rules learned in M5 (2.1.319)

1. **Test kit:** `session.compact` needs at least one message on both sides (`{ role, text, toolUses }`); `classic.StopFailure` and `session.compact` need bottoms; `test(name, { options: { autoRecover: true } }, body)` passes `userConfig` values.
2. A hook that never returns (the crash points) works in the kit if the test does not await that call (`void $.classic.Stop(…)`, then `until(…)`); `session.start` rebuilds the runtime, so the next "process" gets a fresh serial queue.
3. The debug log carries every `$.ui.toast (jeeves): …` and `jeeves: …` line: read toasts and markers from it; the TUI screen tail misses them.
4. A process frozen by system sleep stops heartbeating, so its lock is stale by the time it is killed: `/jeeves recover` then succeeds on the first try.
5. Local `/jeeves` commands cost nothing (`/cost` stays $0.0000), so multi-process tests that type only `/jeeves` are free.

## 5. Open items

- **M5 demo** (§2) and a clean full check (§1.3).
- Live-unverified: the StopFailure pause, compaction (precompute skip, COMPACTED after `/compact`), `autoRecover` submitting from `session.start`, REPO_MISMATCH and relink on a real moved git repository (`hasCommit` against real git; mod tests are non-git), the `/clear` stall recovery through `endedHere` in the same process.
- Shortcut kept: `takeoverLock` guard collision (`shortcut:` comment in `storage.ts`).
- Handover first-try validity with the D-27 change: 1/1 live so far (run 1).
- `/jeeves threshold` and `/jeeves resume` messages do not mention the relative override (cosmetic).
- Carried: A-05, CI never run (no remote), Q-1 not posted, AC-07/AC-09 E layers, Q-9, ST-9.3 naming check, `$.prompt.fill` emptying the box live (ADR-010 A1), the AC-10 "quote earlier messages" probe.
- D-28 is Proposed: the maintainer should accept or amend it.

## 6. Next: M6 (UX & distribution, ST-7.1, ST-7.2, ST-8.1 … ST-8.4)

**Read first:** `04-backlog-stories.md` E7 and E8 and the standard DoD; `05` M6 row (AC-01, AC-02 manual, AC-20, AC-21, AC-22 evidence; install < 5 min on a clean user; demo: clean-machine install → first rotation); `06` §6 (Cursor checklist) and the AC rows; `08-open-source-release-plan.md`; `07` Q-3 (per-plugin data dir for an installed mod), Q-4 (lowest supported version), Q-5 (50% default).

**Live runs:** ask the maintainer for a budget first. AC-20 (uninstall clean) and AC-21 (contributor docs) are mostly manual; the Cursor checklist needs the maintainer at the keyboard.
