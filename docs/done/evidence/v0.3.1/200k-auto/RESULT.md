# ST-17.3: live auto-started session on a real 200K window

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Account:** the maintainer's Team account (turn mode, D-49), fresh-install state (`~/jeeves-fresh` as `CLAUDE_CONFIG_DIR`, a scratch `JEEVES_STATE_DIR` per run) · **Model:** haiku (Claude Haiku 5.5) with `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`, no `JEEVES_TEST_WINDOW_OVERRIDE` · **Plugin:** `--plugin-dir jeeves` at `e10190f` · **Driver:** `tests/pty/ac41.py auto <scratch> --config-dir ~/jeeves-fresh --window 200000 --no-1m` · **Budget:** US$2 (D-53); spent **US$0.86** over three runs (API-equivalent, from the transcripts; not billed in dollars on this account).

## Result: PASS on the run that finished, with two qualifications

Run 3 (40 modules) meets ST-17.3's pass list. The first two runs did not reach it, and are kept.

| Check (ST-17.3) | Run 3 |
|---|---|
| First-run notice, then an auto task holding the prompt word for word | yes (`first_run_notice`, `auto_task`; task-rev-001 is the prompt) |
| At least one rotation outside the grace period or past threshold + 10 | **4 rotations**, nothing typed after the task (`keystrokes_after_task: []`). The first was requested at 67.84%, past 60% (threshold 50 + 10) |
| D-45 (1) outcome passes | yes: all 40 modules committed, `./verify.sh` exits 0 |
| D-45 (2) median growth between rotations ≥ 40K tokens | growth 118,740 / 88,200 / 65,920 / 59,960; median **77,060** |
| D-45 (3) no stops, at most one handover retry | 0 retries; no stop while working. **Qualified:** the task ended in `NEEDS_REVIEW (DOD_UNMET)` once Claude reported it done: an auto task has no verification commands, so Jeeves asks the person to confirm with `/jeeves done` (designed behaviour) |
| D-45 (4) each module committed once | **39 of 40.** Module 39 was committed with a tie-break bug, which the final full verify caught, and Claude fixed it in a second commit (the task prompt forbids changing a committed module). This is a model slip, not Jeeves |
| NFR-10 grep of the state folder | clean (`nfr10_hits: []`) |
| Spend within US$2 | US$0.56 for run 3; US$0.86 for all three |

## The window and the grace margin (ST-17.1's check, now live)

`probe/`: `/context` before any prompt (a local command, no model call), same config.

- Without the variable: `31.6k/1m`, auto-compact buffer 33K (3.3%).
- With `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`: **`31.1k/200k`**, auto-compact buffer **33K (16.5%)**, so the engine compacts at about 167K, **83.5%**. The grace period's end (60%) and `/jeeves later`'s cap are below it.

**Risk seen in run 3:** the first handover was requested at 67.84% (one turn read many test files: 43K → 98K → 145K), and the handover turn itself took the context to **157,948 tokens (79%)**, only about 4.5 points short of the engine's compaction. Turn mode can act only at a turn's end, so a single heavy turn on a 200K window can come close to compaction before the handover is written. It did not compact here. If it did, ADR-006 A1's compaction rotation is the fallback.

## The three runs

| Run | Modules | Result | Rotations | Peak prompt | Spend |
|---|---|---|---|---|---|
| `run1-18/` | 18 | All modules committed and verified at 59K (30%) in 13 calls: Haiku skimmed the case tables (`tail -2`, grep summaries). **No rotation**, so it fails ST-17.3. Not void: each module was verified before its commit | 0 | 59,129 | 0.018 |
| `run2-40/` | 40 | Two rotations (requested at 62.28% and 53.96%; growth 105,440 and 72,940; one handover retry). In the third conversation Claude committed module 9, wrote "I'm continuing with module 10", and **ended its turn without a tool call**. In turn mode nothing prompts it again, so the run idled 10 minutes and stopped: **outcome not reached** | 2 | 145,641 | 0.278 |
| `run3-40/` | 40 | See above: **PASS** with two qualifications | 4 | 157,948 | 0.561 |

## What this does and does not show

- **Shows:** on a real 200K window, a fresh-install session is auto-watched, and its first typed prompt becomes the task. It rotates repeatedly with nothing typed, at a growth rate well above D-45's bar, and stays below the engine's compaction point.
- **Does not show:**
  - Stop mode: this is turn mode on a Team account.
  - A stable rate: one passing run.
  - Cost against a run without Jeeves.
- **Open behaviour, not a Jeeves error:** Haiku sometimes ends a continuation turn by announcing the next step without taking it (run 2). An unattended task then waits for the person. Whether Jeeves's hidden completion-rules row (ADR-007 A1) makes this more likely is not known.
