# Jeeves

**Long Claude Code tasks, without the context running out.** Jeeves is a plugin for Claude Code. When a long task fills the context window, it saves a verified handover, starts a fresh conversation in the same terminal and carries on with the task there. You keep working; you don't write summaries or paste anything back.

**Status:** public beta 0.3.1, with auto-start on 1M and 200K windows (release candidate, not published yet; see the [CHANGELOG](jeeves/CHANGELOG.md)). Claude Code 2.1.319 or later, macOS, tested in Cursor's terminal too. On Claude accounts in a Team organization a built-in plugin skips Jeeves's hooks; 0.3 hands over there too, in turn mode (0.2.0 turned itself off). No API key, no server, no network calls. Not made by or affiliated with Anthropic.

## How it works

1. You type `/jeeves on`, then your task, and work as usual. On a new install Jeeves can also start by itself: in a git repository, on a model whose context window is 200K tokens or more (0.3.1 and later; 0.3.0: above 200K), your first typed prompt in a fresh session becomes the task (`/jeeves auto off` turns this off; an upgrade from 0.2 keeps it off until `/jeeves auto on`). [Auto-start](jeeves/README.md#auto-start) has the details.
2. When the context reaches your threshold (default 50%, or 40% on models with a context window above 200K), Jeeves waits until Claude has stopped with nothing still running, then asks Claude for a handover.
3. It checks the handover against git and its own record of what ran: branch and commit match, files named really exist, no test is claimed as passed when its last run failed, no secrets. A handover that fails is sent back with the reasons; after three tries Jeeves stops and asks you.
4. It saves the handover, runs `/clear`, and gives the fresh conversation your original task, the handover and the next steps. The task continues, without a keystroke from you. If Claude ends that first fresh turn by only announcing its next step, an auto task gets one prompt to carry on (0.3.1).

Jeeves never runs your commands, never changes git, never answers permission prompts for you, and never marks a task done without evidence.

## Install

At the Claude Code prompt:

```
/plugin install jeeves --marketplace nickycdk/jeeves
```

Then, in any project, start `claude` and type `/jeeves status`. A fresh install answers `Jeeves  mode: full` and `No managed task. Start with /jeeves on`.

The repository is private for now, so that line works only for people with access. From a clone instead: `claude plugin install jeeves --marketplace /path/to/this/repo`. Update, uninstall and settings: see the [full README](jeeves/README.md#install).

**Trying it out?** [docs/testing.md](jeeves/docs/testing.md) walks through seven short scenarios (a forced handover, completion with proof, auto-start, your own `/clear`, crash recovery, the everyday commands, the carry-on prompt), what each should show, and what to send back.

## Use it

```
/jeeves on                   start a managed task; your next prompt is saved as the task
/jeeves check npm test       optional: a command that proves the task is done
<your task>                  work as usual; the entry under the prompt shows "Jeeves 12%/50%"
```

At the threshold you'll see `Jeeves: handover requested`, then `Jeeves: handover validated, starting fresh`, and the fresh conversation picks up the task.

| Command | What it does |
|---|---|
| `/jeeves on [goal]` | Start a managed task. Without a goal, your next prompt is the task |
| `/jeeves` or `/jeeves status` | Mode, task, context, threshold, rotations, why it stopped if it did, whether this session is watched, and a `Try:` line with the commands that fit now |
| `/jeeves threshold <n>` | Hand over at n% context (20 to 90) |
| `/jeeves defaults` | This project's defaults for new tasks: `defaults threshold <n>`, `defaults check <cmd>`, `defaults clear` |
| `/jeeves rotate` | Hand over now, at the next safe stop |
| `/jeeves later` | Skip the next handover (threshold +10, up to a cap below auto-compaction) |
| `/jeeves pause` / `resume` | Stop handovers for a while |
| `/jeeves recover` | Continue a task a crashed or closed session left behind |
| `/jeeves retry` | Try again after a handover failed its checks or a possible loop |
| `/jeeves stats` | Rotations, context cleared, cost and stops, for this project and the current task |
| `/jeeves handover` | The last handover: its file, Current goal and first next actions (a missing or changed file is said, not printed) |
| `/jeeves history [--full]` | Recent state changes and rotations; `--full` adds each rotation's context, cost and handover file |
| `/jeeves auto [on\|off]` | Show or set auto-start everywhere; `/jeeves defaults auto on\|off` sets one project |
| `/jeeves off` | End the task (files are kept); auto-start stays off for the rest of the session |
| `/jeeves help` | Every command |

The full command list, modes, settings and FAQ are in [jeeves/README.md](jeeves/README.md).

## Your data

Everything stays on your machine, in a state folder outside your repository: your task prompt, the handovers and a redacted log. Never the transcript or your file contents. With auto-start, recording begins at the first prompt you type in a session Jeeves watches; tasks it started by itself that never handed over are deleted after 7 days. Delete it any time with `/jeeves purge --all`. Details: [PRIVACY.md](jeeves/PRIVACY.md).

## More

- [Testing guide](jeeves/docs/testing.md) · [Troubleshooting](jeeves/docs/troubleshooting.md) · [Compatibility](jeeves/docs/compatibility.md) · [Architecture](jeeves/docs/architecture.md)
- [Contributing](jeeves/CONTRIBUTING.md) · [Security](jeeves/SECURITY.md) · [Changelog](jeeves/CHANGELOG.md)
- Planning documents and test evidence: [docs/plans](docs/plans/)

Licence: MIT.
