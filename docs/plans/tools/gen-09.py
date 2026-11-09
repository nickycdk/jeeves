# Regenerates docs/plans/09-v0.3-auto-start-plan.md from the numbered plans (02-07). Run from the repo root: python3 -I docs/plans/tools/gen-09.py
# Its own sections (header, 1, 5, 8, 10) are written here; edit them here, never in 09 directly.
import sys
r=lambda p: open('docs/plans/'+p).read()
e03=r('03-epics.md'); s04=r('04-backlog-stories.md'); m05=r('05-delivery-milestones.md'); a06=r('06-test-and-acceptance-plan.md'); d07=r('07-risks-and-open-questions.md'); a02=r('02-architecture-and-adrs.md')
epics=e03[e03.index('## E13'):e03.index('---\n\n## P1 / P2 backlog')].rstrip().replace('\n## E1','\n### E1')
epics='#'+epics if epics.startswith('## ') else epics
stories=s04[s04.index('## E13 — Auto-start (v0.3)'):s04.index('---\n\n**Count:** 56')].rstrip()
stories=stories.replace('## E1','### E1').replace('\n### ST-','\n#### ST-')
count=[l for l in s04.split('\n') if l.startswith('**M9 (v0.3) count:**')][0].replace('**M9 (v0.3) count:**','**Count:**')
L=lambda t,pfx:[l for l in t.split('\n') if any(l.startswith(x) for x in pfx)]
m9=L(m05,['| **M9**'])[0]
acs='\n'.join(L(a06,['| AC-%d |'%i for i in range(35,48)]))
fx='\n'.join(L(a06,['| `long-task`','| `autostart`']))
v03=L(a06,['**v0.3 (M9, D-40):**'])[0]
dec='\n'.join(L(d07,['| D-40','| D-41','| D-42','| D-43','| D-44','| D-45','| D-46']))
risks='\n'.join(L(d07,['| R-26','| R-27']))
qs='\n'.join(L(d07,['| Q-13','| Q-14']))
a3=L(a02,['- **Amendment A3'])[0]
a010=L(a02,['- **Amendment A2 (2026-11-09, ST-13.7'])[0].replace('- **Amendment A2','- **ADR-010 Amendment A2',1)
a003=L(a02,['- **Amendment A1 (2026-11-09, ST-13.6'])[0].replace('- **Amendment A1','- **ADR-003 Amendment A1',1)
# Progress, read from each story's Status line in 04, so it never goes stale: "Solved (date)" is done, anything else is not.
import re
rows=[]
for m in re.finditer(r'^### (ST-1[345]\.\d+) (.+?) — ([SML])\n((?:- .*\n?)*)', stories.replace('\n#### ST-','\n### ST-'), re.M):
    st=re.search(r'^- \*\*Status:\*\* (Solved \([\d-]+\))', m.group(4), re.M)
    rows.append(f"| {m.group(1)} | {m.group(2)} | {m.group(3)} | {'**done**, ' + st.group(1) if st else 'not started'} |")
