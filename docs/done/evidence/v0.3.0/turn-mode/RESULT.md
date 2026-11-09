# ST-16.8: live E runs on the Team account (turn mode): PASS, one defect found and fixed

**Date:** 2026-11-09 · Claude Code 2.1.319 · haiku · macOS · the maintainer's Team account through the fresh-install command (a separate `CLAUDE_CONFIG_DIR`, logged in; `JEEVES_TEST=1`, a scratch `JEEVES_STATE_DIR` per run; the repo's plugin by `--plugin-dir`) · drivers `jeeves/tests/pty/driver.py` and `jeeves/tests/pty/e_layers_v2.py` (new `--config-dir`), costs from `jeeves/tests/pty/transcripts.py`.

**Spend:** about **US$0.31** API-equivalent over all attempts (budget US$3, cap US$1 per run), computed from the transcripts' token usage at Haiku 5.5 prices. Per run below. `/cost` and the engine's session cost do show dollars on this subscription account (`Total cost` on screen; `costUsd` in Jeeves's session records), and they agree with the transcript figure to within cents.

Home paths in the copied screens are replaced by `~`, the scratch folder by `<scratch>`.

## Runs

| Run | What | Result | Cost (US$) | Evidence |
|---|---|---|---|---|
| 1 | `six-steps`, threshold +0.8, two rotations with nothing typed after the task | **PASS** (all 8 checks; 3 sessions, distinct ids, handovers 1 and 2 validated before each `/clear`, no step committed twice, transition lines with the goal and the resume id) | 0.032 | `run1-six-steps/` |
| 1, attempt 1 | the same, before the driver fix | 7 of 8; "transition lines" FAIL was the **driver's** stale string (since ST-14.3 the line reads `handover validated (goal: …), starting fresh`); fixed in `driver.py`. Its final state ROTATING is a third rotation that started while the driver typed `/cost` after its stop and was cut by the driver's Ctrl-C | 0.050 | `run1-six-steps-attempt1/` |
| 2 | AC-07: threshold (6%) crossed just before a Bash call that needs permission; dialog held open 20 s | **PASS**: ROTATION_REQUESTED when the dialog opened, nothing saved or cleared in 20 s, rotation after the answer | 0.113 | `run2-ac07-and-clear/g/` |
| 3 | a typed `/compact` → one rotation | **PASS** after the first attempts: the context filled to 107K by reading the log, `/compact`, then one typed prompt; its reading fell to 43K → `COMPACTED`, one rotation, handover-001 | 0.065 | `run3-compact/k/` |
| 3, attempts | (a) v0.2's phase c as is: `/compact` at 42K context with nothing typed after it | no reading after `/compact`, so nothing happened: expected in turn mode (a compaction is seen only at the next reading, README), and 42K leaves less than the 10K fall anyway. Not a defect; phase k replaces it for turn mode | 0.004 | `run2-ac07-and-clear/c/` |
| | (b) phase k while I edited `hooks/register.ts` | **void**: `--plugin-dir` hot-reloaded Jeeves mid-run (one intermediate edit did not load: `⚠jeeves` on screen), which also reset the last reading the fall is measured from | 0.041 | `run3-compact-void/` |

## Probe items (ST-16.2 … ST-16.7)

| Item | Answer |
|---|---|
| A row appended at `turn.start` reaches that turn's first model call (ST-16.6) | **No, and not any call of that turn.** From the transcripts' recorded requests (`api-request` / `api-request-blob`): run 1 attempt 1, conversation 2 appended the rules at 14:40:50.747; none of the turn's 5 requests carried them; they appeared first in the next turn's request (the handover request). Conversation 1's first turn got no row at all. In a run with nothing typed, a conversation's work is one long turn, so Claude worked without the completion rules. A row appended at a tool result (the threshold nudge, 14:40:59.612) **did** reach the next request (14:41:01.997). **Fixed** (see below) and checked live in run 1: conversation 2 `PROMPT R- R- R- R- ROW R+ R+ R+ R+ R+` (the row went in at the turn's first reading and was in every later request of the turn). |
| The first turn of a process | **Open (known limit):** Jeeves learns it is in turn mode when the first main turn ends without a Stop, so that first turn gets no row (run 1, conversation 1: no row until the handover turn). The next turn gets it, and every continuation does. An auto task that finishes within the first turn of a new `claude` process is therefore not claimed as done until the next turn. Not fixed: telling turn mode earlier would need a guess (e.g. no `prompt.compose` before the first request); left for the maintainer. |
| Several text blocks in one final message (ST-16.3) | Not seen: 0 final messages with more than one text block in 69 model calls. Unverified live; I covers it. |
| A user `/clear` in turn mode carries auto-start over (ST-16.7's fix) | **PASS** (`run2-ac07-and-clear/u/`): the first typed prompt started an auto task; the user `/clear` ended it (DISABLED, USER_CLEAR); the fresh conversation's first typed prompt started a new auto task with no SessionStart; status shows `mode: full (turn)`. |
| A plugin `/clear` that never resolves in turn mode (gate run 5's case) | Not seen in 7 rotations (each `/clear` that ran resolved and the fresh conversation continued within seconds). Cannot be forced; stays a known risk with no fresh-session timer in turn mode. |
| Handover validated and saved as in Stop mode | Yes: 7 handovers saved and verified (hash in the ROTATING event) before each `/clear`. One retry in 7: Claude named `../src/step3.js` in a [verified] bullet; the validator caught it and the corrected block passed. |
| Q-12 (where AC-07 E and the compaction phase run) | **Answered: on the Team account in turn mode.** AC-07 E passes there (run 2). The compaction phase passes in its turn-mode form (run 3); the Stop-mode form (`session.compact`) cannot run on this account. |

## The defect and its fix

`completionRow` was called from `turn.start`. Now `turn.start` only marks the row as due (`rowDue` in `jeeves/hooks/register.ts`), and the turn's first context reading (`session.measure`, which comes after a model response) appends it. `completionRow` returns false while there is no task of this session to count (e.g. the task's prompt is not captured yet), so the next reading tries again. This is still ADR-007 A1's hidden row at the same points (task start, each continuation, every 10 turns, at once after a recognised compaction), sent a little later within the turn. I: `tests/mod/turn-complete.test.ts` AC 1 now checks the row arrives at the reading, not at `turn.start`. Turn-mode suite: 310 pass.
