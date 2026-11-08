# Spec: Auto-start (installing Jeeves is the opt-in)

**Status:** **Approved** 2026-11-08 (D-40): revision 4 with editorial fixes from review 4 (reviews 1–4 applied, §12). **Design frozen:** further ideas go to §13, not to a revision 5. Plan: 03 E13–E15, 04 ST-13.1 … ST-15.3, 05 M9, 06 AC-35 … AC-47, 07 D-40 … D-43, 02 ADR-009 A3. No code yet. Q7 (07 Q-13) still needs an owner and a date. · **Date:** 2026-11-08 · **Target:** v0.3 (after v0.2.0 is public; §6 items may ship in v0.3.x) · **Changes:** ADR-009, AC-03, ADR-003, ADR-010, PRIVACY.md, README (§8) · **Relates to:** FR-05, FR-11, ADR-007, R-03, R-15, R-19, R-25.

## 1. Goal

Jeeves should feel like part of the normal Claude Code day: install it once, start `claude`, work. Long tasks hand over to a fresh conversation by themselves, with no command to remember per task. Anyone who doesn't want it in a session, a project or at all can turn it off in one step. Nobody who used an earlier version has their privacy terms changed without saying yes. People who are not auto-watched hear about Jeeves when it would help, instead of silence.

## 2. Why

Today a user must type `/jeeves on` before each task. They forget, and the sessions that need Jeeves most are long tasks that started small. Installing a session-continuity plugin already says "I want this"; asking again per task adds friction and no safety.

## 3. Not in scope

- Turn mode for Team accounts (`team-accounts-turn-mode.md`). Auto-start stays off wherever Jeeves is unsupported.
- How a rotation works (boundary, handover checks, `/clear`), except the continuation's order (§5.3).
- Network use, telemetry, new dependencies.

## 4. Today (v0.2.0)

- A task starts only with `/jeeves on [goal]`. With a goal, that text is the task; without one, the next prompt typed at the terminal (origin `composer`) is saved word for word as `task-rev-001.md` (FR-05).
- With no task, nothing is recorded (PRIVACY.md, README, first-activation notice).
- The first-activation notice is shown once per install. It is remembered in Jeeves's plugin store (`$.store` key `firstActivationShown`), **not** in the state folder.
- Settings: `stateDir`, `autoRecover` (default off) in `/config`; per project `/jeeves defaults threshold|check|clear`.
- The threshold is chosen when a task is created from `$.session.usage().window`, which is known before the first reading (the model setting): 40% above 200K, else 50%.
- A user-typed `/clear` pauses a task (`PAUSED(USER_CLEAR)`, ADR-010). One warning 5 points before the threshold. A fresh conversation starts at about 34–57K tokens (R-15).
- v0.2 refuses state with a newer schema (`SCHEMA_TOO_NEW`) and never rebuilds it; a `config.json` with an unknown field is "unreadable" and ignored.

## 5. Proposed behaviour

### 5.1 When a session is auto-watched

At `session.start` Jeeves decides **once**, for the whole session, whether it is **eligible** (a later change, such as switching from a 200K to a 1M model, does not start watching; `/jeeves on` does):
1. **Interactive**: `isInteractive` true. Never under `claude -p`, the SDK or background agents.
2. **Full mode**: not assisted, not unsupported (old version or the R-25 skip). The skip is re-checked after the first answer; if it is found, the auto task ends (DISABLED, files kept) with: `Jeeves: not watching any more (this account isn't supported); /jeeves status for details`.
3. **A git repository**: inside a git work tree; subfolders and linked worktrees count (each worktree is its own project, as today).
4. **A large window**: `$.session.usage().window` above 200K tokens, read at `session.start` (the model setting), not at the first reading. On 200K windows a fresh conversation already fills 17–28% of the window, so a 50% threshold would rotate after only about 45–65K tokens of work. Off there until AC-41 has measured it (Q8).
5. **A fresh conversation**: `$.session.turns()` is 0 at `session.start`; resumed conversations (`--resume`, `--continue`) are not auto-watched.
6. **Auto-start on** (§5.5).

