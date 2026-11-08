# 05 — Delivery Milestones

Gates follow PRD §18.6: Feasibility → Foundation → Handover → Fresh session → Continuation → Recovery/safety → UX/distribution → Public beta. "Continuation" and "Fresh session" are one milestone (M4) because the verified mechanism delivers both in one pipeline. A milestone is done only when its gate passes; a failed gate stops downstream work until the cause is fixed or an ADR amended.

Estimates use story midpoints (S 0.5 d, M 1.5 d, L 3.5 d), one developer.

| M | Name | Stories | Est. | Gate (all required) | Demo |
|---|---|---|---|---|---|
| **M0** | Feasibility closeout | ST-0.1 … ST-0.7 | 4.5 d | S-01…S-06 results in `evidence/`; Cursor rotation recorded; ADRs Accepted; PRD changes approved or rejected; DoR checklist (PRD §15) ticked | Spike mod rotating in Cursor |
| **M1** | Foundation | ST-1.1 … ST-1.9 | 13.5 d | CI green; `claude plugin validate`/`test` pass; reducer table + property tests pass; storage crash test passes; probe blocks unsupported version with exact message; `/relay status` live | `/relay status` in a live session showing mode `full` |
| **M2** | Monitoring & task | ST-2.1 … ST-2.5, ST-7.3 | 6 d | AC-03, AC-05, AC-06, AC-14 tests pass; original prompt byte-identical | Turn on, see context %, warning at 45%, request at 50% (test override) |
| **M3** | Handover | ST-3.1 … ST-3.8 | 12 d | AC-07, AC-08, AC-09, AC-17 tests pass; validator fixture suite ≥ 20 cases; handover persisted + hash-verified before any `/clear` effect | Rotation pipeline up to a persisted, validated handover file; invalid handover → NEEDS_REVIEW |
| **M4** | Fresh session & continuation | ST-4.1 … ST-4.8, ST-5.1, ST-5.2 | 13 d | PTY E2E: ≥ 2 rotations, no keystrokes, no repeated work (AC-10/11/12); AC-13, AC-15 pass; assisted mode honest (AC-25) | Fixture task completes across 3 sessions unattended |
| **M5** | Recovery & safety | ST-6.1 … ST-6.7 | 12.5 d | Crash matrix 6/6; AC-16, AC-18, AC-19, AC-23 pass; no git mutation (audit test) | Kill process mid-rotation → `/relay recover` continues once |
| **M6** | UX & distribution | ST-7.1, ST-7.2, ST-8.1 … ST-8.4 | 7 d | AC-01, AC-02 (manual), AC-20, AC-21, AC-22 evidence; install < 5 min on clean user | Clean-machine install → first rotation |
| **M7** | Public beta | ST-9.1 … ST-9.3 | 4.5 d | Every AC pass/fail/not-supported with evidence; security review no Critical/High; real Cursor two-rotation demo; maintainer sign-off; v0.1.0 released | Release + demo video |

## Status (2026-11-08)

