# Live check: Stop mode on an account outside a Team organization

**Date:** 2026-11-10 · **Claude Code:** 2.1.322 · **Account:** a Max subscription (not a Team organization), the default login · **Model:** haiku, real 200K window (`CLAUDE_CODE_DISABLE_1M_CONTEXT=1`) · **Plugin:** `--plugin-dir jeeves` at `53b7cce` · **Driver:** `tests/pty/ac41.py 200k … --modules 40 --cap 2 --window 200000 --no-1m`, run from a copy that sets no `CLAUDE_CONFIG_DIR` and adds `--setting-sources project,local` (the user's own plugins and hooks stay out; the debug log shows none ran).

**Mode:** Stop mode. The debug log has no `bypassed by cc-plugin-sec-default` line and no `Stop hook skipped`. The task was started with `/jeeves on` (explicit): this install's plugin store reads as upgraded from 0.2, so auto-start is off.

## Result: PASS, with one finding

| Check | Result |
|---|---|
| Rotations, nothing typed after the task | **10** (`keystrokes_after_task: []`), 11 conversations, one continuation each |
| Handover retries | 0 |
| Outcome | all 40 modules committed once each, `./verify.sh` exits 0 |
| Growth between rotations | 65K to 94K tokens, median about 72K |
| Stops while working | none |
| Spend | US$0.93 API-equivalent (cap US$2; a subscription, so not billed in dollars) |

**Finding: the 10-rotation limit was reached.** The task ended `PAUSED (MAX_ROTATIONS)` at 58% in its eleventh conversation; Claude finished the last modules there, and Claude Code compacted that conversation once (peak prompt 161,544 tokens). On this account a fresh conversation starts at 18.5% to 21.5% of 200K (it was about 16% on the Team account), so each one has about 60K tokens of room before the 50% threshold: a task of this size needs ten handovers, and a larger one would stop at the limit and wait for the user.
