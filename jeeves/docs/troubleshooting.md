# Troubleshooting

`/jeeves status` names the task's state and, when it stopped, the reason code and one line on what to do. `/jeeves history` shows how it got there. For a bug report, paste `/jeeves status --diagnose` (home folder shown as `~`, secrets redacted).

## Jeeves does not start

**`off: needs Claude Code 2.1.319+` / mode `unsupported`.** Update Claude Code (`claude update`) and restart the session. Jeeves stays off on older versions; [compatibility.md](compatibility.md) lists what was tested.

**Mode `assisted`.** This Claude Code does not let plugins run `/clear`, or refused it once. Handovers are still saved and checked. When one is ready, Jeeves asks you to run `/clear`, then type `/jeeves continue`. `/jeeves status --diagnose` shows what is missing, with a hint.

**`/jeeves` is not found, but `/relay` is.** Another plugin owns `/jeeves`; Jeeves uses `/relay` and said so at start. Every command works the same under `/relay`.

**`mode: full (turn)`, or `/compact` noticed only later (Team accounts).** On Claude Code 2.1.319, accounts in a Team organization get a built-in security plugin (`cc-plugin-sec-default`) that runs before every installed plugin and passes the Stop, SessionStart, compaction and system-prompt events on past them. Jeeves cannot hand over with those events there. After the first answer it notices and switches to turn mode, which uses the end of each answered turn, prompts it sends and the context readings instead: `/jeeves status` says `mode: full (turn)` and `--diagnose` says `Stop hook skipped`. To see which plugin: start `claude --debug-file /tmp/claude-debug.log` and look for `jeeves: classic.Stop bypassed by cc-plugin-sec-default`. If Claude Code then refuses a prompt Jeeves sends, Jeeves turns off for the session (`off: prompt refused`, `mode: unsupported`). In turn mode a `/compact` is noticed at the next context reading (after your next prompt), not at once, and compaction ahead of time is not skipped; the handover's facts say `Scheduled session crons: not available in turn mode`. 0.2.0 has no turn mode: there Jeeves turns itself off (`mode: unsupported`).

**`Auto off: …` in `/jeeves status` (a session is not watched by itself).** The line names the first reason; `/jeeves status --diagnose` lists them all. `window below 200K at start`: the model's context window was under 200K tokens when the session started (0.3.0 needed more than 200K); switching model later does not change it, `/jeeves on` watches anyway. `not a git repository`, `resumed conversation`: auto-start only takes fresh conversations inside a git work tree. `upgraded from 0.2`: type `/jeeves auto on` once.

**`Jeeves has no state folder`.** `HOME` is unset, the default folder is inside your repository, or the folder you set is not absolute or not writable. Set `stateDir` in `/config` to an absolute path outside the repository.

## A task stopped

**`Paused by you. /jeeves resume`** (`USER_PAUSE` in `/jeeves history`). You paused it. `/jeeves resume`.

**`Paused after your /clear. /jeeves resume`** (`USER_CLEAR`). You typed `/clear` during a task. Jeeves paused rather than guess. `/jeeves resume` sends the task and the latest handover into this conversation; `/jeeves off` ends the task.

**`Paused: you interrupted the handover.`** (`USER_INTERRUPT`). You pressed Esc during the handover. `/jeeves resume` lets Jeeves ask again at the next context reading past the threshold.

**`Paused: no safe point to hand over.`** (`UNSAFE_BOUNDARY`). A background shell or subagent was still running at 3 stops in a row (or for 20 minutes), so there was no safe moment to hand over. Let the work finish, then `/jeeves resume`.

**`Rate limit hit`, `API busy`, `API error`, `Login problem`, `Billing problem`** (`RATE_LIMIT`, `OVERLOADED`, `API_ERROR`, `AUTH`, `BILLING`). The API stopped the turn. The message says when a rate limit resets. Fix the cause (`/login` for AUTH), then `/jeeves resume`.

**`Handover limit hit. /jeeves limit <n>`** (`MAX_ROTATIONS`). The task has made as many handovers as its limit allows (30 by default; `/jeeves status` shows `Rotations: 30/30`). Raise it with `/jeeves limit <n>` (up to 100), then `/jeeves resume`; without a higher limit a resume pauses again at the next threshold. Or finish in this conversation. `/jeeves defaults limit <n>` sets the limit for new tasks in this project.

**Handovers come very often (200K window).** A fresh conversation already holds the system prompt, `CLAUDE.md` and the tool list, and the default threshold is 40% (80K tokens), so little room is left. `/jeeves threshold 55` gives each conversation more room; keep it well under 83%, where Claude Code compacts by itself.

