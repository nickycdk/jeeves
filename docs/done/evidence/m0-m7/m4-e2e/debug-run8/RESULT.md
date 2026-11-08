# Live run 8 (meant as gate run 5): stuck at the second handover's Stop

**Commit:** f235eb5 · Claude Code 2.1.319 · haiku · override +0.8 · chars 6000 · cost about US$0.03 (session 1 US$0.016 recorded; session 2 not recorded, killed). Assembled by hand.

What worked live, unattended: session 1 start 5.82% (its second tool reading; f235eb5), steps 1-2 committed, request at 6.98%, handover 1, Jeeves's `/clear`, CONTINUING 1 s after SessionStart, the low first reading (3.76%) passed over, rearm at the real start 6.43% (below the source end 7.28%), session 2 committed steps 3-6 from the continuation (one commit per step, no step redone; `./verify.sh` exits 0 on the final repo), request 2 at 7.28%, the handover instruction delivered.

Fault: Haiku's second handover (`handover-2-reply.txt`, from the session transcript) reached the Stop at 20:30:17, and Jeeves's Stop recorded nothing: no retry, no event, state HANDOVER_GENERATING, Claude idle. Offline replay of parse + validate on the same repo and state is fine (3 MISSING_PATH errors, i.e. a retry). The difference: `mentionedPaths` took the regex `` `/\s+/` `` for an absolute path, and the live Stop looked it up with `$.fs.exists`, which "rejects only a network location"; the rejection threw out of `handoverStop`, and `quietly` logged it to a debug log nobody was writing. Unverified guess for the rejection: the engine reads the backslash as a separator, so `//s+/` looks like a network path.

Fixes (next commit): `asPath` refuses a token with a backslash (unit test); a refused lookup counts as missing (one line, untested: the mod kit skips a throwing hook instead of rejecting); the driver now passes `--debug-file` and keeps Jeeves's debug lines in `jeeves-debug.log`, and survives a `claude` that already exited.
