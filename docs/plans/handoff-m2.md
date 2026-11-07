# Handoff: M2 Monitoring & task done → next is M3

**Date:** 2026-11-07 · **Claude Code:** 2.1.319 · Read `handoff-m1.md` first: its run instructions and engine rules still apply.

## 1. Where things stand

M2 (ST-2.1 … ST-2.5, ST-7.3) is implemented, one commit per story. Checks: typecheck ok, lint ok, 103 unit tests, 40 mod tests, `validate --strict` passes. Live demo: `evidence/m2-demo/RESULT.md` (2 runs, $0.07 each).

```
e9ab583 ST-2.1 on/off + verbatim capture    42b42c8 ST-2.5 pause/resume
3c2a5a2 ST-2.2 revisions                    4e2b542 ST-7.3 notice + reason catalogue
bd666b0 ST-2.3 context reading              (gate commit) evidence, D-17..D-19, quietly() fix
bac704b ST-2.4 threshold + test override
```

## 2. What M2 added

- `src/core/task.ts`: new task state, revision files (rev 1 = prompt verbatim; rev 2+ = change records), fold, `/relay task` text.
- `src/core/machine.ts`: inputs `REVISED`, `SET_THRESHOLD`, `OFF { sessionId }`; `ctx.thresholdOverride`; deferred pause (`state.pauseRequested`) applied at `CONTEXT_READY`.
- `src/adapter/task.ts`: the wiring cycle. `apply()` runs read → reduce → write → effects inside `rt.serial` (one queue per process); `startTask`, `captureFirstPrompt`, `addRevision`, `readTask`, `measure`, `heartbeat`, `claim` (free or stale lock), `releaseOnExit`.
- `hooks/register.ts`: `prompt.submit` (capture), `session.measure` (context only), `session.end` (lock release unless `clear`), heartbeat `$.clock.every` started in `session.start`. `quietly()` keeps hook failures out of the user's way.
- `/relay` subcommands: on, off, pause, resume, threshold, task, dod, check, status, help. Task-changing ones need origin `composer`.
- Tests: `tests/mod/kit.ts` (shared helpers, `until()` for timer work), `memfs.ts` now has a mock clock and store, a switchable `sessionId` and `usage`.

## 3. Engine rules learned in M2

1. `$.prompt.submit` is refused inside a `command.run` hook. Defer with `$.clock.after(0, …)` (port: `submitPromptSoon`).
2. The kit needs a bottom answer for every event a test raises (`session.start`, `session.measure`, `session.end`, `classic.Stop`): `memHost` registers them. Bottom hooks must be registered before the test's first `$` call.
3. `mock.clock.advance` resolves before a timer's async file work ends: use `until(h, pred)`.
4. Live haiku sessions here start at about 6% of a 1M window (the maintainer's global plugins load too). Pick a test override above 6 for a warning, e.g. 9.
5. `$.store` for a `--plugin-dir` plugin is `~/.claude/plugins/store/sessionrelay_inline-<hash>.json` (outside the repo).

## 4. Open items

- D-17, D-18 (07 §2) await the maintainer.
- `/relay on <goal>` submission is tested only under `claude plugin test`, not live.
- A capture whose rev file was written but whose state write then failed leaves rev 0 with an existing `task-rev-001.md`; the next capture then logs IMMUTABLE_EXISTS. Disk-error recovery is ST-6.5.
- `/relay resume` cannot adopt a MONITORING task left by a crashed session (only PAUSED ones). Recovery is ST-6.1.
- `projectTasks` reads every task's `state.json` per hook call (marked `shortcut:`).
- Carried from M1: A-05 (real OS state root write, needs OK), CI never run, port reuse across hooks (still worked live in M2).

## 5. Next: M3 Handover (ST-3.1 … ST-3.8)

The Stop hook is still pass-through: a task reaches ROTATION_REQUESTED and stays there. M3 wires `tool.call` (ledger, soft-quiesce note), `classic.Stop` (safe boundary, handover request/parse/validate) and persists the handover. `effects.ts` already returns hook-bound effects as `forHook`; `apply()` returns them to the hook.
