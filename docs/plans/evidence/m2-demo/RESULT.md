# M2 gate demo: turn on, context %, warning, request (test override)

- **Date:** 2026-11-07 · **Claude Code:** 2.1.319 · **Model:** `--model haiku` (1M context window) · **Driver:** `drive_m2.py` on `../m1-relay-status/ptylib.py`, 140x40 PTY
- **Load:** `claude --plugin-dir <repo>/sessionrelay`, `CLAUDE*`/`CODEX*` env stripped, `SESSIONRELAY_TEST=1`, `SESSIONRELAY_STATE_DIR=<scratch>/state`, `SESSIONRELAY_TEST_THRESHOLD_OVERRIDE=<n>`, throwaway git repo
- **Runs:** 2 (override 6, then 9). **Cost:** $0.07 each (status line).

The demo uses the test override, as 05 allows, so the request comes at a few percent instead of 50%. The first reply already filled 6% of the window (the maintainer's globally installed plugins and skills load into every session). With override 6, the first reading jumped straight to the threshold: one request and no warning, which is correct (a jump gives one request). Run 2 used override 9 so that the first reading fell in the warning band (4-8%).

| Check | Run 1 (T=6) | Run 2 (T=9) |
|---|---|---|
| `/relay on` answered | PASS | PASS |
| First-activation notice (once per machine, `$.store`) | shown | not shown (already shown in run 1: correct) |
| First typed prompt stored byte-identical (`task-rev-001.md`; Unicode, em dash, emoji, double space) | PASS | PASS |
| Context reading from `session.measure` | 6% (56,426 tokens) | 6% (56,285 tokens) |
| Status figure equals Claude Code's own status line | `Context: 11%` / status line `🧠 11%` | same |
| Warning at T-5..T-1 | n/a (6 >= T) | PASS: `Context at 6%. SessionRelay will hand over at 9%.` |
| Request at >= T, exactly once | PASS at 6% | PASS at 11% (after one large paste) |
| Events | DISABLED>MONITORING, rev 1, MONITORING>ROTATION_REQUESTED (THRESHOLD, pct 6) | same with pct 11 |
| Status says `TEST OVERRIDE`; task threshold stays 50 | PASS | PASS |
| Lock heartbeat ran (`$.clock.every`, 30 s) | PASS (heartbeatAt advanced) | PASS |
| Lock released on exit (Ctrl+C: `session.end` prompt_input_exit) | PASS | PASS |

Files: `result-run1.json`, `result-run2.json` (state and events as read from disk), `driver-run*.log`, `screen-excerpt-run*.txt`.

Side effect outside the repo: the engine keeps the plugin's `$.store` in `~/.claude/plugins/store/sessionrelay_inline-684862ebb61b.json`; run 1 wrote `{"firstActivationShown": true}` there. Delete that file to see the notice again.

Not covered live: `/relay on <goal>` (goal submitted from `$.clock.after(0)`, covered only by `claude plugin test`), pause/resume (mod tests), and the real 50% default (planned for ST-9.2).
