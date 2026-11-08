# 00 — Executive Plan: Jeeves

Jeeves was called SessionRelay until 2026-11-07 (D-22); the PRD file and older evidence keep the old name.

**Date:** 2026-11-07 · **Source:** `docs/specs/sessionrelay-product-engineering-spec.md` (PRD v1.0) · **Verified against:** Claude Code 2.1.319 (macOS, Darwin 23.6) · **Status:** Approved (D-15). M0 … M6 solved (M4 gate: two live runs with 5 and 4 unattended rotations, `docs/done/evidence/m0-m7/m4-e2e/RESULT.md`; M5 gate: crash matrix 6/6 and the kill-mid-rotation demo, `docs/done/evidence/m0-m7/m5-demo/RESULT.md`, 2026-11-08). M6 gate: passed 2026-11-08 (AC-01 on a fresh macOS user and the AC-02 Cursor checklist passed, maintainer-reported, `docs/done/evidence/m0-m7/m6-gate/RESULT.md`). M7 (public beta) built 2026-11-08, gate open for the maintainer's Cursor demo, release and sign-off (`handoff-m7.md`). Progress per milestone: `05-delivery-milestones.md` § Status.

## 1. Go / no-go recommendation

**GO for full-auto rotation, built as a mod-only plugin (PRD Path A).**

The PRD's critical unknown (SPIKE-01) was whether a mod inside a running interactive `claude` session can start a genuinely fresh conversation and continue it without the user typing anything. A live spike on 2.1.319 showed it can, using only documented mod APIs:

| Step | Mechanism (documented API) | Observed in spike |
|---|---|---|
| Hold the turn at a safe point | `classic.Stop` hook returns `{ block }` | Claude continued in the same turn; 2nd Stop had `stop_hook_active: true` |
| Know nothing is in flight | Stop input `background_tasks` | Field present (`[]`) |
| Read repo facts deterministically | `$.process.run(['git', …])` | `## main\n M a.txt`, exit 0, no permission prompt |
| Start a fresh conversation | `$.command.run({ command: 'clear' })` | Session ID changed `40a3f79d…` → `ceec6272…`; `session.end` reason `clear` |
| Inject task + handover | `classic.SessionStart` (source `clear`) → `additionalContext` | New conversation quoted the injected secret word |
| Continue without user input | `$.prompt.submit({ text })` | New turn ran by itself; Claude reported "no earlier messages" |
| Context after rotation | `$.session.usage().context.percent` | `undefined` until first reply (never a false 0), then 3% (34K/1M) vs 6% before |
| Settings preserved | — | Model, permission mode (`acceptEdits`), cwd, MCP tools all unchanged after `/clear` |
| Compaction control | `session.compact` → `{ skip }` | `/compact` answered "Not compacted · …" |

Evidence: `docs/done/evidence/m0-m7/spike-01-mod-rotation/` (spike mod, PTY driver, event log). Details in `01-technical-feasibility.md`.

Because the process is never restarted or wrapped, the user's terminal, keyboard, Ctrl+C, permission prompts, MCP and auth are untouched **by construction**. No supervisor, no PTY wrapper, no second install. That removes the PRD's two Critical risks (R-01, R-02) rather than mitigating them.

**Conditions on the GO:**
1. The mods API is marked *early access, may change between releases without notice* in the 2.1.319 type declarations. Jeeves must pin a tested version range, probe capabilities at startup, and degrade to an honestly labelled **assisted mode** if a primitive is missing (ADR-002).
2. The spike ran in a scripted pseudo-terminal, not physically in Cursor. A manual Cursor E2E (M0 exit gate) is still required before the architecture is frozen.
3. Five follow-up spikes (S-02…S-06 in `01-technical-feasibility.md`) must pass in M0. None is expected to change the architecture; each has a documented fallback.

## 2. Recommended architecture (one paragraph)

One Claude Code plugin containing one hooks module (`hooks/register.ts`) that is a thin adapter over a pure TypeScript core (state machine, threshold logic, handover parser/validator, evidence ledger, recovery reducer). The adapter listens to `session.measure`/`tool.call` (context), `classic.Stop` (safe boundary + handover gate), `turn.complete` (schedules rotation), `session.end`/`classic.SessionStart` (rotation boundary + context injection), `prompt.submit` (task capture, input during rotation), `session.compact` (compaction policy), and registers one slash command, `/relay`. State lives in a private user-level directory, written as immutable files plus a small state file swapped with `mv`, guarded by an `mkdir` lock. Zero runtime dependencies. See `02-architecture-and-adrs.md`.

## 3. Smallest viable release (MVP = v0.1 public beta)

