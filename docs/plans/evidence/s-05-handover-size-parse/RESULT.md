# S-05 — Handover size and parse reliability

**Result: PASS** (size: 2 runs, the first invalidated by a spike-mod bug; parse: 1 run, 10 trials) · **Date:** 2026-11-07 · **Claude Code:** 2.1.319 · **macOS:** Darwin 23.6.0 · **Model:** `claude-haiku-5-5` · **Story:** ST-0.5

## Part A — payload delivery (`mod-size/`, `drive_s05a.py`)

Method: `/srsize <chars> <ctx|submit>` builds a payload of exactly that size:

- first line `SPIKE-PAYLOAD size=N START-MARK`;
- numbered lines `L0001 …`;
- last line `END-MARK-N-<WORD>`, with a different word each time.

The mod rotates (`/clear`) and delivers the payload either in `classic.SessionStart` `additionalContext` (`ctx`) or appended to the continuation prompt's `text` (`submit`). The continuation asks the model to quote the first line, the last line and the last `L` label. After the turn, the mod reads the session transcript file and checks whether the exact payload is stored.

| Size | Channel | Model quoted first / last / last-L | Exact payload in transcript | Context tokens (baseline 33,994) |
|---|---|---|---|---|
| 4,000 | `additionalContext` | ✔ / ✔ / ✔ (`L0054`) | ✔ | 35,451 |
| 12,000 | `additionalContext` | ✔ / ✔ / ✔ (`L0163`) | ✔ | 38,286 |
| 30,000 | `additionalContext` | ✔ / ✔ / ✔ (`L0410`) | ✔ | 44,708 |
| 30,000 | prompt `text` | ✔ / ✔ / ✔ (`L0410`) | ✔ | 44,697 |

**Criterion "12K chars delivered intact": PASS.** 30K also arrived intact in both channels, with no truncation or "saved to file" preview. (The 10,000-character cap documented for settings command hooks does not apply to a mod's `additionalContext` on 2.1.319.) This answers Q-6 up to 30K [V-LIVE].

**Run 1 was invalid (spike bug, kept as `events-size-run1-buggy.jsonl`).** All four cases came back MISSING because of two bugs in the spike mod:

1. The SessionStart hook read a module variable *after* `await next(e)`. By then `$.command.run('clear')` had already resolved and the variable had been reset. Lesson for ST-4.2/4.3: **capture rotation state before awaiting `next` inside `classic.SessionStart`**, because `$.command.run('clear')` can resolve while the hooks beneath are still running.
2. `$.prompt.submit({ text, context })`: `context` is not part of `PromptSubmitArgs` ("`context` the hooks' to attach"), and the engine silently ignored it. `claude plugin validate` did not catch this; `tsc` against the engine's types did. Lesson for ST-1.1: **CI must type-check the hooks module with `tsc`**, not only run `claude plugin validate`.

## Part B — parse reliability (`mod-parse/`, `drive_s05b.py`)

Method: one session, 10 trials on a fixture repo (`calc.js`). Each trial is a small edit task ("add an exported function sub/mul/div/…").

- At the first main `classic.Stop` the mod returns `{ block: instruction }` with the draft ST-3.4 handover instruction: 1,578 chars, the sentinel format with task and rotation IDs, the six required headings, tagging rules, the 12,000-char budget, "no secrets", and "do not run new commands".
- At the next Stop, a throwaway tolerant parser checks `last_assistant_message`:
  - exactly one block;
  - IDs match;
  - all six headings present and non-empty;
  - at least one numbered next action;
  - ≤ 12,000 chars;
  - every bullet tagged `[verified]`, `[inferred]` or `[unknown]`.
- If parsing fails, the mod blocks again with the specific errors, up to 2 retries.
- The driver types `/clear` between trials. The parser has an assert self-check: `parser-selfcheck.mts`.

| Metric | Result | Criterion |
|---|---|---|
| First-try parse | **10/10** | ≥ 9/10 |
| Within 2 retries | **10/10** | 10/10 |
| Untagged bullets | 0 in all 10 | — |
| Handover length | 1,725–2,869 chars | ≤ 12,000 |

**PASS.** All 10 raw handovers are saved in `handover-samples/` as seed fixtures for the ST-3.5 parser corpus.

## Findings

- Each Stop-block handover turn cost about US$0.008 on Haiku (per-conversation cost logged by the mod).
- **Handovers echo injected user-level context.** The user's own SessionStart hooks inject text into every conversation, such as coding-style modes and commit-attribution rules. The model copied some of it into "Decisions and constraints". It is harmless here, but it confirms R-08: anything in context can land in a handover. The validator's redaction pass (ST-3.7) is required, and the instruction should say "only task-relevant facts".
- Trials ran at ~6% context on a tiny task. Handover quality on a long, messy task and on Opus/Sonnet is not measured here (A-03 is retired for format compliance; quality stays covered by T-E2E-01 and the M4 multi-rotation E2E).

## Fallback adopted

None needed. ADR-003 keeps the sentinel text block and the `additionalContext` channel. The prompt-`text` channel is proven as a working alternative for the restore path (02 §5.3 already uses a user row plus `submitPrompt`).

## Cost note

Size part: 2 runs × 4 short rotations (run 1 delivered nothing, so it was cheap). Parse part: 1 run × 10 trials, about US$0.008 per handover turn plus a similar task turn. Total for S-05 roughly US$0.20 on Haiku.
