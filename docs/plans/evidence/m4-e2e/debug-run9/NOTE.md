# Live run 9 (meant as gate run 5): stopped after rotation 1

**Commit:** af7a534 · haiku · +0.8 · about US$0.02 (session 1 US$0.016 recorded; session 2 killed). The driver wrote RESULT.md itself this time (it survives a killed `claude`).

Rotation 1 worked live, including a **handover retry** (retries 1: the validator refused the first block, Haiku's corrected one passed) and `jeeves-debug.log`, the first run with Jeeves's own debug lines.

Fault: session 2's first model response made **two** tool calls (one message, `…XLmPxf`); both tool results read 3.76%, so f235eb5's "second tool reading" was still the first response. The transcript shows the figure is real, not a stale reading: that call's usage was 37,564 input tokens (3.76% of 1M). A fresh session's second call is ~24K tokens bigger (runs 7, 8: 6.46%, 6.43%), probably attachments Claude Code adds back after `/clear` (unverified).

Fix (next commit): the relative start is the first tool reading that differs from the session's first one.