**`Handover failed checks. /jeeves retry`** (`HANDOVER_INVALID`). Claude's handover failed the checks three times (the problems are in the toast and in `events.jsonl`), or the saved handover changed on disk before use. Nothing was cleared and earlier handovers are untouched (they stay in the task's `history/` folder). Type `/jeeves retry` to ask for the handover again (Claude is asked at the next safe stop, or at once if it is waiting). A retry counts toward the limit of 2 failed handovers in a row; when that is used up, `/jeeves status` says `Retries used up` and `/jeeves off` ends the task (you can point Claude at the last handover file in a new one).

**`Fresh session too full. /jeeves retry`** (`POSSIBLE_LOOP`). The fresh conversation was already within 10 points of the threshold, so another rotation would loop. Type `/jeeves retry` to keep working in this conversation: Jeeves watches again but does not hand over in it; the next fresh conversation rotates as usual. To avoid it, raise the threshold (`/jeeves threshold 70`), make the task shorter, or reduce what loads at start (large CLAUDE.md files, many MCP tools). If it happens again before a rotation succeeds, the task stops as `FAILED (POSSIBLE_LOOP)`; `/jeeves off`, then `/jeeves on` for a new task. (A task that Jeeves 0.1 stopped as `FAILED (POSSIBLE_LOOP)` stays failed.)

**`Run /clear, then /jeeves continue.`** (`ROTATE_UNAVAILABLE`). `/clear` was refused or the continuation prompt could not be sent. Run `/clear`, then `/jeeves continue`.

**`Claude says done. Confirm: /jeeves done`** (`DOD_UNMET`). Claude reported the task done, and Jeeves cannot prove it: either the task has no check commands (common for a task Jeeves started by itself), or the checks you set (`/jeeves check`) have not passed in Jeeves's record since the last edit. Nothing is wrong. If the work is done, type `/jeeves done` (recorded as your decision); otherwise tell Claude what is left, or ask it to run the checks. Jeeves does not end a task on Claude's word alone, so a file in the repository cannot trick Claude into ending it.

**`failed`** (`FAILED`). Two rotations in a row ended in an error, so Jeeves stopped before a third. The task is over; `/jeeves history` and `/jeeves status --diagnose` show what failed, and `/jeeves on` starts a new task.

## Crashes, other sessions, moved folders

**Claude Code crashed or was closed in the middle of a task.** At the next start Jeeves names the task once. Type `/jeeves recover`: Jeeves takes the task over in this conversation and sends the original task and its last validated handover as the next prompt. If the previous session stopped after that handover was written, the prompt says that work done after it may exist and asks Claude to check the repository first. Recovery runs once; a second `/jeeves recover` says there is nothing to do. Turn on `autoRecover` in `/config` to recover by itself at start.

**`Another running session owns task …`** (`LOCK_HELD`). Another session owns the task. Either it is still running (use it, or `/jeeves status` here to look), or it stopped less than 2 minutes ago: a crashed session keeps its lock until it has been silent for 2 minutes, and the message says how long to wait. `/jeeves on` in a second session starts a separate task.

**`/jeeves status` says the task state is unreadable.** `/jeeves recover` rebuilds `state.json` from the task's event log and write-once files, keeps the unreadable file beside it as `state.json.corrupt-<time>`, and continues from the last validated handover. Nothing is deleted.

**`Blocked: Jeeves could not write its task files`, `Could not save task files to disk.`** (`DISK`). Jeeves could not write its task files; the message names the folder. The last saved state is kept. Free disk space or fix the folder's permissions, then `/jeeves resume`.

**`Blocked: the handover was written on branch …`, `Task belongs to another repository.`** (`REPO_MISMATCH`). The repository is on another branch than the one the last handover was written on, so Jeeves did not continue. Switch back and type `/jeeves recover`, or type `/jeeves recover --relink` to continue on the current branch. If you moved the repository folder, `/jeeves recover` in the new folder finds the task by its old path and `/jeeves recover --relink` moves it here.

**`Saved by a newer Jeeves. Update Jeeves`** (`SCHEMA_TOO_NEW`). The task was saved by a newer Jeeves. Update Jeeves (`claude plugin update jeeves@jeeves`); nothing was changed.

## Other questions

**The context figure shows `?`.** Claude Code has not reported it yet (it does after the first model reply). Jeeves never treats an unknown figure as 0% and does nothing until it has one.

**A message I typed during a handover disappeared.** It was held, not lost: Jeeves said so and quotes it word for word in the fresh conversation's first prompt. If that prompt cannot be sent, Jeeves shows your text again so you can retype it.

**I want to remove everything.** `/jeeves purge --all` (then confirm with the code), then `claude plugin uninstall jeeves@jeeves`.
