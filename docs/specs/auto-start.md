# Spec: Auto-start (installing Jeeves is the opt-in)

**Status:** Draft, revision 2 (review 1 applied, §11). No plan or code yet. · **Date:** 2026-11-08 · **Target:** v0.3 (after v0.2.0 is public) · **Changes:** ADR-009, AC-03, ADR-003, ADR-010, PRIVACY.md, README (§7) · **Relates to:** FR-05, FR-11, ADR-007, R-03, R-15, R-19, R-25.

## 1. Goal

Jeeves should feel like part of the normal Claude Code day: install it once, start `claude`, work. Long tasks hand over to a fresh conversation by themselves, with no command to remember per task. Anyone who doesn't want it in a session, a project or at all can turn it off in one step. Nobody who installed an earlier version has their privacy terms changed without saying yes.

## 2. Why

Today a user must type `/jeeves on` before each task. They forget, and the sessions that need Jeeves most are long tasks that started small. Installing a session-continuity plugin already says "I want this"; asking again per task adds friction and no safety.

## 3. Not in scope

- Turn mode for Team accounts (`team-accounts-turn-mode.md`). Auto-start stays off wherever Jeeves is unsupported.
- How a rotation works (boundary, handover checks, `/clear`, continuation), except the continuation's order (§5.3).
- Network use, telemetry, new dependencies.

## 4. Today (v0.2.0)

- A task starts only with `/jeeves on [goal]`. With a goal, that text is the task; without one, the next prompt typed at the terminal (origin `composer`) is saved word for word as `task-rev-001.md` (FR-05).
- With no task, nothing is recorded (PRIVACY.md, README, first-activation notice).
- Settings: `stateDir`, `autoRecover` in `/config`; per project `/jeeves defaults threshold|check|clear`.
- A user-typed `/clear` pauses a task (`PAUSED(USER_CLEAR)`, ADR-010).
- One warning 5 points before the threshold. The threshold is 40% above a 200K window (about 400K tokens on 1M), else 50% (about 100K on 200K).
- A fresh conversation starts at about 34–57K tokens (R-15).
- v0.2 refuses state with a newer schema (`SCHEMA_TOO_NEW`: "update Jeeves") and never rebuilds it; a `config.json` with an unknown field is "unreadable" and ignored.

## 5. Proposed behaviour

### 5.1 When a session is auto-watched

All of these must hold:
1. **Interactive**: `session.start` has `isInteractive` true. Never under `claude -p`, the SDK or background agents.
2. **Full mode**: not assisted (a handover would need the user to `/clear` by hand), not unsupported (old version or the R-25 skip).
3. **A git repository**: the session's folder is inside a git work tree. Subfolders and linked worktrees count; each worktree is its own project, as today. Elsewhere, `/jeeves on` still works.
4. **A large window**: the model's context window is above 200K tokens (1M models) at the first reading. On 200K windows a fresh conversation already fills 17–28% of the window, so with a 50% threshold a rotation would come after only about 45–65K tokens of work. Auto-start stays off there until AC-41 has measured how often it rotates (§9 Q8). `/jeeves on` works on any window, as today.
5. **A fresh conversation**: `$.session.turns()` is 0 at `session.start`. A resumed conversation (`claude --resume`, `--continue`) already has context, possibly near the threshold, so it is not auto-watched; `/jeeves on` still works.
6. **Auto-start on** (§5.5), and the first-run notice already shown (§5.4).
7. This session owns no task yet.

When a session is not auto-watched, `/jeeves status` says why in one line, for example `auto: off (not a git repository)`, `auto: off (200K window)`, `auto: off (resumed conversation)` or `auto: off (this project)`.

### 5.2 Lazy start, and the near-threshold rule

