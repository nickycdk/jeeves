# Tibbs

**Long Claude Code tasks, without the context running out.** Tibbs is a plugin for Claude Code. When a long task fills the context window, it saves a verified handover, starts a fresh conversation in the same terminal and carries on with the task there. You keep working; you don't write summaries or paste anything back.

**Status:** public beta 0.1.0 (not published yet). Claude Code 2.1.319 or later, macOS. Works in any terminal, including Cursor's and VS Code's. No API key, no server, no network calls. Not made by or affiliated with Anthropic.

## How it works

1. You type `/tibbs on`, then your task, and work as usual.
2. When the context reaches your threshold (default 50%), Tibbs waits until Claude has stopped with nothing still running, then asks Claude for a handover.
3. It checks the handover against git and its own record of what ran: branch and commit match, files named really exist, no test is claimed as passed when its last run failed, no secrets. A handover that fails is sent back with the reasons; after three tries Tibbs stops and asks you.
4. It saves the handover, runs `/clear`, and gives the fresh conversation your original task, the handover and the next steps. The task continues, without a keystroke from you.

Tibbs never runs your commands, never changes git, never answers permission prompts for you, and never marks a task done without evidence.

## Install

At the Claude Code prompt:

```
/plugin install tibbs --marketplace nickycdk/tibbs
```

Then, in any project, start `claude` and type `/tibbs status`. A fresh install answers `Tibbs  mode: full` and `No managed task. Start with /tibbs on`.

From a clone instead: `claude plugin install tibbs --marketplace /path/to/this/repo`. Update, uninstall and settings: see the [full README](tibbs/README.md#install).

## Use it

```
/tibbs on                   start a managed task; your next prompt is saved as the task
/tibbs check npm test       optional: a command that proves the task is done
<your task>                  work as usual; the entry under the prompt shows "Tibbs 12%/50%"
```

At the threshold you'll see `Tibbs: handover requested`, then `Tibbs: handover validated, starting fresh`, and the fresh conversation picks up the task.

| Command | What it does |
|---|---|
| `/tibbs on [goal]` | Start a managed task. Without a goal, your next prompt is the task |
| `/tibbs status` | Mode, task, context, threshold, rotations, and why it stopped if it did |
| `/tibbs threshold <n>` | Hand over at n% context (20 to 90) |
| `/tibbs rotate` | Hand over now, at the next safe stop |
| `/tibbs pause` / `resume` | Stop handovers for a while |
| `/tibbs recover` | Continue a task a crashed or closed session left behind |
| `/tibbs history` | Recent state changes and rotations |
| `/tibbs off` | End the task (files are kept) |
| `/tibbs help` | Every command |

The full command list, modes, settings and FAQ are in [tibbs/README.md](tibbs/README.md).

## Your data

Everything stays on your machine, in a state folder outside your repository: your task prompt, the handovers and a redacted log. Never the transcript or your file contents. Delete it any time with `/tibbs purge --all`. Details: [PRIVACY.md](tibbs/PRIVACY.md).

## More

- [Troubleshooting](tibbs/docs/troubleshooting.md) · [Compatibility](tibbs/docs/compatibility.md) · [Architecture](tibbs/docs/architecture.md)
- [Contributing](tibbs/CONTRIBUTING.md) · [Security](tibbs/SECURITY.md) · [Changelog](tibbs/CHANGELOG.md)
- Planning documents and test evidence: [docs/plans](docs/plans/)

Licence: MIT.
