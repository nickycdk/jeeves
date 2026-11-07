# S-01 — Cursor rotation (manual)

**Result: PARTIAL — accepted by maintainer** (2 runs, 4 rotations) · decision D-14 · **Date:** 2026-11-07 · **Cursor:** 3.27.14 (reported by the maintainer) · **Claude Code:** 2.1.319 · **macOS:** 14.6.1 · **Model:** claude-haiku-5-5 · **Story:** ST-0.1

Run with `run-s01.sh` in Cursor's integrated terminal, `--permission-mode default`. The maintainer reported "everything good". Log: `events.jsonl`, with paths replaced.

## Proven by the log

| Item | Result | Evidence |
|---|---|---|
| Rotation 1 in Cursor | **PASS** | `session.end(clear)` → `classic.SessionStart(source: clear)`, sid `2e53c84c…` → `342ab17c…`; `submit.resolved`; continuation turn completed (Stop at 3%) |
| Rotation 2 in Cursor | **PASS** | sid `342ab17c…` → `de2c0e58…`, same sequence |
| Continuation without keystrokes | **PASS** | Each continuation turn followed `submit.resolved` with no user prompt in between |
| Permission mode kept | **PASS** | `permission_mode: "default"` at both post-rotation Stops |
| Clean exit | **PASS** | `session.end(reason: prompt_input_exit)` |

## Not evidenced in run 1

The whole session lasted about 51 s, with no completed model turn before the first `/srspike`. Every completed turn logs a `classic.Stop`, and there were none until the first continuation. So these checklist items cannot have been exercised in that phase, and the only replies after each rotation were the automatic continuations:

| # | Check | Before | After |
|---|---|---|---|
| 1 | Typing while Claude works | not evidenced | not evidenced |
| 4 | Permission prompt Yes / No | not evidenced | not evidenced |
| 5 | Unicode paste and reply | not evidenced | not evidenced |
| 2, 3, 6, 7 | Resize, Ctrl+C/Esc, /help /config /mcp + history, status line | reported OK (these leave no log trace) | reported OK |
| R | Reply BETA / NONE / DELTA, "session 2" | — | reported OK (the mod does not log reply text) |

## Run 2 (11:10–11:14)

Two more rotations (sid `47b8adf1…` → `8f851b89…` → `33cd0491…`), each with `session.end(clear)` → `classic.SessionStart(clear)` → continuation turn, mode `default` kept. The maintainer's screenshot shows the continuation answered `BETA: (1) NONE (2) DELTA`. One ordinary user turn after rotation 2 ("hello queued", sent while idle). Checks 1, 4 and 5 were again not exercised: no counting turn, no permission prompt, no `perm_*.txt` in the repo, and the session exited right after. `events.jsonl` now holds run 2.

## Decision (2026-11-07)

The maintainer accepted S-01 as is (D-14 in 07 §2). Checks 1, 4 and 5 are covered for the same process by PTY evidence (S-04 permission dialog, S-06 input typed during rotation) but not inside Cursor. ST-9.2 (real Cursor demo before v0.1.0) must exercise them in Cursor, and AC-02 is not claimed until it does.

## Original closing note

One short rerun (~5 min) of checks 1, 4 and 5, before and after `/srspike`. Each produces a Stop line in the log, so `collect` will show them. Also note the Cursor version from Cursor → About.
