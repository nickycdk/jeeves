# Spec: Jeeves on Team accounts ("turn mode")

**Status:** Accepted (D-48): built before v0.3.0 as epic E16 (03, 04 ST-16.1 … ST-16.8). Where this spec and the accepted ADR amendments (02: ADR-002 A3, ADR-003 A2, ADR-004 A2, ADR-006 A1, ADR-007 A1, revision 2) differ, the amendments win; rows and items they change are marked **amended by revision 2**. · **Date:** 2026-11-08 · **Relates to:** R-25, Q-11, D-39, ADR-002, ADR-003, ADR-004, ADR-006, ADR-007.

## 1. Problem

On Claude Code 2.1.319, a Claude account in a Team organization gets a built-in plugin, `cc-plugin-sec-default@builtin`, seated in the **prepend** tier, ahead of every installed plugin (debug log: `seated outermost: the organization is team`). It hooks `classic.*`, `session.compact` and `prompt.compose`, and passes those events on past the user tier (`jeeves: classic.Stop bypassed by cc-plugin-sec-default (tier user); beneath runs`). A user-tier plugin cannot override a prepend hook.

Jeeves v0.2.0 depends on four of those events:

| Event (skipped) | What Jeeves uses it for | ADR |
|---|---|---|
| `classic.Stop` | the safe boundary (nothing in flight), blocking the stop to ask for the handover, reading the handover from `last_assistant_message` | ADR-004, ADR-003 |
| `classic.SessionStart` (`clear`) | putting the handover into the fresh conversation (`additionalContext`) | ADR-003 |
| `session.compact` | skipping compaction ahead of time; handing over after a compaction | ADR-006 |
| `prompt.compose` | the system-prompt section on how to report completion | ADR-007 |

v0.2.0 detects the skip and turns itself off (D-39). Nobody in a Team organization can use Jeeves, the maintainer included, and the Stop-based live tests (AC-07 E, compaction) cannot run on the maintainer's account.

## 2. What still arrives (verified in the 2026-11-08 debug log)

`session.start`, `session.end`, `session.measure`, `turn.start`, `turn.complete`, `prompt.submit`, `tool.call`, `command.run`. The `$` calls Jeeves uses (`$.command.run('clear')`, `$.prompt.submit`, `$.agent.list`, `$.session.usage`, `$.process.run`) are not hooks and are not affected.

Live evidence on the same Team account (M8 run 1): phases d (autoRecover) and e (`/jeeves recover --relink`) **passed**. Both use the restore path, which delivers the task and handover in a continuation prompt sent with `$.prompt.submit`, with no SessionStart. That half of the pipeline already works there.

## 3. Proposal: a second boundary mode built only on events that arrive

When the skip is detected (the v0.2.0 check), use **turn mode** for the rest of the process instead of turning off.

| Step | Stop mode (today) | Turn mode |
|---|---|---|
| Safe boundary | main-loop `classic.Stop`: `background_tasks` empty, no running agent, not aborted | main-loop `turn.complete` with `reason: 'answer'`, not aborted, `$.agent.list()` has no running agent. Background shells: **amended by revision 2:** Jeeves's own background count is zero (ADR-004 A2) |
| Ask for the handover | block the stop with the instruction (same turn) | submit the instruction as a new prompt (`$.prompt.submit`), as the idle nudge already does (`NUDGE_PROMPT`, `submitPromptSoon`); **amended by revision 2:** state HANDOVER_GENERATING before the submit (ADR-003 A2) |
| Read the handover | `last_assistant_message` | the next `turn.complete`'s `answer` (the final visible text of that turn), through the same parser and validator |
| Retry an invalid handover | block again with the reasons | submit the retry instruction (same counter, same limit of 2) |
| Fresh conversation | `$.command.run('clear')` | unchanged |
| Deliver the handover | `classic.SessionStart` `additionalContext` | the restore path's continuation prompt with the handover text (proven on Team accounts, 30K chars arrived intact per ADR-003) |
| Compaction | `session.compact` | not visible. A context drop in `session.measure` with no Jeeves `/clear` behind it is treated as a compaction (COMPACTED), at the next safe boundary. Compaction ahead of time can no longer be skipped |
| Completion rules | `prompt.compose` section | **amended by revision 2:** a hidden `$.session.append` row at task start, after each continuation, after a recognised compaction and every 10 turns (ADR-007 A1) |
| Soft quiesce | hidden row at the first tool result | unchanged (`tool.call` arrives) |
| Held prompts (ADR-010) | `prompt.submit` | unchanged |

