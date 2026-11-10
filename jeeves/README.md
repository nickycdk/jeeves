# Jeeves

Claude Code has a context limit. Your momentum shouldn't. Jeeves is your friendly butler for long Claude Code tasks: when the context starts to fill up, he saves a verified handover, starts a fresh conversation in the same terminal and carries on with the task there. You keep building.

**Status: public beta 0.3.2 (see the [CHANGELOG](CHANGELOG.md)).** It works on Claude Code 2.1.319 and later on macOS; see [Compatibility](docs/compatibility.md).

## The problem

You know the feeling. A long task in one Claude Code conversation slowly fills the context window. Past the middle, answers get slower, earlier details slip away, and compaction summarises your work in ways you do not control. Starting fresh by hand means writing a summary, running `/clear`, pasting it back and explaining the task all over again.

Jeeves takes that job off your hands, inside your normal terminal session. When the context reaches a threshold you choose (default 40% of the window), he asks Claude for a handover, checks it against git and his own record of what ran, saves it, runs `/clear`, and gives the fresh conversation your original task, the handover and the next steps. No copy-pasting, no re-explaining. Just Claude, picking up where it left off.

## Requirements

- Claude Code 2.1.319 or later (`claude --version`).
- macOS. Linux should work but is untested.
- Claude accounts in a Team organization work in **turn mode**: on Claude Code 2.1.319 a built-in plugin there runs before every installed plugin and skips the hooks Jeeves normally hands over with (Stop, SessionStart, compaction, system prompt). Jeeves notices after the first answer and uses the end of each answered turn instead (`/jeeves status`: `mode: full (turn)`). What turn mode does not give: the handover's facts have no scheduled crons (`not available in turn mode`); compaction ahead of time cannot be skipped, and a compaction is recognised only from the next context reading (a fall of more than 10,000 tokens), then handed over at the next turn end; the completion rules reach Claude as a hidden row in the conversation (at the task's first turn, after each continuation and compaction, and every 10 turns) instead of in the system prompt; on 2.1.319 that row can be missing from a turn's last request and from the first turn after `claude` starts, so a "done" claim may come a turn later (a wrong claim still never completes a task). See [Troubleshooting](docs/troubleshooting.md).
- Claude Code must let plugins run `/clear`. On 2.1.319 this works and is part of the typed plugin API, but it is not documented as a supported use and could change. If it stops working, Jeeves falls back to assisted mode (you type `/clear`, then `/jeeves continue`) and says so.
- Nothing else: no API key, no server, no other software. Jeeves makes no network calls.

## Install

At the Claude Code prompt:

```
/plugin install jeeves --marketplace nickycdk/jeeves
```

or from a shell: `claude plugin install jeeves --marketplace nickycdk/jeeves`. From a clone of this repository, give the clone's path instead: `claude plugin install jeeves --marketplace /path/to/jeeves`. A note that userConfig options are not yet set is fine: every setting is optional. Then, in any project, start `claude` and type `/jeeves status`; a fresh install answers `Jeeves  mode: full` and `No managed task. Start with /jeeves on`.

**Update:** `claude plugin update jeeves@jeeves` (third-party marketplaces do not update by themselves).

**Uninstall:** `claude plugin uninstall jeeves@jeeves`. This removes the plugin and its `enabledPlugins` entry in your settings; `claude plugin marketplace remove jeeves` also removes the marketplace entry. Your task files stay. Delete them first with `/jeeves purge --all`, or afterwards by deleting `~/Library/Application Support/Jeeves` (Linux: `~/.local/state/jeeves`).

## Quickstart

The same in Terminal, iTerm, Cursor's or VS Code's integrated terminal: Jeeves lives inside Claude Code, not in the terminal.

