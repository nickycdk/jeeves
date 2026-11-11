# Completion summary and threshold hint (0.3.6)

## Context

Two features that show users what Jeeves did for them and help them get more out of it. Both came from the post-0.3.5 suggestion list (section 3, "Show the value").

1. **A summary when a task finishes.** Today a completed task shows only `Jeeves: task completed`, and the notification says `task completed`. The user doesn't see what Jeeves did: how many handovers, how long it took, which checks passed. All of this is already recorded. A one-line summary makes Jeeves's value visible, and it is the line people share.
2. **A hint when the threshold leaves little room.** A fresh conversation is never empty: the system prompt, `CLAUDE.md` and the tool list come first. If a conversation starts at 27% and the threshold is 40%, each conversation has only 13 points of room. Jeeves then hands over often, and each handover costs a turn. Today the user only finds out when Jeeves stops with `POSSIBLE_LOOP` (a fresh conversation within 10 points of the threshold). A hint one step earlier lets them raise the threshold before that happens.

Outcome: on completion the user sees `Jeeves: task completed in 3h 20m: 6 handovers, 14 commits, 2/2 checks passed.` and a second line with context cleared and cost. When a conversation starts with little room, the user gets one hint per task naming a better threshold.

Nothing new is stored, no setting is added, and the state schema is unchanged.

## Findings from the code

