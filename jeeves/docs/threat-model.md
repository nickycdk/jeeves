# Threat model

Scope: Jeeves 0.1 (ST-9.1), the hooks module in `hooks/register.ts` and everything under `src/`, on Claude Code 2.1.319+, macOS and Linux. Reviewed 2026-11-08 against commit range M7. Reporting a problem: [SECURITY.md](../SECURITY.md).

## What Jeeves is allowed to do

Jeeves runs inside the user's Claude Code process with the user's own rights. It:

- reads and writes files under its **state folder** only (`~/Library/Application Support/Jeeves`, `~/.local/state/jeeves`, or `stateDir`);
- starts a fixed set of programs with literal argument arrays and no shell: `git` (read-only subcommands), `mkdir`, `chmod`, `mv`, `rm`, `rmdir`, `cp`, `uname`, `test`, `true`;
- runs `/clear`, submits prompts, adds a hidden note and a system-prompt section in the session it is loaded in;
- makes no network calls, has no runtime dependencies, and never touches Claude Code's settings or permissions.

## Assets

1. The user's repository and files outside the state folder (must never be changed by Jeeves).
2. Secrets that pass through the session (API keys, tokens in commands or output).
3. The task's integrity: the original prompt, its Definition of Done, the handover chain, the "completed" verdict.
4. The user's control: permission prompts, the ability to stop or pause a task.

## Actors and trust boundaries

