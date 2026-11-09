# Handover: a full review of Jeeves by Fable, and a hands-on try

**Date:** 2026-11-09 · **Claude Code:** 2.1.319 · **Branch:** `main` at `fbe36ea` or later, local only (not pushed). **For:** a fresh session on Claude Fable 5.1 (`claude-fable-5-1`). The previous handover, `docs/done/handoffs/handoff-m10-decisions.md`, has the latest commits. The rules are in §8 of this file.

You have not seen this project before. This file tells you what Jeeves is meant to do, where each part lives, what has been proven and what has not, and what we want from you. Read it whole before you open code.

## 1. What we want from you

1. **Review the whole implementation** against the behaviour in §2 and §3: `jeeves/hooks/`, `jeeves/src/`, and the tests in `jeeves/tests/`. Do it with fresh eyes. Earlier reviews (M9 and M10 code reviews, a ponytail audit) were done by the same model family that wrote the code. Your job is to find what they missed.
2. **Answer one question with evidence:** will a long session hand over correctly and automatically, start a fresh conversation, and carry on without a person? Give a confidence per step (§5 has the current estimate to challenge), and name the code paths that could break each step.
3. **Give it a go** (§7): run the automated suites yourself, then propose a live run. Do not start a live run before the maintainer says yes and sets a budget.

Report findings ranked by severity. For each one give file:line, a concrete failure scenario (inputs and state, then the wrong result), and whether you confirmed it with a test or by reading. Don't fix anything until the maintainer has seen the list. After that, each fix is one commit with a test.

## 2. How Jeeves should work (the contract)

Jeeves is a Claude Code plugin ("mod"). Its job is to keep a long task going when the context window fills: before it is full, Jeeves asks Claude for a handover, checks it, saves it, clears the conversation, and gives the fresh conversation the task and the handover so the work continues. The user types nothing during this.

### 2.1 A task

- **Explicit task:** the user types `/jeeves on`. The next prompt (or `/jeeves on <goal>`) is saved word for word as `task-rev-001.md`.
- **Auto task (0.3+):** on a new install, an eligible session is watched by itself, and its first typed prompt becomes the task. Eligible means interactive, full mode, inside a git work tree, a model window of at least 200K tokens, and a fresh conversation (0 turns at `session.start`). The decision is made once per session and kept in the plugin store, not the state folder. Nothing is written to disk before the first typed prompt.
- **Threshold:** 40% on windows above 200K, 50% otherwise, or a project default or `/jeeves threshold <n>` (20 to 90). An auto task has a grace period: no handover in its first 3 main turns unless the context is 10 points past the threshold.
- **Optional proof of done:** `/jeeves check <cmd>` and `/jeeves dod <text>`. Jeeves never runs commands. It reads the results of the commands Claude ran from its own evidence ledger.

### 2.2 One rotation (the core loop)

States run `MONITORING → ROTATION_REQUESTED → QUIESCING → HANDOVER_GENERATING → VALIDATING → ROTATING → RESTORING → CONTINUING → MONITORING`.

1. **Watch.** Each context reading is a `MEASURE`. At the threshold the state becomes `ROTATION_REQUESTED`. The next main-loop tool result appends one hidden note asking Claude to finish its current step.
2. **Wait for a safe point.** A main-loop stop with nothing in flight: no running subagent, no background shell. If it is unsafe, Jeeves waits. After 3 stops or 20 minutes the task pauses with `UNSAFE_BOUNDARY`. If Claude is idle, one short nudge prompt starts a turn.
3. **Ask.** In Stop mode, the Stop hook blocks once with the handover instruction. In turn mode, the instruction is submitted as a prompt, with the state set to `HANDOVER_GENERATING` before the submit, so prompts the user types are held.
4. **Check.** The answer must contain one `<<<JEEVES-HANDOVER v1 … JEEVES-HANDOVER>>>` block. It goes through `parse.ts`, then `validate.ts`:
   - task and rotation ids match;
   - the block is within the size limit;
   - it contains no secrets;
   - files it marks `[verified]` exist;
   - branch and HEAD match git (read-only);
   - it claims no test as passed whose last ledger run failed.

   An invalid handover gets up to 2 retries with the exact errors. After that the task goes to `NEEDS_REVIEW(HANDOVER_INVALID)`.
5. **Save.** A valid handover is written once as `history/handover-NNN.md` and checked by SHA-256 before anything else happens.
6. **Clear.** At the end of that turn the file is read back and hashed again. Only then does Jeeves run `/clear`, once.
7. **Continue.**
   - **Stop mode:** the fresh conversation's `SessionStart` injects the task, the DoD and the handover. Then Jeeves submits the continuation prompt (`src/core/continuation.ts`).
   - **Turn mode:** no `SessionStart` arrives, so the continuation prompt carries all of it.
   - Prompts held during the rotation are quoted in the continuation.
   - The first low reading in the fresh conversation re-arms the threshold. A reading still near the threshold means a possible loop: `NEEDS_REVIEW(POSSIBLE_LOOP)`, or `FAILED` after repeated failures.
