# M6 demo run 2: one rotation continued (US$0.03); one check reported wrongly

`--plugin-dir` on `jeeves/`, the same folder the local marketplace installs in place (a `directory` marketplace loads the plugin from its source, see `../../m6-install/`), with the maintainer's normal login: the throwaway config of run 1 was still not logged in (the maintainer's `/login` went to the normal config), and installing into the real `~/.claude` was not approved.

What happened (driver.log, events.jsonl): threshold at 6.66% -> handover requested -> handover-001 saved and verified -> `/clear` -> new session 048539be -> RESTORING -> CONTINUING -> MONITORING (rearmed at 6.49%) at 65.7 s, where the driver stopped. No keystroke after setup, no permission dialog, steps 1 and 2 committed once each.

The check "1 rotation(s) continued" shows FAIL because the driver read the final state about 10 s after stopping (after `/cost`), when the cheap test threshold (+0.8 points) had already started the next handover (`HANDOVER_GENERATING`). The driver now records the state at the stop (`stopped_at`, e4efd1d); the run was not repeated.

ST-7.1 live: the transcript lines appear in order in the real TUI (`plain.txt`, `screens/`): "handover requested (THRESHOLD)", "asking Claude for the handover", "checking the handover", "handover validated, starting fresh", "restoring the task", "the fresh conversation continues the task", "session 2 at 6%, watching context". The status entry rendered as `Jeeves ?/?%` (threshold unknown until the session's first reading under the relative override) and, in run 1, `Jeeves: paused (AUTH)`. The numeric `N%/T%` form is not visible in the captured stream (the TUI redraws only changed cells), so it is verified by unit and mod tests only.
