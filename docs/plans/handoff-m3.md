# Handoff: M3 Handover done → start M4 (Fresh session & continuation)

**Date:** 2026-11-07 · **Claude Code:** 2.1.319 · **OS:** macOS, Darwin 27.2 · **Node:** 22.22 · **Repo:** `~/Desktop/Projects/jeeves` (branch `main`, local only)

This file is enough to start M4 in a clean session. `handoff-m1.md` and `handoff-m2.md` are older records: their engine rules still hold, but they use the old product name (see §0).

## 0. The product is now Jeeves

The maintainer renamed SessionRelay to **Jeeves** (D-22, commit `a413ac7`). Everything live uses the new name:

| Thing | Now |
|---|---|
| Plugin folder / name | `./jeeves` / `jeeves` (`claude --plugin-dir ./jeeves`) |
| Command | `/relay` (unchanged, ADR-009); fallback `/jeeves` if `relay` is taken |
| Handover / completion markers | `<<<JEEVES-HANDOVER v1 …` … `JEEVES-HANDOVER>>>`, `JEEVES-COMPLETE` |
| Test env vars | `JEEVES_TEST=1`, `JEEVES_STATE_DIR`, `JEEVES_TEST_THRESHOLD_OVERRIDE` |
| State folder | `~/Library/Application Support/Jeeves` (Linux `${XDG_STATE_HOME:-~/.local/state}/jeeves`) |
| Command output prefix | `jeeves:` (the engine adds it) |

Kept on purpose: the PRD file `docs/specs/sessionrelay-product-engineering-spec.md`, historical evidence logs, and `handoff-m1.md`/`handoff-m2.md`. Read "SessionRelay" there as "Jeeves". The engine keys `$.store` by plugin name, so the first `/relay on` after the rename shows the first-activation notice once more.

## 1. Working rules (from the maintainer; do not re-ask)

- Work in this repo only. One local commit per finished story. Never push, add a remote, post anything, change the maintainer's Claude settings, or install plugins.
- Writing to the real OS state folder (A-05) still needs the maintainer's OK. Live runs always set `JEEVES_STATE_DIR` to a scratch folder.
- Zero runtime dependencies; `typescript` is the only dev dependency.
- Run `SR_TEST_TMP=<scratchpad> jeeves/scripts/check-all.sh` for every story (typecheck, lint, unit, mod tests, validate).
- Load the `plugin-authoring` skill before changing hooks. The engine-written types in `jeeves/.claude-plugin/types/` are the API authority (grep `index.d.ts`).
- Wire hooks through the existing cycle (`apply()`/`applyOwn()` in `src/adapter/task.ts`) and turn `forHook` effects into the hook's answer. Never keep task state in module variables.
- **Live runs:** the maintainer's weekly usage is high. Prefer `node:test` and `claude plugin test`; ask before more than 2–3 live runs in the whole milestone. Drivers: `docs/plans/evidence/m3-demo/drive_m3.py` (newest; uses `JEEVES_*`) on `evidence/m1-relay-status/ptylib.py`, `--model haiku`, throwaway repo in the scratchpad, `CLAUDE*`/`CODEX*` stripped, threshold override above 6 (sessions start at ~6% because the maintainer's global plugins load).
- If a story conflicts with an ADR, stop and ask. Report failures, skips and unverified items plainly. At the end of the milestone run `/ponytail:ponytail-review` on the milestone range and fix what it finds before the gate.

## 2. Before anything

1. `git status` must be clean; `git log --oneline -3` should show the commit that added this file at the top.
2. `SR_TEST_TMP=<scratchpad> jeeves/scripts/check-all.sh`: expected **185 unit, 66 mod, validate passes**.
3. Record `claude --version` (2.1.319 at handoff).

## 3. Where things stand

M0–M3 solved. Progress per milestone: `05-delivery-milestones.md` § Status; per story: the **Status** line under each heading in `04-backlog-stories.md`; per AC: `06` § 3 status notes.

