# Jeeves

A session-continuity plugin for Claude Code. When a managed task's context reaches a threshold, Jeeves writes a verified handover, starts a fresh conversation in the same terminal and continues the task there.

**Status: pre-release, under development.** Nothing here is ready for use yet.

## Modes

`/jeeves status` always shows the mode.

- **full**: Jeeves runs `/clear` itself after a verified handover and continues the task in the fresh conversation. No keystroke is needed.
- **assisted**: used when this Claude Code cannot run `/clear` for a plugin (or refused it once). Jeeves never claims automatic rotation here. It saves the verified handover and asks you to run `/clear`, then `/jeeves continue`, which sends the task and handover into the fresh conversation.
- **unsupported**: this Claude Code version is too old; Jeeves stays off and says which version it needs.

## What you see

While a task is on, Jeeves keeps one entry under the prompt: `Jeeves 34%/50%` (context used / threshold) while it watches, or the current step in words (`Jeeves: writing handover`, `Jeeves: paused (USER_PAUSE)`). Each step of a handover adds one dim line to the transcript; Claude does not see these lines.

## Troubleshooting

**Claude Code crashed or was closed in the middle of a task.** At the next start Jeeves names the task once. Type `/jeeves recover`: Jeeves takes the task over in this conversation and sends the original task and its last validated handover as the next prompt. If the previous session stopped after that handover was written, the prompt says that work done after it may exist and asks Claude to check the repository first. Recovery runs once; a second `/jeeves recover` says there is nothing to do. Turn on the `autoRecover` setting (in `/config`) to recover by itself at start.

**`/jeeves recover` says another session owns the task (`LOCK_HELD`).** Either that session is still running (use it, or `/jeeves status` here to look), or it stopped less than 2 minutes ago. A crashed session keeps its lock until it has been silent for 2 minutes; the message says how long to wait.

**`/jeeves status` says the task state is unreadable.** `/jeeves recover` rebuilds `state.json` from the task's event log and write-once files, keeps the unreadable file beside it as `state.json.corrupt-<time>`, and continues from the last validated handover. Nothing is deleted.

**`Blocked (DISK)`.** Jeeves could not write its task files; the message names the folder. The last saved state is kept. Free disk space or fix the folder's permissions, then `/jeeves resume`.

**`Blocked (REPO_MISMATCH)`.** The repository is on another branch than the one the last handover was written on, so Jeeves did not continue. Switch back and type `/jeeves recover`, or type `/jeeves recover --relink` to continue on the current branch. If you moved the repository folder, `/jeeves recover` in the new folder finds the task by its old path and `/jeeves recover --relink` moves it here.

**The task is `PAUSED`.** A pause (yours, a `/clear` you typed, an API error) is not an interruption: `/jeeves resume` continues it. `/jeeves status` says why it paused.

Supported: Claude Code 2.1.319 or later on macOS. Linux is expected to work but untested.

Licence: MIT.
