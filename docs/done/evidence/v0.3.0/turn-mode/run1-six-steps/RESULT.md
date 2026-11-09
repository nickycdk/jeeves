# PTY E2E six-steps: PASS

Claude Code 2.1.319 (Claude Code) · model haiku · threshold override +0.8% · case tables 6000 chars per step
Setup 21.1 s, run 60.2 s · cost about US$0.0366 (sessions 0.027 + final 0.0096)

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

Final state: {"status": "MONITORING", "reason": null, "rotationCount": 2, "sessionSequence": 3, "taskRevision": 2, "mode": "full", "lastErrorCode": null}

Sessions:
- bb81ee97 4.31% -> 5.72% (US$0.0135399)
- 74c1e2a0 4.61% -> 5.6% (US$0.013455580000000002)

Git log:
- six-steps fixture
- step 1: double
- step 2: isPalindrome
- step 3: sumDigits
- step 4: wordCount
- step 5: fizzbuzz
- step 6: roman

Events:
- DISABLED>MONITORING  None% 
- MONITORING>MONITORING  None% queued check until the first prompt
- MONITORING>MONITORING  None% task revision 1
- MONITORING>MONITORING  None% task revision 2
- MONITORING>ROTATION_REQUESTED THRESHOLD 5.12% context 5.12%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 5.52% 
- HANDOVER_GENERATING>VALIDATING THRESHOLD 5.62% 
- VALIDATING>ROTATING THRESHOLD 5.62% history/handover-001.md#sha256:d841d83804d01771134098ffcb995e70d095bc4fe6e8a1f92
- ROTATING>RESTORING THRESHOLD 5.72% 
- RESTORING>CONTINUING THRESHOLD 5.72% 
- CONTINUING>MONITORING  4.61% rearmed at 4.61%
- MONITORING>ROTATION_REQUESTED THRESHOLD 5.41% context 5.41%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 5.41% 
- HANDOVER_GENERATING>VALIDATING THRESHOLD 5.47% 
- VALIDATING>ROTATING THRESHOLD 5.47% history/handover-002.md#sha256:18e1fe133704c2ca20a24810db90abd5638217c0979d81553
- ROTATING>RESTORING THRESHOLD 5.6% 
- RESTORING>CONTINUING THRESHOLD 5.6% 
- CONTINUING>MONITORING  5.25% rearmed at 5.25%
