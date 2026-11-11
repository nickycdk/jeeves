# Commands

All are `/jeeves <command>`. Only commands you type yourself change a task; anything may read. `/jeeves help` lists them, the everyday ones first.

| Command | What it does |
|---|---|
| `on [goal]` | Start a managed task in this project. Without a goal, your next prompt is the task. In an auto task, `on <goal>` makes it yours: the goal is a new revision and a `/clear` then pauses it. |
| `off` | End the task and release it. Nothing is deleted. Auto-start stays off for the rest of this session. |
| `status [--diagnose]` | Mode, task (`auto` or `explicit`), state, context, threshold, rotations, state folder; with no task of this session's own, whether auto-start watches it and if not why. `--diagnose`: a redacted report for a bug report, with every reason. |
| `pause` / `resume` | No handover until `resume`. Kept across restarts. `resume` also continues after a `/clear` you typed, a rate limit or a disk error. |
| `rotate` | Hand over now, at the next safe stop. |
| `check <cmd>` | Add a verification command (stored as text, never run by Jeeves). |
| `done` | Confirm by hand a task Claude says is done but Jeeves could not prove (`Claude says done. Confirm: /jeeves done`; recorded as your decision). |
| `later` | Skip the next handover: the threshold moves up 10 points and the warning comes again 5 points before. Repeatable up to 90%, or 5 points below the point where Claude Code would compact, when that is lower. A handover already under way goes on (`/jeeves pause` stops it). |
| `continue` | Assisted mode: after `/clear`, continue the task in the fresh conversation. |
| `recover [--relink]` | Continue a task an earlier session left interrupted (crash, closed terminal). `--relink` continues after a branch switch or a moved folder. |
| `retry` | After `Handover failed checks`: ask for the handover again. After `Fresh session too full`: keep working in this conversation without a handover in it. Counts toward the 2 failed handovers in a row. |
| `threshold <n>` | Hand over at n% context (20 to 90; default 40). Warns 5 points before. |
| `limit <n>` | The most handovers this task may make (1 to 100; default 30). At the limit the task pauses; a higher limit and `/jeeves resume` continue it. |
| `defaults` | This project's defaults for new tasks. `defaults threshold <n>`, `defaults limit <n>`, `defaults check <cmd>` (add one; up to 20), `defaults auto on\|off` (auto-start for this project), `defaults clear`. Applied at the next `/jeeves on` in this project (auto-start at once); running tasks are not changed. Kept in the state folder, never in your repository. |
| `auto [on\|off]` | Show whether auto-start is on and which setting decided it; `on`/`off` sets it everywhere (in `auto.json` in the state folder, never in Claude settings). Says so when the `/config` row overrides it. |
| `task` | Show the original prompt, every change since and the Definition of Done. |
| `dod <text>` | Add a done criterion (a new task revision, never an edit). |
| `history [--full]` | The last 20 state changes and a rotations summary. `--full` adds, per rotation, the session's context at start and end, its cost when known, why it ended, and the handover file with its first next actions (a missing or changed file is said, not printed). |
| `handover` | The last handover of the task status shows: its file, Current goal and first 3 next actions, at 40 columns. Reads only; a missing or changed file is said, not printed. |
| `stats` | For this project and the current task: tasks, rotations, sessions, average context at rotation, context cleared by rotations (points, and tokens when the window is known), cost where Claude Code reports it (else "unknown"), and stops by reason. Reads only. |
| `purge --task <id> \| --project \| --all` | List the task folders that would be deleted and give a code. A running task is never deleted. |
| `purge confirm <code>` | Delete them (within 2 minutes; a wrong code cancels). |
| `help` | The command list. |

If another plugin already owns `/jeeves`, Jeeves registers `/relay` instead and says so.
