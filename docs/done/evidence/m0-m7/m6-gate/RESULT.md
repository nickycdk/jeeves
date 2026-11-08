# M6 gate: maintainer's manual checks

**Date recorded:** 2026-11-08 · **Claude Code:** 2.1.319 · **OS:** macOS (Darwin 27.2) · **Recorded by:** the agent, from the maintainer's answers in the M7 session.

| Gate item | Result | Evidence |
|---|---|---|
| AC-01 M layer: README quickstart on a fresh macOS user account, timed | **PASS** (maintainer-reported: under 5 minutes) | Maintainer's own run. Exact time and recording path were not given to the agent; to be attached in `docs/done/evidence/v0.1.0/AC-01/` (ST-9.2). P layer: `docs/done/evidence/m0-m7/m6-install/RESULT.md` (install 2 s, status at 15 s) |
| AC-02: 06 §6 Cursor checklist, 7 items, before and after one rotation | **PASS**, all 7 items in both phases (maintainer-reported) | Maintainer's own run. Cursor version and recording not given to the agent; to be attached in `docs/done/evidence/v0.1.0/AC-02/` (ST-9.2) |
| AC-20, AC-21, AC-22 | PASS (see `handoff-m6.md` §2) | `docs/done/evidence/m0-m7/m6-install/RESULT.md`, 04 ST-8.4, `jeeves/docs/compatibility.md` |

Not done: the optional installed-plugin rotation with a logged-in throwaway config (`handoff-m6.md` §2 (c)).

**Verdict:** M6 gate passed on the maintainer's word for the two manual items. The agent did not see the recordings.
