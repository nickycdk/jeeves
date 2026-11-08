# Jeeves v0.1.0: acceptance evidence pack (ST-9.2)

Every acceptance criterion of the PRD (06 §3) with its result and its evidence. **Claude Code:** 2.1.319 (macOS, Darwin 27.2) unless a row says otherwise. Result: **PASS**, **FAIL**, **NOT SUPPORTED** or **OPEN** (the evidence is not there yet). Layers (06 §1): U unit, I mod/integration (engine test kit), P storage/process, E live PTY run, M manual, C compatibility job.

Paths: `plans/` = `docs/plans/evidence/`, `tests/` = `jeeves/tests/`. Every U/I/P test runs in `jeeves/scripts/check-all.sh` (2026-11-08: 246 unit, 151 mod, all pass).

| AC | Requirement | Result | Layers | Evidence |
|---|---|---|---|---|
| AC-01 | Install on clean macOS, no service or API key, under 5 min | PASS | P, M | P: [`plans/m6-install/RESULT.md`](../../plans/evidence/m6-install/RESULT.md) (fresh HOME, install 2 s, status at 15 s, no login). M: maintainer's fresh macOS user, under 5 min ([`plans/m6-gate/RESULT.md`](../../plans/evidence/m6-gate/RESULT.md)); timing and recording to add in `AC-01/` |
| AC-02 | Cursor terminal: normal TUI and permissions before and after rotation | PASS (M6; two-rotation demo dropped, D-34) | M | Maintainer's 06 §6 checklist, 7/7 before and after one rotation ([`plans/m6-gate/RESULT.md`](../../plans/evidence/m6-gate/RESULT.md)); M0 partial checklist [`plans/s-01-cursor/`](../../plans/evidence/s-01-cursor/RESULT.md). Two-rotation demo with recording: [`cursor-demo-script.md`](cursor-demo-script.md) → `AC-02/` |
| AC-03 | No rotation without opt-in | PASS | I, E | I: `tests/mod/measure.test.ts` (0→95% with no task: zero effects), `tests/mod/task.test.ts`. E: [`e-layers/RESULT.md`](e-layers/RESULT.md) phase A |
| AC-04 | Measurement is the documented source; rate limits ignored | PASS | I | `tests/mod/measure.test.ts` |
| AC-05 | 49% nothing, 50% exactly one request | PASS | U, I | `tests/unit/threshold.spec.ts`, `tests/mod/threshold.test.ts` (concurrent duplicate measures) |
| AC-06 | Missing or stale reading triggers nothing; never a false 0% | PASS | U, I | `tests/unit/threshold.spec.ts`, `tests/mod/measure.test.ts`, `tests/unit/ui.spec.ts` (`?` / "unknown") |
| AC-07 | No interruption during a tool call or permission prompt | PASS (I) / OPEN (E: permission-prompt case not exercised) | I, E | I: `tests/mod/boundary.test.ts`, `tests/mod/quiesce.test.ts`. E: S-02 background work [`plans/s-02-work-in-flight/`](../../plans/evidence/s-02-work-in-flight/), permission dialog open at the threshold [`e-layers/RESULT.md`](e-layers/RESULT.md) phase B |
| AC-08 | Handover has the fields, is short, validatable, references the task | PASS | U, E | U: `tests/unit/validate.spec.ts` (31 fixtures in `tests/fixtures/handover/`). E: [`plans/m3-demo/RESULT.md`](../../plans/evidence/m3-demo/RESULT.md), every live handover in [`plans/m4-e2e/gate-run5/history/`](../../plans/evidence/m4-e2e/gate-run5/history/) |
| AC-09 | Git is the truth; failed tests stay failed | PASS | U, I, E | U: `tests/unit/validate.spec.ts`; I: `tests/mod/handover.test.ts` ("npm test passes" after a failed run is refused). E: `failing-tests` fixture, [`e-layers/RESULT.md`](e-layers/RESULT.md) phase B |
| AC-10 | New session id, fresh context | PASS (probe inconclusive) | U, I, E | I: `tests/mod/rotate.test.ts`, `tests/mod/boundary-clear.test.ts`. E: [`plans/m4-e2e/RESULT.md`](../../plans/evidence/m4-e2e/RESULT.md) (gate runs 5–6: distinct ids, start% < end%); "quote earlier messages" probe: [`e-layers/RESULT.md`](e-layers/RESULT.md) |
| AC-11 | Continues without a prompt from the user | PASS | I, E | I: `tests/mod/continue.test.ts`. E: [`plans/m4-e2e/RESULT.md`](../../plans/evidence/m4-e2e/RESULT.md) (0 keystrokes after setup across 5 and 4 rotations) |
| AC-12 | ≥ 2 rotations, no drift, no repeated work | PASS | E | [`plans/m4-e2e/RESULT.md`](../../plans/evidence/m4-e2e/RESULT.md) (each step committed once, task revision unchanged) |
| AC-13 | Completion only on a verified DoD | PASS | U, I, E | `tests/unit/completion.spec.ts`, `tests/mod/complete.test.ts`; E: [`plans/m4-e2e/RESULT.md`](../../plans/evidence/m4-e2e/RESULT.md) runs 2–4 |
| AC-14 | Pause prevents, resume re-enables | PASS | U, I | `tests/unit/machine.spec.ts`, `tests/mod/pause.test.ts` |
| AC-15 | Manual rotate uses the same pipeline | PASS | I | `tests/mod/manual.test.ts` (effect traces identical except the trigger) |
| AC-16 | Crash recovery at each point | PASS | P, I, E | [`plans/m5-crash/crash-matrix.md`](../../plans/evidence/m5-crash/crash-matrix.md) (6/6), `tests/unit/crash.spec.ts`, `tests/mod/crash.test.ts`; E: [`plans/m5-demo/RESULT.md`](../../plans/evidence/m5-demo/RESULT.md) (real SIGKILL, one recovery) |
| AC-17 | Corrupt handover → NEEDS_REVIEW, earlier file unchanged | PASS | U, I | `tests/mod/handover.test.ts` (2 retries, hash unchanged), `tests/unit/validate.spec.ts` |
| AC-18 | Isolation, a single owner | PASS | I, E | `tests/mod/concurrency.test.ts`; E: [`plans/m5-concurrency/RESULT.md`](../../plans/evidence/m5-concurrency/RESULT.md) (4 real processes, 17/17) |
| AC-19 | No git mutation, no permission bypass | PASS | U, E | `tests/unit/no-git-mutation.spec.ts`, `tests/unit/security.spec.ts`; E: snapshots in [`plans/m5-demo/RESULT.md`](../../plans/evidence/m5-demo/RESULT.md). Security review: [`jeeves/docs/threat-model.md`](../../../jeeves/docs/threat-model.md) |
| AC-20 | Uninstall is clean | PASS | P | [`plans/m6-install/RESULT.md`](../../plans/evidence/m6-install/RESULT.md) (settings as before install except the `enabledPlugins` entry) |
| AC-21 | Contributor docs work | PASS | M | Fresh-clone walkthrough by a fresh agent (04 ST-8.4 status), `jeeves/CONTRIBUTING.md` |
| AC-22 | Compatibility matrix | PASS (local) | C | [`jeeves/docs/compatibility.md`](../../../jeeves/docs/compatibility.md) (2.1.303 … 2.1.319 pass; older refused). The `compat.yml` job has not run: no remote yet |
| AC-23 | Clear failure messages | PASS | U, I | `tests/fixtures/messages.txt` snapshot (`tests/unit/messages.spec.ts`), `tests/mod/stopfailure.test.ts`, `tests/mod/repo.test.ts` |
| AC-24 | Open-source artifacts | OPEN (release) | M | Present: LICENSE, README, CONTRIBUTING, SECURITY, PRIVACY, CHANGELOG, CODE_OF_CONDUCT, issue and PR templates, docs. `jeeves/.claude-plugin/icon.png` (512 px placeholder; `claude plugin validate --profile directory` passes). Missing: the release page (maintainer). Checklist: 08 §9 |
| AC-25 | Honest assisted mode | PASS | I, M | `tests/mod/assisted.test.ts`, `tests/unit/ui.spec.ts`; README "Modes"; claims in `jeeves/docs/release-notes/v0.1.0.md` follow 08 §7 |

## Other release evidence

- Security review (ST-9.1): [`jeeves/docs/threat-model.md`](../../../jeeves/docs/threat-model.md): no Critical or High findings; F-1…F-3 fixed.
- Naming check (ST-9.3): [`naming-check.md`](naming-check.md).
- Release artifact: `jeeves/scripts/release-zip.sh` gives the same SHA-256 from two clean clones (verified 2026-11-08 at `e34c350`); `.github/workflows/release.yml` builds, attests and drafts the release.

## Live runs for this pack

| Run | What | Cost |
|---|---|---|
| M7 E-layer run 1 | thresholds not reached (1M window); kept for the record | ~US$0.04 |
| M7 E-layer run 2 | AC-03 (phase A), AC-09, AC-10 | US$0.089 |
| M7 E-layer run 3 | AC-07 attempt (not exercised), AC-09, AC-10 | US$0.077 |
| Earlier milestones | M3 US$0.07, M4 gate runs (see `plans/m4-e2e/RESULT.md`), M5 US$0.43, M6 US$0.03 | — |