1. Open your project and start `claude`.
2. Type your task and work as usual. In a git repository, on a model with a context window of 200K tokens or more, Jeeves takes your first prompt as the task by itself (see [Auto-start](#auto-start)). The entry under the prompt shows `Jeeves ?/40%` until Claude's first reply, then `jeeves: 12%/40%`.
3. Anywhere else, type `/jeeves on` before your task. Jeeves answers `Jeeves on: task t_... Your next prompt is saved word for word as the task.` (the first time on a machine, plus three lines on where it keeps files and how to pause). Or `/jeeves on <goal>`: the goal is saved and sent as the first prompt.
4. Optional: `/jeeves check npm test` adds a command that proves the task is done, and `/jeeves dod <text>` a done criterion. Jeeves stores them as text and never runs them; Claude does, and Jeeves checks the result.
5. At 40% Jeeves takes over between turns: `jeeves: handover requested`, `... validated, starting fresh. Previous conversation: claude --resume <id>`, then the fresh conversation continues. The old conversation stays in Claude Code; resumed with that command, it can be read but cannot drive the task (`/jeeves status` there says `Owned by another session`). In full mode you type nothing, unless Claude asks for a permission as it would without Jeeves.

`/jeeves pause` stops handovers until `/jeeves resume`; `/jeeves off` ends the task (files kept).

## Auto-start

On a new install (0.3 and later) you can skip `/jeeves on`. Jeeves watches a session by itself when auto-start is on (below; a change applies at once) and all of these hold, checked once when the session starts:

- an interactive session (not `claude -p`, the SDK or a background agent), in full mode;
- inside a git repository (subfolders and linked worktrees count);
- a model whose context window is 200K tokens or more (since 0.3.1; 0.3.0 watched only windows above 200K). On a 200K window the default threshold of 40% is about 80K tokens, and a fresh conversation can already fill a fifth of the window: if the first reading is within 10 points of the threshold, the near-threshold rule below applies;
- a fresh conversation (not `--resume` or `--continue`).

The first such session shows once: `Jeeves watches long sessions here. At 40% context (~400K tokens) it saves a handover and continues in a fresh conversation.` Nothing is recorded until you type your first prompt; that prompt becomes the task, word for word, as after `/jeeves on`. Prompts from other plugins, the SDK or scheduled triggers never start one. `/jeeves status` shows `(auto)` for such a task, and for a session that is not watched the reason, such as `Auto off: not a git repository` (`--diagnose` lists them all).

An auto task works like any other, with these differences:
- if its first context reading is already within 10 points of the threshold (a large CLAUDE.md, a pasted log), Jeeves stops watching this session and says so; `/jeeves on` watches anyway;
- it does not hand over in its first 3 turns, unless the context is already 10 points past the threshold (50% with the default threshold);
- switching to a model with a window below 200K ends it, with a message (a switch from 1M to 200K keeps it, with its threshold);
- a `/clear` you type ends it (files kept) and your next prompt starts a new one; in a task you started with `/jeeves on`, `/clear` pauses as before, and no auto task starts for the rest of that session (a later session is watched again; the paused task waits for `/jeeves resume`). `/jeeves on <goal>` makes an auto task yours: the goal is saved as a new revision and `/clear` then pauses it;
- after a handover, if Claude ends the first turn of the fresh conversation by announcing its next step instead of taking it, Jeeves asks it once to carry on (or to say it is done, or what it needs from you). Only once per conversation, never after you typed in it, and never in a task you started with `/jeeves on`;
- if a session closes in the middle of a handover, the next fresh interactive session continues it by itself, whatever `autoRecover` says;
- if it ended without a single handover, its folder is deleted at a later session start, 7 days after its last change.

**Turning it off:** `/jeeves off` for the rest of this session, `/jeeves defaults auto off` for this project, `/jeeves auto off` everywhere (kept in the state folder, never in your Claude settings), or `/config` → Jeeves → Auto-start → `off`. The session wins over the project, the project over `/config`, `/config` (when set to `on` or `off`) over `/jeeves auto`. `/jeeves auto` shows the setting and which of these decided it. `/jeeves on` always works.

**A hint instead of silence:** a session Jeeves does not watch only because it was not turned on after an upgrade, is a resumed conversation, is outside git or started on a 200K window gets one line when its context reaches the point a watched one would be warned (35% with the default threshold): `Jeeves: this session is at 45%. /jeeves on would hand it over to a fresh conversation before it fills up. /jeeves auto off hides this.` Once per session; never under `-p` or after you turned auto-start off anywhere; after 3 hints in a row with no `/jeeves on` or `/jeeves auto on`, no more. No tokens, no files.

**Upgrading from 0.2:** nothing changes. Jeeves says once that it can now watch long sessions by itself, and keeps auto-start off until you type `/jeeves auto on`.

## What it does by itself, and what it does not

**It does:** watch the context figure (the one in the status line), wait for Claude to stop with nothing in flight, ask for a handover, check it (format, ids, size, no secrets, files named as verified exist, branch and HEAD match git, no "passed" claim for a command whose last run failed), save it with a SHA-256 next to the commits made since the task started and the last output lines of commands that failed and have not passed since, run `/clear` once, and send the continuation prompt. A message you type during a handover is held and quoted in the fresh conversation. When a task stops and needs you, or completes, Jeeves sends a notification through Claude Code's own notification setting.

**It does not:** run your commands or tests, change git (no commit, stash, checkout or reset, ever), touch your permissions or settings, send anything over the network, or answer permission prompts for you. It never claims a task is done without evidence: a task is completed only when Claude reports it with the checks you gave and Jeeves's record shows them passing, or when you confirm with `/jeeves done`.

**It stops and tells you** when: the handover fails its checks 3 times, 1 try and 2 retries (`NEEDS_REVIEW`; `/jeeves retry` asks again), the fresh conversation is already near the threshold (`POSSIBLE_LOOP`; `/jeeves retry` keeps working there), the handover limit is reached (`MAX_ROTATIONS`: 30 by default; `/jeeves limit <n>` raises it and `/jeeves resume` continues), work is still in flight after 3 stops or 20 minutes (`UNSAFE_BOUNDARY`), you interrupt the handover or type `/clear` yourself (in an auto task your `/clear` ends the task instead), the API reports a rate limit, login, billing or overload error, a disk write fails, or the repository moved or changed branch. `/jeeves status` says why, in one line, and what to type.

## Modes

`/jeeves status` (or `/jeeves` alone) always shows the mode, and ends with a `Try:` line naming the 2–3 commands that fit now, such as `Try: /jeeves later | off | help` during a warning.

- **full**: Jeeves runs `/clear` itself after a verified handover and continues the task in the fresh conversation. No keystroke is needed.
- **assisted**: used when this Claude Code cannot run `/clear` for a plugin (or refused it once). Jeeves never claims automatic rotation here. It saves the verified handover and asks you to run `/clear`, then `/jeeves continue`, which sends the task and handover into the fresh conversation.
- **full (turn)**: full, on an account where another plugin skips Jeeves's Stop hook (a Team account, see Requirements): the turn's end is the handover point, and the handover is asked for and the task continued with prompts Jeeves sends.
- **unsupported**: this Claude Code version is too old, or in turn mode Claude Code refused a prompt Jeeves sent; Jeeves stays off and says why.

## What you see

While a task is on, Jeeves keeps one entry under the prompt: `jeeves: 34%/40%` (context used / threshold) while it watches, or the current step in words (`jeeves: writing handover`, `jeeves: Paused by you. /jeeves resume`). In an auto-started task the entry stays empty until the context is within 15 points of the threshold (from 25% with a 40% threshold); `/jeeves` shows the full picture at any time. Your own status line is not changed. Each step of a handover adds one dim line to the transcript; Claude does not see these lines. Errors also show as a short notice.

## Data and privacy

Everything stays on your machine, in the state folder (`/jeeves status` shows it; never inside your repository unless you set `stateDir` there): your task prompt, the handovers with a git facts snapshot each, a redacted log of state changes and of the last 200 commands and edited file paths, and the last output lines (redacted) of up to 3 commands that failed and have not passed since. Never the transcript or file contents. With auto-start, recording begins at the first prompt you type in a watched session (on an upgrade from 0.2, only once you turn auto-start on). Known secret formats are masked. The full list, and what masking catches and misses, is in [PRIVACY.md](PRIVACY.md). Delete it with `/jeeves purge --all` (or `--task`, `--project`) or by deleting the folder.

## Commands

All are `/jeeves <command>`. Only commands you type yourself change a task; anything may read.

| Command | What it does |
|---|---|
| `on [goal]` | Start a managed task in this project. Without a goal, your next prompt is the task. In an auto task, `on <goal>` makes it yours: the goal is a new revision and a `/clear` then pauses it. |
| `off` | End the task and release it. Nothing is deleted. Auto-start stays off for the rest of this session. |
| `auto [on\|off]` | Show whether auto-start is on and which setting decided it; `on`/`off` sets it everywhere (in `auto.json` in the state folder, never in Claude settings). Says so when the `/config` row overrides it. |
| `pause` / `resume` | No handover until `resume`. Kept across restarts. `resume` also continues after a `/clear` you typed, a rate limit or a disk error. |
| `rotate` | Hand over now, at the next safe stop. |
| `later` | Skip the next handover: the threshold moves up 10 points and the warning comes again 5 points before. Repeatable up to 90%, or 5 points below the point where Claude Code would compact, when that is lower. A handover already under way goes on (`/jeeves pause` stops it). |
| `threshold <n>` | Hand over at n% context (20 to 90; default 40). Warns 5 points before. |
| `limit <n>` | The most handovers this task may make (1 to 100; default 30). At the limit the task pauses; a higher limit and `/jeeves resume` continue it. |
| `defaults` | This project's defaults for new tasks. `defaults threshold <n>`, `defaults limit <n>`, `defaults check <cmd>` (add one; up to 20), `defaults auto on\|off` (auto-start for this project), `defaults clear`. Applied at the next `/jeeves on` in this project (auto-start at once); running tasks are not changed. Kept in the state folder, never in your repository. |
| `task` | Show the original prompt, every change since and the Definition of Done. |
| `dod <text>` | Add a done criterion (a new task revision, never an edit). |
| `check <cmd>` | Add a verification command (stored as text, never run by Jeeves). |
| `done` | Confirm by hand a task Claude says is done but Jeeves could not prove (`Claude says done. Confirm: /jeeves done`; recorded as your decision). |
| `retry` | After `Handover failed checks`: ask for the handover again. After `Fresh session too full`: keep working in this conversation without a handover in it. Counts toward the 2 failed handovers in a row. |
| `continue` | Assisted mode: after `/clear`, continue the task in the fresh conversation. |
| `recover [--relink]` | Continue a task an earlier session left interrupted (crash, closed terminal). `--relink` continues after a branch switch or a moved folder. |
| `status [--diagnose]` | Mode, task (`auto` or `explicit`), state, context, threshold, rotations, state folder; with no task of this session's own, whether auto-start watches it and if not why. `--diagnose`: a redacted report for a bug report, with every reason. |
| `stats` | For this project and the current task: tasks, rotations, sessions, average context at rotation, context cleared by rotations (points, and tokens when the window is known), cost where Claude Code reports it (else "unknown"), and stops by reason. Reads only. |
| `handover` | The last handover of the task status shows: its file, Current goal and first 3 next actions, at 40 columns. Reads only; a missing or changed file is said, not printed. |
| `history [--full]` | The last 20 state changes and a rotations summary. `--full` adds, per rotation, the session's context at start and end, its cost when known, why it ended, and the handover file with its first next actions (a missing or changed file is said, not printed). |
| `purge --task <id> \| --project \| --all` | List the task folders that would be deleted and give a code. A running task is never deleted. |
| `purge confirm <code>` | Delete them (within 2 minutes; a wrong code cancels). |
| `help` | The command list. |

If another plugin already owns `/jeeves`, Jeeves registers `/relay` instead and says so.

## Settings

In Claude Code: `/plugin configure jeeves@jeeves`. From a shell: `claude plugin configure jeeves@jeeves` shows them; set one with `claude plugin install jeeves@jeeves --config autoRecover=true`.

| Setting | Default | What it does |
|---|---|---|
| `stateDir` | empty: `~/Library/Application Support/Jeeves` (Linux: `~/.local/state/jeeves`) | Absolute path for task state and handovers. The default is never inside a repository (Jeeves refuses one that would be); a path you set is used as given. |
| `autoRecover` | off | At session start, continue an interrupted task by itself instead of asking you to type `/jeeves recover`. Auto tasks do this whatever the setting says. |
| `autoStart` (Auto-start) | `default` | `default` follows `/jeeves auto` (on for a new install, off after an upgrade from 0.2); `on` or `off` wins over `/jeeves auto`. A project's `/jeeves defaults auto` and `/jeeves off` in a session still win. See [Auto-start](#auto-start). |

**Checks.** Verification commands (`/jeeves check npm test`) are what Claude must have run, with success, before Jeeves accepts the task as done. Jeeves stores them as text and never runs them. When a task starts with none, `/jeeves on` suggests up to 4 from your repository: `package.json` scripts named `test`, `lint`, `typecheck` or `check` (or `test:unit` and the like), and `test`/`lint` targets in a top-level `Makefile`. Nothing is added until you type the command. Other ecosystems (pyproject, Cargo) are not read yet.

### Threshold and handover limit

Two numbers decide when Jeeves hands over and how often. Both have a default, and you can change both for one task or for every new task in a project.

| | What it is | Default | This task | Every new task in this project |
|---|---|---|---|---|
| **Threshold** | How full the context may get, in percent of the model's window, before Jeeves asks for a handover. It warns 5 points earlier. | 40% | `/jeeves threshold <n>` (20 to 90) | `/jeeves defaults threshold <n>` |
| **Handover limit** | How many handovers one task may make. At the limit the task pauses (`MAX_ROTATIONS`) and waits for you. | 30 | `/jeeves limit <n>` (1 to 100) | `/jeeves defaults limit <n>` |

**How the threshold works.** 40% is 80K tokens on a 200K window and 400K on a 1M window; `/jeeves status` shows yours in tokens. A fresh conversation is never empty: the system prompt, your `CLAUDE.md` and the tool list are already there, usually 15 to 20% of a 200K window. What is left between that and the threshold is the room each conversation has to work in, so on a 200K window a long task hands over often (in a measured run, 10 handovers for 40 small modules at a 50% threshold). A higher threshold means fewer handovers and a fuller context at each one; Claude Code compacts by itself at about 83% of a 200K window, and a handover should come well before that. A lower threshold means more handovers and more room to spare. The threshold is set when the task starts; switching models later does not change it. Each `/jeeves later` moves it up 10 points for the task, never past 90% or 5 points below Claude Code's compaction point.

**When the fresh conversation is already close to the threshold.** If a new conversation starts within 10 points of the threshold (30% or more with the default), handing over again would free nothing. Jeeves then stops instead of looping: an auto-started session is not watched (`not watching this session, context already at …`), and after a handover the task waits with `POSSIBLE_LOOP`. This happens with a very large `CLAUDE.md` or many MCP tools on a 200K window. Raise the threshold (`/jeeves threshold 60`), or trim what loads at the start.

**How the limit works.** It is a backstop against a task that never ends, not a budget: a loop is caught long before it by the check above and by the stop after 2 failed handovers in a row. When a task reaches it, Jeeves says `Paused: this task reached 30 rotations, the limit (MAX_ROTATIONS)`. Nothing is lost. Type `/jeeves limit 60`, then `/jeeves resume`, and it carries on; or finish in the conversation you are in. `/jeeves status` shows the count as `Rotations: 12/30`.

**Examples.**

```text
/jeeves threshold 60            this task hands over at 60% (warns at 55%)
/jeeves limit 50                this task may make 50 handovers
/jeeves defaults threshold 35   new tasks in this project hand over at 35%
/jeeves defaults limit 80       new tasks in this project may make 80 handovers
/jeeves defaults                shows this project's defaults
/jeeves defaults clear          back to Jeeves's own (40%, 30 handovers)
```

A task's own setting wins over the project's, and the project's over Jeeves's default. Project defaults also apply to auto-started tasks. Running tasks are never changed by `/jeeves defaults`.

**Not configurable:** 3 handover attempts (1 + 2 retries), 2 failed handovers in a row, 3 unsafe stops or 20 minutes of waiting for background work before pausing, handovers up to 12,000 characters.

Per project you can also keep check commands: `/jeeves defaults check <cmd>` adds one to every new task there.

## Troubleshooting

To try Jeeves by hand, scenario by scenario, see [docs/testing.md](docs/testing.md). The common cases, with what to type, are in [docs/troubleshooting.md](docs/troubleshooting.md). For a bug report, paste the output of `/jeeves status --diagnose`.

## FAQ

**Does it work with `--resume`, `--continue` or forks?** Jeeves never uses them; it only runs `/clear` in your current session. You can still use them yourself; a task belongs to one session at a time.

**What if Claude Code updates and breaks something?** Jeeves checks the version and its capabilities at every start. If `/clear` stops working for plugins it falls back to assisted mode and says so; it never pretends to rotate.

**Will the fresh conversation redo work?** The continuation prompt lists what is done, which files changed, which checks ran with what result and what not to repeat. In the M4 gate runs a six-step task completed across 5 rotations with no step done twice ([evidence](../docs/done/evidence/m0-m7/m4-e2e/RESULT.md)).

**Two terminals in the same project?** Each session gets its own task; one session cannot change another's (`LOCK_HELD`).

**Does it cost anything?** Jeeves itself is free and makes no model calls. A handover is one extra Claude turn.

**Can I see how it works?** [docs/architecture.md](docs/architecture.md) and the state machine in [docs/state-machine.md](docs/state-machine.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Licence: MIT. Jeeves is not made by or affiliated with Anthropic.
