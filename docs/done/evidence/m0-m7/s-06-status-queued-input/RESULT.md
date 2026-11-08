# S-06 — Status coexistence, queued input, dialogs, data dir

**Result: PASS** (1 run) with two design notes for ST-4.4 · **Date:** 2026-11-07 · **Claude Code:** 2.1.319 · **macOS:** Darwin 23.6.0 · **Model:** `claude-haiku-5-5` · **Story:** ST-0.6

## Method

- Spike mod `mod/`:
  - Sets `$.ui.status(...)` at start and after each rotation.
  - At `turn.complete` it queues a rotation that runs 8 s later: `/clear`, then `$.prompt.submit`. The delay leaves a window for typing.
  - While a rotation is queued, a `prompt.submit` with origin `composer` (not a slash command) is answered `{ drop: "Held by SessionRelay — will be delivered to the fresh session" }`, stored, and appended to the continuation prompt (ADR-010).
  - A start-up probe logs candidate data-dir env vars and `$.plugin.root`. It also runs `mkdir` twice and `mv` once through `$.process.run` in a scratch dir (A-04).
- Driver `drive_s06.py`, one session with the user's real custom `statusLine` (from user settings, not modified):
  - (A) Send `ONE`; while rotation 1 is queued, type `TYPED-DURING-ROTATION: please reply with the word HELD-OK` + Enter.
  - (B) Send `TWO`; while rotation 2 is queued, open `/model` and leave the dialog open for 20 s past the rotation's due time, then press Esc.
- Files: `events.jsonl`, `driver.log`, `screen-excerpts.txt`. Excerpts are whitespace-squashed because the TUI places text with cursor moves; the quota line is removed.

## Pass criteria (01 §4)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Status visible without replacing the user's line | **PASS** | One frame shows `⚠ relay-spike-s06: SR-STATUS: relay spike monitoring 42%` on its own line under the prompt, then the user's status line (`🤖 Haiku 5.5 \| 💪 medium \| 🧠 0% \| 💰 …`) unchanged. Same after rotation with `… 3%` |
| 2 | Typed prompt observable at `prompt.submit` (origin `composer`) during rotation | **PASS** | `prompt.held {origin:"composer", command:null, turnId:null, wait:false, rotating:true}` 3 s after `rotation.queued`; the engine showed "Prompt dropped by a hook: Held by SessionRelay — …"; the continuation delivered it (`heldDelivered: 1`) and the fresh conversation answered `CONT-1 HELD-OK` |
| 3 | Record whether a dialog delays a queued `/clear` | **Recorded: it delays, then proceeds** | `clear.calling` at t+0 while `/model` was open; `session.end(clear)` and `clear.resolved` came 16.1 s later, right after Esc closed the dialog. No error, nothing reordered, continuation 2 ran normally |
| 4 | Per-plugin data dir discovery | **None for a `--plugin-dir` mod** | `$.env.get`: `CLAUDE_PLUGIN_DATA`, `CLAUDE_PLUGIN_ROOT`, `XDG_STATE_HOME` all unset (only `HOME`). `$.plugin.root` = the plugin folder (not a data dir: a marketplace update replaces it) |

## Extra results

- **A-04 retired [V-LIVE]:** `$.process.run(['mkdir', '<dir>/lock.d'])` gave exit 0 the first time and exit 1 ("File exists") the second time, so the atomic lock works. `mv -f tmp state.json` gave exit 0 and the file existed afterwards. No permission prompt for either. `$.fs.write` created nested parent dirs.
- **Status line rendering:** the engine prefixes a plugin's status with `⚠ <plugin-name>:`. Product status text should not repeat the plugin name. Note that the `⚠` glyph is drawn by the engine and is not under our control (UX copy in ST-7.1).

## Design notes (feed ST-4.4, ADR-010)

1. **A dropped prompt stays in the prompt box.** After `{ drop }`, the typed text remained as the draft. The next thing the driver typed was appended to it (`"…HELD-OKReply with the single w…"` in the next `prompt.submit`). The product must clear the draft after holding a prompt, using `$.prompt.fill({ text: '', mode: 'replace' })` (typed; untested here). Otherwise the user may send the held text a second time. Added to ADR-010.
2. **Framing of relayed text.** The held prompt, delivered inside a plugin-submitted continuation, was read under the plugin frame. The model remarked "this relayed prompt may not have been typed by you". ST-4.4 should deliver held prompts clearly labelled as the user's own words, quoted verbatim. Whether `asUser: true` should be used for the held part is a product decision. A continuation must stay plugin-framed, so the likely shape is a plugin-framed continuation that quotes the user's messages.

## Fallback adopted

None needed. ADR-005 keeps the OS-standard state root (no per-plugin data dir is offered to a `--plugin-dir` mod). Re-check `CLAUDE_PLUGIN_DATA` once the plugin is installed from a marketplace (M6). ADR-010 gains the "clear the draft" step.

## Cost note

One PTY run, 5 short Haiku turns (per-conversation cost logged: ≤ US$0.006 each). Total well under US$0.05.
