# AC-41 live runs (ST-15.2): PASS. Two rotations with nothing typed on 1M; the outcome passes with and without Jeeves; D-45 met on 200K

**Date:** 2026-11-09 · Claude Code 2.1.319 · haiku · macOS · the maintainer's Team account in turn mode (D-49), fresh-install command: `CLAUDE_CONFIG_DIR` a separate logged-in folder whose Jeeves plugin store was moved aside before each dry and auto run, `JEEVES_TEST=1`, a scratch `JEEVES_STATE_DIR` per run · driver `jeeves/tests/pty/ac41.py`, fixture `long-task` (`jeeves/tests/fixtures/build-repo.ts`, case tables 24,000 chars per module) · every figure measured **in turn mode**.

**Spend:** about US$10.40 API-equivalent over six runs (cap US$40 for the first four, US$14 for the re-run), from the transcripts' token usage at Haiku 5.5 prices (prompts over 100K at 5×; cache reads and writes included). `/cost` does show dollars on this account (checked in ST-16.8). The driver did not type `/cost` every 10 minutes as the story planned, because that would be a keystroke during "nothing typed but the task". It computed spend from the transcripts every minute instead, as the story allows. Home paths in the copied screens are `~` or `<user>`, the scratch folder `<scratch>`.

| Run | Modules | Outcome | Conversations / rotations | Peak prompt | Calls | US$ |
|---|---|---|---|---|---|---|
| Dry run (AC-35 E) | 1 | **PASS**: first-run notice (not the upgrade notice), an auto task, `task-rev-001.md` holds the prompt word for word, nothing in the state folder before it, module committed, verify passes | 1 / 0 | 57K | 6 | 0.01 |
| 200K simulated (`JEEVES_TEST_WINDOW_OVERRIDE=200000`, `/jeeves on`) | 18 | **PASS**: verify passes, each module committed once | 3 / 2 | 133K | 40 | 0.22 |
| **1M with Jeeves** (auto mode, nothing typed but the task), `auto/` | 64 | **PASS**: two rotations (the target), verify passes, each module committed once, no handover retry, no keystroke after the task, NFR-10 grep clean | 3 / 2 | 519K | 163 | 3.42 |
| 1M without Jeeves (no `--plugin-dir`), `base/` | 64 | **PASS** (outcome: one auto-compaction): verify passes, each module committed once; `autoCompactThreshold` not set (default) | 1 / 0, one compaction | 962K | 135 | 3.95 |
| *1M with Jeeves, first attempt*, `auto-grace-turns/` | 64 | *Did not measure rotation*: the grace period, then counted in turns only, lasted the whole one-turn task; the engine compacted at 972K, then one COMPACTED rotation. Led to D-50 | 2 / 1 | 972K | 91 | 2.78 |
| *1M with Jeeves, re-run attempt 1*, `auto-scripted/` | 64 | *Void*: Claude saw that the 64 modules cycle through six functions, wrote one script that implemented, verified and committed them all, and finished at 60K context. Re-run unchanged, so the task stays the baseline's | 1 / 0 | 60K | 7 | 0.01 |

## The 1M run with Jeeves (`auto/`)

With the grace period ending at threshold + 10 (D-50), the task, still one turn with nothing typed, was handed over at **50.07%** in its first conversation. The threshold request came mid-turn; the handover followed at that turn's end (51.8%). The second conversation, past its first rotation and so outside the grace period, rotated at **40.73%**. The third finished the work: the last module was committed and `./verify.sh` exits 0 (77,188 cases). Claude then claimed completion. With no check commands that goes to NEEDS_REVIEW(DOD_UNMET), by design (ADR-007).

- **Growth start → rotation:** 476,400 and 367,800 tokens.
- **Handovers:** 2, each validated first time (no retries); the rotation lines carried the goal.
- **Stops:** none besides the designed DOD_UNMET at the end.

## Cost with and without Jeeves (1M)

US$3.42 with Jeeves against US$3.95 without: **about 13% less** in this one pair of runs. The spec's prediction (§11.1, "with Jeeves at roughly half the baseline") is **not met**. Why: every call above 100K pays 5×, and both runs spend most calls there. With Jeeves the conversations still reach 400–520K before rotating (rotation at 40% of 1M is 400K, plus the grace margin in the first). Without Jeeves the single conversation reaches 962K, then compacts and works on at lower context, so it is not the "everything at 950K" case the estimate assumed. One pair of runs on a model whose work per module varies (163 against 135 calls) is not enough for a stable figure. What the README may say: Jeeves keeps each conversation below about half the window and rotates instead of compacting; it does not promise a saving.

## Q8 (D-45) from the 200K run

All four parts were met (plan 07 D-52):

1. **Outcome passes:** verify exits 0 after the last rotation.
2. **Real work between rotations:** growth from start to rotation was 91,440 and 76,440 tokens. The median, 83,940, is at least 40K, and none is below 20K. The sessions rotated at 55% and 56% of the simulated window, past the 50% threshold: turn mode rotates at the turn end, after the threshold note.
3. **No stops:** none (no POSSIBLE_LOOP, NEEDS_REVIEW or FAILED), and one handover retry.
4. **No repeated work:** each of the 18 modules was committed exactly once.

Per D-45, auto-start on 200K windows is proposed for v0.3.x with its own live check. This run used an explicit task (`/jeeves on`), so the grace period did not apply to it.

## Other checks

- **NFR-10** (1M auto runs): no file in the state folder outside `task-rev-*` and `heldPrompts` holds the task's prompt text.
- **Hidden rows:** the first 1M attempt showed no rules row reaching its one turn (the first turn of a process gets none, ST-16.8). This is the limit the maintainer accepted (D-51).
- **Fixture:** the `long-task` modules repeat six functions, so a model can script them, as re-run attempt 1 did. Haiku did not in four of five 1M runs. A future fixture should give each module its own function.
- **Driver:** its own `./verify.sh` once hung for 17 minutes next to Claude's (both write `.verify.log`), in the first 1M attempt. It was killed by hand, so `verify_exit` in `auto-grace-turns/result.json` is 137; verify passed by hand afterwards. The driver now bounds it at 300 s.
