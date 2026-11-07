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

## Status (2026-11-07)

| M | Status | Evidence |
|---|---|---|
| M0 | Solved | `evidence/s-0*`, D-15 |
| M1 | Solved (CI never run: no remote) | `handoff-m1.md`, `evidence/m1-relay-status/` |
| M2 | Solved | `handoff-m2.md`, `evidence/m2-demo/`; 103 unit + 44 mod tests |
| M3 … M7 | Open | — |

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

- If S-01 reveals Claude Code itself misbehaves after `/clear` in Cursor (not a SessionRelay bug): report upstream, keep building on PTY evidence, but v0.1 cannot claim AC-02 until fixed.
- If a Claude Code update removes plugin-invoked `/clear` before release: ship assisted mode only, labelled as such (AC-25), and re-plan.
- If S-05 parse reliability < 90% even with the tool fallback: re-scope handover to the plugin-generated verified section plus a shorter free-text "next actions" field, and re-run.
