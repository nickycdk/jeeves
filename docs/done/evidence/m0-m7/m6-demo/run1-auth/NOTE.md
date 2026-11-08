# M6 demo run 1: not logged in (AUTH), US$0.00

The throwaway Claude config (`CLAUDE_CONFIG_DIR` in the scratchpad, Jeeves installed there from the local marketplace) had no login, so the first prompt failed with `authentication_failed` and no model call was made. It is not a rotation run, but it shows three things live for the first time:

- the installed plugin (`jeeves@jeeves`, no `--plugin-dir`) loads and runs `/jeeves on`, `/jeeves check` and captures the task;
- ST-6.2 StopFailure: the task paused as `PAUSED (AUTH)` with the message `Paused (AUTH): Claude Code is not logged in (authentication_failed). Run /login, then /jeeves resume.` (live-unverified until now);
- ST-7.1: the status entry (`Jeeves ?/?%`, then `Jeeves: paused (AUTH)`) and the transcript line `Jeeves: paused (AUTH): Login problem. /login, then resume.` render in the real TUI (`screens/00-PAUSED.txt`).
