# PTY E2E six-steps: FAIL

Claude Code 2.1.319 (Claude Code) · model haiku · threshold override 9% · case tables 28000 chars per step
Setup 19.5 s, run 60.1 s · cost about US$0.0204 (sessions 0 + final 0.0204)

| Check | Result |
|---|---|
| AC-10/12 rotations >= 2 | FAIL |
| AC-10 distinct session ids (>= 3) | FAIL |
| AC-10 each session start% < end% | FAIL |
| AC-11 zero keystrokes after setup | PASS |
| AC-11 no permission dialog | PASS |
| AC-12 each step committed exactly once | PASS |
| AC-12 each step file changed in exactly one commit | PASS |
| AC-12 task revision unchanged (rev 1 + the check) | PASS |
| final ./verify.sh exits 0 | PASS |
| AC-13 COMPLETED | FAIL |

Final state: {"status": "NEEDS_REVIEW", "reason": "DOD_UNMET", "rotationCount": 0, "sessionSequence": 1, "taskRevision": 2, "mode": "full", "lastErrorCode": "DOD_UNMET"}

Sessions:

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
- MONITORING>NEEDS_REVIEW DOD_UNMET None% missing: `./verify.sh`: never run (run it exactly as written)
