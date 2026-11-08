# Jeeves

A session-continuity plugin for Claude Code: when a long task fills the context, Jeeves saves a verified handover, starts a fresh conversation in the same terminal and continues the task there.

**Status: pre-release (0.0.0).** It works on Claude Code 2.1.319 on macOS; see [Compatibility](docs/compatibility.md). Not published yet.

## The problem

A long task in one Claude Code conversation slowly fills the context window. Past the middle, answers get slower, earlier details get lost, and compaction summarises your work in ways you do not control. Starting a fresh conversation by hand means writing a summary, running `/clear`, pasting the summary back and explaining the task again.

Jeeves does that for you, inside your normal terminal session. At a threshold you choose (default 50%), it asks Claude for a handover, checks it against git and its own record of what ran, saves it, runs `/clear`, and gives the fresh conversation your original task, the handover and the next steps. The task carries on.

<!-- Demo GIF: recorded with the v0.1.0 evidence pack (ST-9.2). -->

## Requirements

- Claude Code 2.1.319 or later (`claude --version`).
- macOS. Linux should work but is untested.
- Nothing else: no API key, no server, no other software. Jeeves makes no network calls.

## Install

At the Claude Code prompt:

```
/plugin install jeeves --marketplace <owner>/jeeves
```

or from a shell: `claude plugin install jeeves --marketplace <owner>/jeeves`. From a clone of this repository, give the clone's path instead: `claude plugin install jeeves --marketplace /path/to/jeeves`. (`<owner>` is set when the repository is published.) The note "2 userConfig options not yet set" is fine: both settings are optional. Then, in any project, start `claude` and type `/jeeves status`; a fresh install answers `Jeeves  mode: full` and `No managed task. Start with /jeeves on`.

**Update:** `claude plugin update jeeves@jeeves` (third-party marketplaces do not update by themselves).

**Uninstall:** `claude plugin uninstall jeeves@jeeves`. This removes the plugin and its `enabledPlugins` entry in your settings; `claude plugin marketplace remove jeeves` also removes the marketplace entry. Your task files stay. Delete them first with `/jeeves purge --all`, or afterwards by deleting `~/Library/Application Support/Jeeves` (Linux: `~/.local/state/jeeves`).

## Quickstart

The same in Terminal, iTerm, Cursor's or VS Code's integrated terminal: Jeeves lives inside Claude Code, not in the terminal.

1. Open your project and start `claude`.
2. Type `/jeeves on`. Jeeves answers `Jeeves on: task t_... Your next prompt is saved word for word as the task.` (the first time on a machine, plus three lines on where it keeps files and how to pause). Or `/jeeves on <goal>`: the goal is saved and sent as the first prompt.
3. Optional: `/jeeves check npm test` adds a command that proves the task is done, and `/jeeves dod <text>` a done criterion. Jeeves stores them as text and never runs them; Claude does, and Jeeves checks the result.
4. Type your task and work as usual. The entry under the prompt shows `Jeeves ?/50%` until Claude's first reply, then `Jeeves 12%/50%`.
5. At 50% Jeeves takes over between turns: `Jeeves: handover requested`, `... validated, starting fresh`, then the fresh conversation continues. In full mode you type nothing, unless Claude asks for a permission as it would without Jeeves.

`/jeeves pause` stops handovers until `/jeeves resume`; `/jeeves off` ends the task (files kept).

## What it does by itself, and what it does not

**It does:** watch the context figure (the one in the status line), wait for Claude to stop with nothing in flight, ask for a handover, check it (format, ids, size, no secrets, files named as verified exist, branch and HEAD match git, no "passed" claim for a command whose last run failed), save it with a SHA-256, run `/clear` once, and send the continuation prompt. A message you type during a handover is held and quoted in the fresh conversation.

**It does not:** run your commands or tests, change git (no commit, stash, checkout or reset, ever), touch your permissions or settings, send anything over the network, or answer permission prompts for you. It never claims a task is done without evidence: a task is completed only when Claude reports it with the checks you gave and Jeeves's record shows them passing, or when you confirm with `/jeeves done`.

**It stops and tells you** when: the handover fails its checks 3 times, 1 try and 2 retries (`NEEDS_REVIEW`), the fresh conversation is already near the threshold (`POSSIBLE_LOOP`), 10 rotations are reached (`MAX_ROTATIONS`), work is still in flight after 3 stops or 20 minutes (`UNSAFE_BOUNDARY`), you interrupt the handover or type `/clear` yourself, the API reports a rate limit, login, billing or overload error, a disk write fails, or the repository moved or changed branch. `/jeeves status` says why, in one line, and what to type.

## Modes

`/jeeves status` always shows the mode.

