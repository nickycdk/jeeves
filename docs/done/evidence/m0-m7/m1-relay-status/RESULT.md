# M1 gate: live `/relay status` (ST-1.9)

- **Date:** 2026-11-07 · **Claude Code:** 2.1.319 · **OS:** macOS (Darwin 23.6) · **Terminal:** PTY driver (`ptylib.py` from S-06), 140x40 · **Model:** `--model haiku` (no model turn was needed)
- **Load:** `claude --plugin-dir <repo>/sessionrelay --model haiku`, `CLAUDE*`/`CODEX*` env stripped, `SESSIONRELAY_TEST=1`, `SESSIONRELAY_STATE_DIR=<scratch>/state`, throwaway git repo in the scratchpad.
- **Cost:** status line read `$0.00`; one live run.

| Check | Result |
|---|---|
| Plugin loads; `session.start` runs | PASS: state folder created 6.4 s after spawn |
| State folder user-only | PASS: mode `0700` |
| `/relay status` answered | PASS: `SessionRelay  mode: full` / `No managed task. Start with /relay on` / `Path: ...891706/scratchpad/m1-live/state` |
| Mode | `full` |
| Engine laid its types in `sessionrelay/.claude-plugin/types/` | PASS: `npm run typecheck` then ran against them with no `CLAUDE_CODE_TYPES` |

Screen excerpt: `screen-excerpt.txt` (the engine prefixes plugin output with `sessionrelay:`; the PTY capture drops spaces). Driver actions: `driver.log`.

Not covered by this run: the `unsupported` path (needs an older Claude Code; covered by `tests/mod/probe.test.ts` with a mocked `$.session.version`), and a write to the real OS state root (A-05; this run used the test-only state folder).

> After M3 the product was renamed Jeeves (D-22). The driver in this folder now sets `JEEVES_*` variables and waits for the `Jeeves` answers; the logs and results here are the runs as recorded, under the old names.
