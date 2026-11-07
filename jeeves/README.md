# Jeeves

A session-continuity plugin for Claude Code. When a managed task's context reaches a threshold, Jeeves writes a verified handover, starts a fresh conversation in the same terminal and continues the task there.

**Status: pre-release, under development.** Nothing here is ready for use yet.

## Modes

`/relay status` always shows the mode.

- **full**: Jeeves runs `/clear` itself after a verified handover and continues the task in the fresh conversation. No keystroke is needed.
- **assisted**: used when this Claude Code cannot run `/clear` for a plugin (or refused it once). Jeeves never claims automatic rotation here. It saves the verified handover and asks you to run `/clear`, then `/relay continue`, which sends the task and handover into the fresh conversation.
- **unsupported**: this Claude Code version is too old; Jeeves stays off and says which version it needs.

Supported: Claude Code 2.1.319 or later on macOS. Linux is expected to work but untested.

Licence: MIT.
