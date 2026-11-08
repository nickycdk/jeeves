# E layers AC-03, AC-07, AC-09, AC-10 (ST-9.2 live runs)

**Date:** 2026-11-08 · **Claude Code:** 2.1.319 · **Model:** haiku (Haiku 5.5, 1M-token window) · **OS:** macOS (Darwin 27.2) · **Terminal:** PTY (`tests/pty/e_layers.py`, on `ptylib.py`) · **State:** scratch `JEEVES_STATE_DIR` per run · **Fixture:** `failing-tests` plus a committed padding file `notes/log.txt` (2,401 lines, one `MARKER:` line).

Three live runs, about **US$0.21** in total, of the US$1 / 3 runs approved.

| Run | What happened | Cost |
|---|---|---|
| 1 | Neither phase reached its threshold: the 800-line padding file added only ~2 points on a 1M window. Phase B finished the task below the threshold (`NEEDS_REVIEW (DOD_UNMET)`, no checks set). Stopped by hand; kept as `run1/` | ~US$0.04 (phase A US$0.011 from `/cost`; phase B estimated, no `/cost`) |
| 2 | Padding ×3, relative threshold `+1`. Phase A and phase B: one rotation at 8.06%, fresh session at 3.64% | US$0.089 |
| 3 | Phase B only, with the read, `wc` and `date` made one step to put the permission dialog inside a pending rotation | US$0.077 |

## Results

| AC | Layer | Result | Evidence |
|---|---|---|---|
| AC-03 no rotation without opt-in | E | **PASS** | Run 2 phase A (test threshold 8%, no `/jeeves on`): the file was read and answered ("2402" lines; the driver's count regex expected 2400/2401 and reported FAIL, the answer is on screen in `run2/a/plain.txt`); `/context` afterwards: **12% used** (`run2/a/context.txt`); no task folder in the state dir; no handover request or nudge on screen; `/jeeves status`: "No managed task" |
| AC-07 no interruption during a permission prompt | E | **OPEN (not exercised)** | Runs 2 and 3 never had the threshold crossed while the dialog was open. Run 2: the rotation ran before the `date` dialog (it came in session 2). Run 3: haiku issued `date` before the large read registered, so the dialog opened at 5.69% (state MONITORING). The driver held it 20 s: it stayed open, nothing was written. After approval, the reading crossed the threshold (8.07%) and the rotation ran at the next Stop. That shows the dialog is left alone and the rotation waits for a Stop. It does not show the case "threshold crossed while the dialog is open". The I layer (`tests/mod/boundary.test.ts`: no effect until Stop) passes |
| AC-09 failed tests stay failed | E | **PASS** | Runs 2 and 3: the ledger has `npm test` exit 1; `handover-001.md` "Tests and checks": run 2 "`npm test` exit code 1", run 3 "`npm test`: failed, exit 1"; neither calls it passed. The validator accepted both on the first try |
| AC-10 new session id, fresh context | E | **PASS** (probe inconclusive) | Runs 2 and 3: distinct session ids across the rotation; context 12.43% → 3.64% (run 2) and 10.79% → 3.68% (run 3) across `/clear`. The "quote earlier messages" probe is **inconclusive**: in both runs Claude put the marker line into its own handover (`run2/b/history/handover-001.md` line 33), so the fresh session had it legitimately. Run 2 answered "NOT VISIBLE" anyway. The driver now counts the probe only when the handover lacks the marker |

## Notes

- The maintainer's global `UserPromptSubmit` hooks ran in these sessions too ("Tracking ponytail mode" on screen). They did not affect Jeeves.
- In both runs the task ended `NEEDS_REVIEW (DOD_UNMET)`: Claude reported done and the task had no verification commands. This is AC-13 behaving as specified.
- The files contain the scratch path, which includes the maintainer's user name. They are kept raw because `state.json` refers to the handover by SHA-256.
- Rerun: `python3 jeeves/tests/pty/e_layers.py <scratch> [--only a|b]` (about US$0.08–0.10 per run). For AC-07 the timing is up to the model. A deterministic E layer would need a fixture where the only path forward is one Bash call that needs permission right after the threshold is crossed.
