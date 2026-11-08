# Troubleshooting

`/tibbs status` names the task's state and, when it stopped, the reason code and one line on what to do. `/tibbs history` shows how it got there. For a bug report, paste `/tibbs status --diagnose` (home folder shown as `~`, secrets redacted).

## Tibbs does not start

**`off: needs Claude Code 2.1.319+` / mode `unsupported`.** Update Claude Code (`claude update`) and restart the session. Tibbs stays off on older versions; [compatibility.md](compatibility.md) lists what was tested.

**Mode `assisted`.** This Claude Code does not let plugins run `/clear`, or refused it once. Handovers are still saved and checked. When one is ready, Tibbs asks you to run `/clear`, then type `/tibbs continue`. `/tibbs status --diagnose` shows what is missing, with a hint.

**`/tibbs` is not found, but `/relay` is.** Another plugin owns `/tibbs`; Tibbs uses `/relay` and said so at start. Every command works the same under `/relay`.

**`Tibbs has no state folder`.** `HOME` is unset, the default folder is inside your repository, or the folder you set is not absolute or not writable. Set `stateDir` in `/config` to an absolute path outside the repository.

## A task stopped

**`PAUSED (USER_PAUSE)`.** You paused it. `/tibbs resume`.

**`PAUSED (USER_CLEAR)`.** You typed `/clear` during a task. Tibbs paused rather than guess. `/tibbs resume` sends the task and the latest handover into this conversation; `/tibbs off` ends the task.

**`PAUSED (USER_INTERRUPT)`.** You pressed Esc during the handover. `/tibbs resume` lets Tibbs ask again at the next context reading past the threshold.

**`PAUSED (UNSAFE_BOUNDARY)`.** A background shell or subagent was still running at 3 stops in a row (or for 20 minutes), so there was no safe moment to hand over. Let the work finish, then `/tibbs resume`.

**`PAUSED (RATE_LIMIT | OVERLOADED | API_ERROR)`, `PAUSED (AUTH | BILLING)`.** The API stopped the turn. The message says when a rate limit resets. Fix the cause (`/login` for AUTH), then `/tibbs resume`.

**`PAUSED (MAX_ROTATIONS)`.** The task has rotated 10 times, the limit per task; it will not rotate again (a resume pauses again at the next threshold). Finish in this conversation, or `/tibbs off` and start the rest as a new task with `/tibbs on`.

**`NEEDS_REVIEW (HANDOVER_INVALID)`.** Claude's handover failed the checks three times (the problems are in the toast and in `events.jsonl`), or the saved handover changed on disk before use. Nothing was cleared and earlier handovers are untouched (they stay in the task's `history/` folder). The task does not continue from here: `/tibbs off`, then `/tibbs on` for a new task; you can point Claude at the last handover file.

**`NEEDS_REVIEW (POSSIBLE_LOOP)`.** The fresh conversation was already near the threshold, so another rotation would loop. Reduce what loads at start (large CLAUDE.md files, many MCP tools), or use a higher threshold: `/tibbs off`, then `/tibbs on` and `/tibbs threshold 70` for the next task.

**`NEEDS_REVIEW (ROTATE_UNAVAILABLE)`.** `/clear` was refused or the continuation prompt could not be sent. Run `/clear`, then `/tibbs continue`.

**`NEEDS_REVIEW (DOD_UNMET)`.** Claude reported the task done, but the checks you set (`/tibbs check`) have not passed in Tibbs's record. Ask Claude to run them, or confirm by hand with `/tibbs done` (recorded as your decision).

**`FAILED`.** Two rotations in a row ended in an error, so Tibbs stopped before a third. The task is over; `/tibbs history` and `/tibbs status --diagnose` show what failed, and `/tibbs on` starts a new task.

## Crashes, other sessions, moved folders

**Claude Code crashed or was closed in the middle of a task.** At the next start Tibbs names the task once. Type `/tibbs recover`: Tibbs takes the task over in this conversation and sends the original task and its last validated handover as the next prompt. If the previous session stopped after that handover was written, the prompt says that work done after it may exist and asks Claude to check the repository first. Recovery runs once; a second `/tibbs recover` says there is nothing to do. Turn on `autoRecover` in `/config` to recover by itself at start.

**`LOCK_HELD`.** Another session owns the task. Either it is still running (use it, or `/tibbs status` here to look), or it stopped less than 2 minutes ago: a crashed session keeps its lock until it has been silent for 2 minutes, and the message says how long to wait. `/tibbs on` in a second session starts a separate task.

**`/tibbs status` says the task state is unreadable.** `/tibbs recover` rebuilds `state.json` from the task's event log and write-once files, keeps the unreadable file beside it as `state.json.corrupt-<time>`, and continues from the last validated handover. Nothing is deleted.

**`Blocked (DISK)`.** Tibbs could not write its task files; the message names the folder. The last saved state is kept. Free disk space or fix the folder's permissions, then `/tibbs resume`.

**`Blocked (REPO_MISMATCH)`.** The repository is on another branch than the one the last handover was written on, so Tibbs did not continue. Switch back and type `/tibbs recover`, or type `/tibbs recover --relink` to continue on the current branch. If you moved the repository folder, `/tibbs recover` in the new folder finds the task by its old path and `/tibbs recover --relink` moves it here.

**`SCHEMA_TOO_NEW`.** The task was saved by a newer Tibbs. Update Tibbs (`claude plugin update tibbs@tibbs`); nothing was changed.

## Other questions

**The context figure shows `?`.** Claude Code has not reported it yet (it does after the first model reply). Tibbs never treats an unknown figure as 0% and does nothing until it has one.

**A message I typed during a handover disappeared.** It was held, not lost: Tibbs said so and quotes it word for word in the fresh conversation's first prompt. If that prompt cannot be sent, Tibbs shows your text again so you can retype it.

**I want to remove everything.** `/tibbs purge --all` (then confirm with the code), then `claude plugin uninstall tibbs@tibbs`.
