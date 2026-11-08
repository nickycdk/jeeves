# S-02 — Behaviour with work in flight

**Result: PASS** (1 run) · **Date:** 2026-11-07 · **Claude Code:** 2.1.319 · **macOS:** Darwin 23.6.0 · **Model:** `claude-haiku-5-5` (`--model haiku`) · **Story:** ST-0.2

## Method

- Spike mod `mod/` (throwaway) loaded with `claude --plugin-dir mod`. At every main-loop `classic.Stop` it logs `background_tasks`, `session_crons` and `$.agent.list()`, then decides: **safe** = `background_tasks` empty, `session_crons` empty and no agent with status `running`. After it has seen at least one unsafe Stop, the first safe Stop arms a rotation, run at `turn.complete` (`/clear` via `$.command.run`, then `$.prompt.submit`).
- Driver `drive_s02.py` (+ `ptylib.py`, generalised from spike 01) runs interactive `claude` in a PTY in a throwaway git repo, with `--permission-mode acceptEdits --allowedTools 'Bash(sleep:*)'` and CLAUDE*/CODEX* env vars stripped. One prompt: start `sleep 45` with Bash `run_in_background`, and a background general-purpose Agent that runs `sleep 30`; reply STARTED.
- `ps` snapshots taken while deferred and after the rotation (`ps.json`).
- Files: `events.jsonl` (mod log), `driver.log`, `ps.json`. Paths replaced with placeholders.

## Pass criteria (01 §4)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Stop shows non-empty `background_tasks` | **PASS** | Stop #1: `[{type:"subagent", status:"running", agent_type:"general-purpose", …}, {type:"shell", status:"running", command:"sleep 45", …}]` |
| 2 | Mod defers; rotation only after they finish | **PASS** | Stop #1 and #2 → `boundary.defer`; Stop #3 (after the shell finished, ~45 s) had `background_tasks: []`, `agents: []` → `boundary.safe` → `session.end(clear)` → `clear.resolved` → continuation turn answered `BETA` |
| 3 | No orphan process after rotation | **PASS** | `ps` while deferred: the `sleep 45` process and its shell wrapper. `ps` after rotation: none |

## Exact field shapes observed

```jsonc
// classic.Stop input (relevant fields)
"stop_hook_active": false,
"background_tasks": [
  { "id": "af95…", "type": "subagent", "status": "running", "description": "Background sleep 30 check", "agent_type": "general-purpose" },
  { "id": "b1h7…", "type": "shell",    "status": "running", "description": "sleep 45", "command": "sleep 45" }
],
"session_crons": []
// $.agent.list()
[ { "id": "af95…", "description": "Background sleep 30 check", "type": "general-purpose", "status": "running" } ]
```

## Other findings

- **Background completion starts a new turn by itself.** Each finished background job delivered a notification that started a new main turn, so a new `classic.Stop` came without user input. Re-checking at the next Stop (ADR-004) is enough. No timer or polling is needed.
- **`$.agent.list()` lags `background_tasks`.** At Stop #2 the subagent was `completed` in `$.agent.list()` and gone from `background_tasks`. At Stop #3 the list was empty (the entry was dropped). Use `background_tasks` as the main gate and `$.agent.list()` as a second check, as ADR-004 already says.
- **Subagent work was short.** The subagent's own `sleep 30` was refused by Claude Code ("blocked as a standalone sleep"), so the subagent was in flight for only ~5 s. It was still caught as `running` at Stop #1. A long-running subagent has not been observed. The mechanism is the same, but the case was not exercised.
- `session_crons` was `[]` on every Stop (crons are covered by S-04).
- Incidental (relevant to Q-3): the background shell's environment contained `CLAUDE_PLUGIN_DATA=<home>/.claude/plugins/data/<plugin>-<marketplace>`, exported for an installed command-hook plugin. S-06 checks whether a mod sees anything similar.

## Fallback adopted

None needed. ADR-004's policy (treat any background task, running agent or cron as unsafe; re-check at the next Stop) is confirmed as written.

## Cost note

One PTY run, 5 short main turns plus one short subagent on Haiku. About 57K input tokens per turn, mostly prompt-cache reads; well under US$0.10. Two earlier attempts never left the trust dialog (a driver bug, fixed) and made no model calls.
