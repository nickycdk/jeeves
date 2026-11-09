# 03 — Epics

Priority: P0 = MVP. Each epic cites PRD identifiers. Standard epic DoD (applies to all, plus epic-specific items): all child stories meet their DoD; epic AC demonstrated with the listed artifact; docs updated; no open Critical/High review findings; CI green.

Dependency order: E0 → E1 → E2 → E3 → E4 → E5 → (E6, E7 in parallel) → E8 → E9 → (E10, E11) → E12 → E13 → E14 → E16 → E15 (v0.3, `docs/specs/auto-start.md`; E16 turn mode, `docs/specs/team-accounts-turn-mode.md`, D-48, before ST-15.3).

---

## E0 — Feasibility closeout (P0)
- **Status:** Solved (M0 gate passed, D-15).
- **Goal:** Retire the remaining unknowns before any product code; freeze ADR-001.
- **Scope:** Spikes S-01…S-06 (01 §4); maintainer sign-off on ADRs. **Out:** product code.
- **User value:** Guarantees the "full auto" claim is true before work starts (AC-25).
- **Dependencies:** none. **Risks:** R-01, R-02, R-06, R-11.
- **Cites:** PRD §9.3, §15 DoR; FR-01, FR-04, FR-08, FR-09; NFR-02.
- **Acceptance criteria:** each spike has a log + one-page result under `docs/done/evidence/m0-m7/`; the Cursor manual rotation is recorded; ADR-001…010 marked Accepted or amended; any spike failure has its documented fallback adopted in the ADRs.
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
- **Status:** Solved (M2 gate passed; docs/done/evidence/m0-m7/m2-demo).
- **Goal:** Opt-in task with immutable original goal; correct context readings and threshold trigger.
- **Scope:** `/relay on|off|threshold|pause|resume`, task capture and revisions, DoD/verification commands entry, `session.measure` handling, warnings, hysteresis, unknown handling, rate-limit separation.
- **User value:** User can turn Jeeves on in one command and see accurate context status.
- **Dependencies:** E1. **Risks:** R-03, R-13.
- **Cites:** FR-02, FR-03, FR-05, FR-11; AC-03, AC-04, AC-05, AC-06, AC-14; §4.4.
- **AC:** without `/relay on` no rotation ever (AC-03); 49% no request, 50% exactly one, repeated 51% nothing more (AC-05); `undefined` reading shows "unknown" and never triggers (AC-06); original prompt byte-identical in `task-rev-001.md`; pause before threshold prevents rotation until resume (AC-14).
- **Artifact:** unit report + recorded session showing status transitions.

## E3 — Safe boundary and handover (P0)
- **Status:** Solved (M3 gate; docs/done/evidence/m0-m7/m3-demo).
- **Goal:** At a safe point, obtain a validated, persisted handover.
- **Scope:** evidence ledger, soft quiesce, Stop gate, handover instruction, parser, validator, redaction, merged render, atomic persistence, bounded retries, `NEEDS_REVIEW`.
- **User value:** Work state is captured truthfully without the user writing anything.
- **Dependencies:** E2. **Risks:** R-03, R-04, R-07, R-08.
- **Cites:** FR-04, FR-06, FR-07, FR-16; AC-07, AC-08, AC-09, AC-17; NFR-10.
- **AC:** threshold crossed during a tool call or permission prompt never interrupts it (AC-07); handover has all required sections and ≤ 12K chars (AC-08); a failed test stays failed in the handover even if Claude claims otherwise (AC-09); corrupt/empty handover after 2 retries → `NEEDS_REVIEW`, no `/clear`, previous handover intact (AC-17).
- **Artifact:** fixture handovers (good/bad), validator report, recorded rotation up to persisted handover.

## E4 — Fresh session and automatic continuation (P0)
- **Status:** Solved (M4 gate passed 2026-11-07).
- **Goal:** Replace the conversation and continue without user input.
- **Scope:** `/clear` execution, rotation boundary detection, context injection, continuation prompt, held prompts, rearm, loop guard, max rotations, assisted-mode fallback, `/relay rotate`.
- **User value:** The core promise: long tasks keep going across fresh contexts.
- **Dependencies:** E3. **Risks:** R-01, R-06, R-11.
- **Cites:** FR-08, FR-09, FR-03 (rearm); AC-10, AC-11, AC-12, AC-15, AC-25; Flow B, C.
- **AC:** new session ID and low baseline after rotation (AC-10); session 2 reads task + handover and continues with no prompt (AC-11); fixture task rotates ≥ 2 times without repeated work (AC-12); `/relay rotate` uses the identical pipeline (AC-15); `$.command.run` failure produces assisted mode with honest status (AC-25).
- **Artifact:** PTY E2E log with two rotations; recorded Cursor demo (preview).

