# Handoff: M3 Handover done → start M4 (Fresh session & continuation)

**Date:** 2026-11-07 · **Claude Code:** 2.1.319 · **OS:** macOS, Darwin 27.2 · **Node:** 22.22 · Read `handoff-m2.md` and `handoff-m1.md` §3–§5 too: their run instructions and engine rules still apply.

## 0. Before anything else

- **Name:** the maintainer says the product is **Jeeves**, not SessionRelay (Q-8 answered). Code, `/relay`, the `SESSIONRELAY-HANDOVER` sentinel, `SESSIONRELAY_*` env vars, the plugin name and the state folder (`~/Library/Application Support/SessionRelay`) still say SessionRelay. Ask the maintainer when to rename before touching any of it. A rename changes the sentinel, so the handover fixtures and the instruction snapshot change with it.
- **Pending maintainer decisions:** D-20 and D-21 (M3 readings, both Proposed).
- Run the checks once before touching code: `SR_TEST_TMP=<scratchpad> sessionrelay/scripts/check-all.sh` (expected: 185 unit, 66 mod, validate passes).

## 1. Where things stand

M3 (ST-3.1 … ST-3.8) is solved; gate evidence below. A ponytail-review found 4 issues, all fixed (`7a9f576`).

```
6036289 ST-3.1 evidence ledger           7d76cc0 ST-3.5 parser
cf6b13b ST-3.2 soft-quiesce note         6016f10 ST-3.6 validator
aa4d00f ST-3.3 safe boundary + timeout   7991dfa ST-3.7 redaction
73535b4 ST-3.4 instruction template      b8dd7c3 ST-3.8 render, persist, retries
7a9f576 M3 review fixes 1-4
```

Live demo: `evidence/m3-demo/RESULT.md` (1 haiku run, $0.07): threshold at 11% (override 9) → safe Stop → handover written by Claude → validated first try → `history/handover-001.md`, SHA-256 equal to the ref in `state.json`, `handover.md` identical, state ROTATING, no `/clear`.

## 2. What exists after M3

- `src/core/evidence.ts`: `toolRecord` (Bash: redacted command ≤ 300 chars, `ok`, `exit` from "Exit code N", null when denied/backgrounded; Edit/Write/NotebookEdit paths), `capturedFacts`. Ledger = `State.ledger`, ring of 200, one ring across sessions.
- `src/core/handover/`: `template.ts` (QUIESCE_NOTE, HEADINGS, `handoverInstruction` ≤ 2,500 chars with snapshot `tests/fixtures/handover-instruction.txt`, `retryInstruction`), `parse.ts` (line-based, never throws, codes per failure), `validate.ts` (IDs, size, secrets, paths, branch/HEAD, FALSE_PASS; `fatal` outcomes), `render.ts` (merged file + `roundTrips`).
- `src/core/machine.ts`: `TOOL_RESULT { main, entry? }` (ledger + soft-quiesce point), `isSafe`, STOP `handover.fatal` → NEEDS_REVIEW(code) at once; PAUSE in VALIDATING pauses at once.
- `src/core/redact.ts`: Stripe added, one key-name rule with a value check, bounded runs (linear), `findSecrets` for high-confidence formats. `PRIVACY.md` documents the residual risk.
- `src/adapter/task.ts`: `applyOwn` now finds the task **inside** the serial queue (hook order kept). `recordTool`, `onStop` (safe-boundary path + facts snapshot `history/facts-<rotationId>.json`), `handoverStop` (validate → render → round trip → STOP → write-once + hash → `handover.md` → HANDOVER_PERSISTED), `onAbortedTurn`.
- `hooks/register.ts`: `tool.call` records after `next` (write runs after the hook returns), `classic.Stop` (main loop only; skipped when another hook already blocked), `turn.complete` (interrupts only). **Still pass-through:** `session.compact`, `classic.StopFailure`, `classic.SessionStart`.
- Tests: `tests/fixtures/handover/` (31 files: 10 real S-05 outputs + synthetic cases), `tests/mod/{ledger,quiesce,boundary,handover}.test.ts`; memHost answers `agent.list` (`h.agents`).
- Docs: `sessionrelay/docs/performance.md` (ledger p95), `sessionrelay/PRIVACY.md`, state-machine readings updated.

## 3. Engine rules learned in M3 (add to handoff-m1 §5)

1. A Bash failure comes back on `tool.call` as `{ isError: true, text: "Exit code N…" }`; there is no exit-code field. `deny` is a refusal (the tool did not run).
2. The test kit refuses a hook on `session.append` that answers without `next` ("the row is kept; next(e) keeps it"): pass through and record.
3. `classic.Stop` fires for the main loop; a subagent's call carries `agent_id`. `$.agent.list()` statuses: pending, running, waiting, idle, completed, failed, killed.
4. Live: the `session.measure` that crosses the threshold can arrive **after** that turn's Stop (demo finding 1, Q-10).
5. Timing tests on this machine are noisy when other projects run emulators (load average > 600 seen): assert behaviour (the write is off the call's path), keep strict budgets in unit benchmarks.

## 4. Open items

- **Q-10:** an idle session that crossed the threshold waits for the user's next prompt before the handover. Decide in ST-4.1 (start from `turn.complete`?).
- **Stuck in VALIDATING** if the state write after a saved handover fails: `/relay pause` now exits it; resuming re-arms. Re-deriving ROTATING from the verified file is ST-6.1 recovery.
- AC-07 E-layer (permission prompt open at the threshold) and AC-09 E-layer (`failing-tests` fixture run) are open; I/U layers pass.
- The live parse rate with the final instruction text is 1/1; the 10-trial rate (S-05) was on the draft. Watch handovers in M4 runs.
- Carried: A-05 (OS state-root write needs the maintainer's OK), CI never run (no remote), Q-1 upstream question not posted, `/relay on <goal>` not run live, USER_CLEAR resume (ST-4.3), MONITORING crash adoption (ST-6.1).

## 5. Next: M4 Fresh session & continuation (ST-4.1 … ST-4.8, ST-5.1, ST-5.2)

**Gate (05):** PTY E2E ≥ 2 rotations, no keystrokes, no repeated work (AC-10/11/12); AC-13, AC-15; assisted mode honest (AC-25).

Already in place for M4:
- The reducer has ROTATING → RUN_CLEAR on main `turn.complete` (step HANDOVER_PERSISTED), SESSION_END/SESSION_START_CLEAR, CONTEXT_READY, CLEAR_FAILED; `effects.ts` runs RUN_CLEAR (rejection → CLEAR_FAILED) and TRANSFER_LOCK, hands INJECT_CONTEXT / SUBMIT_CONTINUATION back as `forHook`.
- `turn.complete` hook exists (interrupts only): ST-4.1 adds the ROTATING case there.
- `state.lastValidatedHandover` = `history/handover-NNN.md#sha256:<hash>`: re-check the hash when injecting.
- The handover file is self-contained Markdown (task refs, verified facts, narrative block, metadata); ADR-003 says inject it in `classic.SessionStart` `additionalContext`, reading rotation state **before** `await next(e)`.

Watch: exactly one `/clear` per rotation (dedupe by `rotationId`); ADR-010 held prompts; keep live runs minimal (the maintainer's weekly usage is high).
