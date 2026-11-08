# PTY E2E six-steps: FAIL

Claude Code 2.1.319 (Claude Code) · model haiku · threshold override +0.8% · case tables 6000 chars per step
Setup 20.6 s, run 5.0 s · cost about US$0 (sessions 0 + final None)

| Check | Result |
|---|---|
| 1 rotation(s) continued (RESTORING -> CONTINUING -> MONITORING) | FAIL |
| distinct session ids (2) | FAIL |
| handover saved and verified before /clear | FAIL |
| zero keystrokes after setup | PASS |
| no permission dialog | PASS |
| no step committed twice | PASS |
| status entry seen (Jeeves N%/T%) | PASS |
| transition lines seen | FAIL |
| loaded as the installed plugin (jeeves@jeeves, no --plugin-dir) | PASS |

Final state: {"status": "PAUSED", "reason": "AUTH", "rotationCount": 0, "sessionSequence": 1, "taskRevision": 2, "mode": "full", "lastErrorCode": "AUTH"}

Sessions:

Git log:
- six-steps fixture

Events:
- DISABLED>MONITORING  None% 
- MONITORING>MONITORING  None% queued check until the first prompt
- MONITORING>MONITORING  None% task revision 1
- MONITORING>MONITORING  None% task revision 2
- MONITORING>PAUSED AUTH None% authentication_failed
