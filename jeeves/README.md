# Jeeves

Claude Code has a context limit. Your momentum shouldn't. Jeeves is your friendly butler for long Claude Code tasks: when the context starts to fill up, he saves a verified handover, starts a fresh conversation in the same terminal and carries on with the task there. You keep building.

**Status: public beta 0.3.5 (see the [CHANGELOG](https://github.com/nickycdk/jeeves/blob/main/jeeves/CHANGELOG.md)).** It works on Claude Code 2.1.319 and later on macOS; see [Compatibility](https://github.com/nickycdk/jeeves/blob/main/jeeves/docs/compatibility.md).

## The problem

You know the feeling. A long task in one Claude Code conversation slowly fills the context window. Past the middle, answers get slower, earlier details slip away, and compaction summarises your work in ways you do not control. Starting fresh by hand means writing a summary, running `/clear`, pasting it back and explaining the task all over again.

Jeeves takes that job off your hands, inside your normal terminal session. When the context reaches a threshold you choose (default 40% of the window), he asks Claude for a handover, checks it against git and his own record of what ran, saves it, runs `/clear`, and gives the fresh conversation your original task, the handover and the next steps. No copy-pasting, no re-explaining. Just Claude, picking up where it left off.

## Requirements

- Claude Code 2.1.319 or later (`claude --version`), on macOS. Linux should work but is untested.
- Nothing else: no API key, no server, no other software. Jeeves makes no network calls.
- On a Claude account in a Team organization, Jeeves runs in **turn mode**, with a few limits: see [Turn mode](https://github.com/nickycdk/jeeves/blob/main/jeeves/docs/turn-mode.md).

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
4. Optional: `/jeeves check npm test` adds a command that proves the task is done, and `/jeeves dod <text>` a done criterion. Jeeves stores them as text and never runs them; Claude does, and Jeeves checks the result. When a task starts with none, `/jeeves on` suggests some from your repository (see [Checks](#checks)).
5. At 40% Jeeves takes over between turns: `jeeves: handover requested`, `... validated, starting fresh. Previous conversation: claude --resume <id>`, then the fresh conversation continues. The old conversation stays in Claude Code; resumed with that command, it can be read but cannot drive the task (`/jeeves status` there says `Owned by another session`). In full mode you type nothing, unless Claude asks for a permission as it would without Jeeves.

**Pause or stop:** `/jeeves pause` stops handovers until `/jeeves resume`; `/jeeves off` ends the task (files kept); `/jeeves auto off` stops Jeeves from watching sessions by itself.

## What you see

While a task is on, Jeeves keeps one entry under the prompt: `jeeves: 34%/40%` (context used / threshold) while it watches, or the current step in words (`jeeves: writing handover`, `jeeves: Paused by you. /jeeves resume`). In an auto-started task the entry stays empty until the context is within 15 points of the threshold (from 25% with a 40% threshold); `/jeeves` shows the full picture at any time. Your own status line is not changed. Each step of a handover adds one dim line to the transcript; Claude does not see these lines. Errors also show as a short notice.

## Auto-start

On a new install Jeeves watches an interactive session by itself when it runs in a git repository, on a model with a window of 200K tokens or more, in a fresh conversation. Your first prompt becomes the task, word for word; nothing is recorded before it. Turn it off with `/jeeves off` (this session), `/jeeves defaults auto off` (this project) or `/jeeves auto off` (everywhere). The full rules, how an auto task differs and the one-time hint are in [Auto-start](https://github.com/nickycdk/jeeves/blob/main/jeeves/docs/auto-start.md).

## What it does by itself, and what it does not

**It does:** watch the context figure (the one in the status line), wait for Claude to stop with nothing in flight, ask for a handover, check it (format, ids, size, no secrets, files named as verified exist, branch and HEAD match git, no "passed" claim for a command whose last run failed), save it with a SHA-256 next to the commits made since the task started and the last output lines of commands that failed and have not passed since, run `/clear` once, and send the continuation prompt. A message you type during a handover is held and quoted in the fresh conversation. When a task stops and needs you, or completes, Jeeves sends a notification through Claude Code's own notification setting.

**It does not:** run your commands or tests, change git (no commit, stash, checkout or reset, ever), touch your permissions or settings, send anything over the network, or answer permission prompts for you. It never claims a task is done without evidence: a task is completed only when Claude reports it with the checks you gave and Jeeves's record shows them passing, or when you confirm with `/jeeves done`.

**It stops and tells you** when: the handover fails its checks 3 times, 1 try and 2 retries (`NEEDS_REVIEW`; `/jeeves retry` asks again), the fresh conversation is already near the threshold (`POSSIBLE_LOOP`; `/jeeves retry` keeps working there), the handover limit is reached (`MAX_ROTATIONS`: 30 by default; `/jeeves limit <n>` raises it and `/jeeves resume` continues), work is still in flight after 3 stops or 20 minutes (`UNSAFE_BOUNDARY`), you interrupt the handover or type `/clear` yourself (in an auto task your `/clear` ends the task instead), the API reports a rate limit, login, billing or overload error, a disk write fails, or the repository moved or changed branch. `/jeeves status` says why, in one line, and what to type.

## What the mod does on your machine

Jeeves is one Claude Code mod (`hooks/register.ts`); every use of Claude Code's `$` sits in that file. In detail:

- **Programs it runs** (`process.run`, always a fixed list of arguments, never through a shell): `git` to read the repository (`rev-parse`, `status`, `diff --name-only`, `log`, `cat-file -e`, `--version`; it never commits, stashes, checks out or resets); `mkdir`, `chmod`, `mv`, `cp`, `rm` and `rmdir` inside its own state folder only; `uname` to pick the state folder for your system and for `/jeeves status --diagnose`; `true` once at start, to check that programs can run, and `test -w` in `--diagnose`, to check that the state folder is writable.
- **Files it writes** (`fs.write`): only in its state folder (`~/Library/Application Support/Jeeves` on macOS, `~/.local/state/jeeves` on Linux, or the `stateDir` you set). It never writes build, start-up, settings or instruction files. It also keeps a few flags in Claude Code's plugin store (`store.set`).
- **Slash command it runs** (`command.run`): `/clear`, once after a verified handover in full mode, to start the fresh conversation. Nothing else.
- **Prompts it submits** (`prompt.submit`): the continuation prompt for the fresh conversation (your task prompt, the saved handover, and any message you typed during the handover), the handover request and a short "carry on" nudge (fixed texts), and the goal you give with `/jeeves on <goal>`. They go to the Claude Code session you are in, like a prompt you type. Two notes are added to the conversation the same way (`session.append`): the "finish what is in flight" note before a handover and how to report completion.
- **What it reads:** the context usage figure, the session id and turn count (`session.*`), the result of each tool call for its ledger, and its own state files. It does not read the transcript. Of your repository's files it reads only these, and only at `/jeeves on` when the task has no checks, to suggest some: `package.json`, `Makefile`, `justfile` (or `Justfile`, `.justfile`) and `pyproject.toml`, up to 256 KB each. It checks whether `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`, `uv.lock`, `poetry.lock`, `Cargo.toml` and `go.mod` exist, without opening them. Nothing from these files is stored.
- **Hooks that see other calls:** `tool.call` records how each tool call ended and returns the call unchanged. `prompt.compose` adds one section to the system prompt while a task runs (how to report completion). `classic.SessionStart` adds the saved handover as context to the fresh conversation after Jeeves's own `/clear`, and otherwise passes the event on unchanged. `classic.Stop` may ask Claude for the handover before it stops. `session.compact` skips automatic compaction while a task is managed (Jeeves hands over instead). `prompt.submit` holds a message you type during a handover. None of them answers a permission prompt, changes a permission mode or edits settings.
- **Network:** none. Nothing is sent off your machine. Notifications go through Claude Code's own `ui.notify` (your notification setting decides where).
- **Development files:** `package.json` lists TypeScript as a development dependency only, for type checks; Jeeves has no runtime dependencies and runs from its TypeScript source. `scripts/` and `tests/` are run by developers by hand, never by the plugin. `scripts/compat.mjs` installs Claude Code versions from npm into a scratch folder to test compatibility, with a logged-out, empty configuration.

## Modes

`/jeeves status` (or `/jeeves` alone) always shows the mode, and ends with a `Try:` line naming the 2–3 commands that fit now, such as `Try: /jeeves later | off | help` during a warning.

- **full**: Jeeves runs `/clear` itself after a verified handover and continues the task in the fresh conversation. No keystroke is needed.
- **assisted**: used when this Claude Code cannot run `/clear` for a plugin (or refused it once). Jeeves never claims automatic rotation here. It saves the verified handover and asks you to run `/clear`, then `/jeeves continue`, which sends the task and handover into the fresh conversation.
- **full (turn)**: full, on an account where another plugin skips Jeeves's Stop hook (a Team account, see [Turn mode](https://github.com/nickycdk/jeeves/blob/main/jeeves/docs/turn-mode.md)): the turn's end is the handover point, and the handover is asked for and the task continued with prompts Jeeves sends.
- **unsupported**: this Claude Code version is too old, or in turn mode Claude Code refused a prompt Jeeves sent; Jeeves stays off and says why.

## Data and privacy

Everything stays on your machine, in the state folder (`/jeeves status` shows it; never inside your repository unless you set `stateDir` there): your task prompt, the handovers with a git facts snapshot each, a redacted log of state changes and of the last 200 commands and edited file paths, and the last output lines (redacted) of up to 3 commands that failed and have not passed since. Never the transcript or file contents. With auto-start, recording begins at the first prompt you type in a watched session (on an upgrade from 0.2, only once you turn auto-start on). Known secret formats are masked. The full list, and what masking catches and misses, is in [PRIVACY.md](https://github.com/nickycdk/jeeves/blob/main/jeeves/PRIVACY.md). Delete it with `/jeeves purge --all` (or `--task`, `--project`) or by deleting the folder.

## Commands

All are `/jeeves <command>`. The ones you will use most:

| Command | What it does |
|---|---|
| `on [goal]` | Start a managed task in this project. Without a goal, your next prompt is the task. |
| `off` | End the task and release it. Nothing is deleted. |
| `status` | Mode, task, state, context, threshold, rotations, state folder. `status --diagnose` gives a redacted report for a bug report. |
| `pause` / `resume` | No handover until `resume`. Kept across restarts. |
| `rotate` | Hand over now, at the next safe stop. |
| `check <cmd>` | Add a verification command (stored as text, never run by Jeeves). |
| `done` | Confirm by hand a task Claude says is done but Jeeves could not prove. |

The rest (`later`, `threshold`, `limit`, `defaults`, `auto`, `task`, `dod`, `retry`, `continue`, `recover`, `history`, `handover`, `stats`, `purge`, `help`) are in [Commands](https://github.com/nickycdk/jeeves/blob/main/jeeves/docs/commands.md). `/jeeves help` lists them all, the everyday ones first.

## Settings

In Claude Code: `/plugin configure jeeves@jeeves`. From a shell: `claude plugin configure jeeves@jeeves` shows them; set one with `claude plugin install jeeves@jeeves --config autoRecover=true`.

| Setting | Default | What it does |
|---|---|---|
| `stateDir` | empty: `~/Library/Application Support/Jeeves` (Linux: `~/.local/state/jeeves`) | Absolute path for task state and handovers. The default is never inside a repository (Jeeves refuses one that would be); a path you set is used as given. |
| `autoRecover` | off | At session start, continue an interrupted task by itself instead of asking you to type `/jeeves recover`. Auto tasks do this whatever the setting says. |
| `autoStart` (Auto-start) | `default` | `default` follows `/jeeves auto` (on for a new install, off after an upgrade from 0.2); `on` or `off` wins over `/jeeves auto`. A project's `/jeeves defaults auto` and `/jeeves off` in a session still win. See [Auto-start](https://github.com/nickycdk/jeeves/blob/main/jeeves/docs/auto-start.md). |

### Checks

Verification commands (`/jeeves check npm test`) are what Claude must have run, with success, before Jeeves accepts the task as done. Jeeves stores them as text and never runs them. When a task starts with none, `/jeeves on` suggests up to 4 from your repository, at most 2 from each source, in this order:

- `test` and `lint` targets in a top-level `Makefile` (`make test`) and recipes in a `justfile` (`just test`);
- `package.json` scripts named `test`, `lint`, `typecheck` or `check` (or `test:unit` and the like), run with the package manager your lockfile or `packageManager` field names: `npm test`, `pnpm test`, `yarn test` or `bun run test`;
- `pytest`, `ruff check .` and `mypy` when `pyproject.toml` lists them as dependencies (an optional extra does not count: `uv run` does not install extras), run through `uv run` (with `uv.lock`) or `poetry run` (with `poetry.lock`). Without either lockfile nothing is suggested for Python: the tools usually sit in a virtualenv that is not active, and a check that fails blocks "done";
- `cargo test` and `cargo clippy` with a `Cargo.toml`, `go test ./...` and `go vet ./...` with a `go.mod`.

Nothing is added until you type the command.

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

To try Jeeves by hand, scenario by scenario, see the [testing guide](https://github.com/nickycdk/jeeves/blob/main/jeeves/docs/testing.md). The common cases, with what to type, are in [Troubleshooting](https://github.com/nickycdk/jeeves/blob/main/jeeves/docs/troubleshooting.md). For a bug report, paste the output of `/jeeves status --diagnose`.

## FAQ

**Does it work with `--resume`, `--continue` or forks?** Jeeves never uses them; it only runs `/clear` in your current session. You can still use them yourself; a task belongs to one session at a time.

**What if Claude Code updates and breaks something?** Jeeves checks the version and its capabilities at every start. Running `/clear` from a plugin works on 2.1.319 and is part of the typed plugin API, but it is not documented as a supported use and could change. If it stops working, Jeeves falls back to assisted mode (you type `/clear`, then `/jeeves continue`) and says so; it never pretends to rotate.

**Will the fresh conversation redo work?** The continuation prompt lists what is done, which files changed, which checks ran with what result and what not to repeat. In the M4 gate runs a six-step task completed across 5 rotations with no step done twice ([evidence](https://github.com/nickycdk/jeeves/blob/main/docs/done/evidence/m0-m7/m4-e2e/RESULT.md)).

**Two terminals in the same project?** Each session gets its own task; one session cannot change another's (`LOCK_HELD`).

**Does it cost anything?** Jeeves itself is free and makes no model calls. A handover is one extra Claude turn.

**Can I see how it works?** [Architecture](https://github.com/nickycdk/jeeves/blob/main/jeeves/docs/architecture.md) and the [state machine](https://github.com/nickycdk/jeeves/blob/main/jeeves/docs/state-machine.md).

## Contributing

See [CONTRIBUTING.md](https://github.com/nickycdk/jeeves/blob/main/jeeves/CONTRIBUTING.md). Licence: MIT. Jeeves is not made by or affiliated with Anthropic.