## E5 — Completion and DoD verification (P0)
- **Status:** Solved (M4 gate passed 2026-11-07).
- **Goal:** Finish only on machine evidence.
- **Scope:** completion block parsing, DoD evaluation against ledger, `COMPLETED`/`NEEDS_REVIEW`/`BLOCKED`, `/relay done`, summary.
- **Dependencies:** E3 (ledger), E4. **Risks:** R-04.
- **Cites:** FR-10; AC-13; Flow F.
- **AC:** "done" text without passing verification → `NEEDS_REVIEW` listing missing checks (AC-13); all checks pass after last edit → `COMPLETED`, rotation stops.
- **Artifact:** unit + E2E logs for both outcomes.

## E6 — Recovery, safety and fault tolerance (P0)
- **Status:** Solved (M5 gate passed 2026-11-08).
- **Goal:** Every failure ends in a recognisable, recoverable state; never two workers.
- **Scope:** recovery classifier, `/relay recover`, stale locks, error classification (auth/rate limit/billing/overload/API), disk errors, repo mismatch, user `/clear`, user interrupt, compaction policy, concurrency tests, crash matrix.
- **Dependencies:** E4. **Risks:** R-05, R-09, R-12.
- **Cites:** FR-11, FR-12, FR-13; AC-14, AC-16, AC-17, AC-18, AC-19, AC-23; NFR-04; Flow E; edge-case matrix §11.
- **AC:** simulated crash at each transition recovers without duplicate worker/edits (AC-16); two repos isolated, same task single owner (AC-18); no git mutation or permission change during rotation (AC-19); auth, rate limit, outdated CLI, disk error, wrong path each show a specific message (AC-23).
- **Artifact:** crash-matrix report, concurrency test report.

## E7 — Terminal UX and controls (P0)
- **Status:** Solved (M6 gate passed 2026-11-08; ST-7.3 in M2).
- **Goal:** Discreet, accessible status and clear messages.
- **Scope:** status entry, transition toasts/log lines, narrow-width strings, no-emoji/no-colour-only, `/relay history`, first-activation notice, help text, error copy.
- **Dependencies:** E2 (can run alongside E3–E6). **Risks:** R-14.
- **Cites:** §4.1–4.3, FR-11, FR-14, FR-17; NFR-02, NFR-08.
- **AC:** status never replaces the user's status line; one line per transition, none per tool call; text readable at 40 columns; every state has a text label.
- **Artifact:** screenshots at 40/80/140 columns, light/dark.

## E8 — Distribution, docs and compatibility (P0)
- **Status:** Solved (M6 gate passed 2026-11-08; CI and compat workflows never run, no remote).
- **Goal:** One-line install, clean uninstall, docs a newcomer can follow.
- **Scope:** marketplace manifest, README/quickstart/troubleshooting/FAQ/privacy, compatibility matrix, uninstall + delete-state command, `doctor`-equivalent (`/relay status --diagnose`), CI compatibility job.
- **Dependencies:** E4 (features to document), E7. **Risks:** R-06, R-10.
- **Cites:** FR-15, FR-16, FR-17; AC-01, AC-02, AC-20, AC-21, AC-22, AC-24; NFR-01, NFR-05, NFR-06.
- **AC:** clean macOS + supported Claude Code: install by quickstart in < 5 min, no API key (AC-01, NFR-01); uninstall leaves settings and code untouched (AC-20); contributor builds and tests from README (AC-21); matrix published (AC-22).
- **Artifact:** clean-machine install recording, docs PR.

## E9 — Public beta release (P0)
- **Status:** Built, gate open (M7): ST-9.1 and ST-9.2 solved (Cursor demo dropped, D-34); ST-9.3 waits for the maintainer's naming decision, publication and sign-off.
- **Goal:** Ship v0.1.0 honestly.
- **Scope:** full AC evidence pack, real two-rotation demo in Cursor, security review, name/trademark check, release pipeline, announcement text with exact claims.
- **Dependencies:** E5, E6, E8.
- **Cites:** PRD §13, §15 MVP DoD, §17; AC-01…AC-25.
- **AC:** every AC marked pass/fail/not-supported with evidence; marketing claims match `full` mode capabilities; maintainer sign-off.
- **Artifact:** GitHub release, evidence pack (demo video dropped, D-34).

