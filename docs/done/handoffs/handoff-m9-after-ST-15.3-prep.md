# Handover: M9 (v0.3): ST-15.2 done, ST-15.3 done up to the maintainer's sign-off

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Branch:** `main`. `origin/main` is at `37f9cc3`; everything after it is local only (not pushed). Paths are relative to the repo root. Previous handovers: `docs/done/handoffs/handoff-m9-after-ST-15.2-partial.md` (its §3 facts still hold), `docs/done/handoffs/handoff-m9-after-gate-review-fixes.md` (§3 code map, §4 facts, §6 rules still hold).

## 1. What happened this session

- **Maintainer decisions** (07 D-50, D-51; `ea21d3b`):
  - **D-50, grace period:** an auto task's grace period now ends at threshold + 10 (`NEAR_MARGIN`; 0.5 under the test threshold), in `jeeves/src/core/machine.ts` at the threshold request. The auto-start spec §5.2 and AC-37 are amended, and README, CHANGELOG and release notes are updated. Tests: `autostart.spec.ts`, plus a new I test in `tests/mod/autostart.test.ts`.
  - **D-51, completion rules row:** ADR-007 A1's mid-turn row limit is accepted, not changed. It is recorded under ADR-007 in 02 and in the README.
- **ST-15.2 done** (`bc97c26`), about US$10.40 API-equivalent over six runs. Evidence: `docs/done/evidence/v0.3.0/AC-41/RESULT.md`.
  - **1M re-run with Jeeves:** PASS. Two rotations with nothing typed, at 50.07% (inside the grace margin) and 40.73%; no retries; each module committed once; NFR-10 clean. US$3.42, against US$3.95 without Jeeves, which is about 13% less, not the spec's "roughly half".
  - **Void attempt:** before that, one attempt was void because Claude scripted the fixture's six repeating functions at 60K context.
  - **Q8:** 200K is proposed for v0.3.x (D-52).
- **ST-15.3 done up to sign-off** (`5f463e7`, `b2df43b`):
  - Version is 0.3.0 in `plugin.json`, `package.json` and `package-lock.json`. CHANGELOG, release notes and both READMEs are updated.
  - `jeeves/docs/compatibility.md` is regenerated. `scripts/compat.mjs` had had a syntax error since ST-16.7; it is fixed.
  - The evidence pack is `docs/done/evidence/v0.3.0/README.md`.
  - The zip is identical from two clean clones of `5f463e7`, SHA-256 `8780f4f4f4ec35860093ed4441f2cccfbb7ff0a938f228710faa135ed965f102`.
- **Checks at `5f463e7`:**
  - Pass: typecheck, lint, 302 unit, both validates.
  - Mod suite, 311 in each of the three runs: every functional test passes.
  - `tests/perf/stats.test.ts` failed in some runs at load average 17–35 (100.4–257 ms), as in v0.2.0.

## 2. Next, in order

1. **Maintainer:**
   - Sign off ST-15.3 (read `docs/done/evidence/v0.3.0/README.md` and `jeeves/docs/release-notes/v0.3.0.md`).
   - Then tag and publish: theirs, not the agent's.
   - The CHANGELOG date is set when tagging.
   - A tag on a later commit gives a different zip SHA, so rebuild with `jeeves/scripts/release-zip.sh <tag>`.
2. **Push** when asked (`git grep -n "$(whoami)" HEAD` prints nothing at `b2df43b`).
3. **v0.3.x candidates:**
   - Auto-start on 200K windows (D-52), with one auto-started 200K live session.
   - A `long-task` fixture where each module has its own function (it can be scripted today).
   - The ADR-007 A1 limit, if it matters in use.
   - Unsure: the `/jeeves later` + grace edge (threshold + 10 past auto-compaction) goes to a COMPACTED rotation.

## 3. Facts worth keeping

- Haiku may solve `long-task` by script (once in five 1M runs): check the transcript's first tool calls early in any AC-41-style run.
- `~/jeeves-fresh/plugins/store/` now holds a store written by the last run; earlier stores were moved into the scratch folders (test keys only).
- `scripts/compat.mjs <work dir> <versions…>` installs versions from npm into the work dir; no model calls.

## 4. Rules (unchanged)

This repo only; one local commit per finished story or fix; push only when asked; never make the repo public, publish, post, change Claude settings or install plugins; zero runtime dependencies; no live runs without go-ahead and budget; never edit `jeeves/` while a live `--plugin-dir` run is going; ADR conflict → stop and ask; report honestly; before every push `git grep -n "$(whoami)" HEAD` prints nothing; load the plugin-authoring skill before touching hooks or the test kit; handover at about 35% context.
