# PTY E2E six-steps: FAIL

Claude Code 2.1.319 (Claude Code) · model haiku · threshold override +0.8% · case tables 6000 chars per step
Setup 20.5 s, run 65.1 s · cost about US$0.0318 (sessions 0.0318 + final None)

| Check | Result |
|---|---|
| 2 rotation(s) continued (RESTORING -> CONTINUING -> MONITORING) | PASS |
| distinct session ids (3) | PASS |
| handover saved and verified before /clear | PASS |
| zero keystrokes after setup | PASS |
| no permission dialog | PASS |
| no step committed twice | PASS |
| status entry seen (Jeeves N%/T%) | PASS |
| transition lines seen | FAIL |

Final state: {"status": "ROTATING", "reason": "THRESHOLD", "rotationCount": 2, "sessionSequence": 3, "taskRevision": 2, "mode": "full", "lastErrorCode": null}

Sessions:
- ef8ad294 4.33% -> 5.32% (US$0.011689060000000001)
- 8a331f00 4.75% -> 6.12% (US$0.020074150000000002)

Git log:
- six-steps fixture
- step 1: double
- step 2: isPalindrome
- step 3: sumDigits

Events:
- DISABLED>MONITORING  None% 
- MONITORING>MONITORING  None% queued check until the first prompt
- MONITORING>MONITORING  None% task revision 1
- MONITORING>MONITORING  None% task revision 2
- MONITORING>ROTATION_REQUESTED THRESHOLD 5.13% context 5.13%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 5.17% 
- HANDOVER_GENERATING>VALIDATING THRESHOLD 5.21% 
- VALIDATING>ROTATING THRESHOLD 5.21% history/handover-001.md#sha256:421fd9ad41cee048bbc00295a56886486d90b1b2cf2b27d19
- ROTATING>RESTORING THRESHOLD 5.32% 
- RESTORING>CONTINUING THRESHOLD 5.32% 
- CONTINUING>MONITORING  4.75% rearmed at 4.75%
- MONITORING>ROTATION_REQUESTED THRESHOLD 5.67% context 5.67%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 5.73% 
- HANDOVER_GENERATING>VALIDATING THRESHOLD 5.9% 
- VALIDATING>ROTATING THRESHOLD 5.9% history/handover-002.md#sha256:c569e17d092f7c10c237f30d8a410cfec146a784d610f1916
- ROTATING>RESTORING THRESHOLD 6.12% 
- RESTORING>CONTINUING THRESHOLD 6.12% 
- CONTINUING>MONITORING  5.11% rearmed at 5.11%
- MONITORING>ROTATION_REQUESTED THRESHOLD 6.41% context 6.41%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 6.46% 
- HANDOVER_GENERATING>VALIDATING THRESHOLD 6.94% 
- VALIDATING>ROTATING THRESHOLD 6.94% history/handover-003.md#sha256:0e9fed776a5fce4600d3f380fbf127e76dc7508902d26d707
