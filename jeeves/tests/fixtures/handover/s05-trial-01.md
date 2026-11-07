<<<JEEVES-HANDOVER v1 task=t_20261107_spike0 rotation=r_001
## Completed since last handover
- [verified] `calc.js` originally exported only `add(a, b)` returning `a + b`. I added `export function sub(a, b) { return a - b }` below it with one Edit call, which reported success.
- [inferred] The requested change is complete. Nothing else was asked for.
- [unknown] I have not re-read the file after the edit, so the final file contents are confirmed only by the Edit success message.

## Decisions and constraints
- [verified] The user asked for one Edit call and a one-line reply. I followed that.
- [verified] The working directory is a git repo on branch `main`, and git status was clean at session start.
- [inferred] Commits and PRs need the Co-Authored-By and Generated-with attribution lines, but only if the user asks for a commit or PR.
- [unknown] Whether the user wants the change committed. Commit only on request.

## Tests and checks
- [verified] No tests were run this session.
- [verified] I read `calc.js` with `cat` before editing, so the Edit target was the file's real contents.
- [unknown] Whether the project has a test runner or a lint step that covers `calc.js`.

## Open work and blockers
- [verified] none
- [unknown] No blockers were reported. The `sub` export has no test coverage yet.

## Exact next actions
1. [inferred] Run `git diff -- calc.js` to confirm the edit, then check for a test script in the repo (e.g. `package.json`) before adding or running any tests.

## Do not repeat / do not change
- [verified] Do not re-add `add`. It is already present and unchanged.
- [verified] Do not add extra features, options, or files beyond `sub`.
- [inferred] Do not re-read the whole repo. Only `calc.js` is in scope.
JEEVES-HANDOVER>>>