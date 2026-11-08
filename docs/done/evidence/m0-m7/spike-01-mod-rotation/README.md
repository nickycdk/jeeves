# Spike 01 — mod-only rotation (2026-11-07, Claude Code 2.1.319, macOS)

- `mod/` — throwaway spike mod (not product code). Loaded with `claude --plugin-dir mod --model haiku`.
- `drive.py` — PTY driver: starts interactive `claude` in a scratch git repo, types one prompt, waits, sends `/compact`, exits. No other keystrokes.
- `run-3-log.jsonl` — event log of the decisive run. Key lines: Stop blocked once (`stop_hook_active` false → true), `git` facts, `session.end` reason `clear`, `classic.SessionStart` source `clear` with a new session ID, `submit.resolved`, continuation turn text ("NONE" earlier messages, saw injected word "DELTA", MCP tools listed), model and `permission_mode` unchanged, `session.compact` skipped.
- Run 2 (not kept) lost two log lines to a read-modify-write race between hooks; run 3 serialised writes and lost none. This informed ADR-005.
