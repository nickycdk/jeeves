# PTY E2E six-steps: FAIL

Claude Code 2.1.319 (Claude Code) · model haiku · threshold override +0.8% · case tables 6000 chars per step
Setup 20.6 s, run 45.1 s · cost about US$0.0263 (sessions 0.0142 + final 0.0121)

| Check | Result |
|---|---|
| 1 rotation(s) continued (RESTORING -> CONTINUING -> MONITORING) | FAIL |
| distinct session ids (2) | PASS |
| handover saved and verified before /clear | PASS |
| zero keystrokes after setup | PASS |
| no permission dialog | PASS |
| no step committed twice | PASS |
| status entry seen (Jeeves N%/T%) | PASS |
| transition lines seen | PASS |

Final state: {"status": "HANDOVER_GENERATING", "reason": "THRESHOLD", "rotationCount": 1, "sessionSequence": 2, "taskRevision": 2, "mode": "full", "lastErrorCode": null}

Sessions:
- aaadfa96 5.83% -> 6.91% (US$0.014215040000000002)

Git log:
- six-steps fixture
- step 1: double
- step 2: isPalindrome

Events:
- DISABLED>MONITORING  None% 
- MONITORING>MONITORING  None% queued check until the first prompt
- MONITORING>MONITORING  None% task revision 1
- MONITORING>MONITORING  None% task revision 2
- MONITORING>ROTATION_REQUESTED THRESHOLD 6.66% context 6.66%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 6.66% 
- HANDOVER_GENERATING>VALIDATING THRESHOLD 6.66% 
- VALIDATING>ROTATING THRESHOLD 6.66% 
- ROTATING>RESTORING THRESHOLD 6.91% 
- RESTORING>CONTINUING THRESHOLD 6.91% 
- CONTINUING>MONITORING  6.49% rearmed at 6.49%
- MONITORING>ROTATION_REQUESTED THRESHOLD 7.41% context 7.41%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 7.41% 
