# Testing Jeeves

This guide covers two things: how to try Jeeves by hand in a real Claude Code session (part 1), and how the automated checks run (part 2). Part 1 is for anyone on the team. Part 2 is for people changing the code.

## Part 1: try it by hand

### Before you start

- Claude Code 2.1.319 or later (`claude --version`), macOS, logged in.
- A git repository you don't mind Claude editing. A scratch copy of a real project works best, because a handover needs real work to describe.
- Every session uses your normal Claude usage. Long tasks cost money. To keep a test cheap, use `/jeeves rotate` (hand over now) instead of waiting for the context to fill.

### Install from a clone

The GitHub repository is private, so `--marketplace nickycdk/jeeves` works only for people with access. A clone always works:

```sh
git clone https://github.com/nickycdk/jeeves.git ~/jeeves-test
claude plugin install jeeves --marketplace ~/jeeves-test
```

Start `claude` in your test repository and type `/jeeves status`. A fresh install answers `Jeeves  mode: full` and `No managed task. Start with /jeeves on`. On an account in a Team organization, after the first answer the mode reads `mode: full (turn)`. That is expected, see [troubleshooting](troubleshooting.md).

To pick up a newer commit later, run `git -C ~/jeeves-test pull`, then `claude plugin update jeeves@jeeves`.

### Scenarios

Run them in order; each takes a few minutes. After each one, note what you saw against **Expect**.

**1. A task with a forced handover (the core loop)**

1. `/jeeves on`, then give a task of several steps, for example "add input validation to every endpoint in src/api, with a test for each".
2. Let Claude work for two or three turns. The entry under the prompt shows `Jeeves 12%/40%` (your numbers will differ).
3. Type `/jeeves rotate`.

Expect: at the next point where Claude has stopped with nothing running, `Jeeves: handover requested`, then `Jeeves: handover validated, starting fresh`. The conversation clears and the task continues by itself. `/jeeves handover` shows the saved handover's goal and next actions. `/jeeves history --full` lists the rotation.

**2. A task that finishes with proof**

1. `/jeeves on`, then `/jeeves check <your test command>` (for example `npm test`), then a small task.
2. Let Claude finish.

Expect: the task becomes COMPLETED only after the check command ran with exit 0 after the last edit. If Claude claims it's done without running it, Jeeves asks Claude to run it.

**3. Auto-start (no `/jeeves on`)**

1. Quit, and start a fresh `claude` in the git repository, on a model with a 200K or larger window.
2. Type a task as your first prompt.

Expect: once per machine, a notice that Jeeves watches long sessions. `/jeeves status` shows the task with `(auto)`. Outside git, or in `claude --resume`, the status says `Auto off: <reason>` instead.

**4. Your own `/clear`**

1. In an auto task, type `/clear`. Expect: `Jeeves: task ended (new conversation); the next prompt starts a new one`, and your next prompt starts a new auto task.
2. Start a task with `/jeeves on`, then type `/clear`. Expect: `Jeeves: paused (you cleared the conversation); /jeeves resume continues the task`. `/jeeves status` says `Auto off: this session`.
3. Quit and start a new `claude` in the same repository. Expect: the new session is watched again, while the paused task waits for `/jeeves resume`.

**5. Recovery after a crash**

1. Start a task and `/jeeves rotate`.
2. As soon as `Jeeves: handover requested` appears, close the terminal window (don't use `/exit`).
3. Wait two minutes, because the old session's lock goes stale after 120 seconds. Then start `claude` in the same repository.

Expect: Jeeves names the interrupted task. `/jeeves recover` continues it from the last validated handover, exactly once. An auto task recovers by itself in a fresh interactive session.

**6. The everyday commands**

`/jeeves pause` and `/jeeves resume`, `/jeeves later` (skip the next handover), `/jeeves threshold 30`, `/jeeves stats`, `/jeeves off`. Expect: each answers in one or two lines and `/jeeves status` reflects it.

**7. Carry-on after a handover (new in 0.3.1, not yet seen live)**

In an auto task, after a handover, watch the first turn of the fresh conversation. If Claude ends it by announcing a next step ("Next I will…") without taking it, Jeeves sends one prompt starting `Jeeves: carry on with the task.`, and only once per conversation. If you type anything in that conversation first, no carry-on prompt is sent. Please report whether you saw it and whether it helped.

### What to send back

For each scenario: pass or fail, and for a failure what you saw. Attach:

- `/jeeves status --diagnose`. It masks secrets and shows your home folder as `~`. Read it before you share it anyway.
- `/jeeves history --full`.
- `claude --version`, and whether your account is in a Team organization (the status says `(turn)`).

Don't send transcripts or the state folder. It holds your task prompts and handovers.

### Clean up

`/jeeves purge --all` deletes every task file. Then `claude plugin uninstall jeeves@jeeves` and `claude plugin marketplace remove jeeves`.

## Part 2: the automated checks

Run these from `jeeves/` inside the clone (`npm ci` first). None of them calls a model or costs anything. The details of each are in [CONTRIBUTING.md](../CONTRIBUTING.md#scripts).

| Command | What it covers |
|---|---|
| `npm test` | Unit tests of the pure core: the state machine, handover parsing and validation, storage, redaction. |
| `npm run test:mod` | The real hooks inside Claude Code's plugin test kit, with an in-memory host, auto-start off. |
| `npm run test:mod:on` | The same suite with auto-start on. |
| `npm run test:mod:turn` | The same suite as on a Team account (turn mode). |
| `npm run typecheck`, `npm run lint`, `npm run validate` | Types against the engine, core purity, no git-mutating commands, plugin manifest. |
| `scripts/check-all.sh` | All of the above in one go. It stops at the first failure. |

Known noise: `tests/perf/stats.test.ts` (a timing test) can fail under load, and the mod suite can time out at random during system sleep. Rerun before you suspect a change.

**Live runs** (`npm run e2e:pty`, `tests/pty/*.py`) drive a real `claude` in a pseudo-terminal and cost usage, roughly US$0.20 to US$1 per run on Haiku. They need the maintainer's go-ahead. See CONTRIBUTING.md.

**Release check:** `scripts/release-zip.sh <commit>` builds the release zip and its SHA-256. Built from two clean clones of the same commit, the SHA must match.
