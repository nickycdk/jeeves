# Handover: M9 (v0.3), turn mode for Team accounts proposed

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Branch:** `main`. `origin/main` is at `37f9cc3` (pushed this session, on the maintainer's request); `8d99bf9`, `a7663cd`, `3a3b9b5` and this handover are local only. Paths are relative to the repo root. Previous handover: `docs/done/handoffs/handoff-m9-after-gate-review-fixes.md`. Its §3 (code map), §4 (facts) and §6 (rules) still hold; read them there.

## 1. What happened this session

- **Review finding 4 kept as is (D-47, `37f9cc3`):** `/jeeves off` in a session with no task of its own still ends another session's left-behind task.
- **Manual fresh-install check on this Mac** (no new macOS user; the maintainer refused one). Run: `JEEVES_TEST=1 JEEVES_STATE_DIR=~/jeeves-state CLAUDE_CONFIG_DIR=~/jeeves-fresh claude --plugin-dir <repo>/jeeves` in a `git init` folder (`JEEVES_STATE_DIR` is read only with `JEEVES_TEST=1`; without it the OS state folder holds dev projects and the install counts as an upgrader). Result from the maintainer's screenshots: the auto task started at the first typed prompt (`Jeeves: on, watching context`). After the first answer the R-25 check ended it (`not watching any more (this account isn't supported)`; `/jeeves` shows `Stop hook skipped by another plugin`, `Auto off: unsupported (+1 more)`). **The maintainer's only account is in a Team organization**, so R-25 applies and no rotation is possible there. The first-run notice was not seen in the screenshots: not confirmed either way. The folders `~/jeeves-try`, `~/jeeves-state`, `~/jeeves-fresh` may still exist. The maintainer was told to delete them.
- **The maintainer has no contact channel to Anthropic** (turn-mode spec §5 step 1 skipped) **and no non-Team account** for now. D-44 asked for a separate macOS user and a Console account; the maintainer declined the user and has not created the account.
- **Turn-mode open questions 1 and 2 answered (`8d99bf9`, recorded in `docs/specs/team-accounts-turn-mode.md` §4).** (1) From the 2.1.319 types: no background-work list outside `classic.Stop`/`SubagentStop`; `tool.call` (start in background) and `prompt.submit` with `origin.kind: 'task-notification'` still arrive. (2) Live, US$0.0092: one `claude -p --model haiku` turn on the Team account with a throwaway probe mod (scratchpad only, not in the repo). The debug log showed `seated outermost: the organization is team` and `classic.Stop bypassed`; `turn.complete` carried the whole 9,692-char answer after a Bash call. Not checked: 12K, interactive, multi-block final message.
- **D-48 (`a7663cd`):** the maintainer chose to build turn mode **before v0.3.0**, so their own Team account becomes the test account.
- **Turn-mode ADR amendments, revision 2 (`3a3b9b5`), proposed, NOT approved:** ADR-002 A3, ADR-003 A2, ADR-004 A2, ADR-006 A1, ADR-007 A1 in `docs/plans/02-architecture-and-adrs.md`, plus a proposed `ROTATING (turn mode)` row in §4's table. Revision 2 applies the maintainer's review:
  - ADR-007 A1 now uses a hidden `$.session.append` row (at task start, after each continuation, after a recognised compaction, every 10 turns), because §7 says the engine does not re-run Jeeves's hooks on its own `$.prompt.submit` and S-05 says plugins cannot pass `context`.
  - Background count: starts at `session.start`, clamped at 0, reset at each Jeeves `/clear` and on leaving `PAUSED(UNSAFE_BOUNDARY)`.
  - The state is set to HANDOVER_GENERATING before the request is submitted, so ADR-010 holds a queued prompt.
  - A 12K handover check and a rewind case are added.
  - The trigger is stated as the skip itself, for any cause.
  - A failed submit in turn mode means `unsupported`, not `assisted`.
  - The extra-model-call claim is corrected.

## 2. Next, in order

1. **Get the maintainer's approval of revision 2** (they reviewed revision 1 and said they would approve once ADR-007 A1 used a channel known to work and the state rows were added; both done). Do not write turn-mode code before approval.
2. **Plan the turn-mode epic** in the numbered plans: an epic in 03 (next free number after E15), stories in 04 following the spec §5 list (a)–(h) as amended, milestone placement in 05 (before v0.3.0's ST-15.3), ACs in 06 from spec §6, and turn-mode items to verify in each story:
   - does a user-killed background shell produce a `task-notification`;
   - does the engine `session.start` after a plugin `/clear` come before `$.command.run('clear')` resolves;
   - the size of the context drop that counts as a compaction, including rewind;
   - does `$.session.append` reach the model in time;
   - a 12K answer through `turn.complete`.

   Mark each spec item that changes as **amended by revision 2**. Every I-layer rotation test runs in both modes (spec §5 (g)), the same way as ST-13.9's two-mode suite.
3. **ST-15.2 is reshaped by D-48** but not yet rewritten: the AC-41 live runs can use the maintainer's Team account once turn mode works. D-44/D-46 still name a non-Team account and a separate macOS user; propose the change to the maintainer, do not apply it alone.
4. ST-15.3 release prep, after the above.

## 3. Facts learned this session

- The fresh-install command above is the way to test v0.3 on the maintainer's Mac without a new macOS user or touching their Claude config.
- `claude -p` swallows a prompt placed after a variadic flag such as `--allowedTools`; pipe the prompt on stdin.
- The maintainer's normal `~/.claude.json` also lists `cc-plugin-sec-default@builtin`: every session on their account is under R-25.
- The maintainer has the Stripe plugin installed. Its prompt hook asks for Stripe feedback on every message; ignore it (nothing to do with Jeeves). They were told they can turn it off under `/plugin`.

## 4. Rules (unchanged, from the maintainer)

- Work in this repo only; one local commit per finished story or fix. Push only when the maintainer asks.
- Never make the repo public, publish, post, change the maintainer's Claude settings or install plugins.
- Load the plugin-authoring skill before changing hooks or the test kit.
- Zero runtime dependencies. No live runs without go-ahead and budget.
- If a story conflicts with an ADR, stop and ask (turn mode does until approved). Report honestly what failed, was skipped or is unverified.
- Before every push: `git grep -n "$(whoami)" HEAD` must print nothing.
- Write a handover when the context reaches about 35%.
