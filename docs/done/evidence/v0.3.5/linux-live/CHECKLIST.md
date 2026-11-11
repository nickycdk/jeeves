# Linux live run (0.3.5)

Goal: turn "Linux should work but is untested" into "tested". CI already runs the unit and mod tests on `ubuntu-latest`; this is the one thing CI cannot do, a logged-in Claude Code session on Linux. The run does not block 0.3.5. When it passes, a docs-only commit updates the README Requirements, the root README platform badge and `jeeves/docs/compatibility.md`.

Copy this file to `RESULT.md` in this folder and fill it in.

## Environment

- Distro and version (`cat /etc/os-release`):
- Kernel (`uname -sr`):
- Claude Code version (`claude --version`):
- Node version (`node --version`):
- Terminal:
- Shell:
- Account type (personal, or Team = turn mode):
- Jeeves version (`/jeeves status --diagnose`):

## Steps

Use a scratch git repository with a `package.json` that has a `test` script. Record what you saw in each box, and paste screenshots or transcript excerpts where they help.

1. [ ] `claude plugin install jeeves --marketplace nickycdk/jeeves`, then `/jeeves status` answers `mode: full` (or `full (turn)` on Team).
2. [ ] With `XDG_STATE_HOME` **unset**: `/jeeves status` shows the state folder `~/.local/state/jeeves`.
3. [ ] `/jeeves on`: the reply has `Suggested checks: /jeeves check npm test`. Type the task: a multi-step job, for example "add 10 small modules, one at a time, each with a test".
4. [ ] `/jeeves rotate`: the transcript shows `handover requested`, then `validated, starting fresh`, and the fresh conversation carries on with nothing typed.
5. [ ] A natural rotation at the threshold (`/jeeves threshold 25` gets there sooner).
6. [ ] A notification shows when the task completes or stops (if your notification setting is on).
7. [ ] `/jeeves check npm test`; Claude finishes and reports done; the task completes, or `/jeeves done` confirms it.
8. [ ] `/jeeves status --diagnose` prints a report with `~` in place of the home folder.
9. [ ] Restart `claude` with `XDG_STATE_HOME=/tmp/xdg-jeeves` set, then `/jeeves status`: the state folder is `/tmp/xdg-jeeves/jeeves`.
10. [ ] `/jeeves purge --all`, then `purge confirm <code>`, removes the task folders.

## Result

- Pass / fail:
- Anything that differed from macOS:
