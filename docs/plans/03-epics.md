# 03 — Epics

Priority: P0 = MVP. Each epic cites PRD identifiers. Standard epic DoD (applies to all, plus epic-specific items): all child stories meet their DoD; epic AC demonstrated with the listed artifact; docs updated; no open Critical/High review findings; CI green.

Dependency order: E0 → E1 → E2 → E3 → E4 → E5 → (E6, E7 in parallel) → E8 → E9 → (E10, E11) → E12.

---

## E0 — Feasibility closeout (P0)
- **Status:** Solved (M0 gate passed, D-15).
- **Goal:** Retire the remaining unknowns before any product code; freeze ADR-001.
- **Scope:** Spikes S-01…S-06 (01 §4); maintainer sign-off on ADRs. **Out:** product code.
- **User value:** Guarantees the "full auto" claim is true before work starts (AC-25).
- **Dependencies:** none. **Risks:** R-01, R-02, R-06, R-11.
- **Cites:** PRD §9.3, §15 DoR; FR-01, FR-04, FR-08, FR-09; NFR-02.
- **Acceptance criteria:** each spike has a log + one-page result under `docs/plans/evidence/`; the Cursor manual rotation is recorded; ADR-001…010 marked Accepted or amended; any spike failure has its documented fallback adopted in the ADRs.
- **Artifact:** evidence folder + signed ADR list.

## E1 — Foundation: core, storage, adapter skeleton (P0)
- **Status:** Solved (M1 gate passed; CI never run, no remote).
- **Goal:** Buildable, testable plugin skeleton with pure core and safe persistence.
- **Scope:** repo scaffold, CI, domain types, state machine reducer, schemas/migrations, storage (serial queue, atomic swap, immutable files, lock, events), git facts, capability probe, `/relay status|help`.
- **User value:** Nothing visible yet beyond `/relay status`; foundation for every guarantee.
- **Dependencies:** E0. **Risks:** R-05, R-06, R-12.
- **Cites:** FR-01, FR-13, FR-14; NFR-04, NFR-07, NFR-09.
- **AC:** `claude plugin validate` passes; `/relay status` shows mode/probe result in a live session; crash-at-every-write test leaves readable state; two processes cannot both hold the lock; unsupported version produces a precise message and no automation.
- **Artifact:** CI run, `claude plugin test` report, status screenshot.

## E2 — Managed task and context monitoring (P0)
- **Status:** Solved (M2 gate passed; evidence/m2-demo).
- **Goal:** Opt-in task with immutable original goal; correct context readings and threshold trigger.
- **Scope:** `/relay on|off|threshold|pause|resume`, task capture and revisions, DoD/verification commands entry, `session.measure` handling, warnings, hysteresis, unknown handling, rate-limit separation.
- **User value:** User can turn Jeeves on in one command and see accurate context status.
- **Dependencies:** E1. **Risks:** R-03, R-13.
- **Cites:** FR-02, FR-03, FR-05, FR-11; AC-03, AC-04, AC-05, AC-06, AC-14; §4.4.
- **AC:** without `/relay on` no rotation ever (AC-03); 49% no request, 50% exactly one, repeated 51% nothing more (AC-05); `undefined` reading shows "unknown" and never triggers (AC-06); original prompt byte-identical in `task-rev-001.md`; pause before threshold prevents rotation until resume (AC-14).
- **Artifact:** unit report + recorded session showing status transitions.

## E3 — Safe boundary and handover (P0)
- **Status:** Solved (M3 gate; evidence/m3-demo).
- **Goal:** At a safe point, obtain a validated, persisted handover.
- **Scope:** evidence ledger, soft quiesce, Stop gate, handover instruction, parser, validator, redaction, merged render, atomic persistence, bounded retries, `NEEDS_REVIEW`.
- **User value:** Work state is captured truthfully without the user writing anything.
- **Dependencies:** E2. **Risks:** R-03, R-04, R-07, R-08.
- **Cites:** FR-04, FR-06, FR-07, FR-16; AC-07, AC-08, AC-09, AC-17; NFR-10.
- **AC:** threshold crossed during a tool call or permission prompt never interrupts it (AC-07); handover has all required sections and ≤ 12K chars (AC-08); a failed test stays failed in the handover even if Claude claims otherwise (AC-09); corrupt/empty handover after 2 retries → `NEEDS_REVIEW`, no `/clear`, previous handover intact (AC-17).
- **Artifact:** fixture handovers (good/bad), validator report, recorded rotation up to persisted handover.

## E4 — Fresh session and automatic continuation (P0)
- **Goal:** Replace the conversation and continue without user input.
- **Scope:** `/clear` execution, rotation boundary detection, context injection, continuation prompt, held prompts, rearm, loop guard, max rotations, assisted-mode fallback, `/relay rotate`.
- **User value:** The core promise: long tasks keep going across fresh contexts.
- **Dependencies:** E3. **Risks:** R-01, R-06, R-11.
- **Cites:** FR-08, FR-09, FR-03 (rearm); AC-10, AC-11, AC-12, AC-15, AC-25; Flow B, C.
- **AC:** new session ID and low baseline after rotation (AC-10); session 2 reads task + handover and continues with no prompt (AC-11); fixture task rotates ≥ 2 times without repeated work (AC-12); `/relay rotate` uses the identical pipeline (AC-15); `$.command.run` failure produces assisted mode with honest status (AC-25).
- **Artifact:** PTY E2E log with two rotations; recorded Cursor demo (preview).

## E5 — Completion and DoD verification (P0)
- **Goal:** Finish only on machine evidence.
- **Scope:** completion block parsing, DoD evaluation against ledger, `COMPLETED`/`NEEDS_REVIEW`/`BLOCKED`, `/relay done`, summary.
- **Dependencies:** E3 (ledger), E4. **Risks:** R-04.
- **Cites:** FR-10; AC-13; Flow F.
- **AC:** "done" text without passing verification → `NEEDS_REVIEW` listing missing checks (AC-13); all checks pass after last edit → `COMPLETED`, rotation stops.
- **Artifact:** unit + E2E logs for both outcomes.

## E6 — Recovery, safety and fault tolerance (P0)
- **Goal:** Every failure ends in a recognisable, recoverable state; never two workers.
- **Scope:** recovery classifier, `/relay recover`, stale locks, error classification (auth/rate limit/billing/overload/API), disk errors, repo mismatch, user `/clear`, user interrupt, compaction policy, concurrency tests, crash matrix.
- **Dependencies:** E4. **Risks:** R-05, R-09, R-12.
- **Cites:** FR-11, FR-12, FR-13; AC-14, AC-16, AC-17, AC-18, AC-19, AC-23; NFR-04; Flow E; edge-case matrix §11.
- **AC:** simulated crash at each transition recovers without duplicate worker/edits (AC-16); two repos isolated, same task single owner (AC-18); no git mutation or permission change during rotation (AC-19); auth, rate limit, outdated CLI, disk error, wrong path each show a specific message (AC-23).
- **Artifact:** crash-matrix report, concurrency test report.

## E7 — Terminal UX and controls (P0)
- **Status:** Open. ST-7.3 solved in M2; ST-7.1, ST-7.2 open.
- **Goal:** Discreet, accessible status and clear messages.
- **Scope:** status entry, transition toasts/log lines, narrow-width strings, no-emoji/no-colour-only, `/relay history`, first-activation notice, help text, error copy.
- **Dependencies:** E2 (can run alongside E3–E6). **Risks:** R-14.
- **Cites:** §4.1–4.3, FR-11, FR-14, FR-17; NFR-02, NFR-08.
- **AC:** status never replaces the user's status line; one line per transition, none per tool call; text readable at 40 columns; every state has a text label.
- **Artifact:** screenshots at 40/80/140 columns, light/dark.

## E8 — Distribution, docs and compatibility (P0)
- **Goal:** One-line install, clean uninstall, docs a newcomer can follow.
- **Scope:** marketplace manifest, README/quickstart/troubleshooting/FAQ/privacy, compatibility matrix, uninstall + delete-state command, `doctor`-equivalent (`/relay status --diagnose`), CI compatibility job.
- **Dependencies:** E4 (features to document), E7. **Risks:** R-06, R-10.
- **Cites:** FR-15, FR-16, FR-17; AC-01, AC-02, AC-20, AC-21, AC-22, AC-24; NFR-01, NFR-05, NFR-06.
- **AC:** clean macOS + supported Claude Code: install by quickstart in < 5 min, no API key (AC-01, NFR-01); uninstall leaves settings and code untouched (AC-20); contributor builds and tests from README (AC-21); matrix published (AC-22).
- **Artifact:** clean-machine install recording, docs PR.

