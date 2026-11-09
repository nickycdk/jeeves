# AC-41 live runs (ST-15.2): PARTIAL. Dry run and 200K pass; the 1M run with Jeeves did not measure rotation (grace period)

**Date:** 2026-11-09 · Claude Code 2.1.319 · haiku · macOS · the maintainer's Team account in turn mode (D-49), fresh-install command: `CLAUDE_CONFIG_DIR` a separate logged-in folder whose Jeeves plugin store was moved aside before the dry run and again before the 1M auto run, `JEEVES_TEST=1`, a scratch `JEEVES_STATE_DIR` per run · driver `jeeves/tests/pty/ac41.py`, fixture `long-task` (`jeeves/tests/fixtures/build-repo.ts`, case tables 24,000 chars per module) · every figure measured **in turn mode**.

**Spend:** US$6.97 API-equivalent for the four runs (cap US$40), from the transcripts' token usage at Haiku 5.5 prices (prompts over 100K at 5×; cache reads and writes included). `/cost` does show dollars on this account (checked in ST-16.8). The driver did not type `/cost` every 10 minutes as the story planned, because that would be a keystroke during "nothing typed but the task". It computed spend from the transcripts every minute instead, as the story allows. Home paths in the copied screens are `~`, the scratch folder `<scratch>`.

| Run | Modules | Outcome | Conversations / rotations | Peak prompt | Calls | US$ |
|---|---|---|---|---|---|---|
| Dry run (AC-35 E) | 1 | **PASS**: first-run notice (not the upgrade notice), an auto task, `task-rev-001.md` holds the prompt word for word, nothing in the state folder before it, module committed, verify passes | 1 / 0 | 57K | 6 | 0.01 |
| 200K simulated (`JEEVES_TEST_WINDOW_OVERRIDE=200000`, `/jeeves on`) | 18 | **PASS**: verify passes, each module committed once | 3 / 2 | 133K | 40 | 0.22 |
| 1M with Jeeves (auto mode, nothing typed but the task) | 64 | **verify passes, each module committed once; FAIL as a measure of rotation** (below) | 2 / 1 (COMPACTED, after the engine's own compaction) | 972K | 91 | 2.78 |
| 1M without Jeeves (no `--plugin-dir`) | 64 | **PASS** (outcome: one auto-compaction): verify passes, each module committed once; `autoCompactThreshold` not set in the config folder (default) | 1 / 0, one compaction | 962K | 135 | 3.95 |

## The 1M run with Jeeves

Claude did all 64 modules in **one turn**: with nothing typed there is no turn end until the work is done. Auto tasks have a grace period, "no handover in the first 3 turns" (`GRACE_TURNS = 3`, `jeeves/src/core/machine.ts:111`, counted in main turns; the threshold request is skipped while in grace, line 281). Under it Jeeves never requested a handover at 40%; the first call above 400K was at 15:25:46. The context grew to 972K, the engine compacted by itself (Jeeves logged `context fell 842694 -> 306779 tokens`), and only then did Jeeves rotate, as a recognised compaction (ADR-006 A1). The continuation found the work done and claimed completion. With no check commands that goes to NEEDS_REVIEW(DOD_UNMET), by design (ADR-007).

So this run measured the grace period, not Jeeves's rotation. Its cost (US$2.78 against the baseline's US$3.95) is not a with/without comparison: both ran one long conversation into compaction. The difference comes from the conversations after the compaction, and the baseline made 135 calls against 91. The spec §11.1 prediction ("with Jeeves at roughly half the baseline") is **not measured**. Stop mode counts the grace turns the same way, so it is not a turn-mode-only issue. Whether the grace period should also end at a context amount is a spec decision (auto-start spec, approved), left to the maintainer.

A second limit showed up in the same run: no hidden row reached that turn at all. The rules row is not sent in the first turn of a process (turn mode is known only at its end, ST-16.8), and the threshold note was never due. Even when sent, such rows are dropped before a turn's last call (ST-16.8 RESULT).

## Q8 (D-45) from the 200K run

All four parts were met:

1. **Outcome passes:** verify exits 0 after the last rotation.
2. **Real work between rotations:** growth from start to rotation was 91,440 and 76,440 tokens. The median, 83,940, is at least 40K, and none is below 20K. The sessions rotated at 55% and 56% of the simulated window, past the 50% threshold: turn mode rotates at the turn end, after the threshold note.
3. **No stops:** none (no POSSIBLE_LOOP, NEEDS_REVIEW or FAILED), and one handover retry.
4. **No repeated work:** each of the 18 modules was committed exactly once.

Per D-45, auto-start on 200K windows is proposed for v0.3.x with its own live check. This is measured in turn mode with an explicit task, so the grace period did not apply. An auto task would meet the same grace limit as the 1M run.

## Other checks

- **NFR-10** (1M auto run): no file in the state folder outside `task-rev-*` and `heldPrompts` holds the task's prompt text.
- **Estimate redone after the dry run:** about US$18 in all, against US$6.97 spent. The 1M with-Jeeves run never rotated at 40%, so its cost stayed far below the estimate.
- **Driver:** its own `./verify.sh` once hung for 17 minutes next to Claude's (both write `.verify.log`). It was killed by hand, so `verify_exit` in `auto/result.json` is 137. Run by hand afterwards, verify passed (77,188 cases). The driver now bounds it at 300 s.
- Both 1M runs reached a 962–972K prompt: every call above 100K paid 5×.
