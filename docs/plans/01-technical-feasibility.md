# 01 — Technical Feasibility

All facts below are tagged:

- **[V-LIVE]** observed in a live spike on Claude Code 2.1.319 (evidence: `evidence/spike-01-mod-rotation/`, and for S-02…S-06 `evidence/s-0N-*/RESULT.md`).
- **[V-TYPES]** stated in the engine-written mod API declarations for 2.1.319 (`claude-code.d.ts`, written by the binary itself, ~23K lines; the header says *"EARLY ACCESS: this surface may change between releases without notice"*).
- **[V-DOCS]** stated in official docs (code.claude.com/docs), checked 2026-11-07.
- **[ASSUMPTION]** believed but not verified; each has a spike or test that retires it.
- **[UNKNOWN]** not known; listed with a resolution plan.

## 1. Environment examined

| Item | Value |
|---|---|
| Claude Code | 2.1.319 (native install, `~/.local/bin/claude`; 2.1.316–2.1.319 present) |
| OS | macOS (Darwin 23.6.0) |
| Node | 22.22.0 (only needed for dev tooling; mods run in the engine's own sandboxed JS environment, no Node) |
| Mod tooling | `claude plugin validate`, `claude plugin test` present [V-LIVE] |
| Mods availability | On by default from v2.1.286 (admin page) / v2.1.287 (overview page) — docs disagree by one patch [V-DOCS] |

## 2. Verified capabilities (what the plan relies on)

### 2.1 Context measurement (FR-02, AC-04, AC-06)

- `$.session.usage()` → `{ startedAt, context: { tokens?, window, percent?, breakdown? }, rateLimits, cost }` [V-TYPES]. `percent` is "`tokens` over `window` as a whole percentage … (the status line's `used_percentage`)". Optional fields are "left out, never zeroed" [V-TYPES].
- `session.measure` fires "after each main-thread turn, and when a rate-limit window moves a whole point"; usage is pushed, not polled [V-TYPES]. Fired in every spike run [V-LIVE].
- Immediately after `/clear`, `percent` and `tokens` are absent (logged as `null`), then 3% after the first reply [V-LIVE]. A missing value never appears as 0.
- `used_percentage` counts input tokens only (input + cache creation + cache read) from the most recent API response; it is measured against the model's full window, not the compaction window [V-DOCS statusline, model-config].
- Rate limits are a separate field (`rateLimits`) [V-TYPES]: context and quota cannot be confused if the code reads only `context.percent`.
- Main conversation only: `session.measure` is main-thread [V-TYPES]. Whether `context` ever reflects a subagent request is not stated in the docs [ASSUMPTION → test T-INT-03 asserts the reading does not move during a subagent run].
- Window observed: 1,000,000 tokens for `claude-haiku-5-5` [V-LIVE]. Baseline after `/clear` with a heavily customised user config: ~34K tokens; first session of a process: ~57K [V-LIVE].

### 2.2 Safe boundary (FR-04, AC-07)

- `classic.Stop` is hookable from a mod; its input includes `stop_hook_active`, `last_assistant_message`, `background_tasks` (running/pending/backgrounded work: shells, subagents, monitors, workflows) and `session_crons`; base fields include `session_id` and `permission_mode` [V-TYPES][V-LIVE].
- Returning `{ block: reason }` keeps Claude working in the same turn with `reason` as the instruction [V-TYPES][V-LIVE]. Stop hooks can continue a turn at most 8 times in a row before Claude Code overrides the block (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` raises it) [V-DOCS].
- Stop fires only when the main turn ends: no tool call is executing and no permission prompt is open at that moment (prompts happen inside tool calls). Subagent ends raise `SubagentStop`, not `Stop` [V-DOCS].
- `turn.complete` carries `reason: 'answer' | 'aborted' | 'refusal' | 'error'` and `agentId` for subagent turns [V-TYPES]. A user interrupt is distinguishable (`aborted`).
- `$.agent.list()` returns subagents/teammates with `status` [V-TYPES].
- `$.session.append({ message: { type: 'user', content } })` adds a hidden user row that a running turn reads "from the loop's next top" [V-TYPES]. This allows a soft "wrap up now" nudge mid-turn without interrupting a tool. Appended from a `tool.call` hook, it made Haiku end the turn with **0** further tool calls in 5/5 trials; the row comes back `isMeta: true` and is not shown as typed [V-LIVE S-03].
- With background work in flight, Stop's `background_tasks` lists each item with `type` (`shell`, `subagent`, …), `status`, `description`, plus `command` (shell) or `agent_type` (subagent) [V-LIVE S-02]. Each finished background job starts a new main turn by itself, so a deferred rotation is re-checked at the next Stop without polling [V-LIVE S-02]. `$.agent.list()` lags: a finished subagent shows `completed`, then disappears [V-LIVE S-02].
- Stop does not fire for a turn the user interrupts (Esc) [V-LIVE S-04, incidental].

### 2.3 Fresh conversation (FR-08, AC-10)

- `$.command.run({ command, args })` "runs a slash command as if the person typed `/command args` … queued and run once the session is idle" [V-TYPES]. Running the built-in `clear` worked [V-LIVE]. That a plugin may invoke `/clear` is **not stated in the docs** [V-DOCS: not documented] — the live result plus the type contract are the evidence, and compatibility tests must re-check it on every supported version.
- `/clear`: "Start a new conversation with empty context" [V-DOCS]. `session.end` fires with `reason: 'clear'`; "the process goes on under a new session id, and no `session.start` fires for it" [V-TYPES][V-LIVE].
- The new conversation had no earlier messages (model answer: "NONE … only the /clear command record and session-start hook output") [V-LIVE].
- Preserved across `/clear` [V-LIVE]: model (`claude-haiku-5-5`), permission mode (`acceptEdits` given by flag), cwd, MCP tools (model listed `mcp__claude-in-chrome__*`), the user's own SessionStart hooks (ran again).
- Also preserved across a plugin-invoked `/clear` [V-LIVE S-04]: `--add-dir` directories (read again with no prompt), permission modes `default` and `plan` (as well as `acceptEdits`), and session crons (still in `session_crons`, and CronList lists them in the fresh conversation). On 2.1.319 the Bash permission dialog has **no** "for this session" option (`Yes` once · `always allow … from this project`, saved to disk · `switch to auto mode`), so there is no session-only grant to lose [V-LIVE S-04].
- `$.session.usage().cost.usd` resets to 0 at `/clear` (per conversation) [V-LIVE S-04]. `classic.SessionStart` input has no `permission_mode` [V-LIVE S-04].
- A queued `$.command.run('clear')` waits while a modal dialog (`/model`) is open and runs as soon as it closes (16 s delay observed, no error) [V-LIVE S-06].
- `--resume`/`--continue`/fork are never used.

### 2.4 Context injection and continuation (FR-09, AC-11)

- `classic.SessionStart` fires for mods with `source: 'clear'` and the new `session_id` [V-LIVE]. Returning `additionalContext` puts text in the new conversation's context [V-LIVE] ("String added to Claude's context at the start of the conversation, before the first prompt" [V-DOCS]).
- `$.prompt.submit({ text })` queues a prompt that "starts a turn of its own once the session is idle"; the model reads it framed as a message from the named plugin unless `asUser: true` [V-TYPES][V-DOCS]. It started the continuation turn with no keystroke [V-LIVE].
- `initialUserMessage` (SessionStart) is documented only for `-p` mode [V-DOCS]. **Not used.**
- Size limit for SessionStart `additionalContext` in a mod is not documented. Measured: 4K, 12K and 30K characters arrived intact (model quoted first/last lines; exact text in the transcript; no "saved to file" preview) [V-LIVE S-05]. The 10,000-character cap documented for settings command hooks does not apply to a mod on 2.1.319. The same 30K appended to a `$.prompt.submit` `text` also arrived intact [V-LIVE S-05]. A prompt's hook-attached `context` is cut beyond 100,000 characters [V-TYPES].
- `$.prompt.submit` does **not** accept `context` (`PromptSubmitArgs` omits it: "`context` the hooks' to attach"); passing it is silently ignored at runtime [V-TYPES][V-LIVE S-05 run 1]. `claude plugin validate` did not flag this; `tsc` against the engine's types did.
- `$.command.run('clear')` can resolve while other plugins' `classic.SessionStart` hooks are still running. A mod must read its rotation state **before** `await next(e)` in that hook [V-LIVE S-05 run 1].
- Draft handover instruction (1,578 chars) via Stop `block`: 10/10 first-try parses, 0 untagged bullets, 1.7–2.9K chars per handover on a small task [V-LIVE S-05].
- A prompt typed while a rotation is queued arrives at `prompt.submit` with `origin.kind: 'composer'`, no `turnId`, `wait: false`. `{ drop }` stops it and the engine shows "Prompt dropped by a hook: <reason>", **but the dropped text stays in the prompt box** as the draft [V-LIVE S-06].

### 2.5 Compaction (SPIKE-04)

- `session.compact` hook can return `{ skip: reason }`; triggers include `/compact`, the threshold, a plugin, and "ahead of time" (`precompute`) [V-TYPES]. Manual `/compact` was skipped with the hook's reason shown [V-LIVE].
- PreCompact settings hooks can block auto-compaction (exit 2) [V-DOCS].
- Default auto-compaction triggers near the model's limit (~967K on 1M models) [V-DOCS]; users can lower it (`CLAUDE_CODE_AUTO_COMPACT_WINDOW`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, `/autocompact`) [V-DOCS].
- **Conclusion:** compaction can be controlled, but blocking it at the real limit would cause a context-overflow error. Policy (ADR-006): skip `precompute` only while a managed task is active; let threshold compaction happen; record `COMPACTED` and rotate at the next safe boundary.

### 2.6 Deterministic facts (FR-06, FR-07, AC-09)

- `$.process.run(argv, { cwd, timeoutMs })` runs a host command without a shell; "Git runs with repo hooks off" [V-TYPES]. `git status --porcelain=v1 --branch` ran without a permission prompt [V-LIVE].
- `tool.call` hooks see every tool call and its result (`isError`, Bash command, Edit/Write paths) [V-TYPES] → an evidence ledger of commands, exit status and edited files is possible without trusting model text.
- `$.fs`: `read` (≤ 4 MiB), `write` (whole file, creates dirs), `list`, `exists`, `stat` (with `realPath`), `ancestors`. **No rename, delete, append or fsync** [V-TYPES].
- `$.store`: JSON key/value across sessions, ≤ 4 MiB total [V-TYPES].
- `$.env.get(name)` reads environment variables (literal names only) [V-TYPES].
- A naive read-modify-write append lost two log lines when two hooks wrote at once [V-LIVE, run 2]. Serialising writes through one promise chain fixed it [V-LIVE, run 3]. This shapes the storage design. (All S-02…S-06 spike mods used the serialised writer; no lines were lost.)
- `$.process.run(['mkdir', dir])` → exit 0, then exit 1 ("File exists") on a second call (atomic lock); `mv -f tmp target` → exit 0; neither asked for permission; `$.fs.write` creates missing parent dirs [V-LIVE S-06].
- A `--plugin-dir` mod gets no per-plugin data dir: `CLAUDE_PLUGIN_DATA`, `CLAUDE_PLUGIN_ROOT` and `XDG_STATE_HOME` are unset in `$.env`; `$.plugin.root` is the plugin folder itself [V-LIVE S-06]. Installed command-hook plugins do get `CLAUDE_PLUGIN_DATA=~/.claude/plugins/data/<plugin>-<marketplace>` in their shell environment (seen incidentally in S-02); whether an *installed* mod sees it is untested (M6).

### 2.7 UI and commands (FR-11, FR-14, §4.2–4.3)

- `$.command.register({ name, description, argumentHint, immediate })`; a built-in's name is refused [V-TYPES]. `$.command.list()` lists existing commands (collision check).
- `$.ui.status(text)` (status line entry), `$.ui.toast(text)`, `$.ui.log(text)`, `$.ui.notify(text)`; `AbovePrompt` band via `ui.render` [V-TYPES].
- Plugins cannot ship a `statusLine` setting [V-DOCS] — so SessionRelay cannot overwrite the user's status line, satisfying FR-17 by construction. `$.ui.status` renders on its own line under the prompt as `⚠ <plugin-name>: <text>`, directly above an unchanged custom `statusLine` [V-LIVE S-06]. The `⚠ <name>:` prefix is the engine's; status text should not repeat the name.
- `userConfig` fields become `/config` rows and are passed to `register` as `options` [V-TYPES ref].

### 2.8 Errors (FR-12, AC-23)

- `StopFailure` classic event carries `error` ∈ `authentication_failed | oauth_org_not_allowed | account_on_hold | verification_required | billing_error | rate_limit | overloaded | invalid_request | model_not_found | server_error | unknown | max_output_tokens | cloud_credential_error` [V-TYPES].
- `turn.complete` reason `error` / `refusal` [V-TYPES].

### 2.9 Distribution

- Install: `/plugin install <mod> --marketplace <owner>/<repo>` or `claude plugin install …`; a repo becomes a marketplace with `.claude-plugin/marketplace.json` [V-DOCS][V-TYPES ref].
- Org controls that can stop SessionRelay: `allowManagedModsOnly`, `allowManagedHooksOnly`, `disableAllHooks`, `disableSideloadFlags` [V-DOCS]. Detect and explain (FR-01).
- Plugin directory submission requires README and LICENSE, recommends an icon [V-LIVE `claude plugin validate`].
- Naming: "you can't use the Claude Code or Anthropic names or logos as part of your own product, feature, or company name" [V-DOCS legal].

## 3. PRD spikes — results

| Spike | Question (short) | Result | Evidence |
|---|---|---|---|
| SPIKE-01 | Mod starts fresh native conversation + continues without input, TUI intact | **PASS** (PTY; Cursor manual run pending → S-01) | run-3 log, §2.3–2.4 |
| SPIKE-02 | External supervisor restarting interactive `claude` via PTY | **Not needed** — Path A passed; not pursued (ADR-001) | — |
| SPIKE-03 | Inject continuation, detect new session ID | **PASS** — `additionalContext` + `prompt.submit`; new ID in `classic.SessionStart.session_id` and `$.session.id()` | run-3 log |
| SPIKE-04 | Control compaction | **PASS (manual trigger live; auto documented)** — policy in ADR-006 | run-3 log, §2.5 |
| SPIKE-05 | Safe events for pausing after tool batch incl. subagents | **PASS** — `classic.Stop` + `background_tasks` + `turn.complete.reason`; non-empty background case exercised live in S-02 | §2.2, S-02 |
| SPIKE-06 | What carries over to the new session | **PASS** — model, modes (default/acceptEdits/plan), cwd, MCP, hooks, add-dirs, session crons carried; no session-only permission grant exists on 2.1.319 | run-3 log, S-04 |
| SPIKE-07 | Few-step marketplace install without overwriting statusline | **PASS (docs)** — one-line install; plugins cannot set `statusLine`. Coexistence rendering → S-06 | §2.7, §2.9 |

## 4. Remaining spikes (M0; each ≤ 1 day)

Each spike reuses the spike mod and PTY driver in `evidence/spike-01-mod-rotation/` and must store a log + note under `docs/plans/evidence/<spike>/`.

| ID | Goal | Method | Pass criterion | Fallback if it fails |
|---|---|---|---|---|
| **S-01** | Rotation in **Cursor's integrated terminal** | Install spike mod via `--plugin-dir`, run the scripted manual checklist (06 §6) in Cursor on macOS; record screen | Rotation completes; typing, resize, Ctrl+C, Esc, a permission prompt, Unicode all behave normally before/after | None needed for terminal fidelity (the process is never wrapped); a failure here would be a Claude Code bug → report upstream, block release claim AC-02 |
| **S-02** | Behaviour with work in flight | Spike prompt starts `sleep 60 &` (background Bash) and a background subagent; arm rotation | Stop shows non-empty `background_tasks`; mod defers; rotation happens only after they finish; no orphan process after rotation | Treat any background task as unsafe and pause (already the default policy) |
| **S-03** | Soft quiesce mid-turn | During a long multi-tool turn, cross threshold, `$.session.append` a "finish the current step and stop" note | Model ends the turn within ≤ 3 further tool calls in ≥ 4/5 runs | Rely on Stop only (correct, just later); document |
| **S-04** | What `/clear` keeps | Start with `--add-dir`, grant a "this session" permission, enter plan mode, create a session cron; rotate | Record each as kept / lost | Lost add-dirs/permissions are safe (no escalation) but cause prompts → document; plan mode lost → re-enter via `/plan`? record; crons → treat as unsafe boundary |
| **S-05** | Handover size + parse reliability | 10 runs on fixture task at varied lengths; measure `additionalContext` delivery of 4K/12K/30K chars; parse success | 12K chars delivered intact; first-try parse ≥ 9/10, within 2 retries 10/10 | Put handover in `prompt.submit` text instead of `additionalContext`; tighten template |
| **S-06** | Status display coexistence + queued input | With the user's custom `statusLine`, call `$.ui.status`; type a prompt while rotation is queued; open a modal dialog during rotation | Status visible without replacing user's line; typed prompt observable at `prompt.submit` (origin composer) during rotation; record whether a dialog delays queued `/clear` | Use `AbovePrompt` band / toasts only; hold typed prompt as designed |

S-02…S-06 can run in one day with one driver session each, using `--model haiku` (each run costs a few cents of the user's plan).

### 4.1 Results (2026-11-07, Claude Code 2.1.319, Haiku, PTY driver)

| ID | Result | Key evidence | Fallback adopted |
|---|---|---|---|
| S-01 | **PARTIAL, accepted by maintainer (D-14)** | Two rotations in Cursor's terminal, new sid each, continuation ran unprompted, mode kept. Checks 1/4/5 (typing mid-turn, permission prompt, Unicode reply) not evidenced in the log: covered by PTY evidence; must be shown in Cursor in ST-9.2 (`evidence/s-01-cursor/RESULT.md`) | None; gap moved to ST-9.2 |
| S-02 | **PASS** (1 run) | Stop listed a running `subagent` and `shell`; mod deferred twice; rotated only at an empty Stop; no `sleep` process left | None |
| S-03 | **PASS** (5/5, 1 run) | 0 further tool calls after the hidden note in every trial | None |
| S-04 | **PASS** (2 runs) | add-dir, modes, crons kept; no session-only Bash grant exists | None; ADR-004 amended (crons no longer block) |
| S-05 | **PASS** (size 2 runs, parse 1 run) | 4K/12K/30K intact via `additionalContext` and via prompt text; parse 10/10 first try | None; ADR-003 channel confirmed |
| S-06 | **PASS** (1 run) | Status coexists; typed prompt held and delivered; dialog delays `/clear` until closed; no per-plugin data dir for `--plugin-dir` mods | None; ADR-010 amended (clear the draft), ADR-005 confirmed |

Total spend for S-02…S-06: 7 model-calling PTY runs on Haiku, well under US$1. Each spike's `RESULT.md` holds the cost note.

## 5. Assumptions register

| ID | Assumption | Retired by | Status |
|---|---|---|---|
| A-01 | `$.command.run('clear')` keeps working on later 2.1.x builds | Compatibility suite T-COMPAT on each supported version; startup capability probe | Open (re-confirmed on 2.1.319 in every S-0x run) |
| A-02 | `context.percent` reflects only the main conversation | T-INT-03 | Open (S-02 saw the reading unchanged at 6% while a subagent ran, but the subagent was too short to count) |
| A-03 | Model follows the Stop-block handover instruction and emits the sentinel block | S-05, T-E2E-01 | **Retired for format [V-LIVE S-05]**: 10/10 first try on Haiku. Quality on long tasks/other models stays with T-E2E-01 |
| A-04 | `mv` and `mkdir` via `$.process.run` run without permission prompts like `git` did | M1 story ST-1.4 integration test | **Retired [V-LIVE S-06]**; ST-1.4 keeps the integration test |
| A-05 | `$.store`/files under the chosen state root are writable from the mod sandbox | ST-1.3 | Partly: `$.fs.write` to a scratch dir worked, nested dirs created [V-LIVE S-06]; OS state root itself untested → ST-1.3 |
| A-06 | Haiku-based spike results hold for Opus/Sonnet (mechanisms are model-independent; only handover quality differs) | E2E on default model in M7 | Open |
| A-07 | Hidden user rows via `$.session.append` reach the model mid-turn | S-03 | **Retired [V-LIVE S-03]**: 5/5, 0 further tool calls |
| A-08 | A plugin can rely on `claude plugin validate` to catch API misuse | — | **False [V-LIVE S-05]**: it does not type-check. CI must run `tsc` with the engine's types (ST-1.1) |

## 6. Unresolved questions (need maintainer input or upstream answers)

1. **Plugin-invoked `/clear` is undocumented.** It works and is part of the typed contract, but Anthropic could restrict it. Ask upstream (GitHub issue/discussion) to confirm it is a supported use before v0.1 marketing. Until then the README states the dependency.
2. **Mods are early access.** Accept the churn risk? (Recommended: yes, with version pinning and probes.)
3. **Default threshold on 1M-window models.** 50% of 1M = 500K tokens, which many users would consider too late. Keep 50% (PRD constraint) but surface "≈ N K tokens" in `/relay status` and docs. Maintainer to confirm.
4. **Minimum supported Claude Code version.** Verified: 2.1.319. Docs say mods exist since 2.1.286/287. Recommendation: support `>= 2.1.319` at launch, widen only after the compatibility suite passes on older builds.
5. **Plugin data directory.** Is there a documented per-plugin data dir for mods (the env shows `CLAUDE_PLUGIN_DATA` for command-hook plugins)? If yes, prefer it; else use the OS-standard path in ADR-005. **Partly answered [V-LIVE S-06]:** a `--plugin-dir` mod gets none, so ADR-005's OS path stands. Re-check an installed (marketplace) mod in M6.
6. ~~What does `/clear` keep?~~ **Answered [V-LIVE S-04]** (§2.3). ~~SessionStart `additionalContext` size limit?~~ **Answered up to 30K [V-LIVE S-05]** (§2.4).