## E10 — Fewer dead ends (P1, v0.2)
- **Status:** Solved (M8, 2026-11-08); AC met (U + I), see `docs/done/evidence/v0.2.0/README.md`.
- **Goal:** A failed handover or a suspected loop is no longer a dead end, and the default threshold suits large-window models.
- **Scope:** `/jeeves retry` for NEEDS_REVIEW(HANDOVER_INVALID) and NEEDS_REVIEW(POSSIBLE_LOOP) (POSSIBLE_LOOP moves from FAILED to NEEDS_REVIEW); a window-aware default threshold (50% up to a 200K window, 40% above). **Out:** automatic retries; any retry that weakens validation.
- **User value:** recover from a bad handover in one command instead of `/jeeves off` and a new task; rotations on 1M models before 500K tokens.
- **Dependencies:** E6. **Risks:** R-13, R-18, R-23.
- **Cites:** FR-03, FR-08, ADR-003, ADR-009 A2, D-31, D-32.
- **AC:** AC-26, AC-27, AC-28 pass (U + I); earlier handovers byte-identical after a retry; no retry without the user typing it.
- **Artifact:** I-layer tests + state-table rows in 02 §4.

## E11 — Setup and insight (P1, v0.2)
- **Status:** Solved (M8, 2026-11-08); AC met (U + I), see `docs/done/evidence/v0.2.0/README.md`.
- **Goal:** Less typing per task, and a view of what Jeeves has done.
- **Scope:** per-project defaults (`/jeeves defaults`: threshold and verification commands, stored in the state folder), check suggestions from the repo's own scripts at `/jeeves on`, `/jeeves history --full`, `/jeeves stats`. **Out:** a settings UI, the handover diff pane (P1, deferred), anything that runs repo commands from the plugin.
- **User value:** `/jeeves on` in a configured project needs no further setup; users see rotations, cost and context cleared.
- **Dependencies:** E7. **Risks:** R-19 (repo text read for suggestions), R-24.
- **Cites:** FR-10, FR-11, ADR-005, ADR-009 A2, D-30.
- **AC:** AC-29 … AC-32 pass (U + I); no state written inside the repository.
- **Artifact:** I-layer snapshots of each command.

## E12 — Compatibility and live coverage (P1, v0.2)
- **Status:** Solved (M8, 2026-11-08): ST-12.1 closed with the floor at 2.1.319 (D-38), ST-12.2 dropped (D-36), ST-12.3 solved, ST-12.4 solved with c and g failing for an external cause (R-25), ST-12.5 signed off. Gate passed 2026-11-08.
- **Goal:** Widen the supported Claude Code range on evidence, close the live-unverified paths, ship v0.2.0.
- **Scope:** floor 2.1.303 (compat matrix + one live rotation), VS Code terminal checklist (maintainer), live runs for compaction, `autoRecover`, REPO_MISMATCH on a moved repo, the `/clear` stall via `endedHere`, `/plugin configure`, the AC-07 E layer, Q-9 (a second blocking Stop hook), v0.2.0 release prep. **Out:** Linux official and Windows (P1/P2, deferred).
- **Dependencies:** E10, E11; v0.1.0 released (M7). **Risks:** A-01, R-21.
- **Cites:** NFR-02, NFR-06, AC-02, AC-07, AC-22, Q-4, Q-9.
- **AC:** AC-33, AC-34 pass; every path in `handoff-m7.md` §5 "live-unverified" has an E result or a recorded reason; evidence pack `docs/done/evidence/v0.2.0/`.
- **Artifact:** `docs/done/evidence/v0.2.0/`, draft release v0.2.0.

