# M5 demo, live run 1 (2026-11-08 01:00-02:45 UTC): not a gate run, the Mac slept

Model run 1 of 3 (budget D-27). Cost about US$0.18 (killed session estimated from its transcript at haiku list prices).

**What went wrong (environment):** the Mac was on battery with the lid closed (`AppleClamshellState = Yes`) and kept entering sleep; the engine's debug log shows `[event-loop-stall] … likely sleep/wake`, cumulative 975 s. Process 1 froze mid-turn right after the rotation request and never reached the crash point `before-clear`; the driver killed it after its 15-minute wait, in ROTATION_REQUESTED. The same sleep caused the random 5 s timeouts in the mod suite that night (the pre-M5 code failed the same way).

**What the run still shows (read from the files, not the screen):**
- SIGKILL left the task ROTATION_REQUESTED with the dead session's lock in place.
- The new process named the task at start (`$.ui.toast (jeeves): Task t_20261108_a6wp7c was left ROTATION_REQUESTED by an earlier session. /relay recover continues it here.`, p2 debug log). The lock was already stale (process 1 had been frozen), so the first `/relay recover` recovered at once.
- Exactly one recovery (one `STALE_LOCK -> RESTORING` event) and exactly one continuation prompt in the recovering session's transcript; it carried the gap note and "no validated handover yet" (02 §8 row for a lost handover).
- The recovered session then rotated once on its own: handover-001 valid on the first try (`Retries used: 0`, with the D-27 instruction line), `/clear`, fresh session, continuation, rearm. This is the first live check of ST-6.6's process identity at the fresh session.
- No step committed twice; AC-19: stash, refs other than `refs/heads/main`, reflog (commits only), `.git/config` and the Claude settings files unchanged.

**Driver bugs found and fixed after this run:** the worktree snapshot compared HEAD lines (they move with each commit Claude makes); the startup notice and the recover answer were read from the redrawn screen (now from the debug log and `events.jsonl`); a recover that succeeds at once (stale lock) was counted as a failure.

`RESULT.md` here is the driver's own (FAIL) verdict from before those fixes.