done=sum('**done**' in r for r in rows)
progress=f'''**Progress** ({done} of {len(rows)} stories done; built from the Status lines in 04, so regenerate after each story):

| Story | Name | Size | State |
|---|---|---|---|
'''+'\n'.join(rows)
out=f'''# 09 — v0.3 plan: auto-start

**Date:** 2026-11-09 · **Spec:** `docs/specs/auto-start.md` (revision 4, approved, D-40) · **Milestone:** M9 · **Status:** in progress: ST-13.1 … ST-13.9, ST-15.1, ST-14.1 … ST-14.4 solved (see the progress table in §4; current handover `docs/plans/handoff-m9.md`); next ST-14.5; Q-13 and Q-14 decided (D-44, D-45). Review 1 of the plan applied (gate wording for a reduced E14, ST-15.2 preconditions, dry run, stop rules and fixture sizing, the estimate checked against M4, Q-14, story fixes) and review 2 (once-per-install upgrade check, same macOS user for every AC-41 run, `/cost` polled in both 1M runs, gate items split).

This file gathers the whole v0.3 plan in one place. The same text lives in the numbered plans (02 ADR-009 A3, ADR-003 A1, ADR-010 A2, 03 E13–E15, 04 ST-13.1 … ST-15.3, 05 M9, 06 AC-35 … AC-47, 07 D-40 … D-43, R-26, R-27, Q-13, Q-14); when they differ, the numbered plans win and this file is updated. Story DoD and epic DoD are the standard ones in 03 and 04.

## 1. Goal and scope

Install Jeeves once, start `claude`, work: on a fresh install, a session that qualifies hands long tasks over to a fresh conversation by itself, with no command per task. Anyone can turn it off per session, project or everywhere in one step. Upgraders from v0.2 keep the promise that nothing is recorded without opt-in until they turn it on. People who are not auto-watched get a hint when it would help.

- **In v0.3:** spec §5 (E13) and §6 (E14, may move to v0.3.x), the AC-41 live measurement and the v0.3.0 release (E15).
- **Not in v0.3:** auto-start on 200K windows (Q8, decided by AC-41 against the bar set in D-45); Team accounts (turn mode, `docs/specs/team-accounts-turn-mode.md`); a setting for the cleanup age; any network use or telemetry; new runtime dependencies.

## 2. Written decisions

{a3}

{a003}

{a010}

{dec}

## 3. Epics

{epics}

## 4. Stories

Implement top to bottom. Sizes: **S** ≤ 0.5 day, **M** 1–2 days, **L** 3–4 days.

{progress}

{stories}

{count}

## 5. Order and parallel work

- **Critical path:** ST-13.1 → ST-13.2 → ST-13.3 → ST-13.4 → ST-13.7 → ST-13.9 → ST-15.2 → ST-15.3. ST-15.1 joins after ST-13.3.
- **After ST-13.1, in parallel:** ST-13.5 (`later`), ST-13.6 (Current goal), ST-13.8 (cleanup).
- **E14 is off the critical path:** ST-15.2 depends on E13 and ST-15.1 only, since nothing in E14 changes cost, rotation rate or outcome. E14 runs alongside: ST-14.1, ST-14.2 after ST-13.3; ST-14.3, ST-14.4 after ST-13.6; ST-14.5 after ST-13.4. Only ST-15.3 (release) waits for it.
- **If v0.3 must be smaller:** ST-14.1 (hint) and ST-14.2 (`/jeeves` alone) ship first among E14; the rest moves to v0.3.x, and the M9 gate then reads as in §6.

## 6. Milestone

| M | Name | Stories | Est. | Gate (all required) | Demo |
|---|---|---|---|---|---|
{m9}

## 7. Acceptance criteria

{v03}

| AC | Requirement (short) | Primary test(s) | Layer | Evidence |
|---|---|---|---|---|
{acs}

New fixtures (06 §2):

| Fixture | Contents | Used by |
|---|---|---|
{fx}

## 8. AC-41: preconditions, cost and stop rules

- **Preconditions** (ST-15.2): every run uses the same macOS user, in fresh-install state before the dry run; a real interactive `claude` driven through a pseudo-terminal (`tests/pty/ptylib.py`, as in M4–M8), never `-p` or the SDK; a git work tree; a fresh conversation; a fresh-install state (a macOS user on which Jeeves was never activated, logged in to a non-Team account, and a scratch `JEEVES_STATE_DIR` with no project). If any is missing, auto-start does not start and the run measures nothing. The once-per-install upgrade check (ST-13.2) keeps the 200K run's `/jeeves on` and project from turning that user into an upgrader, and the 1M auto run repeats the dry run's first-run-notice check before it spends anything.
- **Dry run first** (AC-35 E, about one prompt): the first-run notice and the auto task appear; it also measures tokens and cost per call, and the estimate is redone before any paid run.
- **Estimate** (spec §11.1, Claude Haiku 5.5 prices read 2026-11-08; the 5× price for prompts over 100K re-read on the page): about US$9–35, most likely about US$29. M4 gate run 5 grew only about 1.3K tokens per model call (51 calls for 64K), which multiplies the call count; the first estimate assumed 2.5–10K and was about 4× too low. The per-call pricing matched that run within about 17%.
- **Fixture sizing:** about 1M tokens of work, so two rotations (about 750K needed) have margin; AC-41 needs at least one rotation, reports the count, and two is the target. The run without Jeeves then reaches auto-compaction, which it reports as its outcome. The 200K run uses only the first modules (about 250–300K of work, 4–5 rotations): Q8 needs a rate and an outcome, not the whole fixture.
- **Stop rules:** per-run caps of US$1 (dry run and 200K), US$14 (1M with Jeeves), US$25 (1M without), and a hard total of US$40. Runs go cheapest first. Spend is read from `/cost` every 10 minutes in both 1M runs (a local command, no model call, so the auto run stays "nothing typed but the task") and from Jeeves's session records at each rotation.
- **The 200K fixture starts its task with `/jeeves on`** (maintainer, 2026-11-08). Q8 needs its rotation rate and pass/fail outcome, and neither depends on how the task started. The near-threshold rule applies only to a new task's first reading and never after a rotation; the grace period covers the first 3 turns, when context is small. Forcing auto-start would bend D-42 in the test kit. Both rules are tested in I.
- **For later:** if AC-41 widens auto-start to 200K windows, that release's live run includes one auto-started 200K session, to check the real eligibility path end to end (spec §13).
- **Who, which account, when (D-44):** the maintainer logs in a non-Team, dollar-billed account (Console API key preferred, Pro or Max as fallback) on the separate macOS user; the agent builds the fixture and driver, runs everything and writes `RESULT.md`; target 2026-11-20, after E13 and ST-15.1. The maintainer's own account is a Team account (R-25, Q-12).
- **Q8's bar (D-45), set before the run:** the outcome passes; median growth between rotations ≥ 40K tokens and none under 20K; no loop or review stops and at most one handover retry; no repeated work. All four met: 200K auto-start proposed for v0.3.x; any missed: it stays off.

## 9. Risks

| ID | Risk | L | I | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
{risks}

Existing risks that E13–E15 touch: R-03 (handover misses context), R-15 (cost per rotation), R-19 (prompt injection), R-25 (Team accounts).

## 10. Open items

| # | Question | Why it matters | Resolution path | Owner | Needed by |
|---|---|---|---|---|---|
{qs}

- **Before M9 starts:** v0.2.0 is public (D-37 lifted by the maintainer).
'''
open('docs/plans/09-v0.3-auto-start-plan.md','w').write(out)
