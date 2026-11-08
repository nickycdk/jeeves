# Contributing

Thanks for helping. Tibbs is small on purpose: no runtime dependencies, a pure core, and tests for every behaviour.

## Setup

Requirements: Node 22.6 or later, git, and Claude Code 2.1.319 or later on `PATH` (only for the mod checks; no login is needed for them).

```sh
git clone <repo url> tibbs && cd tibbs/tibbs   # the plugin (the folder with package.json) is tibbs/ inside the clone
npm ci
npm test                 # unit tests: no Claude Code needed
npm run test:mod         # the hooks in Claude Code's test kit
```

## Scripts

| Script | What it does | Needs |
|---|---|---|
| `npm test` | Unit tests (`tests/unit/*.spec.ts`, `node:test`): core, storage, redaction, git audit | Node |
| `npm run test:mod` | `claude plugin test .`: every `tests/mod/*.test.ts` against the real hooks with an in-memory host; no model calls | Claude Code |
| `npm run lint` | `tsc` on `src/core` plus `scripts/lint.mjs`: core purity (no `$`, no I/O), no git-mutating argv, no runtime dependencies | Node |
| `npm run typecheck` | `tsc --strict` on hooks, adapter and mod tests against the engine's types (see below); `-- --core-only` without them | Node (+ engine types) |
| `npm run validate` | `claude plugin validate . --strict` | Claude Code |
| `scripts/check-all.sh` | All of the above plus the marketplace check; run it before every commit. Without the engine types it checks `src/core` only and says so | Claude Code (+ engine types) |
| `npm run compat -- <scratch> <versions...>` | Installs each Claude Code version from npm into `<scratch>` and runs validate + test there; rewrites `docs/compatibility.md` | Claude Code from npm, network |
| `npm run crash:report` | Runs the crash matrix mod tests and rewrites the crash-matrix evidence file | Claude Code |
| `npm run docs:state` | Regenerates `docs/state-machine.md` from the transition table | Node |
| `npm run e2e:pty -- <scratch> ...` | Live end-to-end run in a real `claude` (see below) | Claude Code, logged in, **costs usage** |

`npm run typecheck` needs the engine's type declarations. Claude Code writes them into `.claude-plugin/types/` (the API is `.claude-plugin/types/claude-code/index.d.ts`) the first time it loads this folder: run `claude --plugin-dir .` here once, trust the folder, then `/exit`. No login is needed for that. There is no non-interactive way to get them. You can also point `CLAUDE_CODE_TYPES` at an `index.d.ts` written that way for another checkout. They are not committed: they belong to Claude Code.

Under heavy load or system sleep the mod suite can fail at random with `timed out after 5000 ms` in a different file each run. Rerun before suspecting your change.

## Layout and rules

- `src/core` is pure TypeScript: no `$`, no I/O, no clock. Put logic here and unit-test it.
- `src/adapter` talks to the engine; `hooks/register.ts` only wires events. See [docs/architecture.md](docs/architecture.md).
- Unit tests are `*.spec.ts`; mod tests are `*.test.ts` (the engine runs every `*.test.ts`, so unit tests must not use that suffix).
- Never add a runtime dependency. Never run a git command that changes anything (the lint and `no-git-mutation.spec.ts` check). Never name a settings or permissions file.
- User-facing text lives in `src/adapter/ui.ts`: plain ASCII, a word for every state, status lines at most 40 columns. `tests/fixtures/messages.txt` snapshots the messages.

## Live end-to-end runs (cost money)

```sh
npm run e2e:pty -- <scratch dir> [--override 8.5] [--chars 6000] [--minutes 30] [--out <evidence dir>]
```

`tests/pty/driver.py` (Python: Node has no pseudo-terminal without a native dependency) builds the `six-steps` fixture with `tests/fixtures/build-repo.ts`, starts `claude --plugin-dir . --model haiku` in it with `TIBBS_TEST=1`, `TIBBS_STATE_DIR` in the scratch folder and a test threshold override, types only the setup (`/tibbs on`, `/tibbs check ./verify.sh`, then the task) and then nothing until the task ends. It needs `claude` on `PATH`, logged in. A run with a few rotations costs roughly US$0.20 to US$1 on haiku. Never point `TIBBS_STATE_DIR` at your real state folder.

Evidence lands in `<out>` (default `<scratch>/evidence`): `RESULT.md` (pass/fail per assertion, Claude Code version, cost), `result.json`, `events.jsonl`, `sessions/`, `history/` (handovers), `git-log.txt`, `driver.log` (every keystroke with its time) and `plain.txt` (the screen). Read it for secrets before you commit it.

Other drivers: `tests/pty/demo_recover.py` (kill mid-rotation, then `/tibbs recover`), `tests/pty/concurrency.py` (several sessions, free), `tests/pty/clean_install.py` (install, status and uninstall for a fresh `HOME`; free, no login).

## How changes are made

- Behaviour changes start as a story with acceptance criteria (see the backlog in `docs/plans/04-backlog-stories.md` in the repository root, or open a feature issue).
- Architecture changes need an ADR or an amendment to one (`docs/plans/02-architecture-and-adrs.md`); decisions go into `docs/plans/07-risks-and-open-questions.md`.
- A pull request names its story, adds tests (an error or recovery path too), passes `scripts/check-all.sh`, and updates `CHANGELOG.md` and the docs for anything a user can see. The template lists this.
- Public text claims only what the evidence shows (no "unattended"; assisted mode is always named as such).

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