- `/relay on|off|status|threshold|rotate|pause|resume|recover|history|done|help`.
- Opt-in managed task; original prompt captured verbatim and stored append-only.
- Rotation at ≥ 50% (configurable 20–90) at the next safe boundary, with soft "wrap up" nudge mid-turn.
- Handover = machine-verified facts (git, edits, test exit codes) + model-written narrative in a sentinel-delimited Markdown block, validated before `/clear`.
- Fresh conversation via `/clear`, context injection, automatic continuation, rearm on fresh reading, loop guard.
- Completion only when DoD verification commands were run by Claude (normal permissions) and exited 0 after the last edit; otherwise `NEEDS_REVIEW`.
- Crash recovery, single-owner lock, corrupt-state handling, pause on auth/rate-limit/API errors.
- macOS + Cursor supported and tested; Linux expected to work (no platform code) but labelled P1 until tested.
- Install with one line from a public GitHub marketplace; uninstall leaves no trace in Claude settings.

**Explicitly out of MVP:** supervisor/launcher, Windows, other agents, dashboards, telemetry, config UI beyond `/relay` and `/config` rows.

## 4. Milestones (detail in `05-delivery-milestones.md`)

| M | Name | Exit gate |
|---|---|---|
| M0 | Feasibility closeout | S-02…S-06 pass; manual Cursor rotation demo recorded; ADR-001 signed |
| M1 | Foundation | Pure core + storage + lock + adapter skeleton; `/relay status`; CI green |
| M2 | Monitoring & task | Opt-in, task capture, threshold trigger with AC-05/06 tests |
| M3 | Handover | Evidence ledger, handover request/parse/validate/persist; AC-08/09/17 |
| M4 | Fresh session & continuation | `/clear` rotation, injection, continuation, rearm, loop guard; AC-10/11/12 |
| M5 | Recovery & safety | Crash matrix, errors, pause/resume, concurrency; AC-14…AC-19, AC-23 |
| M6 | UX & distribution | Status UI, install/uninstall, docs, compatibility matrix; AC-01/02/20–22 |
| M7 | Public beta | AC-01…AC-25 evidence; release v0.1.0 (two-rotation Cursor demo dropped, D-34). **Status:** signed off 2026-11-08; public release deferred (D-37) |
| M8 | v0.2 (P1) | `/jeeves retry`, 40% default above 200K, project defaults, check suggestions, `history --full`, `stats`, floor 2.1.303, live coverage; AC-26…AC-34. **Status:** solved 2026-11-08 (ST-12.5 signed off; not tagged or released); ST-12.2 dropped, floor stays 2.1.319 (D-38), Team accounts unsupported (D-39) |

Rough size: 56 stories (5 L, 30 M, 21 S) ≈ 73 engineer-days for one developer (≈ 14 weeks), M0 alone ≈ 4.5 days. A coding agent executing stories in order can compress this, but the estimate assumes human review per story.

## 5. Document map

| File | Contents |
|---|---|
| `01-technical-feasibility.md` | Verified capabilities, spike results, remaining spikes, assumptions, unresolved questions |
| `02-architecture-and-adrs.md` | Architecture options compared, ADRs, modules, state machine, sequences, data contracts, concurrency, recovery, compatibility |
| `03-epics.md` | 16 epics (E10–E12 for v0.2, E13–E15 for v0.3) with goal, scope, value, risks, AC, DoD, artifacts |
| `04-backlog-stories.md` | 85 stories (12 for v0.2, 17 for v0.3) in dependency order, each with scope, approach, deps, AC, tests, size, DoD |
| `05-delivery-milestones.md` | Milestones, gates, critical path, demo per milestone |
| `06-test-and-acceptance-plan.md` | Test architecture, fixtures, AC→test mapping, evidence production |
| `07-risks-and-open-questions.md` | Risk register, decision log, open questions, proposed PRD changes |
| `08-open-source-release-plan.md` | Repo, licence, CI, supply chain, packaging, release, naming |
| `09-v0.3-auto-start-plan.md` | The whole v0.3 auto-start plan in one file: decisions, epics, stories, milestone, AC, AC-41 cost, risks, open items |

## 6. Proposed PRD changes (summary — full justification in `07-risks-and-open-questions.md` §4)

1. Remove the supervisor package and statusline fallback from scope; the mod API covers both needs.
2. Define "context %" as `$.session.usage().context.percent` (= status line `used_percentage`, measured against the model's full window). On 1M-token models 50% means ~500K tokens.
3. Replace "temp → fsync/rename" with: immutable write-once files + read-back hash verification + `mv` pointer swap (the mod `$.fs` API has no rename or fsync).
4. Do not block automatic compaction at the context limit (that would cause a context-overflow error); skip only early/pre-emptive compaction and rotate at the next safe boundary after any compaction.
5. A user-typed `/clear` during a managed task pauses the task instead of auto-continuing.
6. Prompts typed during a rotation are held and delivered to the fresh session, not lost or sent to the old one.
7. DoD verification commands run through Claude's own Bash tool and permissions, never executed by the plugin.
8. AC-02/NFR-02 evidence is a scripted manual Cursor run plus PTY automation; Cursor itself cannot be automated in CI.

None of these lowers a requirement. Each one replaces an unverifiable mechanism with a verified one.
