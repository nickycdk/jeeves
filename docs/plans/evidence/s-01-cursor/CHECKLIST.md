# S-01 — Cursor rotation: manual checklist (ST-0.1)

You run this by hand in Cursor's integrated terminal. It takes about 30 minutes. It proves that a mod-driven `/clear` rotation leaves the terminal working normally (NFR-02, AC-02). Based on `06-test-and-acceptance-plan.md` §6.

The spike mod is `docs/plans/evidence/s-01-cursor/mod/`. It is a throwaway, not product code. It only rotates when you type `/srspike`, so you can do every check before the rotation and again after it. It shows `relay-spike: session N` in the status area and writes an event log to the file named by `SRSPIKE_LOG`.

## 0. Before you start

- [ ] Start a screen recording (Cmd+Shift+5 → record selected portion → the Cursor window). Keep secrets off screen.
- [ ] Note versions for RESULT.md: Cursor (Cursor → About), `claude --version`, macOS (`sw_vers -productVersion`).

## 1. Setup (paste into Cursor's integrated terminal)

The mod is copied to a temp folder first. Loading a mod writes a `types/` folder next to it, and this keeps the evidence folder clean.

```bash
JEEVES=~/Desktop/Projects/jeeves
WORK=$(mktemp -d /tmp/s01-cursor.XXXX)
cp -R "$JEEVES/docs/plans/evidence/s-01-cursor/mod" "$WORK/mod"
mkdir "$WORK/repo" && cd "$WORK/repo" && git init -q -b main && echo hello > a.txt && git add . && git -c user.email=s@x -c user.name=spike commit -qm init
echo "work dir: $WORK"
```

## 2. Launch (exact command)

```bash
SRSPIKE_LOG="$WORK/log.jsonl" claude --plugin-dir "$WORK/mod" --model haiku --permission-mode default
```

- `--permission-mode default` is needed because your user settings default to `auto`, which would hide the permission prompt in check 4.
- On "Do you trust the files in this folder?", choose **Yes, I trust this folder**. Dismiss any unrelated onboarding or notice dialog with **Esc**, not "Yes".
- You should see `relay-spike: session 1` near the prompt.

## 3. Phase A: before rotation

Type `Reply with the word READY.` once so the session has a turn. Then run each check:

| # | Check | How | Pass if |
|---|---|---|---|
| A1 | Typing while Claude works | Send `Count slowly from 1 to 40, one number per line.` While it streams, type `hello queued` and press Enter | The text appears in the prompt box and runs after the current turn |
| A2 | Resize | Drag the terminal pane narrow (≤ 50 columns), then wide | No garbled layout; prompt and status still readable |
| A3 | Ctrl+C / Esc | Type some text and press Ctrl+C at idle; send `Count from 1 to 200.` and press Esc mid-turn | Ctrl+C clears the input; Esc interrupts the turn; no prompt from the spike appears after the interrupt |
| A4 | Permission prompt | Send `Run the Bash command touch perm_a.txt` → choose **Yes** once. Send `Run the Bash command touch perm_b.txt` → choose **No** | Prompt looks and behaves as without the plugin |
| A5 | Unicode | Paste `æøå ÆØÅ — 🙂🚀 — 漢字かな` into a prompt and send `Repeat exactly: <pasted>` | Renders correctly in the prompt and in the reply |
| A6 | Built-in UI | Open `/help`, `/config`, `/mcp` (Esc to close each); press Up-arrow at an empty prompt | Each opens and closes normally; history recall works |
| A7 | Status | Look near the prompt | `relay-spike: session 1` is visible next to your own status line, which is not replaced |

## 4. Rotate

- [ ] Type `/srspike` and press Enter. Do not type anything else.
- [ ] Pass if: the screen clears to a fresh conversation, a continuation prompt runs by itself, the reply starts with `BETA`, says **NONE** for earlier messages, names the secret word **DELTA**, and the status shows `relay-spike: session 2`.

## 5. Phase B: after rotation

Repeat A1–A7 as B1–B7. For B4 use `perm_c.txt` (Yes) and `perm_d.txt` (No). For B7 expect `session 2`.

Optional: run `/srspike` a second time and repeat a short subset (B1, B3, B5) as C1, C3, C5.

## 6. Finish

- [ ] Exit with Ctrl+C twice. Stop the recording.
- [ ] Check the log shows the rotation, with a new session ID:

```bash
grep -E '"ev":"(session.end|classic.SessionStart|clear.resolved|submit.resolved)"' "$WORK/log.jsonl"
```

Expected: `session.end` with `"reason":"clear"`, then `classic.SessionStart` with `"source":"clear"` and a different `sid`, then `clear.resolved` and `submit.resolved`.

- [ ] Copy the evidence and replace temp paths before saving:

```bash
E="$JEEVES/docs/plans/evidence/s-01-cursor"
sed -e "s#$WORK#<work>#g" -e "s#$HOME#<home>#g" "$WORK/log.jsonl" > "$E/events.jsonl"
```

- [ ] Save the recording as `docs/plans/evidence/s-01-cursor/recording.mov` only after checking that it shows no secrets. Otherwise keep it outside the repo and note where it is.
- [ ] Fill in `RESULT.md` (template below). Delete `$WORK` when done.

## RESULT.md template

```markdown
# S-01 — Cursor rotation (manual)

**Result:** PASS / FAIL · **Date:** · **Cursor:** · **Claude Code:** · **macOS:** · **Model:** claude-haiku-5-5

| # | Check | Phase A (before) | Phase B (after) | Notes |
|---|---|---|---|---|
| 1 | Typing while working | | | |
| 2 | Resize | | | |
| 3 | Ctrl+C / Esc | | | |
| 4 | Permission prompt (Yes / No) | | | |
| 5 | Unicode | | | |
| 6 | /help, /config, /mcp, history | | | |
| 7 | Status line coexistence | | | |
| R | Rotation: new sid, BETA / NONE / DELTA, session 2 | — | | |

Session IDs: before `…` → after `…` (from events.jsonl)
Recording: recording.mov (or location)
Anything odd:
```

If an item fails only after the rotation, it is a Claude Code bug in `/clear` handling, not a terminal-wrapping issue (nothing is wrapped). Per 01 §4, report it upstream and do not claim AC-02.