What stays the same: the pure core (states, reducer, validator, storage, locks, the evidence ledger), the commands, and all v0.1/v0.2 behaviour on accounts where Stop arrives. Turn mode is chosen only after the skip is seen, never by guess. Status shows `mode: full (turn)` so a bug report says which path ran.

### Costs and risks

- ~~**An extra turn per rotation.**~~ **Amended by revision 2:** about the same model work (Stop's `{ block }` also makes Claude answer again); the differences are a visible request prompt in the transcript and the window before the request (ADR-003 A2).
- **ADR changes.** ADR-004 (boundary = Stop), ADR-003 (channel = Stop message and SessionStart), ADR-006 (precompute skip) and ADR-007 (compose section) each get an amendment for turn mode. Accepted by the maintainer on 2026-11-09 (revision 2, D-48).
- **A user typing while the handover is requested.** Their prompt and Jeeves's request can race. ADR-010 already holds typed prompts in ROTATION_REQUESTED and later states, so the same rule applies; this needs I-layer tests for the turn-mode order.
- **Policy intent.** The prepend plugin is a security default. Turn mode uses only events and calls it lets through; it does not try to get around the skip. Still, see §5 (ask first).

## 4. Open questions

1. Is there a background-shell signal outside Stop's `background_tasks`? (`$.agent.list()` covers subagents only.) If not, turn mode waits for a `turn.complete` that follows a turn with no backgrounded tool result (the ledger records `backgrounded`), which is weaker. Needs a look at the 2.1.319 types. **Answered from the 2.1.319 types (2026-11-09): no.** `background_tasks` exists only on `StopHookInput` and `SubagentStopHookInput` (both `classic.*`, skipped); no `$` call or engine event lists background work. What still arrives: `tool.call` shows a call started in the background, and `prompt.submit` with `origin.kind: 'task-notification'` shows a background task's notification. Turn mode therefore keeps its own count (started in `tool.call`, ended at a notification), the weaker path above; a shell killed without a notification would leave it waiting.
2. Does `turn.complete.answer` carry the whole final message for a 12K-char handover? Check with one live haiku turn on the Team account (about US$0.01). **Answered live (2026-11-09, US$0.0092): yes, up to 9,692 chars.** One `claude -p --model haiku` turn on the maintainer's Team account with a throwaway probe mod: the debug log shows `cc-plugin-sec-default@builtin seated outermost: the organization is team` and `turn-probe: classic.Stop bypassed by cc-plugin-sec-default`; `turn.complete` (main loop, `reason: 'answer'`) carried the final answer whole (9,692 chars, same first and last lines as the printed result), after a turn that ran a Bash call first. Not checked: 12K (the model wrote 1,800 of the asked lines, 9.7K), an interactive session (this was `-p`), and a final message with several text blocks.
3. Is the skip intended for all user plugins on Team accounts, and will it stay? (§5)

## 5. Recommended order

1. **Ask upstream first** (free): a short question to Anthropic on whether `cc-plugin-sec-default` is meant to skip every user-tier plugin's `classic.*` hooks on Team accounts, and whether a plugin opt-in is planned. Drafted by Jeeves's maintainer and posted by them (agents never post, D-37). If the answer is "a bug" or "an opt-in is coming", turn mode may not be needed.
2. **Answer open questions 1 and 2** (one look at the types, one US$0.01 live turn).
3. **If still needed: v0.3 epic "Turn mode"**, with stories:
   - (a) ADR amendments: **done** (revision 2 accepted, D-48)
   - (b) the boundary and handover request on `turn.complete`
   - (c) handover read from `answer`, with retries
   - (d) delivery through the restore path's continuation
   - (e) compaction from `session.measure`
   - (f) completion rules **(amended by revision 2: a hidden `$.session.append` row, ADR-007 A1)**
   - (g) I-layer tests that run every rotation test in both modes
   - (h) live E runs on the Team account (rotation, two rotations, AC-07 with a permission dialog, compaction)

   Rough size: M–L, about 6–8 engineer-days. Planned as E16, ST-16.1 … ST-16.8, ≈ 10 days at the story midpoints (04).

## 6. Acceptance (for the v0.3 epic, if built)

- On a Team account (prepend skip present): two rotations in a row with zero keystrokes after setup; the handover validated and saved exactly as in Stop mode; AC-07 holds (no handover request while a permission dialog is open); a typed `/compact` leads to one rotation.
- On an account without the skip: behaviour and event traces identical to v0.2.0 (Stop mode); the turn-mode code path never runs.
- `/jeeves status` and `--diagnose` name the mode; nothing claims Stop-mode guarantees in turn mode.
