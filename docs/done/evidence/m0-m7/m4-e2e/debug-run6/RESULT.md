# Live run 6 (meant as gate run 5): stopped, D-25 start reading wrong

**Commit:** bdb8655 · Claude Code 2.1.319 · haiku · override +0.8 · chars 6000 · cost US$0.036 (3 recorded sessions; the 4th was killed mid-handover)

Stopped by hand after 4 rotations in 90 s with only step 1 committed. The driver crashed on `/cost` after the kill, so this folder was assembled by hand (driver.log = its stdout).

First live sightings, all working: Jeeves's own `/clear` (3x), the fresh session taking the task, the 1 s fresh-session continuation (bdb8655) moving RESTORING -> CONTINUING about 1 s after SessionStart, the continuation acted on (session 2's handover: "Repo state re-checked at the start of session 2"), rearm (3x).

Fault: each fresh session's first reading (3.74 / 3.76 / 3.77%) came about 3 s after the continuation, before its first model call. The first model call adds ~2 points (6.10 / 6.11 / 6.64% at the first tool result; session 1, whose first reading came at a tool result, started at 5.68%). With start = 3.75, start + 0.8 fired at the first tool call: every session rotated without progress (`state.json`: rotation 4 at `thresholdAt` 4.57).

Fix (332b9e2, D-25 amended): the relative start is the first tool-result reading; the loop guard compares it with the source session's last reading (`guardPct`), because a normal fresh start (6.1-6.6%) exceeds the old session's threshold (5.68 + 0.8).

| Session | start% | end% | US$ |
|---|---|---|---|
| 636ddb05 | 5.68 | 7.26 | 0.0148 |
| 486095c8 | 3.74 | 6.77 | 0.0119 |
| d1172ac2 | 3.76 | 6.25 | 0.0093 |