## E13 — Auto-start (P1, v0.3)
- **Status:** Open. Spec approved 2026-11-08 (D-40); AC-41's owner and date still open (spec Q7).
- **Goal:** Installing Jeeves is the opt-in on fresh installs: an eligible session starts an auto task at its first typed prompt, with no command per task, while upgraders keep the v0.2 promise until they turn it on.
- **Scope:** spec §5: eligibility decided once at `session.start` (interactive, full mode, git, window above 200K, fresh conversation, auto-start on) with the reason order and `(+N more)`; lazy start at the first `composer` prompt; first-run notice (`autoNoticeShown`); near-threshold rule, 3-turn grace, model-switch end; task `origin` auto/explicit (state schema bump, migration); `/jeeves later` with the auto-compaction cap; `/jeeves off` for the session, `/jeeves defaults auto`, `/jeeves auto` (`auto.json`), the `autoStart` row and their precedence; upgrade detection and notice; Current goal heading and the continuation order; user `/clear` ends an auto task; auto tasks recover by themselves under the same gates; cleanup of ended auto tasks without a rotation after 7 days; privacy and README text; downgrade safety. **Out:** 200K windows (Q8, decided by AC-41); Team accounts (turn mode, E16); a setting for the cleanup age; any network use.
- **User value:** long tasks hand over by themselves without remembering `/jeeves on`; one step turns it off at any level.
- **Dependencies:** E10–E12 (v0.2.0). **Risks:** R-03, R-15, R-19, R-25, R-26, R-27.
- **Cites:** FR-05, FR-11, ADR-003, ADR-007, ADR-009 A3, ADR-010, AC-03, D-41, D-42, D-43.
- **AC:** AC-35 … AC-40, AC-42 … AC-46 pass (U + I); the I-layer suite passes with `autoStart` off and on; every existing AC keeps passing.
- **Artifact:** I-layer tests in both modes; state-table rows in 02 §4; PRIVACY.md and README diffs.

## E14 — Part of the day (P1, v0.3; may ship in v0.3.x)
- **Status:** Open.
- **Goal:** People who are not auto-watched hear about Jeeves when it would help, and a rotation is easy to trust and undo.
- **Scope:** spec §6: the hint at threshold − 5 for reason 3b and 4–6 (once per session, stops after 3 unanswered); `/jeeves` alone with the reason and 2–3 suggested commands within 8 lines; the rotation line with `claude --resume <full id>`; `/jeeves handover`; the quiet status line in auto tasks. **Out:** a handover diff pane; any text that costs tokens.
- **User value:** one command to remember; the old conversation is one command away.
- **Dependencies:** E13 (reasons, origin). **Risks:** R-26.
- **Cites:** spec §6, AC-47.
- **AC:** AC-47 passes (U + I).
- **Artifact:** I-layer snapshots of each message and of `/jeeves` alone at 40 columns.

## E15 — v0.3 evidence and release (P1, v0.3)
- **Status:** Solved (2026-11-09): ST-15.2 done, ST-15.3 signed off by the maintainer; tag and publication are the maintainer's. Earlier: Owner, account and target date for ST-15.2 decided (D-44, amended by D-49: the maintainer's Team account in turn mode, on their normal macOS user with a separate Claude config folder; the agent builds and runs; target 2026-11-20); Q8's bar set (D-45). Go-ahead and US$40 budget approved (D-46), valid once E13, ST-15.1, E16 (ST-16.8), the D-49 config folder and the dry run are in place; caps are API-equivalent dollars (D-49).
- **Goal:** Measure what auto-start costs and how it behaves live before any cost wording ships, decide Q8, ship v0.3.0.
- **Scope:** the test-only window override; AC-41 live: a dry run in a fresh-install state (AC-35 E), then a 1M fixture with and without Jeeves (auto mode, two rotations as the target) and a 200K simulated fixture, each under a spending cap; Q8 decided from it; README cost wording only from the measured result; v0.3.0 release prep. **Out:** widening auto-start to 200K windows in v0.3.0 (v0.3.x, spec §13).
- **Dependencies:** ST-15.2 on E13 and ST-15.1 only (E14 changes no cost, rate or outcome) and on E16 (it runs on the Team account in turn mode, D-49); ST-15.3 on everything, E16 included. **Risks:** R-15, R-25 (the runs depend on turn mode), Q-12, Q-13, Q-14.
- **Cites:** AC-41, spec §7, §11.1, Q7, Q8.
- **AC:** AC-41 has a PASS/FAIL result with its cost, or a recorded reason it could not run; Q8 answered; release zip reproducible.
- **Artifact:** `docs/done/evidence/v0.3.0/`, draft release v0.3.0.

