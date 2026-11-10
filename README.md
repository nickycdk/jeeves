<div align="center">

<img src="docs/images/jeeves-handoff.gif" alt="Jeeves handing over a Claude Code task to a fresh conversation" width="140">

# Jeeves

**Claude Code has a context limit. Your momentum shouldn't.**

[![Version](https://img.shields.io/badge/version-0.3.1_beta-111?style=flat-square)](jeeves/CHANGELOG.md)
[![Claude Code](https://img.shields.io/badge/Claude_Code-2.1.319%2B-d97757?style=flat-square)](jeeves/docs/compatibility.md)
[![macOS](https://img.shields.io/badge/macOS-supported-555?style=flat-square)](jeeves/docs/compatibility.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-2ea44f?style=flat-square)](LICENSE)

[Get started](#get-started) · [Why not /compact?](#why-not-just-compact) · [How it works](#what-happens-at-40) · [Commands](#commands) · [Full docs](jeeves/README.md)

</div>

---

Jeeves is your personal butler for long Claude Code tasks. He keeps an eye on your context window and, before things get crowded, prepares a handover and starts a fresh conversation in the same terminal. Claude picks up right where it left off.

No interruptions. No copy-pasting. No explaining the same task twice. Finish your coffee, or go back to your sunbed.

You keep building. Jeeves takes care of the rest. 🎩

> [!NOTE]
> **Public beta 0.3.1.** Needs Claude Code 2.1.319 or later on macOS. Works in any terminal, including Cursor's and VS Code's. No API key, no server, and Jeeves itself makes no network requests. Not made by or affiliated with Anthropic.

## Get started

**1. Install it.** At the Claude Code prompt:

```
/plugin install jeeves --marketplace nickycdk/jeeves
```

This adds the marketplace and the plugin in one go. A note that some options are not set yet is fine: every setting is optional.

**2. Type your task.** Whether Jeeves starts by himself depends on where you are:

| Conditions | What to do |
|---|---|
| **All three:** a git repository, a 200K+ context window, a new conversation | Just type your task. Jeeves starts automatically. |
| **Any of these:** no git repository, a smaller context window, a resumed conversation | Run `/jeeves on`, then type your task. |

Once Jeeves is watching, every handover happens by itself. The line under the prompt shows how full the context is, for example `Jeeves 12%/40%`. Not sure he's watching? `/jeeves status` tells you, and if he isn't, why.

## Why not just `/compact`?

`/compact` summarises your conversation to free up context. Jeeves takes a different approach: he checks a structured handover against the task's recorded state, then starts a fresh conversation with your original task intact.

- **The handover is checked.** Claude writes it in fixed sections, and Jeeves compares it with git and with the commands that ran before he uses it.
- **Your task survives word for word.** The fresh conversation gets your original prompt, not a summary of it.
- **You can read it.** Every handover is saved as a file. `/jeeves handover` shows the last one.
- **It happens early.** By default at 40%, typically well before Claude Code's automatic compaction kicks in.

## What happens at 40%

1. Jeeves waits until Claude has stopped and nothing is still running.
2. He asks Claude for a handover: where things stand, what comes next, and how far along the plan is, if there is one.
3. He checks it: the branch and commit match, the files it names exist, no test is claimed as passing when its last run failed, and nothing in it matches a recognised secret pattern. A handover that fails goes back to Claude with the reasons. After three tries, Jeeves stops and sends you a notification.
4. He saves it with the commits made since the task started, runs `/clear`, and gives the fresh conversation your original task, the handover and the next steps. Decisions and dead ends carry over from one handover to the next, so Claude doesn't retry what already failed.

You'll see `Jeeves: handover requested`, then `Jeeves: handover validated, starting fresh`, and Claude carries on.

Jeeves never runs your commands, never changes git, never answers permission prompts for you, and never marks a task done without proof. He knows his place. And unlike a certain other assistant, he never needs a coffee break. ☕

## Commands

| Command | What it does |
|---|---|
| `/jeeves status` | What Jeeves is doing now, and what you can type next |
| `/jeeves on [goal]` | Start a task. Without a goal, your next prompt is the task |
| `/jeeves rotate` | Request a handover at the next safe moment |
| `/jeeves pause` | Stop handovers for a while |
| `/jeeves resume` | Start handovers again |
| `/jeeves off` | End the task (its files are kept) |
| `/jeeves help` | Every command |

<details>
<summary><b>Settings and more commands</b></summary>

<br>

| Command | What it does |
|---|---|
| `/jeeves threshold <n>` | Hand over at n% context (20 to 90, default 40) |
| `/jeeves limit <n>` | The most handovers one task may make (1 to 100, default 30) |
| `/jeeves check <cmd>` | A command that proves the task is done. Claude runs it, Jeeves checks the result |
| `/jeeves defaults` | This project's defaults for new tasks (`threshold`, `limit`, `check`, `auto`) |
| `/jeeves auto [on\|off]` | Show or set auto-start everywhere |
| `/jeeves later` | Skip the next handover (threshold +10) |
| `/jeeves recover` | Pick up a task left behind by a crashed or closed session |
| `/jeeves retry` | Try again after Jeeves stopped and asked you |
| `/jeeves stats` | Handovers, context cleared and cost |
| `/jeeves handover` | Show the last handover |
| `/jeeves history [--full]` | Recent changes and handovers |

</details>

Settings, modes, updating, uninstalling and the FAQ are in the [full README](jeeves/README.md). On a Claude Team account, Jeeves runs in turn mode with a few limits. See [Requirements](jeeves/README.md#requirements).

## Your data

Everything stays on your machine, in a folder outside your repository: your task prompt, the handovers, the git facts for each handover, and a log of commands and edited file names with secrets removed. Jeeves doesn't copy the transcript or your files. A handover is Claude's own summary, so it can quote a line of code, and one that contains a known secret format is rejected. Tasks that auto-start and never hand over are deleted after 7 days. `/jeeves purge --all` deletes everything. Details: [PRIVACY.md](jeeves/PRIVACY.md).

## Support

If Jeeves saves you a few context resets, you can buy me a coffee. It keeps the butler in business.

<a href="https://buymeacoffee.com/nickycdk"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=nickycdk&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" height="40"></a>

## More

- [Testing guide](jeeves/docs/testing.md) · [Troubleshooting](jeeves/docs/troubleshooting.md) · [Compatibility](jeeves/docs/compatibility.md) · [Architecture](jeeves/docs/architecture.md)
- [Contributing](jeeves/CONTRIBUTING.md) · [Security](jeeves/SECURITY.md) · [Changelog](jeeves/CHANGELOG.md)
- Planning documents and test evidence: [docs/plans](docs/plans/)

Licence: MIT.
