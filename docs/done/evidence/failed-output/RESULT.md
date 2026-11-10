# Live check: what a failed Bash result looks like to the hook (plan 11, step 1)

**Date:** 2026-11-10 · **Claude Code:** 2.1.322 · **Model:** haiku · **Driver:** `drive.py` (uses `ptylib.py` from `../m0-m7/s-02-work-in-flight/`, copied into `<scratch>/lib`) · **Mod:** `mod/` (throwaway; logs every Bash `tool.call` result to `events.jsonl`).

**Scenario:** one prompt runs two scripts as separate Bash calls:

- `sh fail.sh`: `OUT-1` (stdout), `ERR-1` (stderr), `OUT-2` (stdout), `progress 10%\rprogress 100%` (stdout), `ERR-2` (stderr), `exit 3`.
- `sh big.sh`: 1,000 lines of ~50 characters (stdout), then `ERR-END` (stderr), `exit 2`.

## Findings

1. **The streams arrive merged, in print order.** `fail.sh` gave `text` = `Exit code 3\nOUT-1\nERR-1\nOUT-2\nprogress 10%\rprogress 100%\nERR-2` (`isError: true`). So the last lines are the last lines printed, whichever stream. Plan 11 keeps the last 20 lines (no first-5 + last-15 split).
2. **`Exit code N` is the first line of `text`.** `result` holds the same text with `Error: ` in front. The test kit's fake (`Exit code 1`) has the right shape.
3. **`\r` arrives raw.** Progress frames reach the hook unchanged, so `outputTail` keeps only the text after the last `\r` on each line.
4. **Long output is cut before the hook sees it.** `big.sh` printed ~50,000 characters; `text` was 10,040: the first ~5,000, then `... [20012 characters truncated] ...`, then ~5,000 ending at `line-590`. Lines 591-999 and `ERR-END` never reached the hook. Claude Code first keeps about the first 30,000 characters, then trims the middle to about 10,000. The model reads the same text, so for output above ~30,000 characters the tail Jeeves keeps is the last part Claude saw, not the real end.

## End to end with Jeeves (`e2e/`)

**Driver:** `e2e/driver.py` (uses `jeeves/tests/pty/ptylib.py`; `--plugin-dir jeeves` from the working tree, haiku, explicit task). `test.sh` prints `running 3 tests`, then fails with `FAIL calc.test: expected 4, got 5` on stderr, until a file `fixed` exists.

**Result: PASS** (`e2e/result.json`):

- After step 1 (`sh test.sh`, exit 1) the ledger held `running 3 tests\nFAIL calc.test: expected 4, got 5`; `state.json` on disk was schema 3.
- `/jeeves rotate`: `e2e/handover-001.md` shows the block with both lines quoted (`    > `), the exit, time and `0 edits since`. The fresh conversation's own transcript holds the quoted lines. The merged file was 3,456 characters (SessionStart context was measured intact up to 30K).
- The driver created `fixed`; step 2 ran `sh test.sh` again (exit 0): the tail was gone and `state.json` was written as schema 2.
- Second `/jeeves rotate`: `e2e/handover-002.md` shows `- none` under the block.
