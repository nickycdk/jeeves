# Contributing

Requirements: Node 22.6+ and Claude Code (for the mod checks).

```sh
cd jeeves
npm ci
npm run typecheck   # tsc --strict on hooks/, src/, tests/mod against the engine-written claude-code types
npm run lint        # tsc on core + scripts/lint.mjs (purity, no forbidden git commands, no runtime deps)
npm test            # unit tests (node:test), no Claude Code needed
npm run test:mod    # claude plugin test . (engine test kit, no model calls)
npm run validate    # claude plugin validate . --strict
```

`npm run typecheck` needs the engine's type declarations. Claude Code writes them into
`.claude-plugin/types/` the first time it loads this folder with `claude --plugin-dir .` in an
interactive session. You can also point `CLAUDE_CODE_TYPES` at a `claude-code.d.ts` file. They are
not committed (they belong to Claude Code, not to this project). Without them, use
`npm run typecheck -- --core-only`. CI relies on `npm run lint`, which type-checks `src/core`.

Layout: `src/core` is pure TypeScript (no `$`, no I/O, no clock); `src/adapter` talks to the engine;
`hooks/register.ts` only wires events. Unit tests are `tests/unit/*.spec.ts`; mod tests are
`tests/mod/*.test.ts` (the engine runs every `*.test.ts`, so unit tests must not use that suffix).

## PTY end-to-end run (costs model usage)

```sh
npm run e2e:pty -- <scratch dir> [--override 10] [--pad 400] [--minutes 30] [--out <evidence dir>]
```

`tests/pty/driver.py` (Python: Node has no pseudo-terminal without a native dependency) builds the `six-steps`
fixture with `tests/fixtures/build-repo.ts`, starts `claude --plugin-dir . --model haiku` in it with
`JEEVES_TEST=1`, `JEEVES_STATE_DIR` in the scratch folder and the test threshold override, types only the setup
(`/relay on`, the task, `/relay check ./verify.sh`) and then nothing until the task ends. It needs `claude` on PATH,
logged in. The fixture's `verify.sh` prints a padding report (`--pad` lines) so context grows quickly enough to
rotate within a few steps; under the override the loop guard uses a 1-point margin (see `docs/state-machine.md`).

Evidence lands in `<out>` (default `<scratch>/evidence`): `RESULT.md` (pass/fail per assertion, Claude Code version,
cost), `result.json`, `events.jsonl`, `sessions/`, `history/` (handovers), `git-log.txt`, `driver.log` (every
keystroke with its time) and `plain.txt` (the screen). Copy the folder to `docs/plans/evidence/` when it backs a gate.
