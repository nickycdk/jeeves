# Old commit IDs

On 2026-11-08, before the repository went public, its history was rewritten to remove the maintainer's home path from old live-run captures (`/Users/<name>` became `~`, the user name became `user`; nothing else changed). Every commit got a new ID. Documents written before then cite the old IDs; this table maps them. The private practice repo (`jeeves-release-test`, D-37) keeps the old IDs.

| Old | New | Subject |
|---|---|---|
| `f1f05c2` | `b2d68f9` | ST-1.1: plugin scaffold, toolchain and CI |
| `112e391` | `b652ae7` | ST-1.2: domain types, schema guards and migrations |
| `541b645` | `9db466d` | ST-1.3: storage: state root, serial queue, write-once files |
| `1670220` | `37321e4` | ST-1.4: atomic state swap and task lock |
| `63200c4` | `d4ef7c3` | ST-1.5: event log with redaction |
| `bab8dca` | `1a2b763` | ST-1.6: project/task identity and git facts |
| `8544bc2` | `888891c` | ST-1.7: state machine reducer and invariants |
| `ce192a1` | `3d3c387` | ST-1.8: engine port, adapter, register wiring, capability probe |
| `e3367c2` | `a55e45c` | ST-1.9: /relay router, status and help |
| `ccaec06` | `7d0681b` | ST-1.3 fix: never chmod an existing state folder |
| `2dc1c2d` | `6773a8f` | M1 review fixes (ponytail-review findings 1-9) |
| `07b35b3` | `2098722` | Handoff: M1 done, next is M2 |
| `e9ab583` | `e5f5b0a` | ST-2.1: /relay on\|off and verbatim task capture |
| `3c2a5a2` | `3f1fff0` | ST-2.2: task revisions, DoD and verification commands |
| `bd666b0` | `870e1e2` | ST-2.3: context reading adapter |
| `bac704b` | `023a3af` | ST-2.4: threshold trigger, warning, /relay threshold, test override |
| `42b42c8` | `498f265` | ST-2.5: pause and resume |
| `4e2b542` | `7679d5c` | ST-7.3: first-activation notice and reason-code catalogue |
| `9bc5fce` | `60ad86b` | M2 gate: live demo evidence, decisions D-17..D-19, handoff |
| `92f7941` | `b061b76` | M2 review fixes (ponytail-review findings 1-4) |
| `c9cffcd` | `8f7ec3f` | Plans: mark M0-M2 work as solved |
| `f0b322a` | `823fb06` | Handoff: M2 done, next is M3 |
| `6036289` | `eae4f5d` | ST-3.1: evidence ledger |
| `cf6b13b` | `523cc44` | ST-3.2: soft-quiesce note |
| `aa4d00f` | `04871f3` | ST-3.3: safe-boundary evaluator and quiesce timeout |
| `73535b4` | `8169a6b` | ST-3.4: handover instruction template |
| `7d76cc0` | `12a3d42` | ST-3.5: handover parser |
| `6016f10` | `f96ce48` | ST-3.6: handover validator and cross-checks |
| `7991dfa` | `5f7d053` | ST-3.7: redaction |
| `b8dd7c3` | `7ca6a3b` | ST-3.8: merged render, persistence, retries, NEEDS_REVIEW |
| `7a9f576` | `d44ffe7` | M3 review fixes (ponytail-review findings 1-4) |
| `d83f193` | `c775134` | M3 gate: live demo evidence, D-20/D-21, Q-10, plans marked, handoff |
| `a413ac7` | `d192a8b` | Rename SessionRelay to Jeeves (D-22) |
| `8347aff` | `5e6d900` | Rename review fix, plans marked, handoff for M4 |
| `480b4a9` | `fa3ca23` | Record maintainer answers: D-20, D-21 accepted; D-23 automatic rotation; M4 run cap |
| `28bd873` | `c49b91c` | ST-4.1 rotation executor: one verified /clear per rotation, idle nudge (D-23) |
| `c37323c` | `01c7dfa` | ST-4.2 rotation boundary: source/target sessions, session record, lock transfer |
| `c71fec1` | `3cafaf1` | ST-4.3 context injection and continuation prompt (D-23) |
| `05775ed` | `ec9850b` | ST-4.4 held prompts during rotation (ADR-010 A1) |
| `e9b41a3` | `2a3a434` | ST-4.5 rearm, loop guard, max rotations, consecutive failures |
| `f2b7c15` | `7e3ac31` | ST-4.6 assisted-mode fallback and /relay continue (AC-25) |
| `7d7a400` | `559db6c` | ST-4.7 manual /relay rotate on the threshold pipeline (AC-15) |
| `312d007` | `cceaa66` | ST-4.8 fixture builder and PTY E2E harness (live run at the gate) |
| `bde8a5d` | `a2ddcb5` | ST-5.1 completion block and DoD evaluator (ADR-007) |
| `6088399` | `7657c46` | ST-5.2 completion gate, /relay done, summary (AC-13) |
| `23f24f2` | `1a1bebb` | M4 review fixes and live debug run 1 fixes |
| `e89de31` | `b02842d` | Live debug run 2 fixes: exact readings, per-case verify output, plain check wording |
| `1691d49` | `836b91a` | Read context at every main-loop tool result (debug run 3) |
| `dce1fea` | `20b0253` | M4 gate report: built, gate not passed; plans marked, D-24, handoff-m4 |
| `29343ff` | `c967f28` | M4 review 2 fixes (ponytail-review findings 1-3) |
| `107e6bf` | `b1f00a7` | Plans: D-25 (relative test threshold, 2 gate runs), statuses, handoff-m4 for the next sess |
| `17d8379` | `0bbc664` | D-25 relative test threshold (+d) with its loop guard |
| `bdb8655` | `eb8ca13` | Continue from the fresh session when the /clear promise never resolves |
| `332b9e2` | `c958e55` | D-25 amended after gate run 6: start at the first tool reading, guard on the source end re |
| `780376f` | `5d869cb` | Evidence: live run 6 (stopped) assembled by hand |
| `f235eb5` | `3ed004a` | D-25: relative start at the second tool reading (live run 7) |
| `af7a534` | `d7be374` | Handover Stop: a regex is no path; a refused lookup counts as missing (live run 8) |
| `f54c910` | `31625a2` | D-25: relative start once the reading moves past the first response (live run 9) |
| `214ca0e` | `5f1d4f1` | M4 gate evidence: gate runs 5 and 6 pass (live, haiku, +0.8) |
| `55b0231` | `fdecee0` | Review fixes: strict debug filter, /clear timing comments, rearm once the start is known |
| `a347f51` | `0dcd705` | M4 solved: gate report, plan statuses, D-25 amended, D-26, handoff-m4b |
| `99b976e` | `0261533` | Plans: M4 solved in 00, A-01/A-03 readings from the M4 gate in 01 |
| `be7139d` | `8af40ce` | ST-6.2 StopFailure -> PAUSED(<code>) with a fix per code; API pauses are not rotation fail |
| `981b87f` | `a7a71eb` | ST-6.3 an interrupt while a handover is requested rules out the nudge; user /clear mid-rot |
| `41dcd89` | `af78e17` | ST-6.4 compaction: skip precompute while managed; after a compaction request a handover (C |
| `6983e9c` | `351a6cf` | ST-6.1 recovery classifier and /relay recover: startup notice, rebuild of an unreadable st |
| `1fc4b9e` | `437914c` | ST-6.5 BLOCKED(DISK) keeps the last checkpoint; REPO_MISMATCH on branch or moved repo, /re |
| `a54ff61` | `ad4c92f` | ST-6.6 concurrency: separate task per running session, process identity at the fresh sessi |
| `0839275` | `f9edad3` | ST-6.7 crash matrix: six test-only crash points, recover once at each, crash-matrix.md rep |
| `0259854` | `3567758` | Handover first-try (maintainer decision): six-steps names its real files; one instruction  |
| `25adbf2` | `c9d9e65` | AC-19 static audit: git starts in one helper, read-only subcommands only, no settings file |
| `0515e5d` | `680fb11` | M5 review fixes 1-4: held messages delivered on resume after a paused handover; recover gi |
| `9267452` | `5032aa0` | M5 demo: driver reads notices from the debug log and recovery from events; live run 1 arch |
| `c01a06e` | `3813d43` | Plans: ST-6.1..6.7 solved, M5 built with its gate open (demo pending), handoff-m5 |
| `23f8f9e` | `fe2472e` | Second review fixes: rebuild copies the unreadable state.json aside (task stays visible if |
| `906b551` | `378817b` | Code-review fixes 1-10: one task per session in recover; mismatch keeps the adopted handov |
| `85f6b1c` | `8e5d48e` | D-29: the command is /jeeves (fallback /relay), matching the product name; ADR-009 amended |
| `963ffa9` | `af120b4` | handoff-m5: command now /jeeves (D-29), M5 commit list |
| `e19acd5` | `285d6c6` | M5 gate passed: kill mid-rotation demo (run 2) 17/17, US$0.25; AC-16 E layer; crash matrix |
| `24699ba` | `0f2f18c` | ST-7.1 status entry (Jeeves 34%/50%, word label per state, <= 40 cols) and one transcript  |
| `94bb5c8` | `73ea702` | ST-7.2 /jeeves history: last 20 state changes and rotations summary, 80 columns |
| `b10bc9e` | `73774e4` | ST-8.3 /jeeves status --diagnose (redacted, ~ for home); compat script + workflow; docs/co |
| `8e344a7` | `c05871a` | ST-8.1 marketplace.json, README install/update/uninstall, /jeeves purge with typed code; c |
| `e0c7658` | `5d48d32` | ST-8.2 docs: README rewrite (commands, settings with defaults, stop reasons, FAQ), docs/tr |
| `c9cbc34` | `51f1e67` | ST-8.4 contributor experience: CONTRIBUTING with every script and the PTY cost note, issue |
| `2e329fc` | `a8d08af` | ST-8.2/8.4 walkthrough fixes: expected output in install and quickstart, marketplace remov |
| `8fa9a86` | `7d4828b` | ponytail review fixes 1-5: purge decides by the lock (unreadable tasks too) and checks aga |
| `e4efd1d` | `a4a0f6c` | M6 demo: driver --installed/--rotations with screen snapshots; run 1 (no login, AUTH pause |
| `e5f6caf` | `9767444` | code-review fixes 1-10: purge confirm deletes only the listed folders, purge --all without |
| `b17af31` | `b764acb` | Plans: M6 built (gate waits for the maintainer's AC-01 fresh-user and AC-02 Cursor checks) |
| `b86aac2` | `140788c` | M6 gate passed: AC-01 fresh macOS user and AC-02 Cursor checklist (maintainer-reported); 0 |
| `e34c350` | `9d43162` | ST-9.1 security review: threat model, SECURITY.md; state.json values that reach a path or  |
| `d383a64` | `c4fe1cc` | ST-9.3 prepared: naming check write-up, reproducible release zip script, release workflow  |
| `04d113b` | `205be99` | ST-9.2 prep: E-layer PTY driver (AC-03/07/09/10), Cursor two-rotation demo script for the  |
| `602b1c8` | `351d43b` | ST-9.2: AC-01…AC-25 evidence pack (docs/evidence/v0.1.0/README.md), E-layer live runs 1-3  |
| `e09958f` | `c78e208` | ponytail review fix 1: the AC-03 E check reads the /context percentage instead of a line-c |
| `669c07b` | `e4a8974` | code-review fixes 1-10: F-3 claim corrected (filter drivers still run, reproduced; accepte |
| `66b4397` | `4ad085c` | Plans: M7 built (gate waits for the maintainer's Cursor demo, release and sign-off), stori |
| `ec74244` | `548a4fd` | Plans: M8 (v0.2) planned: E10-E12, ST-10.1 … ST-12.5, AC-26 … AC-34, D-30 … D-33, R-23/R-2 |
| `a7cde3d` | `a69bd25` | Plans: Cursor two-rotation demo and video dropped from the M7 gate (D-34); AC-02 rests on  |
| `1df1ca6` | `f26eb93` | Plans: epic status lines E4-E12, E7 marked solved, executive plan M7 (D-34) and M8 rows |
| `f6485e4` | `fb45ba2` | README: root landing page (what it does, how it works, install, use, commands, data); drop |
| `1f4cd3b` | `1b06715` | Docs: GitHub owner nickycdk in install lines, changelog and release notes |
| `16c3f8d` | `7cf1909` | Rename Jeeves to Tibbs (D-35): plugin, folder, /tibbs command, TIBBS_* env vars, sentinels |
| `b6760be` | `3557e33` | Placeholder icon: T for Tibbs (directory profile passes) |
| `b340d63` | `cbd4a83` | Revert rename to Tibbs: name stays Jeeves (D-35, final) |
| `082e43d` | `e8518f7` | Untrack the 44 plan/evidence files that contain the home path; gitignore them (kept locall |
| `2a08850` | `baf566f` | M7 signed off with public release deferred (D-37); v0.2 approved (D-36), ST-12.2 dropped,  |
| `cc89910` | `5fafbf4` | Release workflow: skip the provenance attestation on private repos (GitHub refuses it ther |
| `742aebf` | `e88b271` | Release zip: build in UTC so a laptop build matches the CI build (practice release found t |
| `b493501` | `7b99a1a` | Evidence: practice release round 2, runner and laptop zips identical |
| `2455f8a` | `da205b1` | ST-10.1: window-aware default threshold (40% above a 200K window, else 50%); status shows  |
| `9866ab6` | `12ea004` | ST-10.2, ST-10.3: /jeeves retry after an invalid handover or a possible loop; POSSIBLE_LOO |
| `cdbf69a` | `d65e93e` | ST-11.1: per-project defaults (/jeeves defaults threshold\|check\|clear), applied at /jeeves |
| `ce10a23` | `7af8a98` | ST-11.2: suggest check commands from package.json and Makefile at /jeeves on (never added  |
| `729c6e9` | `8b54f05` | ST-11.3: /jeeves history --full (per-rotation sessions, context, cost, end reason, handove |
| `bc4b59a` | `43a9d1b` | ST-11.4: /jeeves stats (project and task: rotations, sessions, context at rotation, contex |
| `1c07042` | `2cc591a` | ST-12.3: Q-9 answered, a second blocking Stop hook beneath Jeeves wins its stop and the ha |
| `65a90d3` | `a3ed162` | Review fix 1: a /jeeves pause in a continued session resets the failure count (it was rese |
| `c3bee7e` | `5d13e6b` | Review fix 2: history --full lists the handover files and pairs each with the session that |
| `1559005` | `32f46e4` | Review fix 3: the retry limit is checked only in the reducer |
| `6c49f3a` | `87369fb` | projectTasks reads task states in parallel (stats over 50 tasks, ST-11.4 AC 4 was borderli |
| `1bdc6d5` | `0f9a98f` | M8 progress handover; ST-12.1 closed with the floor at 2.1.319 (D-38); v0.2 live driver e_ |
| `76b1af1` | `27522a4` | Handover: push only when the maintainer asks |
| `1c40081` | `55ed214` | /jeeves menu hint lists every command (retry, done, defaults, stats, history --full were m |
| `c559253` | `a4a8a7e` | ST-12.4 diagnosis: live phases c and g failed because cc-plugin-sec-default (prepend tier, |
| `a07c0b1` | `a9ce6cb` | R-25 detection: a main turn that answers without reaching Jeeves's classic.Stop sets mode  |
| `1445a9d` | `1e87ecc` | ST-12.5 release prep: version 0.2.0, CHANGELOG, release notes, evidence pack (AC-26 … AC-3 |
| `d17baaf` | `09e9452` | Code review fixes (M8 range): a skipped Stop hook also stops measuring, holding prompts an |
| `c5ff1b1` | `e27e63e` | compatibility.md regenerated for 0.2.0: 2.1.302 … 2.1.319 validate, 175 mod tests (2.1.316 |
| `7cfacbc` | `2f7ab2c` | M8 handover (built, gate open: ST-12.5 sign-off); statuses in 00, 03, 04, 05, 06 for what  |
| `d539265` | `8535d81` | M8 gate passed: ST-12.5 signed off by the maintainer (no tag, no release) |
| `76b27a9` | `35d4b1a` | Ponytail review fixes: one status text for the off states (a later session start no longer |
| `9a43e02` | `1bab060` | Move finished work to docs/done: handovers M1–M8 (docs/done/handoffs), M0–M7 evidence (doc |
| `c2dc0f7` | `f2d0879` | Spec for Team accounts (turn mode, Q-11): problem, what still arrives, proposal, costs, op |
| `145f99f` | `2521c94` | Status keeps the reason and the defaults warning within 8 lines: Path, Last, Rotations, Wa |
| `f6adff1` | `3b055c2` | history --full and stats share one session-record reader and one event parser (code review |
| `214ca1d` | `ac20a84` | AC-32 P (stats < 100 ms on 50 tasks) profiled: call count, not one slow step; the call-sav |
| `9d1157c` | `175aa4b` | Handover and CHANGELOG: review findings 8 and 10 fixed after M8, ponytail review, AC-32 pr |
| `639dcbd` | `5f87ff3` | Timing check AC-32 P moves to tests/perf: runs locally (claude plugin test ., check-all),  |