```
6036289 ST-3.1 evidence ledger           7d76cc0 ST-3.5 parser
cf6b13b ST-3.2 soft-quiesce note         6016f10 ST-3.6 validator
aa4d00f ST-3.3 safe boundary + timeout   7991dfa ST-3.7 redaction
73535b4 ST-3.4 instruction template      b8dd7c3 ST-3.8 render, persist, retries
7a9f576 M3 review fixes 1-4              d83f193 M3 gate: demo, D-20/D-21, plans
a413ac7 Rename SessionRelay -> Jeeves    (+ rename review fix and this handoff)
```

M3 gate evidence: `evidence/m3-demo/RESULT.md` (1 haiku run, $0.07): threshold → safe Stop → Claude's handover validated first try → `history/handover-001.md`, SHA-256 equal to the ref in `state.json`, `handover.md` identical, state ROTATING, no `/clear`. Invalid → NEEDS_REVIEW is proven by `tests/mod/handover.test.ts`.

**Maintainer decisions after the gate (all Accepted, `07` §2):** D-20 (which handover claims are checked: `[verified]` bullets and "Tests and checks"), D-21 (Stop-hook readings; `/relay pause` in VALIDATING pauses at once), D-23 (rotation fully automatic, see §7).

## 4. Code map (`jeeves/`)

- `hooks/register.ts`: wiring only. Live: `session.start` (command, probe, heartbeat), `command.run` (`/relay`, `/jeeves`), `session.measure`, `session.end`, `prompt.submit` (task capture), `tool.call` (ledger: records after `next`, write runs after the hook returns), `turn.complete` (main-loop interrupts only), `classic.Stop` (main loop; skipped when another hook already blocked). **Still pass-through:** `session.compact`, `classic.StopFailure`, `classic.SessionStart`.
- `src/core/` (pure, `node:test`): `machine.ts` (reducer for the whole 02 §4 table, incl. the M4 rows already: ROTATING → RUN_CLEAR on main `turn.complete`, SESSION_END/SESSION_START_CLEAR, CONTEXT_READY, CLEAR_FAILED), `types.ts`, `schema.ts`, `task.ts`, `evidence.ts` (ledger entries), `redact.ts`, `handover/{template,parse,validate,render}.ts`, `git.ts`, `ids.ts`, `lock.ts`, `paths.ts`, `probe.ts`.
- `src/adapter/` (talks to `$`): `task.ts` (cycle, `applyOwn` looks the task up inside the serial queue, `recordTool`, `onStop`, `handoverStop`, lock helpers), `effects.ts` (runs RUN_CLEAR (rejection → CLEAR_FAILED), TRANSFER_LOCK, LOG_EVENT, TOAST; hands INJECT_CONTEXT / SUBMIT_CONTINUATION / BLOCK_STOP / … back as `forHook`), `storage.ts` (serial queue, `writeImmutable` + SHA-256, `writeState`/`replaceFile` atomic swap, lock, events), `git.ts`, `commands.ts`, `ui.ts`, `engine-mod.ts`/`ports.ts`, `runtime.ts`, `probe.ts`.
- Task folder on disk: `state.json` (incl. `ledger`, ring of 200), `task-rev-NNN.md`, `events.jsonl`, `lock.d/`, `history/facts-<rotationId>.json`, `history/handover-NNN.md` (write-once), `handover.md` (copy).
- Tests: `tests/unit/*.spec.ts`, `tests/mod/*.test.ts` (`memfs.ts` = in-memory host incl. `h.agents`, `kit.ts` helpers, `until()`), `tests/fixtures/handover/` (31 handovers: 10 real S-05 outputs + synthetic), `tests/fixtures/handover-instruction.txt` (snapshot).
- Docs: `jeeves/docs/state-machine.md` (generated by `npm run docs:state` from `scripts/state-diagram.mjs`, which holds the table readings), `jeeves/docs/performance.md`, `jeeves/PRIVACY.md`, `jeeves/CHANGELOG.md`.

## 5. Engine rules (2.1.319): do not rediscover

Read `handoff-m1.md` §5 (10 rules: no `$` noun as a value, literal `$.env.get` names, `$` only passed to top-level functions, mod tests cannot call `$.fs`/`$.process`, gating hooks need `.catch`, …) and `handoff-m2.md` §3 (no `$.prompt.submit` inside `command.run`; register kit bottoms before the first `$` call; `mock.clock.advance` needs `until()`; after `/clear` no `session.start` fires and `session.end` carries the old id). New in M3:

