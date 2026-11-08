# M5 demo, kill mid-rotation -> /relay recover: FAIL

Claude Code 2.1.319 (Claude Code) · haiku · relative override +0.8 · crash point before-clear (SIGKILL)
Cost about US$0.1827 (killed session 0.167, estimated from its transcript at haiku list prices; other sessions 0.0157)

| Check | Result |
|---|---|
| p1 trust | PASS |
| p1 on | PASS |
| p1 reached the crash point | FAIL |
| dead lock left behind | PASS |
| startup notice names the task | FAIL |
| first recover refused while the lock is live (LOCK_HELD) | FAIL |
| second recover continues | FAIL |
| dead process left ROTATING with handover-001 saved | FAIL |
| exactly one recovery (one STALE_LOCK -> RESTORING event) | PASS |
| exactly one continuation prompt in the recovering session | PASS |
| continuation built from handover-001 | FAIL |
| no keystroke after /relay recover until the end of the run | PASS |
| no step committed twice | PASS |
| AC-19 stash list unchanged | PASS |
| AC-19 refs: only refs/heads/main moved | PASS |
| AC-19 new reflog entries are commits only | PASS |
| AC-19 .git/config and worktrees unchanged | FAIL |
| AC-19 Claude settings files unchanged | PASS |

State left by the dead process: {"status": "ROTATION_REQUESTED", "lastValidatedHandover": null, "step": "REQUESTED"}
Final state: {"status": "MONITORING", "reason": null, "rotationCount": 2, "sessionSequence": 3}

Git log:
- six-steps fixture
- step 1: double
- step 2: isPalindrome

New reflog entries:
- commit: step 2: isPalindrome
- commit: step 1: double

Events:
- DISABLED>MONITORING  None% 
- MONITORING>MONITORING  None% queued check until the first prompt
- MONITORING>MONITORING  None% task revision 1
- MONITORING>MONITORING  None% task revision 2
- MONITORING>ROTATION_REQUESTED THRESHOLD 6.67% context 6.67%
- ROTATION_REQUESTED>RESTORING STALE_LOCK 6.67% recovered by /relay recover from ROTATION_REQUESTED with no handover
- RESTORING>CONTINUING MANUAL 6.67% 
- CONTINUING>MONITORING  5.86% rearmed at 5.86%
- MONITORING>ROTATION_REQUESTED THRESHOLD 7.18% context 7.18%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 7.18% 
- HANDOVER_GENERATING>VALIDATING THRESHOLD 7.18% 
- VALIDATING>ROTATING THRESHOLD 7.18% 
- ROTATING>RESTORING THRESHOLD 7.38% 
- RESTORING>CONTINUING THRESHOLD 7.38% 
- CONTINUING>MONITORING  6.44% rearmed at 6.44%
