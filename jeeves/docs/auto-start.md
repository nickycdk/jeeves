# Auto-start

On a new install (0.3 and later) you can skip `/jeeves on`. Jeeves watches a session by itself when auto-start is on (below; a change applies at once) and all of these hold, checked once when the session starts:

- an interactive session (not `claude -p`, the SDK or a background agent), in full mode;
- inside a git repository (subfolders and linked worktrees count);
- a model whose context window is 200K tokens or more (since 0.3.1; 0.3.0 watched only windows above 200K). On a 200K window the default threshold of 40% is about 80K tokens, and a fresh conversation can already fill a fifth of the window: if the first reading is within 10 points of the threshold, the near-threshold rule below applies;
- a fresh conversation (not `--resume` or `--continue`).

The first such session shows once: `Jeeves watches long sessions here. At 40% context (~400K tokens) it saves a handover and continues in a fresh conversation.` Nothing is recorded until you type your first prompt; that prompt becomes the task, word for word, as after `/jeeves on`. Prompts from other plugins, the SDK or scheduled triggers never start one. `/jeeves status` shows `(auto)` for such a task, and for a session that is not watched the reason, such as `Auto off: not a git repository` (`--diagnose` lists them all).

## How an auto task differs

An auto task works like any other, with these differences:

- if its first context reading is already within 10 points of the threshold (a large CLAUDE.md, a pasted log), Jeeves stops watching this session and says so; `/jeeves on` watches anyway;
- it does not hand over in its first 3 turns, unless the context is already 10 points past the threshold (50% with the default threshold);
- switching to a model with a window below 200K ends it, with a message (a switch from 1M to 200K keeps it, with its threshold);
- a `/clear` you type ends it (files kept) and your next prompt starts a new one; in a task you started with `/jeeves on`, `/clear` pauses as before, and no auto task starts for the rest of that session (a later session is watched again; the paused task waits for `/jeeves resume`). `/jeeves on <goal>` makes an auto task yours: the goal is saved as a new revision and `/clear` then pauses it;
- after a handover, if Claude ends the first turn of the fresh conversation by announcing its next step instead of taking it, Jeeves asks it once to carry on (or to say it is done, or what it needs from you). Only once per conversation, never after you typed in it, and never in a task you started with `/jeeves on`;
- if a session closes in the middle of a handover, the next fresh interactive session continues it by itself, whatever `autoRecover` says;
- if it ended without a single handover, its folder is deleted at a later session start, 7 days after its last change.

## Turning it off

`/jeeves off` for the rest of this session, `/jeeves defaults auto off` for this project, `/jeeves auto off` everywhere (kept in the state folder, never in your Claude settings), or `/config` → Jeeves → Auto-start → `off`. The session wins over the project, the project over `/config`, `/config` (when set to `on` or `off`) over `/jeeves auto`. `/jeeves auto` shows the setting and which of these decided it. `/jeeves on` always works.

## A hint instead of silence

A session Jeeves does not watch only because it was not turned on after an upgrade, is a resumed conversation, is outside git or started on a 200K window gets one line when its context reaches the point a watched one would be warned (35% with the default threshold): `Jeeves: this session is at 45%. /jeeves on would hand it over to a fresh conversation before it fills up. /jeeves auto off hides this.` Once per session; never under `-p` or after you turned auto-start off anywhere; after 3 hints in a row with no `/jeeves on` or `/jeeves auto on`, no more. No tokens, no files.

## Upgrading from 0.2

Nothing changes. Jeeves says once that it can now watch long sessions by itself, and keeps auto-start off until you type `/jeeves auto on`.
