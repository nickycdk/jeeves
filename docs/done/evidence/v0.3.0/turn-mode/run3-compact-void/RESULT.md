# v0.2 E layers: see FAIL rows

Claude Code 2.1.319 (Claude Code) · haiku · macOS · `tests/pty/e_layers_v2.py` · cost about US$0.06 (session records + /cost of the last session)

| Check | Result |
|---|---|
| k: the /compact was recognised at the next reading (COMPACTED request) | FAIL |
| k: one rotation followed (RESTORING once, handover-001 saved) | FAIL |
| f: /clear stall via endedHere | NOT EXERCISED: needs the engine to withhold the fresh SessionStart; covered in I (`tests/mod/recover.test.ts`) |

## Phase k

- DISABLED>MONITORING  None% 
- MONITORING>MONITORING  None% task revision 1
