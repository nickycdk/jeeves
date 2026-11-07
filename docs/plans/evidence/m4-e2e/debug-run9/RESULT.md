# PTY E2E six-steps: FAIL

Claude Code 2.1.319 (Claude Code) · model haiku · threshold override +0.8% · case tables 6000 chars per step
Setup 18.8 s, run 66.4 s · cost about US$0.0162 (sessions 0.0162 + final None)

| Check | Result |
|---|---|
| AC-10/12 rotations >= 2 | FAIL |
| AC-10 distinct session ids (>= 3) | FAIL |
| AC-10 each session start% < end% | FAIL |
| AC-11 zero keystrokes after setup | PASS |
| AC-11 no permission dialog | FAIL |
| AC-12 each step committed exactly once | FAIL |
| AC-12 each step file changed in exactly one commit | FAIL |
| AC-12 task revision unchanged (rev 1 + the check) | PASS |
| final ./verify.sh exits 0 | FAIL |
| AC-13 COMPLETED | FAIL |

Final state: {"status": "MONITORING", "reason": null, "rotationCount": 1, "sessionSequence": 2, "taskRevision": 2, "mode": "full", "lastErrorCode": null}

Sessions:
- e59c3f44 5.81% -> 7.2% (US$0.01615905)

Git log:
- six-steps fixture
- step 1: double

Events:
- DISABLED>MONITORING  None% 
- MONITORING>MONITORING  None% queued check until the first prompt
- MONITORING>MONITORING  None% task revision 1
- MONITORING>MONITORING  None% task revision 2
- MONITORING>ROTATION_REQUESTED THRESHOLD 6.64% context 6.64%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 6.64% 
- HANDOVER_GENERATING>VALIDATING THRESHOLD 6.64% 
- VALIDATING>ROTATING THRESHOLD 6.64% 
- ROTATING>RESTORING THRESHOLD 7.2% 
- RESTORING>CONTINUING THRESHOLD 7.2% 
- CONTINUING>MONITORING  3.76% rearmed at 3.76%