| Actor | Trust | How it reaches Jeeves |
|---|---|---|
| The user at the keyboard | Trusted | `/jeeves` commands typed in the composer (`origin.kind === 'composer'`) |
| Claude (the model) | Partly trusted: it can be steered by text in the repository, tool output or web pages (prompt injection) | Handover text, the completion marker, tool calls the ledger records, its own Bash (which can edit files, including the state folder, subject to the user's permission settings) |
| Repository content | Untrusted | Text Claude reads; the repository's own `.git/config` when Jeeves runs `git` |
| Other plugins, MCP servers, other sessions | Untrusted | Slash commands with another origin, prompts, a second session on the same task |
| Files in the state folder | Trusted only after validation | `state.json`, `lock.d/owner.json`, `events.jsonl`, handover files |

## Threats, mitigations and tests

| # | Threat | Mitigation | Tests |
|---|---|---|---|
| T1 | **Prompt injection makes Claude change or end the task**: a repository file tells Claude to run `/jeeves off`, `/jeeves done`, `/jeeves purge`, or to print the completion marker | Every task-changing subcommand runs only when the user typed it; anything else gets "Only you can change a Jeeves task". The completion marker is accepted only when the DoD checks ran and passed in the ledger after the last edit; otherwise NEEDS_REVIEW. `/jeeves check` text is stored, never run | `tests/mod/{task,pause,manual,complete,revision,purge}.test.ts` (plugin origin refused), `tests/unit/completion.spec.ts`, `tests/mod/complete.test.ts` (AC-13), `tests/unit/security.spec.ts` (no program runs a given command) |
| T2 | **A false handover**: Claude claims tests passed or files exist that do not, and the fresh conversation trusts it | The validator checks `[verified]` paths exist, branch and HEAD match git, and refuses "passed" for a command whose last ledger run failed (D-20). The plugin-written facts block comes from git, not from Claude | `tests/unit/validate.spec.ts` (31 fixtures), `tests/mod/handover.test.ts` (AC-09) |
| T3 | **Injected instructions carried forward**: text in a handover reaches every later conversation | Accepted residual risk (F-5): the handover was already in Claude's context; Jeeves adds no rights to it, frames it as "the latest validated handover", and the user's own prompt (`task-rev-001.md`) leads the fresh context | — |
| T4 | **Secret leakage into the state folder** | Ledger commands, failed commands' last output lines and event details are redacted and capped; a handover holding a high-confidence secret is refused; the transcript and file contents are never stored, and of tool output only the last lines of at most 3 failed commands not seen passing since (in `state.json` until the command passes, and permanently in each `history/handover-NNN.md` written meanwhile, until purged). Residual limits in PRIVACY.md | `tests/unit/redact.spec.ts`, `tests/unit/redact-corpus.spec.ts`, `tests/unit/evidence.spec.ts` (ledger redaction, output lines cut at a secret or key block), `tests/mod/handover.test.ts` (secret refused) |
| T5 | **Tampered state files steer a path or a git argument**: Claude's Bash (or anything else running as the user) edits `state.json` so an id reads `../../x` or the start commit reads `--output=<file>` | Every persisted file is schema-checked on read. Ids that become path segments must be safe names (letter or digit first, then `[A-Za-z0-9_-]`, no `/` or `.`); the start commit must be hex; the handover reference must be `history/handover-NNN.md#sha256:…`. `git.ts` refuses a non-hex commit again at the argv. Purge deletes only folders it listed itself, under `<state>/projects`, never a path from an argument | `tests/unit/schema.spec.ts` (ST-9.1 rows), `tests/unit/git.spec.ts` (start commit never reaches git; no file is written), `tests/mod/purge.test.ts` |
| T6 | **Command injection through process arguments** | No shell anywhere; programs from a fixed list with array argv; git runs with `--no-optional-locks -c core.fsmonitor=false`. Commands a repository's own `.git/config` names (fsmonitor is off; filter drivers selected by attributes still run) are F-3 | `tests/unit/security.spec.ts`, `tests/unit/no-git-mutation.spec.ts`, `tests/unit/git.spec.ts` (a planted `core.fsmonitor` command does not run) |
| T7 | **Lock abuse**: a second session takes over a running task, or a purge deletes a live task | `mkdir` lock with heartbeat; another live owner gets LOCK_HELD and nothing is written; takeover only of a stale lock under a second guard lock; purge refuses any task with a live or unreadable lock and checks again at confirm | `tests/mod/concurrency.test.ts` (AC-18), `tests/unit/lock.spec.ts`, `tests/mod/purge.test.ts`, `docs/done/evidence/m0-m7/m5-concurrency/` |
| T8 | **Repository or permission changes**: Jeeves commits, resets, stashes, or edits Claude Code settings | Git read-only subcommands only, from one helper; no source names a settings file; no network; zero runtime dependencies | `tests/unit/no-git-mutation.spec.ts` (AC-19), `tests/unit/security.spec.ts`, E layer in `docs/done/evidence/m0-m7/m5-demo/` |
| T9 | **Denial of service**: a huge handover, a flood of held prompts, a regex that backtracks | Handover size limit, held prompts capped (50 × 100,000 chars), event log rolls at 1 MiB, redaction patterns bounded; a Jeeves failure never blocks a hook (it logs and passes the event on) | `tests/unit/redact-corpus.spec.ts` (time budget), `tests/unit/validate.spec.ts` (size limit), `tests/unit/schema.spec.ts`, `tests/unit/events.spec.ts` (roll-over), `tests/mod/boundary.test.ts` |

## Findings (ST-9.1 review, 2026-11-08)

Severity follows the impact if exploited, given the precondition.

| ID | Finding | Severity | Status |
|---|---|---|---|
| F-1 | `taskStartHead` from `state.json` went to `git diff` unchecked: a value `--output=<file>` made Jeeves create or truncate any file the user can write, with no permission prompt. Precondition: a write to the state folder (Claude's Bash with permission, or any process running as the user). Reproduced before the fix | Medium | Fixed: schema requires hex; `git.ts` re-checks at the argv |
| F-2 | `taskId`, `projectId`, `rotationId` and the handover reference from `state.json` were only "a string": `../` in them could steer `mv` (relink), the facts file write, or a handover read outside the task folder. Same precondition as F-1 | Medium | Fixed: safe-name and handover-reference patterns in the schema; the handover read path is checked again |
| F-3 | A repository's own `.git/config` can name commands that git runs during `git status` and `git diff`: `core.fsmonitor`, and filter drivers (`filter.<name>.clean`) selected by `.gitattributes` or `.git/info/attributes`. Both reproduced on git 2.54. Precondition: someone wrote that repository's `.git/config` (a clone never transfers it). Claude Code runs `git status` in the same repository itself, so Jeeves adds no new exposure | Low | Partly fixed: `-c core.fsmonitor=false` on every git call. Filter drivers accepted: no flag turns off every config-driven command (`--attr-source` does not cover `.git/info/attributes`); the only full fix is not running git, which the handover facts need |
| F-4 | PRIVACY.md did not say that prompts typed during a handover are stored word for word in `state.json` until the fresh conversation gets them | Low | Fixed in PRIVACY.md |
| F-5 | Instructions inside a handover reach later conversations (T3) | Low | Accepted; documented here and in PRIVACY.md |
| F-6 | Two takers racing on a dead takeover guard can collide (`storage.ts` shortcut comment) | Low | Accepted for 0.1: needs several processes auto-recovering the same task in the same second |
| F-7 | The state root gets mode 700 only when Jeeves creates it; a folder the user made keeps its own mode | Low | Accepted: deliberate (it may be a folder the user shares); the README names the folder |
| F-8 | GitHub Actions in `.github/workflows` are pinned by tag, not by commit SHA (08 §4) | Low | Fixed in ST-9.3: every action pinned by commit SHA, checked by `tests/unit/security.spec.ts` |

No Critical or High findings. A `/code-review` of the M7 range then found F-3's first wording too strong (filter drivers); it is corrected above. Dependencies: none at runtime; one dev dependency (`typescript`, pinned exactly, lockfile committed).

## Not in scope

The Claude Code engine and its permission system; the model's own behaviour beyond what Jeeves checks; other plugins; a local attacker with the user's rights (they can already do anything Jeeves can); the machine's disk encryption and backups of the state folder.