8. **Carry on (0.3.1, ADR-007 A2).** In the conversation an automatic rotation opened for an **auto** task, the first stop that has no completion block and nothing running gets one carry-on prompt. It never gets a second, never gets one after the user typed there, and explicit tasks never get one.

### 2.3 Done

Claude signals done with a `<<<JEEVES-COMPLETE v1 … JEEVES-COMPLETE>>>` block.
- **With check commands:** `COMPLETED` only if every check ran with exit 0 after the last edit and no blockers are listed. Otherwise Jeeves asks once for the missing checks, then goes to `NEEDS_REVIEW(DOD_UNMET)`.
- **Without check commands:** `NEEDS_REVIEW`, and the user confirms with `/jeeves done`.

### 2.4 Stop mode and turn mode

On some accounts (seen on Team organizations), Claude Code 2.1.319 seats a built-in plugin, `cc-plugin-sec-default`, ahead of Jeeves. It passes `classic.Stop`, `classic.SessionStart`, `session.compact` and `prompt.compose` on past Jeeves. The first main turn that ends without Jeeves's Stop running switches the process to **turn mode** (`mode: full (turn)`). In turn mode:
- `turn.complete` is the boundary.
- Jeeves keeps its own count of running background tasks.
- The handover is asked for and read through prompts and answers.
- A compaction is recognised from a drop in the context reading.
- The completion rules go in as a hidden row.

A turn another source opened (a `/loop`, a notification) is not read as the handover unless its answer carries the handover block. If Claude Code refuses a prompt Jeeves sends, the process becomes `unsupported`: an auto task ends, and an explicit task gives up its lock.

### 2.5 Interruptions

| Event | Result |
|---|---|
| User `/clear`, explicit task | `PAUSED(USER_CLEAR)`, lock released, auto-start off for that session only |
| User `/clear`, auto task | `DISABLED(USER_CLEAR)`; the next prompt starts a new auto task |
| User interrupt during the handover | Pause |
| API errors (rate limit, auth, billing, overload) | Pause, with a reason |
| Disk write failure | `BLOCKED(DISK)` |
| Branch or repository mismatch | `BLOCKED(REPO_MISMATCH)` |
| 10 rotations reached | `MAX_ROTATIONS` |
| Crash or close mid-rotation | The lock goes stale after 120 s. The next session names the task, and `/jeeves recover` continues it from the last validated handover, exactly once. Auto tasks recover by themselves in a fresh interactive session. |

### 2.6 Invariants (a break in any of these is a severe finding)

1. Jeeves never runs the user's commands, never changes git, never answers a permission prompt, and never writes inside the repository.
2. Never `/clear` without a validated handover that is saved and hash-verified on disk.
3. Never two continuations for one rotation (crash points included).
4. Never mark `COMPLETED` without ledger evidence.
5. A prompt the user types during a rotation is never lost and never runs ahead of the handover request.
6. One task is owned by one session at a time (lock in `lock.d/`). Stale locks are taken only through recover.
7. On failure, stop and say why (`/jeeves status`). Never continue on a bad handover. Fail closed for the rotation, fail open for the user: Claude can always stop.
8. No transcript or file contents are stored. Secrets are redacted in logs. No network. Zero runtime dependencies.

## 3. Where the code is

```
jeeves/hooks/register.ts     wires engine events to the adapter (243 lines); nothing else
jeeves/src/core/             pure: machine.ts (reduce: state + input -> state + effects), handover/ (template,
                             parse, validate, render), evidence.ts (ledger), completion.ts, continuation.ts,
                             autostart.ts, background.ts, compaction.ts, lock.ts, recovery.ts, redact.ts
jeeves/src/adapter/          talks to the engine: task.ts (the cycle: read state -> reduce -> write -> effects,
                             one serial queue per process; onStop, turnBoundary, continueFresh, onUserClear),
                             eligible.ts (auto-start), recover.ts, storage.ts (atomic writes, locks), commands.ts,
                             ui.ts (all user text), engine-mod.ts (ports over `$`)
jeeves/tests/unit/           node:test on the core (304)
jeeves/tests/mod/            the real hooks in Claude Code's plugin test kit, in-memory host (328 with perf)
jeeves/tests/pty/            live drivers in a real `claude` (cost money)
```

**Design documents** (read the ones you need):
- `docs/plans/02-architecture-and-adrs.md`: ADR-001 to ADR-010 with amendments, the transition table (§4) and the file layout (§6).
- `jeeves/docs/architecture.md`: a one-page map.
- `jeeves/docs/state-machine.md`: the generated diagram.
- `docs/specs/auto-start.md` and `docs/specs/team-accounts-turn-mode.md`.
- User-facing behaviour: `jeeves/README.md` and `jeeves/docs/troubleshooting.md`.

The engine API types are written by Claude Code into `jeeves/.claude-plugin/types/` the first time it loads the folder (see `jeeves/CONTRIBUTING.md`).