An eligible session starts an auto task at the first typed prompt (§5.2), unless it already owns a task.

**Model switch.** If a reading in an auto task shows a window that would not be eligible (for example `/model` from a 1M to a 200K model), the auto task ends (DISABLED, files kept) with a message: `Jeeves: not watching any more (this model's window is 200K); /jeeves on to watch anyway`. Explicit tasks keep their threshold as today.

**Why a session isn't watched.** Status and `/jeeves` (§6.5) show one reason, chosen in this order:
- **First, reasons no command can change in this session:** `-p`/SDK, unsupported, assisted.
- **Then the fixable ones, easiest first:**
  1. off for this session (`/jeeves on`)
  2. off for this project (`/jeeves defaults auto on`)
  3. off everywhere (`/jeeves auto on`), or (3b) not turned on after an upgrade (`/jeeves auto on`)
  4. resumed conversation (start a new one)
  5. not a git repository
  6. 200K window at start

When several reasons apply, the line ends with `(+N more)`, so a fix that removes only one reason doesn't look like the whole answer (`/jeeves status --diagnose` lists all).

### 5.2 Lazy start, near-threshold rule, grace period

- Session start creates no task. The cleanup in §5.9 is the only write to task state at session start; the upgrade check (`auto.json`) and the notice key (`autoNoticeShown`) are the other writes there.
- The task is created at the **first prompt typed at the terminal**: origin kind `composer`, not a slash command. Any other origin kind (`bridge`, `sdk`, `task-notification`, a plugin's `$.prompt.submit`, any other) never starts an auto task; one test per kind.
- **Near-threshold rule.** If the first reading of a new auto task is within 10 points of the threshold (a large CLAUDE.md, a pasted log), the task ends at once (DISABLED, files kept) and Jeeves says so in one line: `Jeeves: not watching this session, context already at 34%; /jeeves on to watch anyway`.
- **Grace period.** An auto task never rotates in its first 3 main turns.

### 5.3 What "the task" is, and who said it

The first prompt is saved word for word as `task-rev-001.md` (FR-05 holds). The task is marked `origin: auto` or `explicit`, which needs a state schema bump with a migration; v0.2 tasks read as `explicit`.

Every new handover, for every task, has a seventh required heading, **Current goal**: 1 or 2 bullets, each tagged `[verified]`, `[inferred]` or `[unknown]` like the other headings, each at most 300 characters. The parser checks the heading is present, the bullet count, the tags and the length; redaction and the secret check apply. v1 blocks without it stay valid for tasks created before the upgrade.

The continuation prompt puts **the user's words first**:
1. the original task and every `goal:`, `dod`, `check` revision, labelled "the user's words";
2. then the current goal, labelled "Claude's summary at the last handover (may be wrong)";
3. then the rest as today.

The summary is data, never instructions (R-19). It cannot change the task, the DoD or the checks. The rotation line shows it cut to one line, so drift is visible.

### 5.4 The first-run notice

- On a fresh install it is shown at the `session.start` of the first eligible session, with the threshold that applies:
  `Jeeves watches long sessions here. At 40% context (~400K tokens) it saves a handover and continues in a fresh conversation.`
  `/jeeves later postpones a handover, /jeeves off stops it for this session, /jeeves auto off turns it off.`
- **The same session is watched.** The notice comes at `session.start`; recording starts only at the first typed prompt, which comes after it. So the first session after installing works at once.
- A new plugin-store key, `autoNoticeShown`, stops it from repeating. It is a different key from v0.2's `firstActivationShown`.
- The status line, warning and rotation lines are in §6.

### 5.5 Postpone and turn off

| Command or setting | Effect |
|---|---|
| `/jeeves later` (new) | Skips the next handover. This task's threshold moves up 10 points, never past the **cap**, with the warning again 5 points before. The cap is 90%, or 5 points below the session's auto-compaction point when that is lower; with auto-compaction off, the cap is 90% (`$.session.usage()` with a locally estimated breakdown gives `autoCompactThreshold` in tokens, no model call; read at each `later`, since a model switch moves it), so a postponed handover always comes before Claude Code compacts. Works in auto and explicit tasks; repeatable. At the cap the warning says `Jeeves hands over at 85% (now 80%); can't postpone further. /jeeves off to keep this conversation.` A rotation already under way is not stopped (`/jeeves pause` stays for that) |
| `/jeeves off` | Ends the current task (files kept) and stops auto-start for the rest of this session |
| `/jeeves on [goal]` | Always v0.2 behaviour: an **explicit** task. After `/jeeves off`, auto-start stays off for the session |
| `/jeeves defaults auto off` / `on` | This project, in the project's `config.json` (schema bump; v0.2 ignores the file as made by a newer Jeeves); `defaults clear` resets it |
| `/jeeves auto off` / `on` (new) | Everywhere: writes `auto.json` in Jeeves's state folder (never Claude settings). When the `/config` row is set to `on` or `off` and so takes precedence, it says so: `Saved, but /config → Auto-start is set to on, which takes precedence.` |
| `/config` → Jeeves → **Auto-start** (`autoStart`) | Choice row: `default`, `on`, `off`. `on`/`off` here win over `auto.json`. `default` resolves from `auto.json`; without that file it is on for fresh installs and off for upgraders (§5.6) |

Precedence: session, then project, then the `/config` row when set to `on`/`off`, then `auto.json`, then the fresh/upgrade default. `/jeeves status` names the source.

### 5.6 Upgrading from v0.2

An earlier install promised that nothing is recorded without `/jeeves on`. That promise is kept for those users:
- **Upgrader:** at the first v0.3 session start, the plugin store has `firstActivationShown`, or the state folder holds any project. Jeeves writes `auto.json` with `{ "default": "off", "reason": "upgraded from 0.2" }`, so the decision never changes by itself.
- They see one notice: `Jeeves can now watch long sessions by itself. Type /jeeves auto on to turn it on. Nothing changes until you do.`
- **Fresh install:** neither is present, so auto-start is on, with the first-run notice (§5.4).
- **Accepted gap:** someone who installed v0.2 but never activated it, or purged everything, looks like a fresh install and gets auto-start on. They may have read the v0.2 README promise. This is accepted because they still see the first-run notice before anything is recorded, and turning it off takes one command.
- Their tasks, defaults and settings are unchanged.
- **Changing `stateDir` later:** the new folder has no `auto.json`. The plugin-store key still marks the user as an upgrader, so the default stays off.

### 5.7 A `/clear` the user types

- **In an auto task,** it ends the task (DISABLED, files kept), and the next typed prompt starts a new auto task. The message: `Jeeves: task ended (new conversation); the next prompt starts a new one`.
- **In an explicit task,** it pauses as today: `Jeeves: paused (you cleared the conversation); /jeeves resume continues the task`.
- `/jeeves on <goal>` during an auto task turns it explicit (the goal becomes a `goal:` revision). Status shows `(auto)` or `(explicit)`.
- Jeeves's own `/clear` in a rotation is unaffected (ADR-010).

### 5.8 Interrupted sessions

- **Mid-rotation (HANDOVER_GENERATING … RESTORING):** an **auto** task recovers by itself, with a message, whatever `autoRecover` says. The user never asked for that rotation, so cleaning it up is not their job. It does so only in a session that passes the same gates as auto-start: interactive, full mode, a fresh conversation (§5.1 items 1, 2 and 5). Under `-p`, the SDK, assisted mode or in a resumed conversation it waits for such a session. A typed `/jeeves recover` still works anywhere, as today. An **explicit** task follows `autoRecover` as today.
- **Ended in MONITORING** (the session simply ended): the auto task is not resumed; the new session starts its own.

### 5.9 Cleanup

At session start, Jeeves deletes **auto** tasks that ended (DISABLED or COMPLETED, or MONITORING with no live lock) **without a single rotation**, 7 days after they ended (the state's last update, `updatedAt`, not its creation):
- through the existing purge code, under the resolved state folder (a custom `stateDir` included);
- with auto-start on or off;
- never touching explicit tasks or tasks with handovers.

This is the only write to task state at session start.

### 5.10 Privacy text

PRIVACY.md, README and the notices say:
- **Fresh installs:** for each auto-watched session, from the first typed prompt on, Jeeves records the same local state as today (task text, context readings, the redacted command and edit ledger, events), on this machine only, never the transcript.
- **Upgraders:** nothing changes until they type `/jeeves auto on`.

They also name the opt-out levels and the cleanup.

### 5.11 Downgrade

A v0.2 that meets v0.3 state:
- refuses those tasks with `SCHEMA_TOO_NEW` ("update Jeeves") and never rebuilds or overwrites them;
- ignores a v0.3 project `config.json`, and never reads `auto.json`.

No data is lost either way. The v0.3 release notes say so.

## 6. Making it feel like part of the day

These complete the experience. They may ship in v0.3.x if v0.3 needs to be smaller (§11).

### 6.1 A hint instead of silence

A session that is **not** auto-watched gets one hint when its context reaches the point where a watched session would be warned (threshold − 5). Text:

`Jeeves: this session is at 45%. /jeeves on would hand it over to a fresh conversation before it fills up. /jeeves auto off hides this.`

- When it appears: once per session, only for reason 3b (not turned on after an upgrade) and reasons 4–6 of §5.1. **Never after an explicit off at any level** (session, project, `/jeeves auto off`, the `/config` row), and never under `-p`.
- When it stops: after 3 hints in a row that were not followed by `/jeeves on` or `/jeeves auto on` (a plugin-store counter, reset when the user acts on one). The text ends with `/jeeves auto off hides this.`
- What it costs: no tokens, no files.
- Why it matters: it covers the 200K windows until Q8 is decided, and it is how most people will find out what Jeeves does.

### 6.2 Easy to trust, easy to undo

- The rotation line says how to get the old conversation back, which Claude Code keeps:
  `Jeeves: handover validated (goal: finish the CSV parser), starting fresh. Previous conversation: claude --resume <full session id>`.
- The full id is printed: `claude --resume` documents a session id or name, not a prefix. Jeeves already records the ending session's id in `sessions/NNN.json` at its own `/clear`.
- **Resuming the old conversation** is safe: it has turns, so it is not auto-watched, and it does not own the task (the lock moved to the fresh conversation at the rotation). There `/jeeves status` says the task belongs to another session, as for any other session today. No second conversation can drive the same task.
- **`/jeeves handover`** (new) shows the last handover: its file, the current goal, the first next actions, cut to the status width. Users can see what was carried over.

### 6.3 A quiet status line

- **In an auto task,** the status line stays empty until the context is within 15 points of the threshold. From there it shows `Jeeves 28%/40%` as today.
- **In an explicit task,** it shows from the start, as today.
- `/jeeves` always shows the full picture.

### 6.4 Auto tasks recover by themselves

Covered in §5.8.

### 6.5 `/jeeves` alone is the one command to remember

`/jeeves` with no arguments shows the status as today, plus:
- whether this session is watched and, if not, the reason (§5.1 order);
- one line with the 2–3 commands that make sense now: `later` and `off` during a warning; `resume` when paused; `retry` when a handover failed; `on` when not watched; `handover` after a rotation.

The 8-line limit holds. The commands line sits with the reason line and the warnings, which stay when lines give way.

## 7. Tokens and cost (honest version)

- **Watching:** no model calls. A session that never reaches the threshold costs what it would without Jeeves. While a task is active, one small system-prompt section (ADR-007, a few hundred characters) is added to each turn. The hint and the quiet status line cost nothing.
- **A rotation:**
  - one extra turn for the handover, plus the fresh conversation's starting context (34–57K tokens, R-15);
  - the old prompt cache is thrown away, so the first turns afterwards pay full input price until the new cache warms up.
- **What it may save:** each turn sends the whole conversation. Most of it is a cache read, billed at a fraction of normal input, but at 400–900K tokens per turn that fraction is still large; after a rotation it is about 50K. Rotation also avoids auto-compaction near the limit. Whether a rotation saves money depends on how many turns follow it; on short continuations it can cost more.
- **Not measured.** No savings claim goes into the README until AC-41 has run, and the wording then states what was measured, on which window, with cache effects included.

## 8. Written decisions this changes

| Item | Today | After |
|---|---|---|
| ADR-009 | "Nothing is automatic without opt-in (AC-03)"; a task starts with `/jeeves on` | Amendment A3: on fresh installs, installing is the opt-in; auto-start per §5; off per session, project or everywhere; upgraders keep the v0.2 promise until `/jeeves auto on` |
| AC-03 | No rotation without opt-in | No rotation unless the user typed `/jeeves on` or the session was auto-watched under §5.1; nothing recorded before the first typed prompt; never auto-watched for an upgrader who has not turned it on |
| ADR-003 | Six required headings | Seventh, Current goal (§5.3); v1 blocks valid for older tasks |
| Continuation | Original task, handover, next steps | User's words first, then Claude's summary, labelled (§5.3) |
| ADR-010 | User `/clear` pauses | Unchanged for explicit tasks; ends an auto task; a message for each (§5.7) |
| `autoRecover` | Off by default, all tasks | Unchanged for explicit tasks; auto tasks always recover by themselves (§5.8) |
| Commands | | `/jeeves later`, `/jeeves auto on/off`, `/jeeves defaults auto on/off`, `/jeeves handover`; `/jeeves` alone gains the reason and suggested commands |
| userConfig | `stateDir`, `autoRecover` | + `autoStart` (choice: default, on, off) |
| PRIVACY.md, README | Recording only after `/jeeves on` | §5.10 |
| Decision log | | New D-numbers: installing is the opt-in (fresh installs only); 1M windows first; auto tasks recover by themselves |

## 9. Acceptance criteria (draft)

| AC | Requirement | Layers |
|---|---|---|
| AC-35 | Fresh install, eligible session: the notice shows at `session.start`; the first `composer` prompt **in that same session** creates the auto task, word for word; nothing is written before it; every other origin kind never starts one (one test per kind) | U, I, E |
| AC-36 | Not eligible under `-p`/SDK, assisted, unsupported, outside git, 200K window (read at `session.start`, no task file written), resumed conversation; eligibility is decided once at `session.start` (a later switch to 1M does not start watching; the reason reads "200K window at start"); status shows the first reason in the §5.1 order and `(+N more)` when several apply | I |
| AC-37 | Near-threshold rule with its message, 3-turn grace period, and a model switch to a non-eligible window ending the auto task with its message | U, I |
| AC-38 | Opt-out levels and precedence (session, project, `/config` on/off, `auto.json`, default); `/jeeves auto on/off` writes only `auto.json` and says when the `/config` row overrides it; Claude settings never written; `/jeeves on` after `/jeeves off` gives an explicit task and auto stays off for the session | U, I |
| AC-39 | `/jeeves later` moves the threshold by 10, warns again, never past the cap (90%, or 5 points below the auto-compaction point when lower, auto-compaction off counted as no limit below 90%), says "can't postpone further" at the cap, works in auto and explicit tasks, does not stop a running rotation | U, I |
| AC-40 | User `/clear`: ends an auto task with its message; pauses an explicit task with its message; status shows auto/explicit | I |
| AC-41 | Live, non-Team account, haiku (1M window, seen in every M8 run). **1M fixture:** with and without Jeeves; reported: tokens and cost (cache reads included), number of rotations, pass/fail outcome (the fixture's checks pass after the last rotation). **200K: rotation rate and outcome, simulated window; cost compared on 1M only.** The 200K fixture runs with Jeeves only, under a test-only window override (`JEEVES_TEST=1` with `JEEVES_TEST_WINDOW_OVERRIDE=200000`, like the existing threshold override; never a user setting), so Jeeves applies the 50% rule and a ~100K threshold to a 1M session. Below 100K tokens the real window changes nothing, so the rotation rate and outcome match a real 200K window; what it cannot reproduce is the without-Jeeves baseline, which on a real 200K window would hit auto-compaction. Plus two rotations in auto mode with nothing typed but the task. The 200K result decides Q8; README cost wording covers 1M only | E |
| AC-42 | Current goal: required in new handovers with the §5.3 checks; v1 blocks valid for older tasks; continuation order puts the user's words first and labels the summary; the rotation line shows it; the summary never changes the task, DoD or checks | U, I |
| AC-43 | Upgrade: `firstActivationShown` or an existing project makes `auto.json` say off; never auto-watched until `/jeeves auto on` or the `/config` row; upgrade notice once; tasks, defaults and settings byte-identical after the first v0.3 session; fresh installs resolve to on; the `autoNoticeShown` and `firstActivationShown` keys are distinct | I |
| AC-44 | Cleanup deletes only ended auto tasks with no rotation, 7 days after they ended (`updatedAt`), under a custom `stateDir` too, with auto-start on or off; never explicit or rotated tasks | U, I |
| AC-45 | Downgrade: a v0.2 build (test kit) refuses v0.3 tasks with `SCHEMA_TOO_NEW`, ignores a v0.3 `config.json` and `auto.json`; nothing is rewritten | I, C |
| AC-46 | Auto tasks interrupted mid-rotation recover by themselves with a message, only in an interactive, full-mode, fresh session (they wait under `-p`/SDK, assisted, resumed); a typed `/jeeves recover` works anywhere; explicit tasks follow `autoRecover` | I |
| AC-47 | §6: the hint (once per session, only for reason 3b and reasons 4–6, never after an explicit off at any level, stops after 3 unanswered hints, ends with "/jeeves auto off hides this", no task files), the full resume id and a resumed old conversation that cannot drive the task, the rotation line's `claude --resume` id, `/jeeves handover`, the quiet status line in auto tasks, `/jeeves` alone with reason and suggested commands within 8 lines | U, I |

All existing AC keep passing. The I-layer suite runs twice: once with `autoStart` off (v0.2 behaviour kept), once with it on.

## 10. Open questions

| # | Question | Proposal |
|---|---|---|
| Q1 | Default for upgraders | Off, `/jeeves auto on` to turn it on; on for fresh installs (§5.6) |
| Q2 | Folders without git | Git work trees only, subfolders and linked worktrees included (§5.1) |
| Q3 | Cleanup age | 7 days, fixed |
| Q4 | `/clear` in an auto task | End it, with a message (§5.7) |
| Q5 | Current goal for all tasks | Yes, user's words first (§5.3) |
| Q6 | Setting name | Auto-start, key `autoStart` |
| Q7 | Who runs AC-41, on which non-Team account, and when | **Open: the one blocker to approval.** It blocks AC-41, Q8 and the README cost wording. Needs an owner and a date. Cost recomputed from current haiku prices (2026-11-08): about US$4–16 for the three runs, most likely US$7–8; proposed budget US$20 (§11.1). (The 200K window question is settled: simulated, AC-41) |
| Q8 | Auto-start on 200K windows | Off at first; widen only if AC-41's simulated 200K fixture shows an acceptable rotation rate with a passing outcome. "Acceptable" is set by the maintainer before the run |

## 11. Rough size

- **§5 (core):** about 5 engineer-days:
  - the notice and store key
  - the auto/explicit origin with its state migration, the defaults schema bump and `auto.json`
  - eligibility at `session.start`, with the model-switch, near-threshold and grace rules
  - opt-out levels, status reasons and their order
  - `/jeeves later` and `/jeeves auto`
  - the Current goal heading and continuation order
  - `/clear` messages, auto-recovery for auto tasks, cleanup
  - privacy and README text
  - the I-layer suite in both modes, downgrade tests
- **§6 (polish):** about 2 days more: hint, rotation line, `/jeeves handover`, quiet status line, `/jeeves` alone.
- **Live E run (AC-41):** about US$4–16, most likely US$7–8 (§11.1); the earlier US$0.50–1.00 is withdrawn. The test-only window override is a few lines next to the existing threshold override.

If v0.3 must be smaller, §6.1 (hint) and §6.5 (`/jeeves` alone) ship first among the polish, since they decide whether people who are not auto-watched ever see Jeeves.

### 11.1 AC-41 cost estimate (Q7)

**Prices** (Claude Haiku 5.5, `claude-haiku-5-5`, the model of every M8 run; platform.claude.com/docs/en/about-claude/pricing, read 2026-11-08), US$ per million tokens:

| Prompt | Input | Cache write 5 min | Cache write 1 h | Cache read | Output |
|---|---|---|---|---|---|
| up to 100K tokens | 0.10 | 0.125 | 0.20 | 0.01 | 0.50 |
| over 100K tokens | 0.50 | 0.625 | 1.00 | 0.05 | 2.50 |

The tier is set per request by the whole prompt, cache reads included: every call above 100K pays the higher prices on all its tokens. US-only inference (`inference_geo`) adds 10%.

**Model** (an estimate, not a measurement; script kept out of the repo, its rules are these):
- Each model call re-reads the whole context from the cache, writes the new tokens (`g` per call) to the cache and produces 500–2,000 output tokens (thinking included). A fresh conversation starts at 50K (R-15) and writes it once. A handover is one extra call at the threshold with 3K output.
- **1M fixture:** 800K tokens of work. With Jeeves: 50K → 400K, rotation, 50K → 400K, rotation, 50K → 150K, done. Without Jeeves: the same work in one conversation, 50K → 850K.
- **200K fixture (simulated):** the same 800K of work, rotating at 100K (50% of a 200K window), about 15 rotations. Every call stays near or below the 100K price line, so it is cheap.
- Range: `g` from 10K down to 2.5K tokens per call (80 to 320 calls per 800K), 5-minute or 1-hour cache writes.

| Run | Low (`g` 10K, 5 min) | Likely (`g` 5K, 5 min) | High (`g` 2.5K, 1 h, 2K output) |
|---|---|---|---|
| 1M with Jeeves (auto mode, two rotations) | 1.36 | 2.24–2.75 | 5.28 |
| 1M without Jeeves | 2.34 | 4.22–4.79 | 9.41 |
| 200K simulated, Jeeves only | 0.32 | 0.40–0.52 | 0.92 |
| **Total** | **≈ 4.0** | **≈ 6.9–8.1** | **≈ 15.6** |

**Reading it:**
- The calls between 400K and 850K dominate the without-Jeeves run: each pays 5× the per-token prices of a call below 100K, and a 600K call's cache reads alone cost US$0.03. The model predicts the with-Jeeves run at roughly half the baseline. This is a prediction under the stated rules, not a result; it stays out of the README until AC-41 has measured it (§7).
- Before the run, read the 1M session's `autoCompactThreshold`: if 850K is above it, the baseline compacts, which AC-41 reports as part of its outcome (and which lowers its cost).
- The "two rotations in auto mode with nothing typed but the task" are the with-Jeeves 1M run, not a fourth run.
- Not checked: Claude Code's real per-call growth and cache-write duration on this fixture, and whether the account bills in dollars or against a plan's usage limits.

**Proposed budget:** US$20 for all three runs, stopping if the first run (1M with Jeeves) passes US$8, since then the high case is being exceeded.

## 12. Revisions

**Revision 2 (review 1):**
- 1M windows first, with real threshold numbers in all texts
- off for upgraders
- resumed and near-threshold sessions not watched, plus a grace period
- `/jeeves later`
- the user's words before Claude's goal summary, with tags defined
- a visible message for each `/clear` outcome
- `/jeeves on` after `/jeeves off` defined
- cleanup described
- downgrade
- AC-41 with outcome and two window sizes
- caching wording in the cost section
- "plugin prompt" defined by origin kind
- 5 days

**Revision 3 (review 2):**

| Review point | Change |
|---|---|
| The marker made the first session do nothing | The notice at `session.start` comes before any recording, so the same session is watched; the store key only stops repeats (§5.4, AC-35) |
| Window known too late; model switches | Window read at `session.start` from the model setting, so no task file on 200K; a switch to a non-eligible window ends the auto task with a message (§5.1, AC-36, AC-37) |
| Near-threshold stop was silent | One-line message (§5.2) |
| `/jeeves later` had no end | "Can't postpone further" at 90% (§5.5, AC-39) |
| Upgrader gap; marker names | Gap stated and accepted; v0.2's marker is the plugin-store key `firstActivationShown`, the new one is `autoNoticeShown` (revision 2 wrongly placed it in the state folder) (§5.6, AC-43) |
| Status reason order | Unfixable first, then fixable ones, easiest first (§5.1) |
| One-command opt-in for upgraders | `/jeeves auto on/off` writes `auto.json`; the `/config` row's `default` resolves from it (§5.5, §5.6) |
| Suggest instead of silence | Hint at threshold − 5 for fixable non-watched sessions (§6.1) |
| Trust and undo | `claude --resume <id>` in the rotation line; `/jeeves handover` (§6.2) |
| Status line only when it matters | Quiet until 15 points before the threshold in auto tasks (§6.3) |
| `/jeeves` as the one command | Reason and suggested commands (§6.5) |
| `autoRecover` for auto tasks | Auto tasks recover by themselves (§5.8, AC-46) |
| Q7 | Still open, marked as the one blocker (§10) |

**Revision 4 (review 3):**

| Review point | Change |
|---|---|
| The hint nagged people who turned it off | Only for reason 3b (upgrade default) and 4–6, never after an explicit off at any level, stops after 3 unanswered hints, ends with "/jeeves auto off hides this" (§6.1, AC-47) |
| Auto-recovery without auto-start's gates | Only in an interactive, full-mode, fresh session; otherwise waits; typed `/jeeves recover` works anywhere (§5.8, AC-46) |
| `/jeeves later` could pass auto-compaction | Cap is 90% or 5 points below the auto-compaction point, read from `$.session.usage()` with no model call (§5.5, AC-39) |
| `/jeeves auto` silently overridden | Says when the `/config` row takes precedence (§5.5, AC-38) |
| AC-41 may not be runnable | Haiku's 1M window confirmed from M8 runs; the 200K fixture's model or setting and the cost are now preconditions of Q7; the old estimate withdrawn (AC-41, Q7, §11) |
| Resume id | Full id (prefixes are not documented); the id is already recorded at Jeeves's own `/clear`; a resumed old conversation can't drive the task (§6.2, AC-47) |
| Wording: "the one write at session start" | "The only write to task state at session start", other writes named (§5.2, §5.9) |
| One-line reason could mislead | `(+N more)` (§5.1, AC-36) |
| Switch from 200K to 1M | Eligibility decided once at `session.start`; reason "200K window at start" (§5.1, AC-36) |
| Cleanup age undefined | 7 days after the task ended (`updatedAt`) (§5.9, AC-44) |
| Scope | Design frozen; further ideas go to §13 |

**Editorial fixes (review 4, no design change):** auto-compaction off means a 90% cap, now said in §5.5 as in AC-39; the R-25 re-check's ending message (§5.1); AC-41's 200K fixture uses a test-only simulated window for rotation rate and outcome, cost compared on 1M only, so Q7 shrinks to the cost recomputation plus an owner and a date.

## 13. v0.3.x ideas (not in this spec)

New ideas go here, not into a new revision.

- A setting for the cleanup age (Q3), if someone asks.
- Widening auto-start to 200K windows, once AC-41 has decided Q8. If it does, that release's live run includes one auto-started 200K session, to check the real eligibility path end to end; AC-41's 200K fixture starts with `/jeeves on` and deliberately skips it (maintainer, 2026-11-08: the rotation rate and outcome don't depend on how the task started, and forcing auto-start would bend D-42 in the test kit).