| M | Status | Evidence |
|---|---|---|
| M0 | Solved | `evidence/s-0*`, D-15 |
| M1 | Solved (CI never run: no remote) | `handoff-m1.md`, `evidence/m1-relay-status/` |
| M2 | Solved | `handoff-m2.md`, `evidence/m2-demo/`; 103 unit + 44 mod tests |
| M3 | Solved | `handoff-m3.md`, `evidence/m3-demo/`; 185 unit + 66 mod tests |
| M4 | Solved: gate passed 2026-11-07 (gate runs 5 and 6: 5 and 4 live rotations, COMPLETED, 10/10 checks each); AC-10/11/12/13/15/25 met | `evidence/m4-e2e/RESULT.md`, `handoff-m4b.md`; 220 unit + 101 mod tests; three ponytail reviews fixed (23f24f2, 29343ff, 55b0231) |
| M5 | Solved: gate passed 2026-11-08. ST-6.1 … ST-6.7 solved; crash matrix 6/6 (I + P layers); AC-16 (I + E), AC-18 (I + E), AC-19 (U + E), AC-23 (U/I) pass. Demo (live run 2): SIGKILL at `before-clear` (ROTATING, handover-001 saved) -> new process -> `/jeeves recover` (refused once while the dead lock was live, then accepted) -> exactly one continuation from handover-001 -> a normal rotation afterwards; 17/17 checks, about US$0.25. Live run 1 (US$0.18) froze in system sleep. M5 live cost in total about US$0.43 | `evidence/m5-demo/RESULT.md`, `evidence/m5-crash/crash-matrix.md`, `evidence/m5-concurrency/RESULT.md`, `evidence/m5-demo/run1-sleep/NOTE.md`, `handoff-m5.md`; 237 unit + 137 mod tests, clean after three reviews (two ponytail, one code-review) |
| M6 | Solved: gate passed 2026-11-08. The maintainer ran AC-01 on a fresh macOS user (under 5 min) and the AC-02 Cursor checklist (7/7 before and after a rotation), both pass (`evidence/m6-gate/RESULT.md`; recordings to attach in ST-9.2). Built: ST-7.1, ST-7.2, ST-8.1 … ST-8.4 solved; AC-20 (P), AC-21, AC-22 (local) pass; install to `/jeeves status` 15 s for a scripted fresh user (no login); demo split: install proven free (`m6-install`, 11/11), rotation live in run 2 (one rotation continued, US$0.03) with `--plugin-dir` on the installed folder, because the throwaway config could not be logged in. Not done: the optional installed-plugin rotation with a logged-in throwaway config. CI and compat workflows never ran (no remote). M6 live cost US$0.03 of the US$1 budget | `evidence/m6-gate/RESULT.md`, `evidence/m6-install/RESULT.md`, `evidence/m6-demo/run1-auth/NOTE.md`, `evidence/m6-demo/run2/NOTE.md`, `docs/compatibility.md`, `handoff-m6.md`; 239 unit + 151 mod tests; one ponytail review and one code-review on the M6 range, all findings fixed |
| M7 | Built, gate open (2026-11-08). ST-9.1 solved (threat model, SECURITY.md, F-1/F-2 Medium and F-3 Low fixed, no Critical/High). ST-9.2: evidence pack with every AC (22 PASS; AC-02 passed at M6 with its two-rotation Cursor demo open; AC-07 PASS in I with its E layer open; AC-24 open until the release page); E-layer live runs 1-3, about US$0.21: AC-03 E and AC-09 E pass, AC-10 E pass with the probe inconclusive, AC-07 E not exercised. ST-9.3 prepared: naming check, reproducible release zip, release workflow (draft), version 0.1.0. Open for the maintainer: the Cursor two-rotation demo and video (`docs/evidence/v0.1.0/cursor-demo-script.md`), AC-01 timing/recording files, naming decision (TSDR check), remote + CI first run + fork dry run, tag, publication, sign-off | `docs/evidence/v0.1.0/README.md`, `jeeves/docs/threat-model.md`, `docs/evidence/v0.1.0/e-layers/RESULT.md`, `handoff-m7.md` |

Total ≈ 73 engineer-days, matching the backlog. ST-7.3 is scheduled in M2 because the first-activation notice ships with `/relay on`.

## Critical path

ST-0.7 → ST-1.1 → ST-1.2 → ST-1.3 → ST-1.4 → ST-1.7 → ST-1.8 → ST-1.9 → ST-2.1 → ST-2.3 → ST-2.4 → ST-3.1 → ST-3.3 → ST-3.6 → ST-3.8 → ST-4.1 → ST-4.2 → ST-4.3 → ST-4.5 → ST-4.8 → ST-6.1 → ST-6.7 → ST-9.2 → ST-9.3.

## Parallel tracks (if two people/agents)

- Track A (critical path above).
- Track B: ST-1.5, ST-1.6, ST-3.5, ST-3.7, ST-7.1, ST-7.2, ST-8.4 early; ST-6.2, ST-6.4 once ST-1.7 lands; docs (ST-8.2) after M4.

## Release candidates

- **v0.0.x (internal):** after M4, maintainer dogfoods on real work; collects handover failures as parser fixtures.
- **v0.1.0 (public beta):** after M7.
- **v0.2 (P1):** Linux official, VS Code terminal matrix, back-compat range widened, stats.

## Stop/kill criteria

- If S-01 reveals Claude Code itself misbehaves after `/clear` in Cursor (not a Jeeves bug): report upstream, keep building on PTY evidence, but v0.1 cannot claim AC-02 until fixed.
- If a Claude Code update removes plugin-invoked `/clear` before release: ship assisted mode only, labelled as such (AC-25), and re-plan.
- If S-05 parse reliability < 90% even with the tool fallback: re-scope handover to the plugin-generated verified section plus a shorter free-text "next actions" field, and re-run.
