# Contributing

Requirements: Node 22.6+ and Claude Code (for the mod checks).

```sh
cd sessionrelay
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
