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
