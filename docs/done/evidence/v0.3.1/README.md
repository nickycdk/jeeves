# v0.3.1 evidence pack (M10)

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Plan:** `docs/plans/10-v0.3.x-plan.md` (approved, D-53) · **Stories:** ST-17.1 … ST-17.4, plus the maintainer-approved ST-15.4 findings 3 and 4 and the session review fixes.

## Acceptance

| AC | What | Evidence |
|---|---|---|
| AC-36 (amended, ADR-009 A4) | 200K or more is eligible; below 200K is not (`window below 200K at start`) | U: `tests/unit/autostart.spec.ts` (199,999 / 200,000 / 1M); I: `tests/mod/eligible.test.ts` |
| AC-37 (amended) | a switch from 1M to 200K keeps the auto task and its threshold; below 200K ends it; on 200K the grace period ends at 60% | U: `autostart.spec.ts`; I: `eligible.test.ts`, `autostart.test.ts` |
| AC-55 | `distinct-task` cannot be solved by one script; the driver voids a scripted run | U: `tests/unit/build-repo.spec.ts`; `tests/pty/void_check_test.py` (synthetic runs) |
| ST-17.3 (E) | one auto-started session on a real 200K window | `200k-auto/RESULT.md`: PASS on run 3 (4 rotations, 40 modules, verify passes), with two qualifications; runs 1 and 2 kept |

## Automated checks at the release commit

- Unit: 303 pass.
- Mod suite: 321 tests in each of its three runs (stop × autoStart off, stop × on, turn × off). All pass except `tests/perf/stats.test.ts` (< 100 ms), which fails when the machine is loaded (load average 16–19 this session) and is not run by CI.
- Typecheck, lint, `void_check_test.py` and `claude plugin validate --strict` pass, and the marketplace validates.
- Compatibility: `jeeves/docs/compatibility.md`, regenerated for 0.3.1. The one failure in each row below 2.1.319 is `tests/perf/stats.test.ts` (re-run by hand on 2.1.316: the timing test, 1,396 ms under load), not a compatibility break.

## Live spend

US$0.86 API-equivalent over the three ST-17.3 runs (budget US$2, D-53), plus the `/context` probes (no model calls). Team account, so nothing was billed in dollars.

## Release artifact

`jeeves/scripts/release-zip.sh` from two clean clones of `a0e2232` (after the M10 code-review and ponytail-audit fixes, `fd7648c` … `a0e2232`): identical `jeeves-0.3.1.zip`, SHA-256 `6684647a10be6203a51c296d21a1aef53ff62b348250c443b53a4e2474603b71` (249 files, no home path). `claude plugin validate` passes on the unzipped marketplace root and `--strict` on its `jeeves/` folder. It replaces the earlier candidate at `46fcea2` (`c1fa9565…ca71`), which was never signed off. The tag goes on `a0e2232` (a tag on another commit gives another SHA). **Sign-off:** waits for the maintainer. Tag and publication are the maintainer's.