1. A Bash failure comes back on `tool.call` as `{ isError: true, text: "Exit code N…" }`; there is no exit-code field. `deny` means the tool did not run.
2. The test kit refuses a `session.append` hook that answers without `next`: pass through and record.
3. `classic.Stop` is the main loop; a subagent's carries `agent_id`. `$.agent.list()` statuses: pending, running, waiting, idle, completed, failed, killed.
4. Live: the `session.measure` that crosses the threshold can arrive **after** that turn's Stop (Q-10).
5. Timing tests are noisy on this machine when other projects run emulators (load average > 600 seen): assert behaviour, keep strict budgets in unit benchmarks.

## 6. Open items

- **Q-10 closed by D-23:** rotation must be fully automatic. When the request lands after the turn's Stop (Claude idle), submit a short plugin prompt ("Jeeves: prepare handover") to get a Stop. Build it in ST-4.1.
- **VALIDATING left standing** if the state write after a saved handover fails: `/relay pause` exits it; re-deriving ROTATING from the verified file is ST-6.1.
- AC-07 E-layer (permission prompt open at the threshold) and AC-09 E-layer (`failing-tests` fixture run) are open.
- Live parse rate with the final instruction text: 1/1. Watch handovers in M4 runs.
- ST-9.3: the name is chosen; availability/trademark check open (R-10).
- Carried: A-05 (OS state-root write needs the maintainer's OK), CI never run (no remote), Q-1 upstream question not posted, `/relay on <goal>` not run live, USER_CLEAR resume (ST-4.3 builds it), MONITORING crash adoption (ST-6.1), Q-9 (another plugin's Stop block).

## 7. Next: M4 (ST-4.1 … ST-4.8, ST-5.1, ST-5.2)

**Read first:** `04-backlog-stories.md` E4 and E5 and the standard DoD at its top; `02-architecture-and-adrs.md` ADR-003 (channel note), ADR-007, ADR-010 (+A1), §4 table rows ROTATING…CONTINUING, §5.1 sequence; `05` M4 row; `06` AC-10, AC-11, AC-12, AC-13, AC-15, AC-25 and §2 fixtures (`six-steps`); `evidence/s-04-clear-carryover/` and `evidence/s-06-status-queued-input/` (the spike code for `/clear`, SessionStart injection and held prompts).

**Gate (05):** PTY E2E with ≥ 2 rotations, no keystrokes, no repeated work (AC-10/11/12); AC-13, AC-15 pass; assisted mode honest (AC-25). **Demo:** a fixture task completes across 3 sessions unattended.

**Live-run budget for M4: at most 5 live runs in total** (the maintainer approved this; haiku, estimated $0.20–0.50 each). Spend at most 3 on debugging and keep 2 for the clean gate runs. Stop and ask before a 6th.

**D-23 (maintainer):** everything must happen automatically, with no user input at any point. (1) A request that lands after the turn's Stop gets a short plugin prompt to obtain a Stop (ST-4.1). (2) The continuation prompt (ST-4.3) is generated from the validated handover and tells the fresh session what has been built (completed work, files, checks and their results) and exactly where to pick up (the next actions).

Already in place:
- Reducer rows and `effects.ts` for RUN_CLEAR, TRANSFER_LOCK, CLEAR_FAILED; `turn.complete` hook exists (add the ROTATING case, ST-4.1); `/clear` must come from `$.clock.after(0)` and run exactly once per `rotationId`.
- `state.lastValidatedHandover` = `history/handover-NNN.md#sha256:<hash>`: re-check the hash before injecting.
- ADR-003: inject the handover in `classic.SessionStart` `additionalContext` and read rotation state **before** `await next(e)`. The restore path (no `/clear`) puts it in the continuation prompt's text. Plugins cannot pass `context` to `$.prompt.submit`.
- ADR-010 A1: after holding a prompt, clear the composer with `$.prompt.fill({ text: '', mode: 'replace' })` (typed but unverified: ST-4.4 must test it), and quote held prompts verbatim in the continuation.