- Session start writes no task. The cleanup in §5.9 is the only write at session start.
- The task is created at the **first prompt typed at the terminal**: origin kind `composer`, not a slash command. Prompts with any other origin kind (`bridge`, `sdk`, `task-notification`, a plugin's `$.prompt.submit`, any other) never start an auto task; a test checks each origin kind.
- **Near-threshold rule.** If the first reading after the task is created is within 10 points of the threshold (the same margin as the POSSIBLE_LOOP check), for example a large CLAUDE.md or a pasted log, the auto task ends at once (DISABLED, files kept). Status then says `auto: off (context already at 34%)`. No rotation can fire in a conversation the user never saw start small.
- **Grace period.** An auto task never rotates in its first 3 main turns, whatever the reading.

### 5.3 What "the task" is, and who said it

The first prompt is saved word for word as `task-rev-001.md` (FR-05 holds). The task is marked `origin: auto` or `explicit`, which needs a state schema bump with a migration; v0.2 tasks read as `explicit`.

Every new handover, for every task, has a seventh required heading, **Current goal**: 1 or 2 bullets, each tagged `[verified]`, `[inferred]` or `[unknown]` as in the other headings, each at most 300 characters. The parser checks the heading is present, the bullet count, the tags and the length. Redaction and the secret check apply, as everywhere. v1 handover blocks without the heading stay valid for tasks created before the upgrade.

The continuation prompt puts **the user's own words first**:
1. the original task and every `goal:`, `dod`, `check` revision, labelled "the user's words";
2. then the current goal, labelled "Claude's summary at the last handover (may be wrong)";
3. then the rest as today.

The summary is data, never instructions (R-19). It cannot change the task, the DoD or the checks. Text read from files or tools that ends up in it stays below the user's words.

The rotation line shows the current goal (cut to one line), so the user can spot drift: `Jeeves: handover validated (goal: finish the CSV parser), starting fresh`.

### 5.4 What the user sees, and when

- **First-run notice, before anything is recorded.** On fresh installs it shows at the first `session.start` where §5.1 would apply. A marker file is written when it is shown. No auto task is created in a session where the marker was absent at `session.start`, so the notice always comes first; that session starts watching from the next session on, or at once with `/jeeves on`. Text, with the threshold that applies:
  `Jeeves watches long sessions here. At 40% context (~400K tokens) it saves a handover and continues in a fresh conversation.`
  `/jeeves later postpones one handover, /jeeves off stops it for this session, /config turns it off.`
- **Upgraders** (see §5.6) get a different notice and no auto task until they turn it on.
- **Status line** from the first prompt: `Jeeves 12%/40%`, as today.
- **Warning before each handover** (5 points before, as today), with the real numbers:
  `Jeeves hands over at 40% (now 35%). /jeeves later to postpone, /jeeves off to keep this conversation.`

### 5.5 Postpone and turn off

| Command or setting | Effect |
|---|---|
| `/jeeves later` (new) | Skips the next handover only. The threshold for this task moves up by 10 points (not past 90%), with the warning again 5 points before. Works in any task, auto or explicit; repeatable. A rotation already under way is not stopped; that stays `/jeeves pause` |
| `/jeeves off` | Ends the current task (files kept, as today) and stops auto-start for the rest of this session |
| `/jeeves on [goal]` | Always v0.2 behaviour: an **explicit** task from the goal or the next typed prompt. After `/jeeves off`, auto-start stays off for this session; the user is in manual control until the session ends |
| `/jeeves defaults auto off` / `on` | This project. Stored in the project's `config.json` with a schema bump (v0.2 then says it was made by a newer Jeeves and ignores it); `defaults clear` resets it |
| `/config` → Jeeves → **Auto-start** (`autoStart`) | Everywhere. A choice row: `default` (on for fresh installs, off for upgraders, §5.6), `on`, `off`. Jeeves never writes Claude settings; the user changes this row |

Precedence: session over project over global. `/jeeves status` names the source (`auto: on (default)`, `auto: off (this project)`, `auto: off (this session)`).

### 5.6 Upgrading from v0.2

An earlier install promised that nothing is recorded without `/jeeves on`. That promise is kept for those users:
- **Upgrader**: the state folder already has the first-activation marker or any project at the first v0.3 session start. For them, `default` resolves to **off**. Jeeves records a machine-level note (`auto.json` in the state folder) so the decision does not change later.
- They see a one-time notice: `Jeeves can now watch long sessions by itself. To turn it on: /config → Jeeves → Auto-start → on. Nothing changes until you do.`
- **Fresh install**: no marker and no project. `default` resolves to on, with the first-run notice (§5.4) before any task.
- Their tasks, defaults and settings are unchanged.

### 5.7 A `/clear` the user types

- In an **auto** task, a user-typed `/clear` ends it (DISABLED, files kept); the next typed prompt starts a new auto task. Jeeves says so: `Jeeves: task ended (new conversation); the next prompt starts a new one`.
- In an **explicit** task it pauses as today, and says so: `Jeeves: paused (you cleared the conversation); /jeeves resume continues the task`.
- `/jeeves on <goal>` during an auto task turns it explicit (the goal becomes a `goal:` revision). Status shows `Task: … (explicit)` or `(auto)`, so the user can see which `/clear` rule applies.
- Jeeves's own `/clear` in a rotation is unaffected (ADR-010).

### 5.8 Interrupted sessions

- An auto task left mid-rotation (HANDOVER_GENERATING … RESTORING) is named at the next session start, as today (`/jeeves recover`, or by itself with `autoRecover`). A normal prompt instead starts a new auto task and leaves the old one for `/jeeves recover`.
- An auto task left in MONITORING (the session simply ended) is not resumed; the new session starts its own.

### 5.9 Cleanup

- At session start, Jeeves deletes **auto** tasks that ended (DISABLED or COMPLETED, or MONITORING with no live lock) **without a single rotation** and older than 7 days. It uses the existing purge code, under the resolved state folder (a custom `stateDir` included).
- This is the one write at session start. It runs whether auto-start is on or off, so turning auto-start off still cleans up what it left.
- Explicit tasks and tasks with handovers are never deleted by themselves.

### 5.10 Privacy text

PRIVACY.md, README and the notices say:
- **For fresh installs:** Jeeves records, for each auto-watched session from the first typed prompt on, the same local state as today (task text, context readings, the redacted command and edit ledger, events), on this machine only, never the transcript.
- **For upgraders:** nothing changes until they turn auto-start on.

Both describe the opt-out levels and the cleanup.

### 5.11 Downgrade

- A v0.2 that meets v0.3 state refuses those tasks with `SCHEMA_TOO_NEW` ("update Jeeves") and never rebuilds or overwrites them.
- A v0.3 project `config.json` is likewise refused and ignored ("defaults unreadable", `defaults clear` resets it).
- v0.2 tasks are not touched by v0.3 until a v0.3 session writes them, which happens only after the migration in §5.3.
- No data is lost either way. The v0.3 release notes say so.

## 6. Tokens and cost (honest version)

- **Watching:** no model calls. A session that never reaches the threshold costs what it would without Jeeves. While a task is active, one small system-prompt section (ADR-007, a few hundred characters) is added to each turn.
- **A rotation:**
  - one extra turn for the handover, plus the fresh conversation's starting context (34–57K tokens, R-15);
  - the prompt cache of the old conversation is thrown away, so the first turns afterwards pay full input price until the new cache warms up.
- **What it may save:** each turn sends the whole conversation. Most of it is a cache read, billed at a fraction of normal input, but at 400–900K tokens per turn that fraction is still large; after a rotation it is about 50K. Rotation also avoids auto-compaction near the limit, which has its own summary call. Whether a rotation saves money depends on how many turns follow it; on short continuations it can cost more.
- **Not measured.** No number or claim about savings goes into the README until AC-41 has run, and the wording then states what was measured, on which window, with cache effects included.

## 7. Written decisions this changes

| Item | Today | After |
|---|---|---|
| ADR-009 | "Nothing is automatic without opt-in (AC-03)"; a task starts with `/jeeves on` | Amendment A3: on fresh installs, installing is the opt-in; auto-start per §5.1–§5.7; off per session, project or globally; upgraders keep the v0.2 promise until they turn it on |
| AC-03 | No rotation without opt-in | No rotation unless the user typed `/jeeves on` or the session was auto-watched under §5.1; nothing recorded before the first typed prompt; never auto-watched for an upgrader who has not turned it on |
| ADR-003 | Six required headings | Seventh, Current goal, as defined in §5.3; v1 blocks valid for older tasks |
| Continuation | Original task, handover, next steps | The user's words first, then Claude's summary, labelled (§5.3) |
| ADR-010 | User `/clear` pauses | Unchanged for explicit tasks; ends an auto task, with a message for each (§5.7) |
| Commands | | `/jeeves later`; `/jeeves defaults auto on/off` |
| userConfig | `stateDir`, `autoRecover` | + `autoStart` (choice: default, on, off) |
| PRIVACY.md, README | Recording only after `/jeeves on` | §5.10 |
| Decision log | | New D-numbers: installing is the opt-in (fresh installs only); 1M windows first |

## 8. Acceptance criteria (draft)

| AC | Requirement | Layers |
|---|---|---|
| AC-35 | Fresh install, interactive, git repo, 1M window: the first-run notice appears before any task is written; from then on no task file until the first `composer` prompt, which is saved word for word; every other origin kind never starts one (one test per kind) | U, I, E |
| AC-36 | No auto-watch under `-p`/SDK, assisted, unsupported, outside git, on a 200K window, or in a resumed conversation (`turns() > 0`); status names the reason for each | I |
| AC-37 | Near-threshold rule and the 3-turn grace period: an auto task never rotates in a conversation that started within 10 points of the threshold or in its first 3 turns | U, I |
| AC-38 | Opt-out levels, precedence and status sources; `/jeeves on` after `/jeeves off` gives an explicit task and auto stays off for the session | U, I |
| AC-39 | `/jeeves later` moves the threshold by 10 (cap 90), warns again, works in auto and explicit tasks, does not stop a running rotation | U, I |
| AC-40 | User `/clear`: ends an auto task with its message; pauses an explicit task with its message; status shows auto/explicit | I |
| AC-41 | Live, non-Team account, haiku: **two fixtures, one per window (200K and 1M)**, each run with and without Jeeves. Reported: tokens and cost (cache reads included), number of rotations, and a **pass/fail outcome** (the fixture's checks pass after the last rotation). Plus two rotations in auto mode with nothing typed but the task. The 200K result decides whether auto-start widens to 200K windows (Q8) | E |
| AC-42 | Current goal: required in new handovers with the checks in §5.3; v1 blocks valid for older tasks; the continuation order puts the user's words first and labels the summary; the rotation line shows it; text in the summary never changes the task, DoD or checks | U, I |
| AC-43 | Upgrade: an upgrader is never auto-watched until `autoStart` is set to on, and sees the upgrade notice once; their tasks, defaults and settings are byte-identical after the first v0.3 session; fresh installs resolve `default` to on | I |
| AC-44 | Cleanup deletes only ended auto tasks with no rotation, older than 7 days, under a custom `stateDir` too, with auto-start on or off; never explicit or rotated tasks | U, I |
| AC-45 | Downgrade: a v0.2 build (test kit) refuses v0.3 tasks with `SCHEMA_TOO_NEW` and ignores a v0.3 `config.json`; nothing is rewritten | I, C |

All existing AC keep passing. The I-layer suite runs twice: once with `autoStart` off (v0.2 behaviour kept), once with it on.

## 9. Open questions

| # | Question | Proposal (after review 1) |
|---|---|---|
| Q1 | Default for upgraders | **Off**, with a notice that says how to turn it on; on for fresh installs (§5.6) |
| Q2 | Folders without git | Git work trees only, subfolders and linked worktrees included; status explains why a session isn't watched (§5.1) |
| Q3 | Cleanup age | 7 days, fixed; configurable only if someone asks |
| Q4 | `/clear` in an auto task | End it, with a visible message (§5.7) |
| Q5 | Current goal for all tasks | Yes, one format, with the user's words first (§5.3) |
| Q6 | Setting name | **Auto-start**, key `autoStart` |
| Q7 | Who runs AC-41, on which non-Team account, and when | **Must have an owner and a date before this spec is approved**: it blocks AC-41 and Q8 |
| Q8 | Auto-start on 200K windows | Off at first. Widen only if AC-41's 200K fixture shows an acceptable rotation rate with a passing outcome. "Acceptable" is set by the maintainer before the run |

## 10. Rough size

About **5 engineer-days**:
- notices and the marker
- the auto/explicit origin with its state migration, and the defaults schema bump
- opt-out levels and status reasons
- the resume, near-threshold and grace rules
- `/jeeves later`
- the Current goal heading and continuation order
- `/clear` messages
- cleanup
- privacy and README text
- the I-layer suite in both modes
- downgrade tests on the v0.2 kit
- one live E run with two fixtures (about US$0.50–1.00, haiku, non-Team account)

## 11. Revision 2: what changed after review 1

| Review point | Change |
|---|---|
| 200K windows rotate too often; fixed "40%" text | Auto-start only above 200K at first (§5.1 item 4, Q8); notices show the threshold that applies (§5.4) |
| Upgrade default breaks the privacy promise; notice timing | Off for upgraders, on for fresh installs (§5.6, AC-43); notice always before the first auto task, enforced by a marker (§5.4) |
| Resumed sessions and near-threshold starts | Not auto-watched when `turns() > 0`; near-threshold rule and 3-turn grace (§5.1 item 5, §5.2, AC-37) |
| Only a drastic way out at the warning | `/jeeves later` (§5.5, AC-39) |
| Current goal moves authority to Claude; tags undefined | User's words first, summary labelled and data-only, shown in the rotation line; tags and parser checks defined (§5.3, AC-42) |
| `/clear` has two invisible meanings | A message for each, and auto/explicit shown in status (§5.7, AC-40) |
| `/jeeves on` after `/jeeves off` ambiguous | Always an explicit task; auto stays off for the session (§5.5) |
| Cleanup is a write at session start | Said, runs with auto on or off, respects `stateDir` (§5.9, AC-44) |
| Downgrade path | §5.11, AC-45 |
| AC-41 lacked outcome and window sizes; caching wording | Two fixtures, pass/fail outcome, rotation count (AC-41); §6 rewritten with cache effects |
| "Plugin prompt" not testable | Defined by origin kind; one test per kind (§5.2, AC-35) |
| Estimate tight | 5 days (§10) |
