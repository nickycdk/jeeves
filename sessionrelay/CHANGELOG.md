# Changelog

## Unreleased

- `/relay status` shows the mode (full, assisted or unsupported), the managed task if any, its state, context reading (or "unknown"), threshold, rotations, last handover or error, and the state folder. `/relay help` lists commands. If `/relay` is taken, SessionRelay registers `/sessionrelay` and says so.
- On an unsupported Claude Code version, SessionRelay says which version it needs and does nothing automatic.
- `stateDir` setting (in `/config`) chooses where task state is kept; the default is outside any repository.
- `/relay on [goal]` starts a managed task. With a goal, that text is saved word for word and sent as the first prompt; without one, your next typed prompt is saved word for word (`task-rev-001.md`). Slash commands are never captured. Nothing is recorded without `/relay on`.
- `/relay off` stops the task and releases its lock; no file is deleted.
- A task belongs to one session at a time: another running session gets `LOCK_HELD`. Only commands you type yourself can change a task.