- **Every completion runs through `apply()`** (`jeeves/src/adapter/task.ts:~60-87`). `COMPLETE_BLOCK` (Claude's block with passing checks, via `completionStop`, `task.ts:513`, in both Stop and turn mode) and `DONE_CMD` (`/jeeves done`, `commands.ts:226`) both reach `COMPLETED` there. `apply()` already turns each `LOG_EVENT` into a transcript line (`transitionLine`, `ui.ts:62`) and calls `rt.port.notify` when `needsYou(prev, state)` (`task.ts:85`). One hook point covers every path.
- **The data already exists:**
  - handovers: `state.rotationCount`;
  - sessions, with `startedAt`, `startPct`, `endPct` and `costUsd`: `sessions/NNN.json`, read by `readSessions` (`jeeves/src/adapter/history.ts:34`, not exported yet);
  - the live session's cost: `rt.port.costUsd()` (`ports.ts:43`, used at `task.ts:374`). It is not in a session record until the session ends;
  - context cleared: `aggregate()` in `jeeves/src/core/stats.ts:26`, as used by `/jeeves stats`;
  - commits since the task started: `gitFacts(port, identity, taskStartHead).commitsSinceStart` (`jeeves/src/adapter/git.ts:39`), one read-only `git log`;
  - checks: `readTask(...).view.checks`, which `completionStop` already reads.
- **The state schema is strict.** An unknown field makes `state.json` invalid (`jeeves/src/core/schema.ts:58`), and older Jeeves versions then call the task unreadable. A "hint shown" flag therefore must not go into `state.json`. It goes into Claude Code's plugin store (`rt.port.storeGet` / `storeSet`, already used for auto-start flags in `jeeves/src/adapter/auto.ts:42`).
- **TOAST effects are not de-duplicated** (`jeeves/src/adapter/effects.ts:34`), so "once per task" needs that store flag.
- **The threshold maths is in `reduce`** (`jeeves/src/core/machine.ts:186-195`). A fresh conversation is "rearmed" (CONTINUING → MONITORING) only when its first reading `p` is below `T − LOOP_MARGIN` (10); otherwise it stops with `POSSIBLE_LOOP`. So when a hint can apply, the room `T − p` is always above 10.
- **The cap for a higher threshold** is `laterCap(window, autoCompactTokens)` (`machine.ts:128`, read in `commands.ts:200`): 90%, or 5 points below Claude Code's compaction point when that is lower.
- **Claims policy** (`stats.ts` header, 08 §7): say "context cleared", never "tokens saved"; an unknown cost stays "unknown", never $0.

## Design

### 1. Completion summary

**When:** in `apply()`, when `prev.status !== 'COMPLETED' && state.status === 'COMPLETED'`.

**What the user sees** (transcript lines in place of `Jeeves: task completed`):

```
Jeeves: task completed in 3h 20m: 6 handovers, 14 commits, 2/2 checks passed.
Jeeves: context cleared 180 points (~360K tokens). Cost: $4.10 (1 session unknown).
```

- **Duration:** from the first session's `startedAt` to `state.updatedAt`, as `45m`, `3h 20m` or `2d 4h`. It is wall time, so an idle night counts. That is fine for a summary, and the wording "in" doesn't claim active work time.
- **Handovers:** `state.rotationCount`, as `no handovers`, `1 handover` or `6 handovers`.
- **Commits:** the length of `commitsSinceStart`. Left out when unknown (no git, a timeout, or no `taskStartHead`), never shown as 0.
- **Checks:**
  - `2/2 checks passed` when `COMPLETE_BLOCK` completed it;
  - `confirmed by you` after `/jeeves done`;
  - `no checks set` when there were none.
- **Line 2** is shown only when it has something to say: context cleared when above 0 (from `aggregate([files])`), and the cost of the session records plus the live session's `rt.port.costUsd()`, with unknowns counted as in `/jeeves stats`. Cost is left out entirely when no cost is known.
- **Notification:** line 1 without the `Jeeves: ` prefix, where today it says `task completed`.
- **Never blocks completion:** if gathering the data throws (a read error, a git timeout), the old `Jeeves: task completed` line is shown. The state is already written before the summary is built.

**Code:**

- `jeeves/src/core/stats.ts`: a pure `completionSummary(input): string[]`. `input` = `{ state, sessions, events, liveCostUsd: number | null, commits: number | null, how: 'checks' | 'user', checks: number, now: Iso }`. It reuses `aggregate([{ state, sessions, events }])` for context cleared and cost, and the existing `k` / `one` formatters.
- `jeeves/src/adapter/history.ts`: `export` `readSessions`, and add `completionLines(rt, dir, state, how): Promise<string[]>`. It reads sessions and events the way `statsText` does (`history.ts:101`), plus `gitFacts`, `rt.port.costUsd()` and `readTask(...).view.checks`, then calls `completionSummary`.
- `jeeves/src/adapter/task.ts` `apply()`: on the transition to `COMPLETED`, `await completionLines(...)` inside a try/catch. Use the lines for the `LOG_EVENT` whose `to` is `COMPLETED` (one `rt.port.note` per line), and line 1 for `notify`. `how` is `'user'` when the input type was `DONE_CMD`, else `'checks'`. `apply()` knows the input, so no new parameter is needed.
- `transitionLine`'s `COMPLETED` case stays as the fallback text.

### 2. Threshold hint

**When:** in `apply()`, at the first context reading of a conversation:
- either a fresh conversation was rearmed after a handover (`prev.status === 'CONTINUING' && state.status === 'MONITORING'`),
- or the task's first conversation got its first reading (`state.status === 'MONITORING'`, `prev.lastContext` with no `percent` and `state.lastContext.percent` known).

Not under the test overrides (`rt.thresholdOverride` or `rt.thresholdRelative` set), where thresholds are artificial.

**Rule** (pure, in `jeeves/src/core/machine.ts` next to `laterCap`, as `roomHint(p, T, cap): number | null`):

- `ROOM_MIN = 20`, `ROOM_TARGET = 30`.
- No hint when `T − p >= ROOM_MIN`. A typical 200K window starts at 15 to 20%, so with the default 40% it has 20 to 25 points of room and gets no hint.
- Otherwise `next = min(cap, ceil5(p + ROOM_TARGET))`. Hint only when `next >= T + 10`, so it's worth typing. Return `next`, or `null`.

**What the user sees** (a toast and one transcript line, once per task):

```
Jeeves: this conversation started at 27%, leaving 13 points before the 40% handover. /jeeves threshold 60 gives more room (/jeeves defaults threshold 60 for this project).
```

- **Once per task:** plugin store key `roomHint:<taskId>`. Set it when shown; never show it while it is set. No change to `state.json`.
- **The cap** comes from `laterCap(window, await rt.port.autoCompactTokens())`, as `commands.ts:200` does. The window comes from `state.lastContext.window`.
- A user who already typed `/jeeves threshold` keeps getting no hint only if their room is ≥ 20. Otherwise one hint is fine, since it's once per task.

## Steps (paths under `jeeves/`)

1. `src/core/stats.ts`: `completionSummary` and a `duration(ms)` formatter.
2. `src/core/machine.ts`: `ROOM_MIN`, `ROOM_TARGET`, `roomHint`.
3. `src/adapter/history.ts`: export `readSessions`; add `completionLines`.
4. `src/adapter/ui.ts`: `MSG.roomHint(p, T, next)` (the text above).
5. `src/adapter/task.ts` `apply()`: the completion summary and the hint, as designed, both inside try/catch, and both after the state write and effects (they only add notes, a toast and a notification).
6. Docs (below), CHANGELOG, release notes `docs/release-notes/v0.3.6.md`, and a version bump in `package.json`, `.claude-plugin/plugin.json` and both READMEs (`tests/unit/version.spec.ts` enforces this).
7. Decision log: `D-56` in `docs/plans/07-risks-and-open-questions.md` (repo root), covering the summary content, wall-time duration, ROOM_MIN 20 / ROOM_TARGET 30, and the store flag instead of a state field.

## Docs

- `jeeves/README.md` "What you see": one paragraph on the completion summary, and one sentence on the hint.
- `jeeves/README.md` "How the threshold works": one sentence. Jeeves hints once per task when a fresh conversation leaves fewer than 20 points of room, and names a threshold that gives about 30.
- `jeeves/PRIVACY.md`: no change, since nothing new is stored. The store flag holds only a task id and "shown". Add one line under the plugin-store mention if PRIVACY lists store keys.
- Root `README.md` "What happens at 40%": optionally one line, "When the task is done, Jeeves tells you what it took."

## Tests

**Unit, `tests/unit/stats.spec.ts`** (`completionSummary`):
- full summary: 6 handovers, 14 commits, 2/2 checks, known window and cost → the two lines above, exactly;
- `no handovers`, `1 handover`, `6 handovers`;
- durations: 45m, 3h 20m, 2d 4h; under a minute shows `<1m`;
- commits unknown (`null`) → left out; 0 commits → `0 commits`;
- `how: 'user'` → `confirmed by you`; no checks → `no checks set`;
- no cost known → no cost part; some unknown → `(n session(s) unknown)`; the live session's cost is added;
- nothing cleared and no cost → line 2 left out.

**Unit, `tests/unit/machine.spec.ts`** (`roomHint`):
- room 25 → null; room exactly 20 → null; p 27, T 40, cap 90 → 60;
- cap 50, p 27, T 40 → 50 (≥ T+10); cap 45 → null;
- result is always a multiple of 5 and never above `cap`.

**Mod, `tests/mod/complete.test.ts`:**
- a task completed by a passing completion block: the transcript holds `task completed in` with `2/2 checks passed`, and the notification text starts with `task completed in`;
- `/jeeves done` after `DOD_UNMET`: `confirmed by you`;
- git facts failing (the fake `git log` exits 1) → the summary has no commits part, and the task still completes;
- a summary that throws (sessions folder unreadable) → `Jeeves: task completed`, task `COMPLETED`.

**Mod, the hint** (new cases in `tests/mod/later.test.ts`, or a new `tests/mod/room.test.ts`):
- after a rotation, the fresh conversation's first reading is 27% with T 40 → one toast naming `/jeeves threshold 60`;
- a second rotation, again at 27% → no second toast (store flag);
- a new task in the same project → the hint can show again;
- first reading 18% with T 40 → no hint;
- the test override set → no hint;
- in turn mode (`npm run test:mod:turn`) the same cases pass.

## Verification

- `cd jeeves && npm run lint && npm test && npm run typecheck && npm run validate`.
- `npm run test:mod`, `npm run test:mod:on`, `npm run test:mod:turn`.
- **Live, on the maintainer's machine** (in a scratch repository, `/jeeves threshold 20` so it's quick):
  1. `/jeeves on`, `/jeeves check npm test`, then a small multi-step task. After one or two handovers and Claude's completion block, the transcript and the notification show the summary, and the numbers match `/jeeves stats` and `git log --oneline <start>..HEAD | wc -l`.
  2. Paste a large file into `CLAUDE.md` so a fresh conversation starts at about 10 to 15%. With `/jeeves threshold 30`, a handover gives one hint naming a higher threshold. A second handover gives none.
- Record both in `docs/done/evidence/v0.3.6/RESULT.md`.

## Not included

- A summary in `/jeeves status` or `/jeeves history` after completion. `/jeeves stats` already shows the figures.
- Active-time measurement (time with Claude working). It isn't recorded today and would need new state.
- Changing the threshold automatically. The hint only suggests a value; the user decides.
- Pinned notes, the todo list in the handover, monorepo suggestions and the pipe warning: separate plans.
