# Handoff: M7 built → the maintainer's release steps (public beta v0.1.0)

**Date:** 2026-11-08 · **Claude Code:** 2.1.319 · **OS:** macOS, Darwin 27.2 · **Node:** 22.22 · **Repo:** `~/Desktop/Projects/jeeves` (branch `main`, local only, no remote)

This file is enough to start in a clean session. The working rules, code map and engine rules are in `handoff-m3.md` §0, §1, §4, §5, `handoff-m4.md` §4, §5, `handoff-m4b.md` §4, `handoff-m5.md` §0, §4 and `handoff-m6.md` §3, §4. The command is `/jeeves`.

## 1. Before anything

1. `git status` clean; `git log --oneline -1` shows the commit that added this file.
2. The Mac on power (`pmset -g batt`); wrap live runs in `caffeinate -dimsu`.
3. `SR_TEST_TMP=<scratchpad> jeeves/scripts/check-all.sh`: expected **246 unit, 151 mod (31 files), validate and marketplace pass**, exit 0. One stray "unhandled rejection: The operation was aborted" appeared once in the mod suite under load (load average ~20). The rerun was clean. Rerun once before investigating.
4. `claude --version` (2.1.319).
5. **Usage:** on 2026-11-08 the maintainer's weekly plan usage stood at 97% (resets Nov 9, 11 pm). Ask before any live run.

## 2. Gates

- **M6: solved** (2026-11-08). The maintainer reported AC-01 (fresh macOS user, under 5 min) and AC-02 (06 §6 checklist, 7/7 before and after a rotation) as passing. The agent saw no recordings, times or Cursor version (`evidence/m6-gate/RESULT.md`).
- **M7: built, gate open.** The gate (05) and where each item stands:

| M7 gate item | State | Evidence |
|---|---|---|
| Every AC pass / fail / not supported, with evidence | 22 PASS. AC-02: PASS at M6, the two-rotation demo is open. AC-07: PASS in I, its E layer is open (not exercised in 2 live attempts). AC-24: open until the release page exists | `docs/evidence/v0.1.0/README.md` |
| Security review: no Critical/High | **PASS**: F-1 (git `--output` injection from `state.json`, Medium) and F-2 (path segments from `state.json`, Medium) reproduced and fixed; F-3 (commands a repo's own `.git/config` names, Low) partly fixed: fsmonitor off, filter drivers accepted (reproduced; same exposure as Claude Code's own `git status`); F-4 doc gap fixed; F-8 Actions pinned by SHA; F-5…F-7 accepted Low | `jeeves/docs/threat-model.md`, `jeeves/SECURITY.md` |
| Real Cursor two-rotation demo | **Open (maintainer)**: script ready | `docs/evidence/v0.1.0/cursor-demo-script.md` |
| Maintainer sign-off | Open | — |
| v0.1.0 released | Open (maintainer): pipeline ready, never run | `.github/workflows/release.yml`, `jeeves/scripts/release-zip.sh` |
| Demo: release + demo video | Open (maintainer) | — |

**M7 live spend:** 3 haiku runs, about **US$0.21** of the US$1 / 3 runs approved. Run 1 (~US$0.04) did not reach its thresholds: haiku has a 1M-token window here. Run 2 cost US$0.089, run 3 US$0.077 (`docs/evidence/v0.1.0/e-layers/RESULT.md`).

## 3. What M7 added

Commits: b86aac2 (M6 gate), e34c350 ST-9.1, d383a64 ST-9.3 prep, 04d113b ST-9.2 prep, 602b1c8 ST-9.2 evidence, e09958f ponytail fix, code-review fixes 1-10 (after: F-3 wording corrected, one regex per format in core (`COMMIT_RE` in `core/git.ts`, `HANDOVER_REF_RE` in `core/handover/render.ts`) with the handover ref now exactly 64 hex, driver fixes (dialog seen only in new output, AC-07 order, AC-10 ids and probe), zip script relative output and line endings, release checks all three version fields), plans and this handoff (after).

