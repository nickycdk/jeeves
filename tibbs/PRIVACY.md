# Privacy

Tibbs runs on your machine and sends nothing anywhere. It has no server, no telemetry and no network calls.

## What it stores

Everything sits in the state folder (`/tibbs status` shows where; never inside your repository unless you set `stateDir` there):

- your original task prompt, word for word (`task-rev-001.md`), and each `/tibbs dod` / `/tibbs check` you type;
- `state.json`: the task's state, the last context reading, and the evidence ledger: the last 200 commands Claude ran (redacted, at most 300 characters each, with exit status) and the paths of files it edited;
- handovers Claude writes at each rotation (`history/handover-NNN.md`) and a facts snapshot per rotation (branch, HEAD, `git status` entries, scheduled crons);
- a message you type while a handover is under way, word for word, in `state.json` until the fresh conversation receives it, then removed;
- `events.jsonl`: one short, redacted line per state change.

It never stores the conversation transcript, tool output, or file contents.

## How long it keeps it

Until you delete it. Uninstalling Tibbs does not delete the state folder. To delete:

- `/tibbs purge --task <id>`, `/tibbs purge --project` or `/tibbs purge --all`: Tibbs lists the folders it would delete and gives you a code; `/tibbs purge confirm <code>` (within 2 minutes) deletes them. A task that is still running is never deleted (`/tibbs off` first).
- Or delete the state folder yourself: `~/Library/Application Support/Tibbs` on macOS, `~/.local/state/tibbs` on Linux (or the `stateDir` you set).

## Redaction

Before a command enters the ledger or a line enters the event log, Tibbs masks these formats: private key blocks, Anthropic, OpenAI, GitHub, AWS access key IDs, Stripe, Slack, JWTs, credentials in URLs, `Bearer` tokens, and values after key-like names (`API_KEY=…`, `aws_secret_access_key = …`, `"client_secret": "…"`, `password: '…'`). A handover that contains a high-confidence secret (any of the named formats) is rejected and Claude is asked to remove it.

## Residual risk

Redaction is pattern matching. It misses:

- a secret with no known prefix that is not assigned to a key-like name (a bare random string in prose);
- a secret Claude paraphrases or splits across lines;
- a value after a key-like name that looks like code: a plain lowercase word in quotes, or a bare value with no digit (`password = hunter`);
- secrets inside file paths or command arguments that look like ordinary words.

Handovers are written by Claude from its own context. Anything in that context, including text other hooks inject, can end up in a handover; only the formats above are blocked. Treat the state folder like your shell history: keep it on your own machine and do not share it.

False positives were measured at 0.23 changed lines per 10,000 on TypeScript's own type libraries, this repo's source and its handover fixtures (`tests/unit/redact-corpus.spec.ts`).
