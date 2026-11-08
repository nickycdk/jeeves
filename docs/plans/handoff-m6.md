# Handoff: M6 built → maintainer's M6 manual checks, then M7 (public beta)

**Date:** 2026-11-08 · **Claude Code:** 2.1.319 · **OS:** macOS, Darwin 27.2 · **Node:** 22.22 · **Repo:** `~/Desktop/Projects/jeeves` (branch `main`, local only, no remote)

This file is enough to start in a clean session. The working rules, code map and engine rules are in `handoff-m3.md` §0, §1, §4, §5, `handoff-m4.md` §4, §5, `handoff-m4b.md` §4 and `handoff-m5.md` §0, §4. The command is `/jeeves` (D-29); every `/relay` in older docs means `/jeeves`.

## 1. Before anything

1. `git status` clean; `git log --oneline -1` shows the commit that added this file.
2. The Mac awake and on power, lid open (`uptime`, `pmset -g batt`). This session ran on battery with `caffeinate -dimsu` around live runs and had no sleep problems.
3. `SR_TEST_TMP=<scratchpad> jeeves/scripts/check-all.sh`: expected **239 unit, 151 mod (31 files), validate and marketplace pass**, exit 0. It needs the engine types in `jeeves/.claude-plugin/types/` (present on this machine; a fresh clone gets them from one interactive `claude --plugin-dir .`, else check-all type-checks `src/core` only and says so). Random `timed out after 5000 ms` in the mod suite under load: rerun first.
4. `claude --version` (2.1.319 at handoff).

## 2. State of the milestones

- **M5: solved** (2026-11-08). Demo run 2: SIGKILL at `before-clear` → `/jeeves recover` → exactly one continuation → a normal rotation; 17/17, US$0.25 (`evidence/m5-demo/RESULT.md`).
- **M6: built, gate open.** All six stories solved. What the gate (05) still needs is manual and belongs to the maintainer:

| Gate item (05 M6) | State | Evidence |
|---|---|---|
| AC-01 install on clean macOS, < 5 min | P layer PASS: scripted fresh `HOME`, local marketplace, installed in 2 s, `/jeeves status` mode full at 15 s, no login. **M layer open:** a fresh macOS user account, timed and recorded | `evidence/m6-install/RESULT.md` |
| AC-02 Cursor (manual) | **Open:** 06 §6 checklist before and after a rotation, at the keyboard | — |
| AC-20 uninstall clean | P layer PASS: settings after uninstall = before install minus the `enabledPlugins` entry; state folder kept; no plugin data folder | `evidence/m6-install/RESULT.md` |
| AC-21 contributor docs | PASS: fresh-clone walkthrough by a fresh agent (unit + mod from the docs alone); 4 gaps fixed | 04 ST-8.4 status |
| AC-22 compatibility matrix | PASS locally: 2.1.303 … 2.1.319 pass validate + kit, 2.1.287/2.1.295 refuse the module. `compat.yml` never ran (no remote) | `jeeves/docs/compatibility.md` |
| Demo: clean-machine install → first rotation | Split: install proven free (above); one live rotation in run 2 (US$0.03) with `--plugin-dir` on the same folder the directory marketplace loads. Not done: an installed plugin rotating with a login, because the throwaway config could not be logged in (the maintainer's `/login` in the agent session went to the normal config) | `evidence/m6-demo/run1-auth/NOTE.md`, `evidence/m6-demo/run2/NOTE.md` |

To close M6, the maintainer: (a) runs the README quickstart on a fresh macOS user account with a stopwatch and a screen recording; (b) runs the 06 §6 Cursor checklist before and after one rotation; (c) optionally logs in once in a throwaway config (`CLAUDE_CONFIG_DIR=<dir> claude`, `/login`, `/exit`, in a separate terminal) so the next agent can run `python3 tests/pty/driver.py <scratch> --installed <dir> --rotations 1 --override +0.8 --out ...` (about US$0.03). Then mark M6 solved in 05, 00 and 06.

M6 live spend: run 1 US$0.00 (no login), run 2 US$0.03, of the US$1 / 2 runs approved.

## 3. What M6 added (code map)

M6 commits (e19acd5..): ST-7.1 24699ba, ST-7.2 94bb5c8, ST-8.3 b10bc9e, ST-8.1 8e344a7, ST-8.2 e0c7658, ST-8.4 c9cbc34, walkthrough fixes 2e329fc, ponytail fixes 8fa9a86, demo driver/evidence e4efd1d, code-review fixes e5f6caf, plans and this handoff (after). Reviews on the M6 range: one `/ponytail:ponytail-review` (5 findings: purge re-check at confirm, purge by lock, a test, `~` replacement; the status-at-restart finding needed no change) and one `/code-review` (10 findings, all fixed).

- `src/adapter/ui.ts`: `STATE_WORD`, `statusLine` (`Jeeves 34%/50%`, `?` unknown, word label otherwise, ≤ 40 cols, `assisted` suffix), `transitionLine` (one transcript line per status change), `shownThreshold`, `historyText`, HELP rows `history`, `status --diagnose`, `purge`.
- `src/adapter/task.ts` `transition`: one `port.note` per LOG_EVENT with from ≠ to, `port.status(statusLine)` after each changed cycle; `blockOnDisk` sets it too.
- `ports.ts`/`engine-mod.ts`: `note(text)` = `$.ui.log(text)` (transcript, not sent to the model); `pluginVersion()` reads `${$.plugin.root}/.claude-plugin/plugin.json`.
- `src/adapter/diagnose.ts`: `/jeeves status --diagnose` (versions, mode + hints, OS, state folder + source + writable, git via `gitVersion` in `git.ts`, task, lock); `~` for home, `redact()`. `Runtime.stateRootSource` added.
- `src/adapter/purge.ts`: `/jeeves purge --task <id> | --project | --all` → list + 4-hex code; `/jeeves purge confirm <code>` within 2 min (one try per code); decided by live locks (`busy`, an unreadable lock refuses), checked again at confirm on exactly the listed folders; works without a project for `--all`; `rm -rf` only under `<root>/projects`.
- `.claude-plugin/marketplace.json` at the repository root (`source: ./jeeves`); `check-all.sh` validates it and no longer hides a failed validate.
- Scripts: `scripts/compat.mjs` (`npm run compat -- <scratch> <versions>`), `.github/workflows/compat.yml`; `tests/pty/clean_install.py` (fresh HOME install/status/uninstall, free); `driver.py --installed <CLAUDE_CONFIG_DIR> --rotations N` (screens per state change); `ptylib.Claude(plugin=None)`.
- Tests: `tests/mod/{ui,history,diagnose,purge}.test.ts`, `tests/unit/ui.spec.ts` (labels, widths, ASCII); `memfs.ts` gained `notes` (transcript lines) and `test -w`.
- Docs: README rewrite, `docs/{troubleshooting,architecture,compatibility}.md`, PRIVACY retention, CONTRIBUTING, CODE_OF_CONDUCT, issue/PR templates, root README.

## 4. Things learned in M6 (2.1.319)

1. An installed mod (directory marketplace) gets **no** `CLAUDE_PLUGIN_DATA` and no `~/.claude/plugins/data/<id>`; state goes to the OS path (Q-3 answered). Good: `claude plugin uninstall` deletes a plugin's data folder unless `--keep-data`.
2. A directory marketplace loads the plugin **in place** from its source folder (no copy in the cache is used for hooks).
3. `claude plugin validate` and `claude plugin test` need **no login** (empty `CLAUDE_CONFIG_DIR`), so CI can run them.
4. An interactive `claude` with an empty `CLAUDE_CONFIG_DIR` (onboarding marked done in its `.claude.json`) starts, loads installed plugins and answers local `/jeeves` commands while "Not logged in"; any prompt pauses the task as `PAUSED (AUTH)` (first live check of ST-6.2).
5. `/login` typed in the agent's own session logs in the normal config, not a throwaway `CLAUDE_CONFIG_DIR`. A throwaway login needs a separate terminal started with that variable.
6. The TUI redraws only changed cells, so the plugin status entry's changing digits are not readable from a PTY capture; transcript lines (`$.ui.log`) are.
7. Engine before 2.1.303 refuses `$` passed across an import (Jeeves's adapter does this everywhere): that is the hard floor for this code.
8. `npm i @anthropic-ai/claude-code@<v> --prefix <dir>` gives a working `node_modules/.bin/claude` for any version (about 6 s each).

## 5. Open items

- M6 manual gate items (§2).
- `NEEDS_REVIEW` is a dead end except `continue` (ROTATE_UNAVAILABLE), `done` (DOD_UNMET) and `recover` (STATE_CORRUPT): HANDOVER_INVALID and POSSIBLE_LOOP can only be ended with `/jeeves off` (docs say so). A "retry" path is a product decision for the maintainer (P1 candidate).
- Live-unverified (carried): compaction (precompute skip, COMPACTED after `/compact`), `autoRecover` from `session.start`, REPO_MISMATCH/relink on a real moved git repo, the `/clear` stall recovery through `endedHere`; the numeric status entry in a capture (§4.6). Now verified live: StopFailure AUTH pause, ST-7.1 transcript lines.
- Not verified: `/plugin configure jeeves@jeeves` and `/config` showing plugin options in a live session (README names them); a GitHub-sourced install (expected like the directory one).
- Placeholders to fill at publication (ST-9.3): `<owner>` in README install lines, CODE_OF_CONDUCT reporting address, Actions pinned by tag not SHA (08 §4 asks for SHA).
- Carried: A-05, CI never run (no remote), Q-1 not posted, AC-07/AC-09 E layers, Q-9, ST-9.3 naming check, `$.prompt.fill` emptying the box live (ADR-010 A1), the AC-10 "quote earlier messages" probe, D-28 Proposed, Q-4 (`MIN_VERSION` stays 2.1.319 unless the maintainer wants a live run on 2.1.303+), Q-5 (50% default on 1M windows).

## 6. Next: M7 (public beta, ST-9.1 … ST-9.3)

**Read first:** `04` E9 and the standard DoD; `05` M7 row (every AC pass/fail/not-supported with evidence; security review no Critical/High; real Cursor two-rotation demo; maintainer sign-off; v0.1.0 released); `06` §5 (evidence layout `docs/evidence/v0.1.0/`), §6, §7 (release gates); `08` (§2 required files: SECURITY.md and `.claude-plugin/icon.png` are still missing; §4 CI, §5 supply chain, §6 release, §7 claims, §9 pre-release checklist).

- **ST-9.1 security review** (agent work, free): threat model (`docs/threat-model.md`), targeted tests per mitigated threat (prompt injection via repo/handover text, secret leakage, lock abuse, path traversal in state paths and purge, `$.process.run` argv), SECURITY.md.
- **ST-9.2 real Cursor demo and AC evidence pack** (maintainer at the keyboard + paid runs): ≥ 2 rotations in Cursor on the default model, AC-01…AC-25 table with links, video ≤ 3 min.
- **ST-9.3 naming check and release pipeline**: availability/trademark search; release workflow (tag → CI → zip + checksums + attestation). Publishing (remote, push, release) is the maintainer's: the agent must not add a remote or push.
