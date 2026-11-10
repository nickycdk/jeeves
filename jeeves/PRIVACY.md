# Privacy

Jeeves runs on your machine and sends nothing anywhere. It has no server, no telemetry and no network calls.

## When it records

- **A task you start with `/jeeves on`:** from that command on.
- **Auto-start, on a new install (0.3 and later):** Jeeves watches a session by itself when it is an interactive session in a git repository, on a model whose context window is 200K tokens or more (0.3.0: above 200K), in a fresh conversation (not `--resume` or `--continue`), with auto-start not turned off. In such a session it records, **from the first prompt you type on**, the same local state as for `/jeeves on` (the list below), on this machine only, and never the transcript. Before that first typed prompt no task file is written; the first such session shows a notice that Jeeves watches long sessions here.
- **Upgraded from 0.2:** nothing changes. Jeeves records only after `/jeeves on`, as before, until you type `/jeeves auto on` (or set Auto-start to `on` in `/config`).

**Turning auto-start off:** `/jeeves off` for the rest of this session, `/jeeves defaults auto off` for this project, `/jeeves auto off` everywhere, or `/config` → Jeeves → Auto-start → `off` (which wins over `/jeeves auto`). The session and project settings win over both. `/jeeves on` still starts a task wherever auto-start is off.

## What it stores

Everything sits in the state folder (`/jeeves status` shows where; never inside your repository unless you set `stateDir` there):

- your original task prompt, word for word (`task-rev-001.md`): the prompt after `/jeeves on`, or the first prompt you typed in a session Jeeves watches by itself; and each `/jeeves dod` and `/jeeves check` you type later, and a goal you give with `/jeeves on <goal>` in a task Jeeves started by itself;
- `state.json`: the task's state, whether it started by `/jeeves on` or by itself, the last context reading, and the evidence ledger: the last 200 commands Claude ran (redacted, at most 300 characters each, with exit status) and the paths of files it edited;
- handovers Claude writes at each rotation (`history/handover-NNN.md`) and a facts snapshot per rotation (branch, HEAD, `git status` entries, scheduled crons; no crons in turn mode, where Jeeves cannot see them);
- a message you type while a handover is under way, word for word, in `state.json` until the fresh conversation receives it, then removed;
- `events.jsonl`: one short, redacted line per state change (a held message is named by its length there, never quoted);
- per project, if you set them with `/jeeves defaults`: a default threshold, the default check commands you typed, as text, and auto-start on or off (`projects/<project>/config.json`). Jeeves never runs the commands;
- `auto.json`: auto-start on or off everywhere, as `/jeeves auto on|off` set it (or `off` with the reason "upgraded from 0.2").

In Claude Code's plugin store (kept by Claude Code on this machine), Jeeves keeps a few flags: whether its notices were shown, whether this install was an upgrade from 0.2, and per running session whether it is watched (and if not, why) and whether `/jeeves off` turned auto-start off there. No prompt text.

A notification (a task stopped and needs you, or completed) carries only the state and its reason, never prompt or file text, and goes wherever your Claude Code notification setting and `Notification` hooks send it.

It never copies the conversation transcript, tool output, or your files. A handover is Claude's own summary and can quote small parts of them (see [Residual risk](#residual-risk) below).

## How long it keeps it

Until you delete it, with one exception: a task Jeeves started by itself that ended without a single handover (you ended it, cleared the conversation, or the session closed before the threshold) is deleted at the start of a later session, 7 days after its last change, without a message. Tasks you started with `/jeeves on`, tasks with a handover, and paused or stopped tasks are kept. This runs whether auto-start is on or off.

Uninstalling Jeeves does not delete the state folder. To delete:

- `/jeeves purge --task <id>`, `/jeeves purge --project` or `/jeeves purge --all`: Jeeves lists the folders it would delete and gives you a code; `/jeeves purge confirm <code>` (within 2 minutes) deletes them. A task that is still running is never deleted (`/jeeves off` first).
- Or delete the state folder yourself: `~/Library/Application Support/Jeeves` on macOS, `~/.local/state/jeeves` on Linux (or the `stateDir` you set).

## Redaction

Before a command enters the ledger or a line enters the event log, Jeeves masks these formats: private key blocks, Anthropic, OpenAI, GitHub, AWS access key IDs, Stripe, Slack, JWTs, credentials in URLs, `Bearer` tokens, and values after key-like names (`API_KEY=…`, `aws_secret_access_key = …`, `"client_secret": "…"`, `password: '…'`). A handover that contains a high-confidence secret (any of the named formats) is rejected and Claude is asked to remove it.

## Residual risk

Redaction is pattern matching. It misses:

- a secret with no known prefix that is not assigned to a key-like name (a bare random string in prose);
- a secret Claude paraphrases or splits across lines;
- a value after a key-like name that looks like code: a plain lowercase word in quotes, or a bare value with no digit (`password = hunter`);
- secrets inside file paths or command arguments that look like ordinary words.

Handovers are written by Claude from its own context. Anything in that context, including text other hooks inject, can end up in a handover; only the formats above are blocked. Treat the state folder like your shell history: keep it on your own machine and do not share it.

False positives were measured at 0.23 changed lines per 10,000 on TypeScript's own type libraries, this repo's source and its handover fixtures (`tests/unit/redact-corpus.spec.ts`).
