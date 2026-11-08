# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub: on the repository page, **Security → Report a vulnerability** (GitHub private vulnerability reporting). Do not open a public issue for a security problem.

Include what you ran, what happened, your Claude Code version (`claude --version`) and the output of `/jeeves status --diagnose` (it is safe to paste: the home folder is shown as `~` and secrets are redacted). Jeeves has one maintainer; reports are answered on a best-effort basis, and a fix for a confirmed problem ships as a patch release with a note in the CHANGELOG.

## Supported versions

| Jeeves | Claude Code | Supported |
|---|---|---|
| 0.1.x | 2.1.319 and later (see [docs/compatibility.md](docs/compatibility.md)) | Yes |
| earlier | any | No |

## Scope

In scope: the plugin in this repository (`hooks/`, `src/`) and the files it writes in its state folder. Examples: Jeeves changing anything outside its state folder, running a program or command it should not, letting text from Claude or a repository change a task without the user, storing a secret it should have masked, or bypassing a Claude Code permission prompt.

Out of scope: Claude Code itself (report those to Anthropic), other plugins, and an attacker who already runs code as your user.

## What Jeeves does and does not do

- Runs entirely on your machine. No network calls, no telemetry, no runtime dependencies.
- Writes only under its state folder. Starts only `git` (read-only subcommands) and basic file tools (`mkdir`, `mv`, `rm`, `cp`, `chmod`), always as fixed argument lists, never through a shell.
- Never changes your repository's history, your Claude Code settings or your permissions. Permission prompts still need you.
- Only commands you type yourself can change a task.

## Known limits

- Redaction is pattern matching and can miss secrets; [PRIVACY.md](PRIVACY.md) lists what it catches and misses. Treat the state folder like your shell history.
- A handover is written by Claude. Text that steered Claude in one conversation can reach the next one through the handover. Jeeves checks the handover's claims against git and the commands it saw run, but not its intent.

The full threat model, with the tests behind each mitigation, is in [docs/threat-model.md](docs/threat-model.md).
