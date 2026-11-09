# PTY E2E six-steps: PASS

Claude Code 2.1.319 (Claude Code) · model haiku · threshold override +0.8% · case tables 6000 chars per step
Setup 21.2 s, run 150.3 s · cost about US$0.0464 (sessions 0.0356 + final 0.0108)

| Check | Result |
|---|---|
| 2 rotation(s) continued (RESTORING -> CONTINUING -> MONITORING) | PASS |
| distinct session ids (3) | PASS |
| handover saved and verified before /clear | PASS |
| zero keystrokes after setup | PASS |
| no permission dialog | PASS |
| no step committed twice | PASS |
| status entry seen (Jeeves N%/T%) | PASS |
| transition lines seen | PASS |

Final state: {"status": "ROTATING", "reason": "THRESHOLD", "rotationCount": 2, "sessionSequence": 3, "taskRevision": 2, "mode": "full", "lastErrorCode": null}

Sessions:
- b9037632 4.23% -> 5.76% (US$0.013414640000000002)
- 5221b121 4.64% -> 6.68% (US$0.022199540000000004)

Git log:
- six-steps fixture
- step 1: double
- step 2: isPalindrome
- step 3: sumDigits
- step 4: wordCount

Events:
- DISABLED>MONITORING  None% 
- MONITORING>MONITORING  None% queued check until the first prompt
- MONITORING>MONITORING  None% task revision 1
- MONITORING>MONITORING  None% task revision 2
- MONITORING>ROTATION_REQUESTED THRESHOLD 5.18% context 5.18%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 5.59% 
- HANDOVER_GENERATING>VALIDATING THRESHOLD 5.67% 
- VALIDATING>ROTATING THRESHOLD 5.67% history/handover-001.md#sha256:277ba36baca17c0dc844576024391c5898890059f8b1631e5
- ROTATING>RESTORING THRESHOLD 5.76% 
- RESTORING>CONTINUING THRESHOLD 5.76% 
- CONTINUING>MONITORING  4.64% rearmed at 4.64%
- MONITORING>ROTATION_REQUESTED THRESHOLD 6.38% context 6.38%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 6.51% 
- HANDOVER_GENERATING>VALIDATING THRESHOLD 6.6% 
- VALIDATING>ROTATING THRESHOLD 6.6% history/handover-002.md#sha256:78b905d201abb1657786fc668675177b91e9fb0fe29baa9db
- ROTATING>RESTORING THRESHOLD 6.68% 
- RESTORING>CONTINUING THRESHOLD 6.68% 
- CONTINUING>MONITORING  4.83% rearmed at 4.83%
- MONITORING>ROTATION_REQUESTED THRESHOLD 6.14% context 6.14%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 6.14% 
- HANDOVER_GENERATING>VALIDATING THRESHOLD 6.25% 
- VALIDATING>ROTATING THRESHOLD 6.25% history/handover-003.md#sha256:cd421f120c8b77b66e26d66bd33268b6f763d6e733f32e574
