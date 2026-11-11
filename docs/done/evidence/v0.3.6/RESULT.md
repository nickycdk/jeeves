# Live check: completion summary and threshold hint (plan 12)

**Date:** 2026-11-11 · **Claude Code:** 2.1.322 · **Model:** haiku (200K window, `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`) · **Driver:** `drive.py` (uses `jeeves/tests/pty/ptylib.py`; `--plugin-dir` is the working tree, as an absolute path) · **Files:** `result.json`, `driver.log`, `debug-jeeves.log` (the Jeeves lines of Claude Code's `--debug-file`).

**Scenario:** a scratch git repository with `test.sh` (passes). `/jeeves on`, a first step that runs `sh test.sh`, `/jeeves check sh test.sh`. The threshold is set 8 points above the first reading (25.27% → `/jeeves threshold 34`), since a fresh conversation starts about 7 points lower. `/jeeves rotate`; the driver makes 2 commits; `/jeeves rotate` again; then Claude runs the check and ends with the completion block. `/jeeves stats` last.

**Result: PASS.**

## Threshold hint

- Rotation 1: the fresh conversation rearmed at 18.07% (`rearmed at 18.07%`), 16 points under 34%. Jeeves showed once, as a toast and a transcript line: `this conversation started at 18%, leaving 16 points before the 34% handover. /jeeves threshold 50 gives more room (/jeeves defaults threshold 50 for this project).` 50 = ceil5(18.07 + 30), below the cap.
- The plugin store got `roomHint:t_20261111_y74xcj`; `state.json` has no such field.
- Rotation 2 rearmed at 18.29%: no second toast (`debug-jeeves.log` has one `$.ui.toast` with the hint in the whole run).

## Completion summary

```
jeeves: task completed in 2m: 2 handovers, 2 commits, 1/1 checks passed.
jeeves: context cleared 8.3 points (~17K tokens). Cost: $0.03.
```

- `git log --oneline <taskStartHead>..HEAD` lists 2 commits.
- `/jeeves stats` for the task: `Rotations: 2`, `Context cleared: 8.3 points (~17K tokens)`, `Cost: $0.02 over 2 session(s)`. The summary's $0.03 adds the live session's cost, which has no session record yet (the two records: $0.0091 and $0.0119).
- The notification (`$.ui.notify`, 64 characters) is line 1 without the prefix. No completion toast.

## Found and fixed by this check

1. **The hint never showed live** (runs 2 and 3). `apply()` looked for the rearm only on a `MEASURE` input, but live the fresh conversation's first reading usually comes inside a `TOOL_RESULT` (machine.ts runs `MEASURE` inside it). The mod tests sent `session.measure` only. Fixed: the check is on the transition (CONTINUING → MONITORING, which only the rearm makes); `tests/mod/room.test.ts` now delivers the reading through a tool result, and fails against the old check.
2. **Run 1 did not test the working tree.** `--plugin-dir jeeves` was relative and `claude` starts in the scratch repository, so the installed Jeeves 0.3.5 loaded. The driver now passes an absolute path.
3. **First guess at the threshold was wrong.** A fresh conversation starts about 7 points below the first conversation's first reading (25.5% there, 18.0% fresh), so `threshold = first + 15` left 23 points of room and no hint was due. Now `first + 8`.
