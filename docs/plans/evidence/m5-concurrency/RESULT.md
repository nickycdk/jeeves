# AC-18 concurrency (PTY): PASS

Claude Code 2.1.319 (Claude Code) · 4 processes at once · only /relay commands typed (no model call)

| Check | Result |
|---|---|
| p1 trust | PASS |
| p2 trust | PASS |
| p3 trust | PASS |
| p4 trust | PASS |
| p1 on | PASS |
| p2 status (read-only view of p1 task) | PASS |
| p2 on: LOCK_HELD for p1 task, separate task | PASS |
| p2 off ends its own task | PASS |
| p2 off again: LOCK_HELD for p1 task | PASS |
| p2 recover: LOCK_HELD | PASS |
| p3 (linked worktree) on, no LOCK_HELD | PASS |
| p4 (second repo) on, no LOCK_HELD | PASS |
| p1 still owns its task (MONITORING) | PASS |
| 3 project folders (repo, worktree, repo2) | PASS |
| 4 tasks, each its own session | PASS |
| p2 task DISABLED, others MONITORING | PASS |
| no model call (no cost shown or $0.00) | PASS |

Tasks on disk (project, task, status, session, lock owner):
- 0c222bdf5b04c245 t_20261107_x64gqu MONITORING f63a8291 lock=None
- be12cefaa00098d4 t_20261107_l6vsrx DISABLED e8cda05d lock=None
- be12cefaa00098d4 t_20261107_whm3dk MONITORING 2052a962 lock=None
- c7d47af44e16cee4 t_20261107_75cldr MONITORING 53aa352d lock=None

/cost per process: {"p1": ["0.0000"], "p2": ["0.0000"], "p3": ["0.0000"], "p4": ["0.0000"]}
