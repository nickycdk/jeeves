# Cursor two-rotation demo: script for the maintainer (ST-9.2)

What this produces: the M7 gate's "real Cursor two-rotation demo" and the ST-9.2 checks. You get a screen recording of at least 2 automatic rotations in Cursor's integrated terminal on your default model, with the 06 §6 checklist before and after a rotation, cut into a video of 3 minutes or less. Everything is saved under `docs/done/evidence/v0.1.0/AC-02/` (raw files) and `docs/done/evidence/v0.1.0/demo/` (the video).

Time: about 30–45 minutes. Cost: your default model, two to three conversations on a small fixture. Roughly US$1–4 on Opus or Sonnet; `/cost` before each rotation tells you the exact figure.

## 0. Before you start

- macOS, Cursor stable, Claude Code 2.1.319 or later (`claude --version`), logged in.
- Turn off notifications (Do Not Disturb) and close windows that show secrets. The recording must be secrets-free.
- Pick a scratch folder outside any repository, for example `~/jeeves-demo`. Nothing in your real state folder is touched: the commands below set `JEEVES_STATE_DIR`.

## 1. Set up the fixture (in Cursor's integrated terminal)

```sh
mkdir -p ~/jeeves-demo && cd ~/jeeves-demo
node --experimental-strip-types --no-warnings <repo>/jeeves/tests/fixtures/build-repo.ts six-steps repo --chars 6000
cd repo
export JEEVES_TEST=1 JEEVES_STATE_DIR=~/jeeves-demo/state JEEVES_TEST_THRESHOLD_OVERRIDE=+3
claude --plugin-dir <repo>/jeeves
```

Replace `<repo>` with this repository's path. Or use the installed plugin (`claude` without `--plugin-dir`) if it is installed from the local marketplace.

**Why a test threshold (ST-9.2 allows it, with the reason stated):** at the default 50% the fixture would need hundreds of thousands of tokens per rotation on a large-context model. `+3` rotates once this conversation's context is 3 points above its first reading. `/jeeves status` shows `TEST OVERRIDE` and the recording shows it. If rotations come too slowly on a 1M-token window, use `+2`. If they come after every step, use `+5`.

Start the screen recording now (Cmd+Shift+5 → record the Cursor window).

## 2. Before the first rotation: checklist (06 §6, phase "before")

In this order, in the fresh `claude`:

1. `/jeeves status`: shows `mode: full`, no managed task, `TEST OVERRIDE`.
2. `/jeeves on`, then `/jeeves check ./verify.sh`, then paste the task (copy it from `node --experimental-strip-types -e "import('<repo>/jeeves/tests/fixtures/build-repo.ts').then(m => console.log(m.SIX_STEPS_TASK))"`).
3. **Type while Claude works**: type `hello` while it works; it is queued in the prompt box. Delete it again (or send it: Claude then answers it).
4. **Resize**: drag the terminal pane to 50 columns or narrower, then wider. The layout is not garbled and the status entry `Jeeves N%/T%` is still readable.
5. **Esc / Ctrl+C**: press Esc during a running turn (it interrupts, and Jeeves sends no prompt afterwards). Then type a few letters at idle and press Ctrl+C (the input clears). Tell Claude to carry on (`continue the task`).
6. **Permission prompt**: Claude runs Bash for `./verify.sh` and `git commit`. Answer **Yes** once, and **No** once on a later prompt (then tell it to go on). The prompt behaves as it does without the plugin.
7. **Unicode**: paste `æøå 🚀 漢字` into a prompt (for example "say this back: æøå 🚀 漢字"). It renders correctly in your text and in the reply.
8. `/help`, `/config`, `/mcp` open and close normally; the Up arrow recalls an earlier prompt.
9. `/jeeves status` shows session 1 and a context reading.

To keep the six-step task moving, answer **Yes** to the remaining permission prompts.

## 3. The rotations (no keys pressed)

When the status entry passes the threshold, Jeeves asks for a handover at the next safe stop, saves it, runs `/clear` and continues. On screen you should see the transcript lines `Jeeves: handover requested`, then `Jeeves: handover validated, starting fresh`, then the fresh conversation's first prompt (`Jeeves: you are session 2 …`). Do not touch the keyboard during a rotation, except to answer permission prompts. Wait for **two** rotations (session 3 started). `/jeeves history` lists them.

## 4. After a rotation: checklist (06 §6, phase "after")

In session 2 or 3, repeat items 3–9 of section 2. Item 9 must now show session 2 or 3. Then let the task finish (`COMPLETED` in `/jeeves status`) or stop with `/jeeves off`.

Stop the recording.

## 5. Save the evidence

```sh
E=<repo>/docs/done/evidence/v0.1.0/AC-02 && mkdir -p $E
cp -R ~/jeeves-demo/state/projects/*/tasks/*/{events.jsonl,state.json,sessions,history} $E/
claude --version > $E/versions.txt; sw_vers >> $E/versions.txt; echo "Cursor: <version from Cursor > About>" >> $E/versions.txt
```

Then fill `$E/RESULT.md` from the template below. Cut the recording to 3 minutes or less (setup, one rotation in full, the second rotation sped up, two checklist items after it) and save it as `docs/done/evidence/v0.1.0/demo/jeeves-v0.1.0-demo.mp4`. Watch it once for secrets before you commit it. A large video can live in the GitHub release instead; then link it from RESULT.md.

Copy your AC-01 fresh-user timing and recording (M6 gate) to `docs/done/evidence/v0.1.0/AC-01/RESULT.md` too.

### RESULT.md template

```markdown
# AC-02 / ST-9.2: Cursor two-rotation demo
Date: · Cursor: · Claude Code: · macOS: · Model (default): · Threshold: TEST OVERRIDE +3 (reason: see script §1)
Rotations: N (session ids from sessions/*.json) · Final state: · Cost (/cost per session):
| # | Checklist item (06 §6) | Before | After |
|---|---|---|---|
| 1 | Typing during a running turn is queued | | |
| 2 | Resize ≤ 50 cols and wider, status readable | | |
| 3 | Ctrl+C clears, Esc interrupts, no Jeeves prompt after an interrupt | | |
| 4 | Bash permission prompt: Yes and No behave normally | | |
| 5 | Unicode paste æøå 🚀 漢字 renders | | |
| 6 | /help, /config, /mcp, Up arrow | | |
| 7 | /jeeves status: right session and context | | |
Recording: demo/jeeves-v0.1.0-demo.mp4 (≤ 3 min), reviewed for secrets: yes/no
```
