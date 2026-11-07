# Changelog

## Unreleased

- `/relay status` shows the mode (full, assisted or unsupported), the managed task if any, its state, context reading (or "unknown"), threshold, rotations, last handover or error, and the state folder. `/relay help` lists commands. If `/relay` is taken, SessionRelay registers `/sessionrelay` and says so.
- On an unsupported Claude Code version, SessionRelay says which version it needs and does nothing automatic.
- `stateDir` setting (in `/config`) chooses where task state is kept; the default is outside any repository.
