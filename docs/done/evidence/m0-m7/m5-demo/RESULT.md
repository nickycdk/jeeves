# M5 demo, kill mid-rotation -> /jeeves recover: PASS

Claude Code 2.1.319 (Claude Code) · haiku · relative override +0.8 · crash point before-clear (SIGKILL)
Cost about US$0.2456 (killed session 0.2193, estimated from its transcript at haiku list prices; other sessions 0.0264)

| Check | Result |
|---|---|
| p1 trust | PASS |
| p1 on | PASS |
| p1 reached the crash point | PASS |
| dead lock left behind | PASS |
| startup notice names the task | PASS |
| recover continues | PASS |
| dead process left ROTATING with handover-001 saved | PASS |
| exactly one recovery (one STALE_LOCK -> RESTORING event) | PASS |
| exactly one continuation prompt in the recovering session | PASS |
| continuation built from handover-001 | PASS |
| no keystroke after /jeeves recover until the end of the run | PASS |
| no step committed twice | PASS |
| AC-19 stash list unchanged | PASS |
| AC-19 refs: only refs/heads/main moved | PASS |
| AC-19 new reflog entries are commits only | PASS |
| AC-19 .git/config and worktrees unchanged | PASS |
| AC-19 Claude settings files unchanged | PASS |

First /jeeves recover refused while the dead lock was live: True (then retried once it was stale)
State left by the dead process: {"status": "ROTATING", "lastValidatedHandover": "history/handover-001.md#sha256:7b952cfb9664b92dfdbe53186773b7f4d55f984d6c72d587dc33d5f724221654", "step": "HANDOVER_PERSISTED"}
Final state: {"status": "ROTATION_REQUESTED", "reason": "THRESHOLD", "rotationCount": 2, "sessionSequence": 3}

Git log:
- six-steps fixture
- step 1: double
- step 2: isPalindrome
- step 3: sumDigits

New reflog entries:
- commit: step 3: sumDigits
- commit: step 2: isPalindrome
- commit: step 1: double

Events:
- DISABLED>MONITORING  None% 
- MONITORING>MONITORING  None% queued check until the first prompt
- MONITORING>MONITORING  None% task revision 1
- MONITORING>MONITORING  None% task revision 2
- MONITORING>ROTATION_REQUESTED THRESHOLD 6.68% context 6.68%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 6.68% 
- HANDOVER_GENERATING>VALIDATING THRESHOLD 6.68% 
- VALIDATING>ROTATING THRESHOLD 6.68% 
- ROTATING>RESTORING STALE_LOCK 6.68% recovered by /jeeves recover from ROTATING with history/handover-001.md
- RESTORING>CONTINUING MANUAL 6.68% 
- CONTINUING>MONITORING  6.29% rearmed at 6.29%
- MONITORING>ROTATION_REQUESTED THRESHOLD 7.23% context 7.23%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 7.23% 
- HANDOVER_GENERATING>VALIDATING THRESHOLD 7.23% 
- VALIDATING>ROTATING THRESHOLD 7.23% 
- ROTATING>RESTORING THRESHOLD 7.58% 
- RESTORING>CONTINUING THRESHOLD 7.58% 
- CONTINUING>MONITORING  6.49% rearmed at 6.49%
- MONITORING>ROTATION_REQUESTED THRESHOLD 7.31% context 7.31%
