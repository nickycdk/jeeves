# Live check: the quiesce wait ends by the clock (review finding 1, `e062a22`)

**Date:** 2026-11-09 · **Claude Code:** 2.1.321 · **Account:** Team (turn mode) · **Model:** haiku, real 200K window · **Plugin:** `--plugin-dir jeeves` at `53b7cce` · **Driver:** `driver.py` (in this folder; it uses `jeeves/tests/pty/ptylib.py`).

**Scenario:** `/jeeves on`, one prompt that starts `python3 -m http.server 8765` in the background and leaves it running, then `/jeeves rotate`; nothing typed after that.

**Result: PASS.** From the task's `events.jsonl` (`result.json`):

| Time (UTC) | Transition |
|---|---|
| 21:14:47 | MONITORING → ROTATION_REQUESTED (MANUAL) |
| 21:14:49 | ROTATION_REQUESTED → QUIESCING, `waiting: 1 background task(s)` |
| 21:35:14 | QUIESCING → PAUSED (UNSAFE_BOUNDARY), `no safe point after 20 minutes` |

The pause came 20 min 26 s after the request (the limit, then the next 30 s heartbeat), with no Stop and no keystroke in between, and the screen showed `Paused: no safe point to hand over (background work still running after 20 minutes). Finish the work, then /jeeves resume.` Before the fix the task stayed QUIESCING with no message.

A first attempt was void: its one-step task was reported done at the nudge (NEEDS_REVIEW, DOD_UNMET) before the wait began; the prompt now says more steps follow.