- `src/core/schema.ts`: `safeName` (`taskId`, `projectId`, `rotationId`, event `taskId`/`rotationId`: a letter or digit first, then `[A-Za-z0-9_-]`, at most 100), `commitHash` (`taskStartHead`: 4–64 hex) and `handoverRef` (`history/handover-NNN.md#sha256:…`).
- `src/adapter/git.ts`: every git call has `-c core.fsmonitor=false`; `COMMIT_RE` re-checks the start commit before `git diff` / `cat-file`. `task.ts` `readVerified` uses `HANDOVER_REF_RE` (only `history/handover-NNN.md`, exactly 64 hex).
- Tests: `tests/unit/security.spec.ts` (program allowlist, no shell, no network, zero runtime deps, Actions pinned by SHA, read-only workflow permissions); ST-9.1 rows in `schema.spec.ts`; two in `git.spec.ts` (a start commit `--output=<file>` writes nothing; a planted `core.fsmonitor` command does not run). `memfs.ts` strips the 3 fixed git args.
- Docs: `jeeves/docs/threat-model.md`, `jeeves/SECURITY.md` (+ `.github/SECURITY.md` pointer, because GitHub looks only in the root, `docs/` or `.github/`), PRIVACY (held prompts), CHANGELOG `0.1.0`, `jeeves/docs/release-notes/v0.1.0.md`, README status line.
- Release: version **0.1.0** in `plugin.json`, `package.json` and the lockfile. `scripts/release-zip.sh [ref] [out]` runs `git archive -0` (uncompressed) of `.claude-plugin`, `jeeves`, `README.md`; the same SHA-256 came out of two clean clones and the working tree, and the unzipped artifact passes `claude plugin validate` as marketplace and plugin. `release.yml`: tag `v*.*.*` → `ci.yml` via `workflow_call` → tag = version check → zip → `attest-build-provenance` → `gh release create --draft`. All Actions pinned by commit SHA (v4.x of checkout, setup-node and upload-artifact; attest v2.4.0).
- `jeeves/.claude-plugin/icon.png`: 512 px placeholder, a geometric "J" on a dark rounded square; `claude plugin validate --profile directory` passes.
- `tests/pty/e_layers.py`: phase A (AC-03, no `/jeeves on`, `/context` reading against an 8% test threshold), phase B (`failing-tests` + padding file, `+1` relative threshold: AC-07 dialog hold, AC-09 handover check, AC-10 probe). `--only a|b`.
- Evidence: `docs/evidence/v0.1.0/` (README table, `e-layers/run1-3`, `naming-check.md`, `cursor-demo-script.md`).

## 4. Things learned in M7

1. **Haiku 5.5 has a 1M-token window here.** Sessions start at ~5.7%, and 2,400 short lines are ~5 points. Thresholds must be planned in points of 1M.
2. **The "quote earlier messages" probe doesn't work as an AC-10 test.** Claude puts notable facts it read into the handover (it quoted the marker line both times), so the fresh session knows them legitimately. Context falling across `/clear` (12.4% → 3.6%) is the better evidence.
3. **The AC-07 timing can't be forced with haiku.** It issues later Bash steps early or in parallel, so the permission dialog opened before the threshold reading registered (run 3), or the rotation ran before the dialog (run 2). Jeeves takes a reading when a main-loop tool call finishes; a call that needs permission finishes only after the dialog is answered.
4. **The maintainer's global `UserPromptSubmit` hooks** ("Tracking ponytail mode") run in PTY test sessions too. Harmless.
5. **`git archive --format=zip -0`** gives the same bytes regardless of the machine's zlib. Compressed zips may differ between machines.
6. **`git ls-remote https://github.com/<action>.git refs/tags/<v>`** gives an action's commit SHA without `gh` (these are lightweight tags; check for `^{}`).

## 5. Open items (for the maintainer unless marked)

- **Cursor two-rotation demo + video ≤ 3 min** (ST-9.2, the M7 gate): `docs/evidence/v0.1.0/cursor-demo-script.md`. Also copy the AC-01/AC-02 M6 recordings and times into `docs/evidence/v0.1.0/AC-01/`, `AC-02/`.
- **Naming:** `docs/evidence/v0.1.0/naming-check.md`. Usable for a free OSS beta. Confirm JEEVES.AI (reg. 7950696, class 9/42) and ASK JEEVES (serial 98352285, pending) in USPTO TSDR before any commercial use or directory listing.
- **Home path in the repo:** 39 tracked plan/evidence files, plus the new `e-layers/run2` and `run3`, contain `~` (as scratch paths or worktree paths). There are no secrets: a scan with Jeeves's own `findSecrets` over all tracked files found only fake test keys. Decide before making the repo public: keep, or rewrite the history of `docs/plans/evidence` (the release zip excludes `docs/` already).
- **Publication:** add the remote, push, let `ci.yml` and `compat.yml` run once (never run; the SHA-pinned v4 Actions and `workflow_call` are unverified), a dry run of `release.yml` on a fork, fill `<owner>` (README install lines, release notes) and the CODE_OF_CONDUCT contact, tag `v0.1.0`, publish the draft release, verify install from the tag on a clean user (08 §9), sign off.
- **Icon:** the placeholder can be replaced by a designed one (avoid anything resembling the Ask Jeeves butler).
- **AC-07 E layer** (agent, needs a budget): a fixture where the only way forward after the threshold is one Bash call that needs permission. Or accept the I layer plus run 3's weaker evidence (the dialog was left alone 20 s, and the rotation waited for the Stop after the answer).
- Carried from M6: `NEEDS_REVIEW` dead ends for HANDOVER_INVALID / POSSIBLE_LOOP (P1 product decision). Live-unverified: compaction, `autoRecover`, REPO_MISMATCH on a real moved repo, `/clear` stall via `endedHere`, `/plugin configure` showing options. Also: Q-1 not posted, Q-4, Q-5, Q-9, D-28 Proposed, A-05.
