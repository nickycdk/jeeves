# Spec: Auto-start (installing Jeeves is the opt-in)

**Status:** Draft for review. No plan or code yet. · **Date:** 2026-11-08 · **Target:** v0.3 (after v0.2.0 is public) · **Changes:** ADR-009, AC-03, PRIVACY.md, README (see §7) · **Relates to:** FR-05, FR-11, ADR-003, ADR-010, R-03, R-15, R-25.

## 1. Goal

Jeeves should feel like part of the normal Claude Code day: install it once, start `claude`, work. Long tasks hand over to a fresh conversation by themselves, with no command to remember per task. People who don't want it in a session, a project or at all can turn it off in one step.

## 2. Why

Today a user must type `/jeeves on` before each task. Two problems:
- **They forget.** The sessions that need Jeeves most are long tasks that started as small ones, where nobody typed `/jeeves on` at the start.
- **The user says yes twice.** Installing a session-continuity plugin already says "I want this". Asking again per task adds friction and no safety.

## 3. Not in scope

- Turn mode for Team accounts (separate spec, `team-accounts-turn-mode.md`). Auto-start stays off wherever Jeeves is unsupported.
- Changing how a rotation works (boundary, handover checks, `/clear`, continuation). Auto-start changes only **when a task starts** and **what happens around it**.
- Any network use, telemetry or new dependency.

## 4. Today (v0.2.0)

- A task starts only with `/jeeves on [goal]`. With a goal, that text is the task. Without one, the next prompt you type is saved word for word as `task-rev-001.md` (FR-05).
- With no task, Jeeves records nothing (PRIVACY.md: state is stored only for managed tasks; README and the first-activation notice say so).
- Settings: `stateDir` and `autoRecover` in `/config`; per project `/jeeves defaults threshold|check|clear` (M8).
- A `/clear` you type during a task pauses it (`PAUSED(USER_CLEAR)`, ADR-010); `/jeeves resume` continues it.
- One warning 5 points before the threshold, then the handover. The threshold is 40% above a 200K window, else 50%.
- Watching costs no tokens: the context reading is local, with no model call.

## 5. Proposed behaviour

### 5.1 When a session is watched

A session is auto-watched when **all** of these hold:
1. The session is interactive (`session.start`: `isInteractive` true). `claude -p`, the SDK and background agents are never auto-watched.
2. Jeeves is in `full` mode. Not in `assisted` mode, where a handover needs the user to run `/clear` by hand, which would nag. Not when `unsupported` (old version, or the R-25 skip).
3. Auto-start resolves to on (§5.5).
4. This session does not already own a task (an explicit or recovered one).

### 5.2 Lazy start: nothing until the first prompt

Session start writes nothing. The task is created at the **first prompt the user types** (`prompt.submit`, origin `composer`, not a slash command), exactly like today's capture after `/jeeves on`. A session the user opens and closes without typing leaves no files. The status line shows `Jeeves ?/40%` from that first prompt on.

### 5.3 What "the task" is in an auto task

The first prompt is still saved word for word as `task-rev-001.md`; FR-05 holds. But in auto mode that prompt is often vague ("look at this bug") and the work drifts. So:
- The task is marked `origin: auto` (state field, schema version bump with migration; v0.2 tasks read as `explicit`).
- Every handover, for every task, gains one required heading, **Current goal**: one or two tagged bullets saying what the work is now, in Claude's words. The parser keeps accepting v1 blocks without it for tasks that started before the upgrade.
- The continuation prompt leads with the current goal, then the original first prompt (labelled as such), then the rest as today.

### 5.4 What the user sees