- **full**: Jeeves runs `/clear` itself after a verified handover and continues the task in the fresh conversation. No keystroke is needed.
- **assisted**: used when this Claude Code cannot run `/clear` for a plugin (or refused it once). Jeeves never claims automatic rotation here. It saves the verified handover and asks you to run `/clear`, then `/jeeves continue`, which sends the task and handover into the fresh conversation.
- **unsupported**: this Claude Code version is too old; Jeeves stays off and says which version it needs.

## What you see

While a task is on, Jeeves keeps one entry under the prompt: `Jeeves 34%/50%` (context used / threshold) while it watches, or the current step in words (`Jeeves: writing handover`, `Jeeves: paused (USER_PAUSE)`). Your own status line is not changed. Each step of a handover adds one dim line to the transcript; Claude does not see these lines. Errors also show as a short notice.

## Data and privacy

Everything stays on your machine, in the state folder (`/jeeves status` shows it; never inside your repository unless you set `stateDir` there): your task prompt, the handovers with a git facts snapshot each, a redacted log of state changes and of the last 200 commands and edited file paths. Never the transcript or file contents. Known secret formats are masked. The full list, and what masking catches and misses, is in [PRIVACY.md](PRIVACY.md). Delete it with `/jeeves purge --all` (or `--task`, `--project`) or by deleting the folder.

## Commands

All are `/jeeves <command>`. Only commands you type yourself change a task; anything may read.

| Command | What it does |
|---|---|
| `on [goal]` | Start a managed task in this project. Without a goal, your next prompt is the task. |
| `off` | End the task and release it. Nothing is deleted. |
| `pause` / `resume` | No handover until `resume`. Kept across restarts. `resume` also continues after a `/clear` you typed, a rate limit or a disk error. |
| `rotate` | Hand over now, at the next safe stop. |
| `threshold <n>` | Hand over at n% context (20 to 90; default 50). Warns 5 points before. |
| `task` | Show the original prompt, every change since and the Definition of Done. |
| `dod <text>` | Add a done criterion (a new task revision, never an edit). |
| `check <cmd>` | Add a verification command (stored as text, never run by Jeeves). |
| `done` | Confirm by hand a task stopped as `DOD_UNMET` (recorded as your decision). |
| `continue` | Assisted mode: after `/clear`, continue the task in the fresh conversation. |
| `recover [--relink]` | Continue a task an earlier session left interrupted (crash, closed terminal). `--relink` continues after a branch switch or a moved folder. |
| `status [--diagnose]` | Mode, task, state, context, threshold, rotations, state folder. `--diagnose`: a redacted report for a bug report. |
| `history` | The last 20 state changes and a rotations summary. |
| `purge --task <id> \| --project \| --all` | List the task folders that would be deleted and give a code. A running task is never deleted. |
| `purge confirm <code>` | Delete them (within 2 minutes; a wrong code cancels). |
| `help` | The command list. |

If another plugin already owns `/jeeves`, Jeeves registers `/relay` instead and says so.

## Settings

In Claude Code: `/plugin configure jeeves@jeeves`. From a shell: `claude plugin configure jeeves@jeeves` shows them; set one with `claude plugin install jeeves@jeeves --config autoRecover=true`.

| Setting | Default | What it does |
|---|---|---|
| `stateDir` | empty: `~/Library/Application Support/Jeeves` (Linux: `~/.local/state/jeeves`) | Absolute path for task state and handovers. The default is never inside a repository (Jeeves refuses one that would be); a path you set is used as given. |
| `autoRecover` | off | At session start, continue an interrupted task by itself instead of asking you to type `/jeeves recover`. |

Per task: `/jeeves threshold <n>` (default 50%). Fixed limits: 10 rotations per task, 3 handover attempts (1 + 2 retries), 2 failed rotations in a row, 3 unsafe stops or 20 minutes before pausing, handovers up to 12,000 characters.

## Troubleshooting

The common cases, with what to type, are in [docs/troubleshooting.md](docs/troubleshooting.md). For a bug report, paste the output of `/jeeves status --diagnose`.

## FAQ

**Does it work with `--resume`, `--continue` or forks?** Jeeves never uses them; it only runs `/clear` in your current session. You can still use them yourself; a task belongs to one session at a time.

**What if Claude Code updates and breaks something?** Jeeves checks the version and its capabilities at every start. If `/clear` stops working for plugins it falls back to assisted mode and says so; it never pretends to rotate.

**Will the fresh conversation redo work?** The continuation prompt lists what is done, which files changed, which checks ran with what result and what not to repeat. In the M4 gate runs a six-step task completed across 5 rotations with no step done twice ([evidence](../docs/plans/evidence/m4-e2e/RESULT.md)).

**Two terminals in the same project?** Each session gets its own task; one session cannot change another's (`LOCK_HELD`).

**Does it cost anything?** Jeeves itself is free and makes no model calls. A handover is one extra Claude turn.

**Can I see how it works?** [docs/architecture.md](docs/architecture.md) and the state machine in [docs/state-machine.md](docs/state-machine.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Licence: MIT. Jeeves is not made by or affiliated with Anthropic.