## E9 — Public beta release (P0)
- **Goal:** Ship v0.1.0 honestly.
- **Scope:** full AC evidence pack, real two-rotation demo in Cursor, security review, name/trademark check, release pipeline, announcement text with exact claims.
- **Dependencies:** E5, E6, E8.
- **Cites:** PRD §13, §15 MVP DoD, §17; AC-01…AC-25.
- **AC:** every AC marked pass/fail/not-supported with evidence; marketing claims match `full` mode capabilities; maintainer sign-off.
- **Artifact:** GitHub release, evidence pack (demo video dropped, D-34).

## E10 — Fewer dead ends (P1, v0.2)
- **Goal:** A failed handover or a suspected loop is no longer a dead end, and the default threshold suits large-window models.
- **Scope:** `/jeeves retry` for NEEDS_REVIEW(HANDOVER_INVALID) and NEEDS_REVIEW(POSSIBLE_LOOP) (POSSIBLE_LOOP moves from FAILED to NEEDS_REVIEW); a window-aware default threshold (50% up to a 200K window, 40% above). **Out:** automatic retries; any retry that weakens validation.
- **User value:** recover from a bad handover in one command instead of `/jeeves off` and a new task; rotations on 1M models before 500K tokens.
- **Dependencies:** E6. **Risks:** R-13, R-18, R-23.
- **Cites:** FR-03, FR-08, ADR-003, ADR-009 A2, D-31, D-32.
- **AC:** AC-26, AC-27, AC-28 pass (U + I); earlier handovers byte-identical after a retry; no retry without the user typing it.
- **Artifact:** I-layer tests + state-table rows in 02 §4.

## E11 — Setup and insight (P1, v0.2)
- **Goal:** Less typing per task, and a view of what Jeeves has done.
- **Scope:** per-project defaults (`/jeeves defaults`: threshold and verification commands, stored in the state folder), check suggestions from the repo's own scripts at `/jeeves on`, `/jeeves history --full`, `/jeeves stats`. **Out:** a settings UI, the handover diff pane (P1, deferred), anything that runs repo commands from the plugin.
- **User value:** `/jeeves on` in a configured project needs no further setup; users see rotations, cost and context cleared.
- **Dependencies:** E7. **Risks:** R-19 (repo text read for suggestions), R-24.
- **Cites:** FR-10, FR-11, ADR-005, ADR-009 A2, D-30.
- **AC:** AC-29 … AC-32 pass (U + I); no state written inside the repository.
- **Artifact:** I-layer snapshots of each command.

## E12 — Compatibility and live coverage (P1, v0.2)
- **Goal:** Widen the supported Claude Code range on evidence, close the live-unverified paths, ship v0.2.0.
- **Scope:** floor 2.1.303 (compat matrix + one live rotation), VS Code terminal checklist (maintainer), live runs for compaction, `autoRecover`, REPO_MISMATCH on a moved repo, the `/clear` stall via `endedHere`, `/plugin configure`, the AC-07 E layer, Q-9 (a second blocking Stop hook), v0.2.0 release prep. **Out:** Linux official and Windows (P1/P2, deferred).
- **Dependencies:** E10, E11; v0.1.0 released (M7). **Risks:** A-01, R-21.
- **Cites:** NFR-02, NFR-06, AC-02, AC-07, AC-22, Q-4, Q-9.
- **AC:** AC-33, AC-34 pass; every path in `handoff-m7.md` §5 "live-unverified" has an E result or a recorded reason; evidence pack `docs/evidence/v0.2.0/`.
- **Artifact:** `docs/evidence/v0.2.0/`, draft release v0.2.0.

---

## P1 / P2 backlog (not scheduled)
- **P1 (scheduled in M8, D-30):** VS Code terminal matrix (ST-12.2); `/jeeves history --full` (ST-11.3); per-project default config (ST-11.1); verification-check suggestions (ST-11.2); `/jeeves stats` (ST-11.4); back-compat floor 2.1.303 (ST-12.1; 2.1.287/2.1.295 refuse the module, Q-4).
- **P1 (still unscheduled):** Linux officially supported (CI PTY E2E; needs a Linux machine with a logged-in Claude Code); handover diff view (`AbovePrompt` pane; early-access mods UI).
- **P2:** Windows; adapters for other agents via `EnginePort`; optional local dashboard; shareable handover policy presets; multi-task orchestration.
