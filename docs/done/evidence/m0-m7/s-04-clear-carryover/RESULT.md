# S-04 — What a plugin-invoked `/clear` keeps

**Result: PASS** (2 runs; every item recorded as kept or lost) · **Date:** 2026-11-07 · **Claude Code:** 2.1.319 · **macOS:** Darwin 23.6.0 · **Model:** `claude-haiku-5-5` · **Story:** ST-0.4

## Method

- Spike mod `mod/`: `/srspike` queues `$.command.run({ command: 'clear' })` and then `$.prompt.submit(continuation)`. It logs `classic.Stop` (`permission_mode`, `session_crons`, `background_tasks`), every main-loop `tool.call` (tool, `deny`, `isError`), `session.end` and `classic.SessionStart`.
- **Run 1** (`drive_s04.py`): `claude --permission-mode default --add-dir <scratch>/extra`. Before rotating: Read `<extra>/note.txt`; run `date +%Y`; create a session cron with CronCreate (`17 * * * *`, prompt `echo ping`). Rotation 1, then a continuation that reads the add-dir file again, runs `date` and calls CronList. Then Shift+Tab twice (default → accept edits → plan mode), and rotation 2 with a trivial continuation.
- **Run 2** (`drive_s04_run2.py`): run 1's `date` needed no permission, so it could not test a granted permission. Run 2 used `touch perm_probe_1.txt` (default mode) to open a Bash permission dialog, recorded the options, then rotated and ran `touch perm_probe_2.txt`.
- Files: `events-run1.jsonl`, `events-run2.jsonl`, `driver-run1.log`, `driver-run2.log`.

## Result table

| Item | Kept / lost | Evidence |
|---|---|---|
| `--add-dir` directory | **Kept** | After rotation, Read of `<extra>/note.txt` returned `ADDDIR-MARKER-7731` with no permission dialog, as before rotation |
| Permission mode `default` | **Kept** | Stop after rotation 1: `permission_mode: "default"` |
| Permission mode `plan` | **Kept** | Rotation 2 started in plan mode; Stop after it: `permission_mode: "plan"` |
| Permission mode `acceptEdits` | **Kept** | Spike 01 (`--permission-mode acceptEdits`) |
| Session cron (CronCreate / `/loop` kind) | **Kept** | `session_crons` still held `{id:"10e566ce", schedule:"17 * * * *", recurring:true, prompt:"echo ping"}` after both rotations; CronList in the fresh conversation listed it |
| "This session" Bash permission grant | **N/A in 2.1.319** | The Bash permission dialog offers no session-only option: `1. Yes` (once) · `2. Yes, and always allow access to <repo> from this project` (saved to disk) · `3. Yes, and switch to auto mode`. A once-only Yes is gone after the call by design. Option 2 is persisted outside the conversation. Option 3 is a mode change, and modes are kept (above). Run 2 chose option 1; after rotation `touch` asked again, which is the expected behaviour for a one-time grant |
| Background tasks | n/a | Covered by S-02 (rotation is deferred until none are in flight) |

## What this changes

- **Crons survive `/clear`.** They belong to the process, not to the conversation. ADR-004 treated a non-empty `session_crons` as unsafe "until S-04 shows crons survive `/clear`". It does, so a scheduled cron no longer has to block rotation. Proposed ADR-004 amendment: crons are not a boundary blocker; list them in the handover's verified section so the new conversation knows they exist. A cron prompt that fires during a rotation is not origin `composer`, so ADR-010 does not hold it. It queues and runs after the continuation, with the handover already injected.
- Nothing is lost that could escalate privileges. The only "loss" is a one-time Yes, which is one-time by design.

## Other observations

- `classic.SessionStart` input carried no `permission_mode` (logged `null`). Read the mode from `classic.Stop` when needed.
- `$.session.usage().cost.usd` resets to 0 after `/clear` (cost is per conversation). Total cost per task must sum across sessions.
- Driver note: run 2's dialog matcher kept seeing the old dialog in the screen buffer and pressed Esc several times after rotation. That rejected the post-rotation `touch`, which still showed a fresh dialog, as expected. The user's interrupt also meant no Stop fired for that turn, which matches the plan's assumption that Stop does not fire on interrupt.

## Fallback adopted

None needed. One ADR change: ADR-004 drops `session_crons` from the unsafe-boundary conditions (logged in 07 §2).

## Cost note

Two PTY runs, about 9 short Haiku turns in total. The mod logged per-conversation cost: US$0.009 before rotation and US$0.007 / US$0.019 after (run 1). Total well under US$0.10.
