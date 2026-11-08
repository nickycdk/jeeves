# Live run 7 (meant as gate run 5): stopped, first tool reading in a fresh session is low too

**Commit:** 780376f (code 332b9e2) · Claude Code 2.1.319 · haiku · override +0.8 · chars 6000 · cost about US$0.02 (session 1 US$0.017 recorded; session 2 killed during its handover). Assembled by hand (driver.log = driver stdout).

Rotation 1 worked unattended: step 1 committed, request at 6.5% (start 5.68 + 0.8), handover, Jeeves's `/clear`, RESTORING -> CONTINUING 1 s later (fresh-session timer), the continuation acted on (session 2 re-checked the repo and wrote `src/step2.js`).

Fault: session 2's **first tool result** read 3.76% (`git status … cat src/step2.js`, 20:25:14.9) and its second 6.46% (write `src/step2.js`, 20:25:19.7). So 332b9e2's "start = first tool reading" still took the low figure, and session 2 asked for a handover at its second tool call. Stopped by hand.

Seen in 4 of 4 fresh sessions (runs 6, 7): exactly one low reading at the first tool result, then the real level. Not seen in a first session (session 1 read 5.68% at its first tool result). Unverified guess: the first model call after `/clear` creates a new prompt cache that the engine's usage figure does not count.

Fix (next commit): relative mode takes a session's start from its **second** tool-result reading.