- **First time on a machine** (replaces today's first-activation notice, once per machine):
  `Jeeves watches long sessions. At 40% context it saves a handover and continues in a fresh conversation.`
  `/jeeves off stops it for this session. /config turns it off everywhere.`
- **Status line** from the first prompt: `Jeeves 12%/40%`, as today.
- **Before each handover** (the existing warning, 5 points before), new text:
  `Jeeves hands over at 40% (now 35%). /jeeves off to keep this conversation.`
- Nothing else changes. Rotation lines, held prompts and status stay as they are.

### 5.5 Turning it off: three levels

| Level | How | Effect |
|---|---|---|
| This session | `/jeeves off` | Ends the current task (files kept, as today) **and** stops auto-start for the rest of this session. `/jeeves on` turns it back on |
| This project | `/jeeves defaults auto off` (or `on`) | Stored in the project's `config.json` (M8 defaults); `defaults clear` resets to the global value |
| Everywhere | `/config` → Jeeves → **Start by itself** (new boolean `userConfig` row `autoStart`, default **true**) | No auto-start anywhere unless a project says `auto on` |

Precedence: session over project over global. `/jeeves status` names the source (`auto: on (default)`, `auto: off (this project)`, `auto: off (this session)`).

### 5.6 `/jeeves on` while auto-watched

- `/jeeves on <goal>` with an auto task running: keeps the task, adds the goal as a task revision (`goal: …`), and marks it `explicit`. No second task.
- `/jeeves on` with no goal and an auto task running: says it is already on and how to add a goal.
- With auto-start off, `/jeeves on [goal]` works exactly as today.

### 5.7 A `/clear` the user types

In an **auto** task, a user-typed `/clear` most often means "new topic". It **ends** the auto task (DISABLED, files kept), and the next typed prompt starts a new auto task. In an **explicit** task it pauses as today (`PAUSED(USER_CLEAR)`, `/jeeves resume`). Jeeves's own `/clear` during a rotation is unaffected (ADR-010).

### 5.8 Interrupted sessions

- An auto task left mid-rotation (crash during HANDOVER_GENERATING … RESTORING) is named at the next session start, exactly as today (`/jeeves recover`, or by itself with `autoRecover`). Auto-start waits until that is answered or the user types a normal prompt, which starts a new auto task and leaves the old one for `/jeeves recover`.
- An auto task left in plain MONITORING (the session just ended) is not resumed. It was a past conversation; the new session starts its own task.

### 5.9 Cleanup

Auto-watching creates one task per session that gets a prompt, so the state folder grows. At session start, Jeeves deletes **auto** tasks that ended (DISABLED or COMPLETED, or MONITORING with no live lock) **without a single rotation** and are older than 7 days, through the existing purge code. Explicit tasks and tasks with handovers are never deleted by themselves. `/jeeves purge` stays for everything else.

### 5.10 Privacy text

PRIVACY.md, README and the first-run notice change from "nothing is recorded without `/jeeves on`" to: Jeeves records, for each watched session from your first prompt on, the same local state as today (task text, context readings, the redacted command and edit ledger, event log), on this machine only, never the transcript. It can be turned off per session, per project or everywhere (§5.5). Cleanup per §5.9.

## 6. Tokens and cost

- **Watching:** no model calls. A session that never reaches the threshold costs the same as without Jeeves. One small system-prompt section (completion rules, ADR-007) is added while a task is active; it is a few hundred characters.
- **A rotation:** one extra turn for the handover, plus the fresh conversation's starting context (about 34–57K input tokens observed, R-15).
- **What it saves:** every turn re-sends the whole conversation (cached or not). Continuing from 40% to 90% of a 1M window means turns of 400–900K tokens; after a rotation, about 50K. It also replaces auto-compaction near the limit, which has its own summary call.
- **Not measured.** The README must not claim savings until the comparison in AC-41 has run.

## 7. Written decisions this changes

| Item | Today | After |
|---|---|---|
| ADR-009 | "Nothing is automatic without opt-in (AC-03)"; a task starts with `/jeeves on` | Amendment A3: installing is the opt-in; auto-start per §5.1–§5.7, off per session, project or globally |
| AC-03 | No rotation without opt-in | No rotation in a session where auto-start resolved to off and no `/jeeves on` was typed; nothing recorded before the first typed prompt |
| PRIVACY.md, README | Recording only after `/jeeves on` | §5.10 |
| ADR-003 | Six required handover headings | Seventh, **Current goal**; v1 blocks still accepted for older tasks |
| ADR-010 | User `/clear` pauses the task | Unchanged for explicit tasks; ends an auto task (§5.7) |
| userConfig | `stateDir`, `autoRecover` | + `autoStart` (default true) |
| Decision log | | New D-number for "installing is the opt-in" |

## 8. Acceptance criteria (draft)

| AC | Requirement | Layers |
|---|---|---|
| AC-35 | Fresh install, interactive session: no file until the first typed prompt; then one auto task with that prompt word for word; slash commands and plugin prompts never start one | U, I, E |
| AC-36 | No auto-start in `-p`/SDK, assisted, unsupported (version or R-25 skip) | I |
| AC-37 | Opt-out levels and precedence (§5.5), shown in status; `/jeeves off` stops auto-start for the session only | U, I |
| AC-38 | User `/clear`: ends an auto task and the next prompt starts a new one; pauses an explicit task as in v0.2 | I |
| AC-39 | Handover "Current goal" required for new handovers, v1 accepted for older tasks; the continuation leads with it | U, I |
| AC-40 | Cleanup deletes only ended auto tasks with no rotation older than 7 days; never explicit or rotated tasks | U, I |
| AC-41 | Live (non-Team account, haiku): two rotations in auto mode with nothing typed but the task; plus a cost comparison of one long fixture task with and without Jeeves, both numbers in the evidence | E |
| AC-42 | Upgrade from v0.2: existing tasks, defaults and settings unchanged; the first session after the update shows the first-run notice once | I |

All existing AC keep passing. The I-layer suite runs once with `autoStart` false to prove v0.2 behaviour is kept.

## 9. Open questions for the review

1. **Default for people upgrading from 0.2.** On by default (consistent) or off until they turn it on (no surprise for existing users)? Proposal: on, with the first-run notice once after the update.
2. **Folders without git.** Auto-watch any folder, or only git repositories (handover checks are weaker without git)? Proposal: git repositories only; `/jeeves on` still works anywhere.
3. **Cleanup age.** 7 days, configurable, or none at all?
4. **`/clear` in auto mode** (§5.7): end the task (proposal) or pause as in explicit tasks?
5. **"Current goal" for explicit tasks too?** Proposal: yes, one handover format for all.
6. **Name of the setting:** "Start by itself" / `autoStart`?
7. **Live testing** needs a Claude account outside a Team organization (R-25, Q-12). Whose, and when?

## 10. Rough size

M–L, about 3–4 engineer-days:
- session-start and capture changes, with the origin flag and migration
- opt-out levels and status
- the handover heading and continuation order
- `/clear` handling
- cleanup
- privacy and README text
- I-layer tests in both modes
- one live E run with the cost comparison (about US$0.30–0.60, haiku, non-Team account)
