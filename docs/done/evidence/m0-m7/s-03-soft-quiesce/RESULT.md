# S-03 — Soft quiesce mid-turn

**Result: PASS** (1 run, 5 trials) · **Date:** 2026-11-07 · **Claude Code:** 2.1.319 · **macOS:** Darwin 23.6.0 · **Model:** `claude-haiku-5-5` · **Story:** ST-0.3

## Method

- Spike mod `mod/` counts main-loop `tool.call`s per trial. After the 2nd tool result of a trial (the fake threshold), it calls
  `$.session.append({ message: { type: 'user', content: [{ type: 'text', text: NOTE }] } })` with
  NOTE = "SessionRelay: the context threshold was reached. Finish the step you are on, do not start any new step or tool call, and end your turn now with a one-line summary of what is done and what is left."
  At the next `classic.Stop` it logs how many tool calls started after the note.
- Driver `drive_s03.py`: one interactive session (`--permission-mode acceptEdits`), 5 trials. Each trial asks for 8 files, `qN_1.txt` … `qN_8.txt`, with "exactly one Write call per message, strictly one after another", then reply DONE. The driver types `/clear` between trials so earlier trials do not influence later ones.
- Files: `events.jsonl`, `driver.log`.

## Pass criterion (01 §4)

"Model ends the turn within ≤ 3 further tool calls in ≥ 4/5 runs."

| Trial | Calls before note | Calls after note | Final message (start) |
|---|---|---|---|
| 1 | 2 | **0** | "Done: q1_1.txt and q1_2.txt are written … Left: q1_3.txt through q1_8.txt …" |
| 2 | 2 | **0** | "Done: q2_1.txt and q2_2.txt exist … Left: q2_3.txt through q2_8.txt …" |
| 3 | 2 | **0** | "Done: q3_1.txt and q3_2.txt are written … Left: q3_3.txt through q3_8.txt …" |
| 4 | 2 | **0** | "Done: q4_1.txt and q4_2.txt exist … Left: q4_3.txt through q4_8.txt …" |
| 5 | 2 | **0** | "Done: q5_1.txt and q5_2.txt are written … Left: q5_3.txt through q5_8.txt …" |

**5/5 trials with 0 further tool calls → PASS.** On disk the repo held exactly `qN_1.txt` and `qN_2.txt` for each trial.

## Findings

- `$.session.append` from inside a `tool.call` hook (after `next(e)` resolved) is read by the model at the loop's next step, as the types say. This retires A-07 [V-LIVE].
- The appended row comes back as `{ type: "user", isMeta: true, … }` with a `uuid`. It was not shown on screen as typed text.
- The model's summary named what was done and what was left. That is a useful seed for the handover.

## Limits

- One cooperative, sequential task on Haiku. A model that issues parallel tool calls, or a long-running tool, will finish what is already in flight before it reads the note. The note cannot cancel those calls, and it does not need to: ADR-004 still waits for Stop.
- Not measured: Opus/Sonnet (A-06), or a task the model considers urgent to finish. ST-3.2 keeps soft quiesce as an optimisation only. Correctness never depends on it.

## Fallback adopted

None. ADR-004's soft quiesce note is confirmed as designed.

## Cost note

One PTY run, 5 short trials (2 Write calls plus one summary each) on Haiku; well under US$0.10.