## 4. Where we think the risk is (check these hardest)

1. **Unattended continuation** (§2.2 step 8). In live run 2 Claude ended a continuation turn by announcing its next step, and the task waited for a person. The carry-on fix (`e1ce94c`, `carryOn` in `src/adapter/task.ts`) has only been checked in the mod suite. Questions: is once per conversation enough? Can it fire where a person *is* needed? It is in-memory, so what happens after a reload?
2. **Turn mode generally.** It depends on undocumented engine behaviour: plugin `/clear`, `$.session.id()` changing after `/clear`, `turn.start` naming the opener, rows appended mid-turn being dropped (ADR-007 A1 known limit). Look for states that can hang: `HANDOVER_GENERATING` with nothing to retry, `ROTATING` after a `/clear` promise that never resolves (audit 6, open), or a held prompt that is never released.
3. **Long 1M sessions.** The threshold is 40% (about 400K tokens). Most live evidence is from 200K windows on Haiku. Check what a very heavy turn does near Claude Code's own compaction (about 83.5% on 200K).
4. **Concurrency and recovery.** Two sessions in one project, crash at each of the crash points (`CRASH_POINTS`), and `claude --resume` of an old conversation.
5. **Auto-start edge cases.** The session-level off keys carried over `/clear` (`carryOver`, `carryUndecided`), and the three just-landed decisions (`ab05940`, `6917056`, `e1ce94c`).
6. **Code-review 3, open:** `/loop 5m /cmd` in turn mode. `prompt.submit` sees `/cmd` while `turn.start` sees the expanded text, so the opener is unknown and the turn counts.

## 5. What is proven and what is not

**Live, on a Team account (turn mode):**
- the 200K run: 4 rotations, every module committed, checks passed (`docs/done/evidence/v0.3.1/200k-auto/RESULT.md`);
- earlier runs with 2 rotations each;
- AC-07;
- a typed `/compact`;
- auto-start after a user `/clear`.

**Today on a second Mac (pre-decision build):** install, auto-start, turn-mode detection, and a user `/clear` ending an auto task all behaved as specified. A handover there has not been tried yet.

**Only in the automated suites:**
- Stop mode (accounts outside a Team organization);
- the three maintainer decisions (`ab05940`, `6917056`, `e1ce94c`);
- recovery at most crash points.

**The current confidence estimate, for you to challenge:**

| Step | Estimate |
|---|---|
| Threshold and safe-point request | ~90% |
| Handover checked and saved | ~90% |
| `/clear` and the fresh conversation started | ~85% |
| Keeps working alone to the end | ~60–65% |
| Overall | ~75% |
| Fails safe (stops and says why) | ~95% |

## 6. Known open items (not bugs to rediscover)

- `jeeves/docs/compatibility.md` still says 323 tests. Regenerating it means a new zip.
- The v0.3.1 zip at `67ac451` (SHA-256 `8d3da6b4…dac5`) waits for the maintainer's sign-off.
- `tests/perf/stats.test.ts` is flaky under load. It is a known timing flake.
- Audit 6 and code-review 3 (§4) are open, low priority.
- The m9 §5 decision list and v0.2.0 public (D-37) are the maintainer's.

## 7. Giving it a go

**Free (do these):**

```sh
cd jeeves && npm ci
npm test                      # unit
npm run test:mod              # mod suite, Stop mode
npm run test:mod:on           # auto-start on
npm run test:mod:turn         # as on a Team account
npm run typecheck && npm run lint && npm run validate
```

Mod tests run the whole suite only; `claude plugin test .` has no file filter and takes about 15 s. `scripts/check-all.sh` stops at the first failure. Write new tests that pin down suspected bugs. That is the preferred way to confirm a finding.

**Hand test:** `jeeves/docs/testing.md` has seven scenarios. The cheapest is a task paced part by part, then `/jeeves rotate` to force a handover.

**Live (needs the maintainer's go-ahead and budget):** propose one run that attacks the weakest step. For example: an auto task on a 1M window with a task big enough to cross 40%, nothing typed after it starts, `tests/pty/driver.py` or `ac41.py` driving it, and evidence written to `docs/done/evidence/`. State the expected cost before you ask. Never edit `jeeves/` while a live `--plugin-dir` run is going.

## 8. Rules

- This repository only.
- One local commit per finished fix, with a test. Push only when asked.
- Never make the repository public, publish, tag, change Claude settings or install plugins.
- Load the `plugin-authoring` skill before touching hooks or the test kit.
- Zero runtime dependencies.
- No live runs without go-ahead and budget.
- An ADR conflict: stop and ask.
- Report honestly: what you ran, what failed, what you only read.
- A change in `jeeves/` means a new release zip from two clean clones (`jeeves/scripts/release-zip.sh <commit>`), with the SHA recorded in `docs/done/evidence/v0.3.1/README.md` and `docs/plans/05-delivery-milestones.md`.
- Before every push, `git grep -n "$(whoami)" HEAD` must print nothing.
- Write a handover at about 35% context.
