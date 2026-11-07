# Changelog

## Unreleased

- `/relay status` shows the mode (full, assisted or unsupported), the managed task if any, its state, context reading (or "unknown"), threshold, rotations, last handover or error, and the state folder. `/relay help` lists commands. If `/relay` is taken, SessionRelay registers `/sessionrelay` and says so.
- On an unsupported Claude Code version, SessionRelay says which version it needs and does nothing automatic.
- `stateDir` setting (in `/config`) chooses where task state is kept; the default is outside any repository.
- `/relay on [goal]` starts a managed task. With a goal, that text is saved word for word and sent as the first prompt; without one, your next typed prompt is saved word for word (`task-rev-001.md`). Slash commands are never captured. Nothing is recorded without `/relay on`.
- `/relay off` stops the task and releases its lock; no file is deleted.
- A task belongs to one session at a time: another running session gets `LOCK_HELD`. Only commands you type yourself can change a task.
- `/relay dod <text>` and `/relay check <command>` add a task revision (a new `task-rev-NNN.md`, never an edit). Verification commands are stored as text; SessionRelay never runs them. `/relay task` shows the original prompt, every change since and the current Definition of Done. Text from Claude, other plugins or other sessions never changes the task.
- While a task is on, SessionRelay reads the main conversation's context fill (the status line's figure). A missing figure shows as "unknown", never 0%, and triggers nothing. Rate-limit changes never count as context.
- The handover is requested once when context reaches the threshold (default 50%), with one warning 5 points before. Repeated or simultaneous readings past it do not request again. `/relay threshold <20-90>` sets it per task.
- Test runs only: `SESSIONRELAY_TEST=1` with `SESSIONRELAY_TEST_THRESHOLD_OVERRIDE=<n>` uses n% instead; `/relay status` then says `TEST OVERRIDE`.
- `/relay pause` stops any handover until `/relay resume`; the pause is kept across restarts. A pause while a handover is only requested cancels it; during a handover it takes effect once the fresh conversation has the task. Leaving Claude Code normally releases the task's lock, so `/relay resume` in the next session works at once (after a crash, after 2 minutes).
- The first `/relay on` on a machine explains, in three lines, where task state is kept, that a fresh conversation will start by itself, and how to pause. `/relay status` explains the reason code of a stopped task in one line.
- Typing `/clear` during a task pauses it (`USER_CLEAR`) and says so; `/relay off` then ends it. Continuing it in the fresh conversation comes with the rotation work.
- A disk error while saving a task revision no longer blocks later revisions.
- While a task is on, SessionRelay keeps an evidence ledger of the last 200 commands (redacted, exit status) and edited files, from the main conversation and subagents. Recording never changes, delays or blocks a tool call.
- Once a handover is due, the first tool result in the main conversation adds one hidden note asking Claude to finish its current step and stop (once per rotation, never while paused).
- The handover is asked for only when Claude stops with nothing in flight: no background shell, no running subagent (scheduled crons do not hold it up). While work is in flight SessionRelay waits; after 3 such stops (or 20 minutes) it pauses the task with `UNSAFE_BOUNDARY` and says why. Interrupting the handover pauses the task (`USER_INTERRUPT`). If SessionRelay itself fails at a stop, Claude stops normally and no rotation step is taken.
- Redaction now also covers Stripe keys, key-like names in any case (`aws_secret_access_key = …`) and quoted secrets in JSON or YAML, and no longer masks type annotations such as `password: string`. What is caught and missed is in PRIVACY.md.
- At a safe stop SessionRelay asks Claude for a handover, checks it (format, task and rotation ids, size, no secrets, files named as verified exist, branch and HEAD match git, no "passed" claim for a command whose last run failed) and saves it once as `history/handover-NNN.md`, verified by SHA-256, plus a copy in `handover.md`. An invalid handover gets up to 2 retries with the exact problems listed; after that the task stops with `NEEDS_REVIEW` (`HANDOVER_INVALID`) and earlier handovers stay untouched. Starting the fresh conversation comes next (M4); until then a saved handover leaves the task in `ROTATING`.
