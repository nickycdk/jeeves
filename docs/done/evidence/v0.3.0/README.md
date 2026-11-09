# Jeeves v0.3.0: acceptance evidence pack (ST-15.3)

The v0.3 acceptance criteria (06 §3, AC-35 … AC-54), the live runs of ST-15.2 and ST-16.8, and the re-run of the existing suite. **Claude Code:** 2.1.319, macOS, haiku for live runs. Result: **PASS**, **PARTIAL**, **FAIL** or **NOT EXERCISED**. Layers (06 §1): U unit, I mod/integration (engine test kit), P timing, E live PTY run, M manual, C compatibility job.

Paths: `tests/` = `jeeves/tests/`. Raw live-run folders stay local (scratch paths); `turn-mode/RESULT.md` and `AC-41/RESULT.md` are their tracked summaries.

**Live runs happened on one account only:** the maintainer's Team account, in turn mode (D-49). Stop mode, which every account outside a Team organization uses, has no v0.3 live run: its v0.3 behaviour rests on U and I (the mod suite runs in Stop mode twice, auto-start off and on) and on v0.2.0's live runs of the unchanged rotation path.

## Suite re-run

`jeeves/scripts/check-all.sh` on 2026-11-09 at the release-prep commit, machine load average 17–35: typecheck ok, lint ok, **302 unit; 311 mod in each of the three runs (Stop mode with auto-start off, Stop mode with auto-start on, turn mode); every functional test passes**; `claude plugin validate --strict` and the marketplace validate pass. The timing test `tests/perf/stats.test.ts` ("P: stats over 50 tasks < 100 ms") failed in some runs at this load (100.4–257 ms) and passed in others, as recorded for v0.2.0 (AC-32 there: borderline, bound kept, runs locally only).

Compatibility (C): [`jeeves/docs/compatibility.md`](../../../../jeeves/docs/compatibility.md), regenerated for 0.3.0: 2.1.302, 2.1.303, 2.1.310, 2.1.316 and 2.1.319 all validate, and their mod tests pass except the timing test above in the generated rows for 2.1.302 and 2.1.310 (2.1.302 passed 311/311 on a re-run). Only 2.1.319 is supported (D-38). `scripts/compat.mjs` had not run since ST-16.7, which put unescaped backticks into a template literal; fixed in ST-15.3.

## v0.3 acceptance criteria

| AC | Requirement | Result | Layers | Evidence |
|---|---|---|---|---|
| AC-35 | Auto-start on a fresh install | PASS | I, E | I: `tests/mod/autostart.test.ts` (notice, first `composer` prompt word for word, nothing written before it, one test per other origin kind), `notice.test.ts`; E: AC-41 dry run (first-run notice, not the upgrade notice; `task-rev-001.md` holds the prompt word for word; nothing in the state folder before it) |
| AC-36 | Eligibility | PASS | U, I | U: `tests/unit/autostart.spec.ts`; I: `tests/mod/eligible.test.ts` |
| AC-37 | Near-threshold, grace, model switch | PASS | U, I | U: `tests/unit/autostart.spec.ts`; I: `tests/mod/autostart.test.ts`, `eligible.test.ts`. Grace amended after AC-41 (D-50): it ends at threshold + 10 |
| AC-38 | Opt-out levels and precedence | PASS | U, I | U: `tests/unit/autostart.spec.ts`; I: `tests/mod/auto.test.ts` |
| AC-39 | `/jeeves later` | PASS | U, I | U: `tests/unit/later.spec.ts`; I: `tests/mod/later.test.ts` |
| AC-40 | User `/clear` by origin | PASS | I, E | I: `tests/mod/clear.test.ts`; E: ST-16.8 phase u (turn mode: a user `/clear` ends the auto task, the next prompt starts a new one) |
| AC-41 | Live cost, rotation rate and outcome | PASS (cost: 13% below the baseline, not half) | E | `AC-41/RESULT.md` |
| AC-42 | Current goal and continuation order | PASS | U, I | U: `parse.spec.ts`, `validate.spec.ts`, `continuation.spec.ts`, `template.spec.ts`; I: `handover.test.ts`, `continue.test.ts`, `ui.test.ts`; E: every ST-16.8 rotation line shows the goal |
| AC-43 | Upgrade path | PASS | I | `tests/mod/auto.test.ts` |
| AC-44 | Cleanup | PASS | U, I | U: `tests/unit/cleanup.spec.ts`; I: `tests/mod/cleanup.test.ts` |
| AC-45 | Downgrade | PASS | U, audit | U: `tests/unit/downgrade.spec.ts` (frozen v0.2.0 reader in `tests/fixtures/v0.2-core/`); audit: `ST-13.1-downgrade.md` |
| AC-46 | Auto-recovery for auto tasks | PASS | I | `tests/mod/recover.test.ts` |
| AC-47 | §6 polish (E14) | PASS | U, I | `hint.test.ts`, `ui.spec.ts`, `ui.test.ts`, `rotate.test.ts`, `handover-cmd.test.ts`, `concurrency.test.ts` |
| AC-48 | Turn mode chosen at the skip only | PASS | U, I, E | U: `probe.spec.ts`; I: `probe.test.ts`, `eligible.test.ts`; E: ST-16.8 (`mode: full (turn)`) |
| AC-49 | Turn-mode safe boundary | PASS | U, I, E | U: `background.spec.ts`; I: `turn-boundary.test.ts`; E: ST-16.8 run 2 (AC-07: no handover while a permission dialog is open) |
| AC-50 | Handover by submit, read from `answer` | PASS | U, I, E | U: `render.spec.ts`; I: `turn-handover.test.ts`; E: 7 handovers validated live, one retry (ST-16.8). Several text blocks in one final message: not seen live (0 in 69 calls), I only |
| AC-51 | Delivery after Jeeves's `/clear` | PASS | I, E | I: `turn-rotate.test.ts`; E: ST-16.8 run 1 (two rotations with nothing typed), AC-41 200K run |
| AC-52 | Compaction from `session.measure` | PASS | U, I, E | U: `compaction.spec.ts`; I: `turn-compact.test.ts`; E: ST-16.8 run 3 (typed `/compact`, then one typed prompt); AC-41 1M runs (the engine's own compaction recognised) |
| AC-53 | Completion rules row and both-mode suite | PASS (I), with a known limit (E) | U, I, E | I: `turn-complete.test.ts`, the suite in three runs; E: the row reaches the turn from its first tool result, but not the turn's last request, and the first turn of a process gets none (ST-16.8; accepted as a known limit, D-51) |
| AC-54 | Turn mode live on the Team account | PASS | E | `turn-mode/RESULT.md` |

## Live spend

| Story | What | US$ (API-equivalent) |
|---|---|---|
| ST-16.8 | turn-mode E runs and the fix's live check | 0.34 |
| ST-15.2 | AC-41 runs | about 10.40 (six runs, one void, one before D-50) |

Figures are from the transcripts' token usage at Haiku 5.5 prices (`tests/pty/transcripts.py`); this account is a Team (subscription) account, so none of it was billed in dollars.

## Release artifact

RELEASE_ARTIFACT
