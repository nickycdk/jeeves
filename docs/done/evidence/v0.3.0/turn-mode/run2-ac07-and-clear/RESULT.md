# v0.2 E layers: see FAIL rows

Claude Code 2.1.319 (Claude Code) · haiku · macOS · `tests/pty/e_layers_v2.py` · cost about US$0.1272 (session records + /cost of the last session)

| Check | Result |
|---|---|
| g/AC-07: a handover was pending when the permission dialog opened | PASS |
| g/AC-07: dialog open 20 s, nothing saved or cleared meanwhile | PASS |
| g/AC-07: the rotation followed after the answer | PASS |
| c: the /compact was recorded as a COMPACTED request | FAIL |
| c: one rotation followed (RESTORING once, handover-001 saved) | FAIL |
| u: the first typed prompt started an auto task | PASS |
| u: the user /clear ended it (auto tasks end at a user /clear) | PASS |
| u: the fresh conversation auto-started again at its first typed prompt (no SessionStart in turn mode) | PASS |
| u: status shows turn mode | PASS |
| f: /clear stall via endedHere | NOT EXERCISED: needs the engine to withhold the fresh SessionStart; covered in I (`tests/mod/recover.test.ts`) |

## Phase g

- DISABLED>MONITORING  None% 
- MONITORING>MONITORING  None% task revision 1
- MONITORING>ROTATION_REQUESTED THRESHOLD 6.52% context 6.52%
- ROTATION_REQUESTED>HANDOVER_GENERATING THRESHOLD 10.67% 
- HANDOVER_GENERATING>VALIDATING THRESHOLD 10.7% 
- VALIDATING>ROTATING THRESHOLD 10.7% history/handover-001.md#sha256:6dd418d296a372032e1036b8c03a00955554116
- ROTATING>RESTORING THRESHOLD 10.8% 
- RESTORING>CONTINUING THRESHOLD 10.8% 
- CONTINUING>MONITORING  3.38% rearmed at 3.38%

## Phase c

- DISABLED>MONITORING  None% 
- MONITORING>MONITORING  None% task revision 1

## Phase u

- DISABLED>MONITORING  None% 