## E16 — Turn mode for Team accounts (P1, v0.3, before ST-15.3)
- **Status:** Open. Spec `docs/specs/team-accounts-turn-mode.md`; ADR-002 A3, ADR-003 A2, ADR-004 A2, ADR-006 A1, ADR-007 A1 (revision 2) accepted 2026-11-09 (D-48). Plan (ST-16.1 … ST-16.8, with its three choices: one probe session, three suite runs, auto task kept at the skip) approved by the maintainer 2026-11-09; probe session go-ahead with a hard cap of US$1.
- **Goal:** where a higher-tier plugin skips Jeeves's `classic.*`, `session.compact` and `prompt.compose` hooks (R-25; seen on every Team-organization account), Jeeves keeps working in turn mode instead of turning off, and the maintainer's Team account becomes the live test account.
- **Scope:** spec §5 (b)–(h) as amended: turn mode chosen when the Stop skip is seen (any cause), status and `--diagnose` name it, a failed submit makes the process `unsupported`; the safe boundary on `turn.complete` with Jeeves's own background count; the handover requested with `$.prompt.submit` (HANDOVER_GENERATING first), read from `turn.complete`'s `answer`, retried the same way; delivery through the continuation prompt after Jeeves's `/clear` (ROTATING turn-mode row); compaction recognised from a `session.measure` drop; completion rules as a hidden `$.session.append` row; every I-layer rotation test in both modes; live E runs on the Team account. README, PRIVACY and `/jeeves help` drop "Team accounts unsupported" (D-39) where turn mode replaces it. **Out:** getting around an organization policy that turns mods or hooks off (R-16); scheduled crons in a turn-mode handover (`not available in turn mode`); skipping compaction ahead of time in turn mode.
- **User value:** people on Team accounts, the maintainer included, can use Jeeves; nothing changes where Stop arrives.
- **Dependencies:** E13 (auto tasks rotate in turn mode too), ST-14.3/ST-14.4 (rotation line, `/jeeves handover` read the same files). ST-15.2 depends on E16 when it runs on the Team account (proposal in the M9 handover; D-44/D-46 unchanged until the maintainer decides). **Risks:** R-25, R-03, R-07, R-15, R-19.
- **Cites:** spec §3–§6, ADR-002 A3, ADR-003 A2, ADR-004 A2, ADR-006 A1, ADR-007 A1, AC-07, AC-10, AC-11, AC-17, AC-25, D-39, D-48.
- **AC:** AC-48 … AC-53 pass (U + I in both modes), AC-54 on the Team account (E); every existing AC keeps passing with the turn-mode suite on and off; on an account without the skip the turn-mode path never runs.
- **Artifact:** `npm run test:mod:turn` report; `docs/done/evidence/v0.3.0/turn-mode/RESULT.md`; README/PRIVACY diffs.

## E17 — 200K auto-start (P1, v0.3.x)
- **Status:** Open. Plan `docs/plans/10-v0.3.x-plan.md`, approved by the maintainer 2026-11-09 (P-1 … P-4 accepted as proposed, D-53; ADR-009 A4).
- **Goal:** auto-start on 200K windows (D-52), checked by one live auto-started 200K session; a `long-task` fixture that one script cannot solve; release v0.3.1.
- **Scope:** ST-17.1 eligibility at 200K or more, model switch, texts; ST-17.2 distinct-module fixture and the driver's void check; ST-17.3 one live session (US$2 cap, go-ahead first); ST-17.4 release prep.
- **Out:** a Stop-mode live run (needs a non-Team account); a new cost measurement; a cleanup-age setting; the ADR-007 A1 row limit (D-51).
- **Dependencies:** E13, E16, ST-15.2's evidence. **Risks:** R-25 (live check again on the Team account), more sessions eligible under the mod host's 200K default.
- **AC:** AC-36 and AC-37 as amended by ADR-009 A4; AC-55 (fixture); every existing AC still passes.
- **Artifact:** `docs/done/evidence/v0.3.1/200k-auto/RESULT.md`; v0.3.1 zip.

---

## P1 / P2 backlog (not scheduled)
- **P1 (scheduled in M8, D-30):** VS Code terminal matrix (ST-12.2); `/jeeves history --full` (ST-11.3); per-project default config (ST-11.1); verification-check suggestions (ST-11.2); `/jeeves stats` (ST-11.4); back-compat floor 2.1.303 (ST-12.1; 2.1.287/2.1.295 refuse the module, Q-4).
- **P1 (still unscheduled):** Linux officially supported (CI PTY E2E; needs a Linux machine with a logged-in Claude Code); handover diff view (`AbovePrompt` pane; early-access mods UI).
- **P2:** Windows; adapters for other agents via `EnginePort`; optional local dashboard; shareable handover policy presets; multi-task orchestration.
