# Turn mode (Team accounts)

Claude accounts in a Team organization work in **turn mode**: on Claude Code 2.1.319 a built-in plugin there runs before every installed plugin and skips the hooks Jeeves normally hands over with (Stop, SessionStart, compaction, system prompt). Jeeves notices after the first answer and uses the end of each answered turn instead (`/jeeves status`: `mode: full (turn)`).

What turn mode does not give:

- the handover's facts have no scheduled crons (`not available in turn mode`);
- compaction ahead of time cannot be skipped, and a compaction is recognised only from the next context reading (a fall of more than 10,000 tokens), then handed over at the next turn end;
- the completion rules reach Claude as a hidden row in the conversation (at the task's first turn, after each continuation and compaction, and every 10 turns) instead of in the system prompt; on 2.1.319 that row can be missing from a turn's last request and from the first turn after `claude` starts, so a "done" claim may come a turn later (a wrong claim still never completes a task).

In turn mode the turn's end is the handover point, and the handover is asked for and the task continued with prompts Jeeves sends. If Claude Code refuses a prompt Jeeves sends, Jeeves stays off for the session and says why (`off: prompt refused`).

See [Troubleshooting](troubleshooting.md) for what to type in each case.
