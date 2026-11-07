# M3 gate demo: rotation up to a persisted, validated handover

- **Date:** 2026-11-07 · **Claude Code:** 2.1.319 · **Model:** `--model haiku` · **Driver:** `drive_m3.py` on `../m1-relay-status/ptylib.py`, 140x40 PTY
- **Load:** `claude --plugin-dir <repo>/sessionrelay`, `CLAUDE*`/`CODEX*` stripped, `SESSIONRELAY_TEST=1`, `SESSIONRELAY_STATE_DIR=<scratch>/state`, `SESSIONRELAY_TEST_THRESHOLD_OVERRIDE=9`, throwaway git repo with `src/calc.js`
- **Runs:** 1. **Cost:** $0.07 (status line).

| Check | Result |
|---|---|
| `/relay on`, first prompt captured (rev 1) | PASS |
| First reading below the override | 6% (56,322 tokens): MONITORING |
| Request at >= T | 11% after one large paste: ROTATION_REQUESTED (THRESHOLD) |
| Safe Stop asks for the handover | PASS, at the **next** turn's Stop (see finding 1) |
| Claude's handover parsed and validated | PASS, first try (`retries: 0`) with the final ST-3.4 text |
| Written once as `history/handover-001.md` | PASS |
| SHA-256 of the file equals the ref in `state.json` | PASS (`sha256_matches_ref: true`) |
| `handover.md` identical copy | PASS |
| State after | ROTATING, step HANDOVER_PERSISTED; events MONITORING > ROTATION_REQUESTED > HANDOVER_GENERATING > VALIDATING > ROTATING |
| No `/clear` (M3 does not wire it) | PASS |

Files: `result-run1.json` (state and events from disk), `handover-001-run1.md` (the merged file), `driver-run1.log`. Scratch paths are replaced by `<scratch>`.

## Findings

1. **The reading that crosses the threshold arrives after that turn's Stop.** The request was recorded at 17:36:13, after the paste turn had already stopped, so the handover was asked for only at the next turn's Stop (the driver sent one more short prompt). In a long turn with tool calls the reading comes mid-turn and the same turn's Stop asks. But a session left idle after crossing the threshold waits for the user's next prompt. Open item for M4: start the handover from `turn.complete` when the request lands after the Stop, or accept and document it.
2. **Context echo again (R-08).** The handover mentions "the Stripe feedback prompt", text injected by the maintainer's globally installed plugins, not by the task. Harmless here; the validator only blocks secrets and false claims.
3. No tool calls happened, so the ledger was empty and no soft-quiesce note was due (`noteAppended: false`). Both are covered by mod tests (`ledger.test.ts`, `quiesce.test.ts`).

## Not covered live

Invalid handover -> retries -> NEEDS_REVIEW: haiku cannot be made to write a bad handover on demand, so this is proven by `tests/mod/handover.test.ts` (AC-17: 2 retries with the errors, then NEEDS_REVIEW, earlier handover byte-identical, no `/clear`) and the validator table tests. The ST-3.4 parse rate was 1/1 first try live with the final text; the 10-trial S-05 rate was measured on the draft text.
