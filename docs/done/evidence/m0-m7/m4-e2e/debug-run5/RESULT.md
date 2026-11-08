# PTY E2E six-steps: FAIL

Claude Code 2.1.319 (Claude Code) · model haiku · threshold override +0.8% · case tables 6000 chars per step
Setup 18.8 s, run 2404.2 s · cost about US$0.0145 (sessions 0.0145 + final 0.0)

| Check | Result |
|---|---|
| AC-10/12 rotations >= 2 | FAIL |
| AC-10 distinct session ids (>= 3) | FAIL |
| AC-10 each session start% < end% | FAIL |
| AC-11 zero keystrokes after setup | PASS |
| AC-11 no permission dialog | PASS |
| AC-12 each step committed exactly once | FAIL |
| AC-12 each step file changed in exactly one commit | FAIL |
| AC-12 task revision unchanged (rev 1 + the check) | PASS |
| final ./verify.sh exits 0 | FAIL |
| AC-13 COMPLETED | FAIL |

Final state: {"status": "RESTORING", "reason": "THRESHOLD", "rotationCount": 0, "sessionSequence": 1, "taskRevision": 2, "mode": "full", "lastErrorCode": null}

Sessions:
- 02f5cb1a 5.68% -> 6.87% (US$0.01449099)

Git log:
- six-steps fixture
- step 1: double

Events:
- DISABLED>MONITORING  None% 
- MONITORING>MONITORING  None% queued check until the first prompt
- MONITORING>MONITORING  None% task revision 1
- MONITORING>MONITORING  None% task revision 2
- MONITORING>ROTATION_REQUESTED THRESHOLD 6.56% context 6.56%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 6.56% 
- HANDOVER_GENERATING>VALIDATING THRESHOLD 6.56% 
- VALIDATING>ROTATING THRESHOLD 6.56% 
- ROTATING>RESTORING THRESHOLD 6.87% 
